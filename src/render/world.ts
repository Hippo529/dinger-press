// The field in projected 2.5D: grass with mow stripes, dirt, lines, bases, mound, wall, stands, lights.
import { THEME } from '../config/theme';
import { BASES, fenceAt, type Stadium } from '../sim/field';
import { crowdPattern, glowSprite, halftone } from './bake';
import { project, type Camera, type Proj } from './camera';

const P: Proj = { x: 0, y: 0, s: 0, depth: 0 };
const N_ARC = 28;

function arcPoint(st: Stadium, i: number, n: number, extra = 0): { x: number; y: number; h: number } {
  const a = -45 + (90 * i) / n;
  const f = fenceAt(st, a);
  const r = ((f.dist + extra) * Math.PI) / 180;
  const ar = (a * Math.PI) / 180;
  void r;
  return { x: (f.dist + extra) * Math.sin(ar), y: (f.dist + extra) * Math.cos(ar), h: f.height };
}

function poly(ctx: CanvasRenderingContext2D, cam: Camera, pts: { x: number; y: number; z?: number }[]): boolean {
  let ok = false;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    project(cam, p.x, p.y, p.z ?? 0, P);
    if (P.depth > 1) ok = true;
    if (i === 0) ctx.moveTo(P.x, P.y);
    else ctx.lineTo(P.x, P.y);
  }
  ctx.closePath();
  return ok;
}

/** Ground polygon points must be in front of the camera; clamp y so they stay visible. */
function front(cam: Camera, x: number, y: number): { x: number; y: number } {
  const minY = cam.pos.y + 2.5;
  return y < minY ? { x, y: minY } : { x, y };
}

