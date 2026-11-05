// Overlays: zone, locator, reticle, charge ring, timing bar, banner, lower third, prompts, popups.
import { FONTS, THEME } from '../config/theme';
import { TUNING } from '../config/tuning';
import { ROSTER_BY_ID } from '../config/roster';
import { easeOutBack, easeOutCubic } from '../core/easing';
import { ZONE } from '../sim/field';
import type { GameState } from '../sim/state';
import { popupAt, type Particles, type Popups } from '../fx/particles';
import { rr } from './hud';
import { zoneToScreen, type Layout, type Rect } from './layout';

const INK = THEME.ink;

/** Strike zone: paper outline + 3×3 ticks (shape, not colour, carries meaning). */
export function drawZone(ctx: CanvasRenderingContext2D, l: Layout, alpha: number): Rect {
  const a = zoneToScreen(l, ZONE.xMin, ZONE.zMax);
  const b = zoneToScreen(l, ZONE.xMax, ZONE.zMin);
  const r = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = THEME.paper;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = alpha * 0.45;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(r.x + (r.w * i) / 3, r.y);
    ctx.lineTo(r.x + (r.w * i) / 3, r.y + r.h);
    ctx.moveTo(r.x, r.y + (r.h * i) / 3);
    ctx.lineTo(r.x + r.w, r.y + (r.h * i) / 3);
  }
  ctx.stroke();
  ctx.restore();
  return r;
}

/** Pitch locator: ring + cross at the predicted crossing point. */
export function drawLocator(ctx: CanvasRenderingContext2D, l: Layout, x: number, z: number, star: boolean): void {
  const p = zoneToScreen(l, x, z);
  const r = Math.max(9, l.plane.s * 0.14);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = star ? THEME.pink : THEME.sun;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - r * 0.5, p.y);
  ctx.lineTo(p.x + r * 0.5, p.y);
  ctx.moveTo(p.x, p.y - r * 0.5);
  ctx.lineTo(p.x, p.y + r * 0.5);
  ctx.stroke();
  ctx.restore();
}

export function drawReticle(ctx: CanvasRenderingContext2D, l: Layout, x: number, z: number, radiusFt: number): void {
  const p = zoneToScreen(l, x, z);
  const r = radiusFt * l.plane.s;
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = THEME.teal;
  ctx.stroke();
  ctx.fillStyle = THEME.teal;
  ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  ctx.restore();
}

/** Charge ring around the aim marker; the sweet band is a thick sun arc with tick marks. */
export function drawCharge(ctx: CanvasRenderingContext2D, l: Layout, x: number, z: number, charge: number): void {
  const p = zoneToScreen(l, x, z);
  const r = Math.max(22, l.plane.s * 0.32);
  const tp = TUNING.pitch;
  const A = (k: number) => -Math.PI / 2 + k * Math.PI * 2 * 0.8;
  ctx.save();
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, A(0), A(1.25));
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = THEME.sun;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, A(tp.sweetLo), A(tp.sweetHi));
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = charge > tp.sweetHi ? THEME.pink : THEME.paper;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r - 7, A(0), A(Math.min(1.25, charge)));
  ctx.stroke();
  // aim cross
  ctx.strokeStyle = THEME.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - 8, p.y);
  ctx.lineTo(p.x + 8, p.y);
  ctx.moveTo(p.x, p.y - 8);
  ctx.lineTo(p.x, p.y + 8);
  ctx.stroke();
  ctx.restore();
}

