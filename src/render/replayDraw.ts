// Instant-replay inset: a printed top-down diagram re-drawn from the snapshot ring (not video).
import { FONTS, THEME } from '../config/theme';
import { fenceAt, STADIUMS, type StadiumId } from '../sim/field';
import { FRAME_FLOATS, type ReplayRing } from '../fx/replay';
import type { Layout } from './layout';

export function drawReplay(ctx: CanvasRenderingContext2D, l: Layout, ring: ReplayRing, now: number, stadium: StadiumId): void {
  const size = Math.min(l.portrait ? l.w * 0.42 : l.h * 0.42, 190);
  const x0 = l.w - l.insets.right - size - 14;
  const y0 = l.scoreboard.y + l.scoreboard.h + 40;
  const st = STADIUMS[stadium];
  const sc = size / 470;
  const ox = x0 + size / 2, oy = y0 + size - 12;
  const P = (x: number, y: number) => [ox + x * sc, oy - y * sc] as const;
  ctx.save();
  ctx.fillStyle = THEME.pink;
  ctx.fillRect(x0 + 3, y0 + 3, size, size);
  ctx.fillStyle = THEME.paper;
  ctx.fillRect(x0, y0, size, size);
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x0, y0, size, size);
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  // field diagram
  ctx.fillStyle = THEME.grass;
  ctx.beginPath();
  ctx.moveTo(...P(0, 0));
  for (let a = -45; a <= 45; a += 5) {
    const f = fenceAt(st, a);
    const r = (a * Math.PI) / 180;
    ctx.lineTo(...P(f.dist * Math.sin(r), f.dist * Math.cos(r)));
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = THEME.dirt;
  ctx.beginPath();
  ctx.moveTo(...P(0, -6));
  ctx.lineTo(...P(66, 64));
  ctx.lineTo(...P(0, 134));
  ctx.lineTo(...P(-66, 64));
  ctx.closePath();
  ctx.fill();
  // ball track up to the current replay frame
  const off = ring.frameAt(now);
  const b = ring.buf;
  const frames = b.length / FRAME_FLOATS;
  const cur = off / FRAME_FLOATS;
  const upto = (cur - ring.playFrom + frames) % frames;
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  let first = true;
  for (let n = 0; n <= upto; n += 3) {
    const k = ((ring.playFrom + n) % frames) * FRAME_FLOATS;
    if (b[k + 4] !== 1) continue;
    const [px, py] = P(b[k + 1], b[k + 2]);
    if (first) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
    first = false;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // fielders as ink dots at the replay frame
  ctx.fillStyle = THEME.ink;
  for (let i = 0; i < 9; i++) {
    const [px, py] = P(b[off + 5 + i * 2], b[off + 6 + i * 2]);
    ctx.beginPath();
    ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b[off + 4] === 1) {
    const [px, py] = P(b[off + 1], b[off + 2]);
    const r = 3 + Math.min(4, b[off + 3] * 0.04); // a little bigger while high
    ctx.fillStyle = THEME.ball;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = THEME.ink;
  ctx.fillRect(x0, y0 - 18, size * 0.72, 18);
  ctx.fillStyle = THEME.sun;
  ctx.font = `11px ${FONTS.display}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('INSTANT REPLAY', x0 + 6, y0 - 9);
}