export function drawField(ctx: CanvasRenderingContext2D, cam: Camera, st: Stadium, w: number, h: number, crowdWave: number): void {
  // Stands (behind the wall): a tall band of crowd above the fence line.
  ctx.save();
  const standPts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= N_ARC; i++) {
    const a = arcPoint(st, i, N_ARC, 8);
    standPts.push({ x: a.x, y: a.y, z: a.h + 2 });
  }
  for (let i = N_ARC; i >= 0; i--) {
    const a = arcPoint(st, i, N_ARC, 80);
    standPts.push({ x: a.x, y: a.y, z: a.h + 70 });
  }
  if (poly(ctx, cam, standPts)) {
    ctx.fillStyle = crowdPattern(ctx);
    ctx.fill();
    if (crowdWave > 0.02) {
      ctx.globalAlpha = crowdWave * 0.5;
      ctx.fillStyle = halftone(ctx, THEME.sun, 9, 2.4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // Light towers (glow sprites, lighter).
  ctx.globalCompositeOperation = 'lighter';
  for (const a of [-40, -15, 15, 40]) {
    const f = fenceAt(st, a);
    const r = f.dist + 70, ar = (a * Math.PI) / 180;
    project(cam, r * Math.sin(ar), r * Math.cos(ar), 105, P);
    if (P.depth > 1) {
      const sz = Math.max(30, P.s * 60);
      ctx.drawImage(glowSprite(THEME.sun, 96), P.x - sz / 2, P.y - sz / 2, sz, sz);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // Grass fan from home to the fence.
  const grass: { x: number; y: number }[] = [front(cam, 0, -6)];
  for (let i = 0; i <= N_ARC; i++) {
    const a = arcPoint(st, i, N_ARC);
    grass.push(front(cam, a.x, a.y));
  }
  // foul territory beyond lines too: widen with a big ground quad first
  ctx.fillStyle = '#18594A';
  poly(ctx, cam, [front(cam, -500, -10), front(cam, 500, -10), front(cam, 500, 520), front(cam, -500, 520)]);
  ctx.fill();
  ctx.fillStyle = THEME.grass;
  poly(ctx, cam, grass);
  ctx.fill();
  // Mow stripes: alternating radial bands (every other 20 ft ring).
  ctx.fillStyle = THEME.grassStripe;
  for (let r0 = 160; r0 < 420; r0 += 40) {
    const band: { x: number; y: number }[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = ((-45 + (90 * i) / 12) * Math.PI) / 180;
      const rr = Math.min(r0, fenceAt(st, (a * 180) / Math.PI).dist);
      band.push({ x: rr * Math.sin(a), y: rr * Math.cos(a) });
    }
    for (let i = 12; i >= 0; i--) {
      const a = ((-45 + (90 * i) / 12) * Math.PI) / 180;
      const rr = Math.min(r0 + 20, fenceAt(st, (a * 180) / Math.PI).dist);
      band.push({ x: rr * Math.sin(a), y: rr * Math.cos(a) });
    }
    poly(ctx, cam, band.map((p) => front(cam, p.x, p.y)));
    ctx.fill();
  }
  // Infield dirt: arc at 95 ft from the mound plus the home circle.
  const dirt: { x: number; y: number }[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = ((-48 + (96 * i) / 20) * Math.PI) / 180;
    dirt.push({ x: 150 * Math.sin(a), y: 150 * Math.cos(a) });
  }
  dirt.push({ x: 66, y: 50 }, { x: 8, y: -8 }, { x: -8, y: -8 }, { x: -66, y: 50 });
  ctx.fillStyle = THEME.dirt;
  poly(ctx, cam, dirt.map((p) => front(cam, p.x, p.y)));
  ctx.fill();
  // Infield grass diamond
  ctx.fillStyle = THEME.grass;
  poly(ctx, cam, [front(cam, 0, 12), { x: 54, y: 63.6 }, { x: 0, y: 116 }, { x: -54, y: 63.6 }]);
  ctx.fill();
  // Halftone shadow along the dirt edge (gives the print texture).
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = halftone(ctx, THEME.ink, 6, 1.5);
  poly(ctx, cam, dirt.slice(0, 21).map((p, i, arr) => (i < arr.length ? { x: p.x, y: p.y } : p)).concat(dirt.slice(0, 21).reverse().map((p) => ({ x: p.x * 0.93, y: p.y * 0.93 }))).map((p) => front(cam, p.x, p.y)));
  ctx.fill();
  ctx.globalAlpha = 1;
  // Mound
  ctx.fillStyle = THEME.dirt;
  const mound: { x: number; y: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    mound.push({ x: 9 * Math.cos(a), y: 60.5 + 9 * Math.sin(a) });
  }
  poly(ctx, cam, mound);
  ctx.fill();
  // Foul lines and base paths (chalk).
  ctx.strokeStyle = THEME.chalk;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const f = fenceAt(st, s * 45);
    const r = f.dist / Math.SQRT2;
    const a = front(cam, 0, 0);
    project(cam, a.x, a.y, 0, P);
    const x0 = P.x, y0 = P.y, w0 = P.s;
    project(cam, s * r, r, 0, P);
    ctx.lineWidth = Math.max(1, Math.min(4, (w0 + P.s) * 0.12));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(P.x, P.y);
    ctx.stroke();
  }
  // Bases
  for (let b = 1; b <= 3; b++) {
    const c = BASES[b];
    ctx.fillStyle = THEME.paper;
    poly(ctx, cam, [{ x: c.x - 1.1, y: c.y }, { x: c.x, y: c.y + 1.1 }, { x: c.x + 1.1, y: c.y }, { x: c.x, y: c.y - 1.1 }]);
    ctx.fill();
  }
  // Home plate + batter's boxes
  ctx.fillStyle = THEME.paper;
  if (poly(ctx, cam, [front(cam, -0.71, 0.71), front(cam, 0.71, 0.71), front(cam, 0.71, 0), front(cam, 0, -0.71), front(cam, -0.71, 0)])) ctx.fill();
  ctx.strokeStyle = 'rgba(242,232,213,0.7)';
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    poly(ctx, cam, [front(cam, s * 1.2, -3), front(cam, s * 1.2, 3), front(cam, s * 5.2, 3), front(cam, s * 5.2, -3)]);
    ctx.stroke();
  }
  // Wall: vertical quads along the fence.
  for (let i = 0; i < N_ARC; i++) {
    const a = arcPoint(st, i, N_ARC), b = arcPoint(st, i + 1, N_ARC);
    const mailbox = st.hazard === 'mailbox' && a.h > 20;
    ctx.fillStyle = mailbox ? '#2F6FA8' : THEME.wall;
    if (poly(ctx, cam, [{ x: a.x, y: a.y, z: 0 }, { x: b.x, y: b.y, z: 0 }, { x: b.x, y: b.y, z: b.h }, { x: a.x, y: a.y, z: a.h }])) {
      ctx.fill();
      ctx.strokeStyle = THEME.sun;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      project(cam, a.x, a.y, a.h, P);
      ctx.moveTo(P.x, P.y);
      project(cam, b.x, b.y, b.h, P);
      ctx.lineTo(P.x, P.y);
      ctx.stroke();
    }
  }
  void w;
  void h;
}

/** Distance markers on the wall (e.g. "400"). */
export function drawWallNumbers(ctx: CanvasRenderingContext2D, cam: Camera, st: Stadium, font: string): void {
  ctx.fillStyle = THEME.paper;
  ctx.textAlign = 'center';
  for (const a of [-45, -22.5, 0, 22.5, 45]) {
    const f = fenceAt(st, a);
    const ar = (a * Math.PI) / 180;
    project(cam, f.dist * Math.sin(ar), f.dist * Math.cos(ar), f.height * 0.45, P);
    if (P.depth < 2) continue;
    const size = Math.max(7, Math.min(18, P.s * 6));
    ctx.font = `${size}px ${font}`;
    ctx.fillText(String(Math.round(f.dist)), P.x, P.y + size * 0.35);
  }
}