/** Timing bar: centre notch (PERFECT notch width), marker shape ◀ early / ▶ late, grade word. */
export function drawTimingBar(ctx: CanvasRenderingContext2D, r: Rect, s: GameState, showMs: boolean, age: number): void {
  const w = s.win;
  if (!w || s.last.grade === null) return;
  const k = Math.min(1, age / 0.15);
  ctx.save();
  ctx.globalAlpha = Math.min(1, (TUNING.timing.timingBarShowS - age) / 0.25);
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(easeOutBack(k), 1);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  rr(ctx, r, 8);
  ctx.fillStyle = INK;
  ctx.fill();
  const inner = { x: r.x + 10, y: r.y + r.h - 14, w: r.w - 20, h: 7 };
  const span = w.weak;
  const X = (ms: number) => inner.x + inner.w / 2 + (ms / span) * (inner.w / 2);
  ctx.fillStyle = '#3A4378';
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  ctx.fillStyle = THEME.teal;
  ctx.fillRect(X(-w.good), inner.y, X(w.good) - X(-w.good), inner.h);
  const notch = TUNING.timing.perfectNotchMs * w.scale;
  ctx.fillStyle = THEME.sun;
  ctx.fillRect(X(-notch), inner.y - 2, X(notch) - X(-notch), inner.h + 4);
  const o = Math.max(-span, Math.min(span, s.last.offsetMs));
  const mx = X(o);
  ctx.fillStyle = THEME.paper;
  ctx.beginPath();
  if (o < 0) {
    ctx.moveTo(mx - 7, inner.y + 3);
    ctx.lineTo(mx + 3, inner.y - 6);
    ctx.lineTo(mx + 3, inner.y + 12);
  } else {
    ctx.moveTo(mx + 7, inner.y + 3);
    ctx.lineTo(mx - 3, inner.y - 6);
    ctx.lineTo(mx - 3, inner.y + 12);
  }
  ctx.fill();
  ctx.fillStyle = THEME.paper;
  ctx.font = `13px ${FONTS.display}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('EARLY', inner.x, r.y + 12);
  ctx.textAlign = 'right';
  ctx.fillText('LATE', inner.x + inner.w, r.y + 12);
  ctx.textAlign = 'center';
  ctx.fillStyle = s.last.grade === 'PERFECT' ? THEME.sun : THEME.paper;
  const ms = showMs ? ` ${o >= 0 ? '+' : ''}${Math.round(s.last.offsetMs)} ms` : '';
  ctx.fillText(s.last.grade + ms, inner.x + inner.w / 2, r.y + 12);
  ctx.restore();
}

/** Misregistered display type (pink + teal plates offset from the ink plate). */
export function printText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, misreg: number, main: string = THEME.paper): void {
  ctx.font = `${size}px ${FONTS.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.pink;
  ctx.fillText(text, x - misreg, y + misreg * 0.6);
  ctx.fillStyle = THEME.teal;
  ctx.fillText(text, x + misreg, y - misreg * 0.4);
  ctx.lineWidth = Math.max(3, size * 0.12);
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = main;
  ctx.fillText(text, x, y);
}

export function drawBanner(ctx: CanvasRenderingContext2D, l: Layout, s: GameState, misreg: number): void {
  const b = s.banner;
  if (!b) return;
  const age = s.time - b.t;
  if (age > 1.6 || age < 0) return;
  const k = easeOutBack(Math.min(1, age / 0.15));
  const alpha = age > 1.35 ? Math.max(0, 1 - (age - 1.35) / 0.25) : 1;
  const r = l.banner;
  ctx.save();
  ctx.globalAlpha = alpha;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  const size = Math.min(l.portrait ? 40 : 48, (r.w / Math.max(6, b.text.length)) * 1.5);
  const main = b.tone === 'good' ? THEME.sun : b.tone === 'bad' ? THEME.paper : THEME.paper;
  printText(ctx, b.text, 0, -8, size, misreg, main);
  if (b.sub) {
    ctx.font = `700 ${l.portrait ? 14 : 16}px ${FONTS.ui}`;
    const tw = ctx.measureText(b.sub).width + 20;
    ctx.fillStyle = INK;
    ctx.fillRect(-tw / 2, size * 0.55, tw, 24);
    ctx.fillStyle = THEME.paper;
    ctx.fillText(b.sub, 0, size * 0.55 + 12);
  }
  ctx.restore();
}

/** Broadcast lower third at PA start: name, catchphrase, ratings. */
export function drawLowerThird(ctx: CanvasRenderingContext2D, l: Layout, s: GameState, misreg: number): void {
  const lt = s.lowerThird;
  if (!lt) return;
  const age = s.time - lt.t;
  if (age > 2.2) return;
  const ch = ROSTER_BY_ID[lt.id];
  if (!ch) return;
  const inK = easeOutCubic(Math.min(1, age / 0.25));
  const out = age > 1.9 ? (age - 1.9) / 0.3 : 0;
  const w = Math.min(l.w - 24, 340);
  const x = 12 - (1 - inK + out) * (w + 20);
  const y = l.portrait ? l.prompt.y + l.prompt.h + 10 : l.h - 150;
  ctx.save();
  ctx.fillStyle = THEME.pink;
  ctx.fillRect(x + misreg, y + misreg, w, 52);
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, 52);
  ctx.fillStyle = THEME.sun;
  ctx.fillRect(x, y, 8, 52);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.paper;
  ctx.font = `18px ${FONTS.display}`;
  ctx.fillText(ch.name.toUpperCase(), x + 16, y + 17);
  ctx.font = `700 11px ${FONTS.ui}`;
  const phrase = ch.catchphrases[Math.floor(s.time * 0) % ch.catchphrases.length];
  ctx.fillStyle = THEME.sun;
  ctx.fillText(`“${phrase}”  C${ch.contact} P${ch.power} S${ch.speed}`, x + 16, y + 38);
  ctx.restore();
}

export function drawPrompt(ctx: CanvasRenderingContext2D, l: Layout, text: string, pulse: number, accent: string): void {
  const r = l.prompt;
  ctx.save();
  ctx.font = `${l.portrait ? 15 : 17}px ${FONTS.display}`;
  const tw = Math.min(r.w, ctx.measureText(text).width + 28);
  const x = r.x + r.w / 2 - tw / 2;
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(pulse * 6);
  ctx.fillStyle = accent;
  ctx.fillRect(x + 2, r.y + 2, tw, r.h);
  ctx.fillStyle = INK;
  ctx.fillRect(x, r.y, tw, r.h);
  ctx.fillStyle = THEME.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.restore();
}

export function drawParticles(ctx: CanvasRenderingContext2D, parts: Particles, avoid: Rect | null): void {
  for (const p of parts.pool) {
    if (!p.live) continue;
    if (avoid && p.x > avoid.x - p.size && p.x < avoid.x + avoid.w + p.size && p.y > avoid.y - p.size && p.y < avoid.y + avoid.h + p.size) continue;
    const a = Math.min(1, p.life / (p.max * 0.5));
    ctx.globalAlpha = a;
    if (p.kind === 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 2) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      ctx.restore();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawPopups(ctx: CanvasRenderingContext2D, pops: Popups, now: number, misreg: number, avoid: Rect | null): void {
  for (const p of pops.pool) {
    if (!p.live) continue;
    const t = popupAt((now - p.born) * 1000);
    let y = p.y + t.dy;
    // never cover the ball between release and contact: nudge above it
    if (avoid && Math.abs(p.x - (avoid.x + avoid.w / 2)) < 120 && y > avoid.y - 30 && y < avoid.y + avoid.h + 30) y = avoid.y - 40;
    ctx.save();
    ctx.globalAlpha = t.alpha;
    ctx.translate(p.x, y);
    ctx.scale(t.scale, t.scale);
    printText(ctx, p.text, 0, 0, p.size, misreg, p.color);
    if (p.sub) {
      ctx.font = `700 13px ${FONTS.ui}`;
      ctx.fillStyle = THEME.paper;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.strokeText(p.sub, 0, p.size * 0.75);
      ctx.fillText(p.sub, 0, p.size * 0.75);
    }
    ctx.restore();
  }
}

export function drawHandoff(ctx: CanvasRenderingContext2D, l: Layout, name: string, age: number, misreg: number): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, l.w, l.h);
  ctx.fillStyle = THEME.pink;
  for (let i = 0; i < 12; i++) ctx.fillRect(0, (l.h / 12) * i, l.w, 2);
  printText(ctx, `PASS TO ${name.toUpperCase()}`, l.w / 2, l.h * 0.42, Math.min(44, l.w / 9), misreg, THEME.sun);
  ctx.font = `700 15px ${FONTS.ui}`;
  ctx.fillStyle = THEME.paper;
  ctx.textAlign = 'center';
  ctx.fillText(age < 0.4 ? 'hold on…' : 'TAP WHEN READY', l.w / 2, l.h * 0.55);
  ctx.restore();
}
