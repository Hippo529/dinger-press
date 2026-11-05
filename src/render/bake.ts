// Offscreen layers baked once (and on resize): halftone patterns, paper grain, glow sprites, stands.
import { THEME } from '../config/theme';

export const bakeStats = { count: 0 };

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Tiny deterministic PRNG for cosmetic textures (keeps screenshots stable). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const patternCache = new Map<string, CanvasPattern>();
/** Halftone dot pattern in `color` (used for shadows and ink tints instead of gradients). */
export function halftone(ctx: CanvasRenderingContext2D, color: string, cell = 6, r = 1.6): CanvasPattern {
  const key = `${color}|${cell}|${r}`;
  let p = patternCache.get(key);
  if (p) return p;
  const c = makeCanvas(cell, cell);
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.beginPath();
  g.arc(cell / 2, cell / 2, r, 0, Math.PI * 2);
  g.fill();
  p = ctx.createPattern(c, 'repeat')!;
  patternCache.set(key, p);
  bakeStats.count++;
  return p;
}

let grain: HTMLCanvasElement | null = null;
/** 160×160 paper grain + fibre speckle, drawn at low alpha over everything. */
export function paperGrain(): HTMLCanvasElement {
  if (grain) return grain;
  const c = makeCanvas(160, 160);
  const g = c.getContext('2d')!;
  const rnd = lcg(7);
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd();
    img.data[i] = 242;
    img.data[i + 1] = 232;
    img.data[i + 2] = 213;
    img.data[i + 3] = v > 0.985 ? 70 : v < 0.02 ? 0 : Math.floor(v * 22);
  }
  g.putImageData(img, 0, 0);
  grain = c;
  bakeStats.count++;
  return c;
}

const glowCache = new Map<string, HTMLCanvasElement>();
/** Pre-rendered radial glow sprite (no shadowBlur). */
export function glowSprite(color: string, size = 64): HTMLCanvasElement {
  const key = color + size;
  let c = glowCache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(0.35, color + '88');
  grd.addColorStop(1, color + '00');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  bakeStats.count++;
  return c;
}

/** Night sky + crowd stands backdrop, baked per viewport size. */
export interface Backdrop {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  dpr: number;
}
let backdrop: Backdrop | null = null;
export function skyBackdrop(w: number, h: number, dpr: number): Backdrop {
  if (backdrop && backdrop.w === w && backdrop.h === h && backdrop.dpr === dpr) return backdrop;
  const c = makeCanvas(w * dpr, h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.fillStyle = THEME.sky;
  g.fillRect(0, 0, w, h);
  // halftone haze from the light towers
  g.fillStyle = halftone(g, '#2B3468', 7, 2.2);
  g.fillRect(0, h * 0.1, w, h * 0.5);
  // stars of the night sky (paper specks)
  const rnd = lcg(42);
  g.fillStyle = THEME.paper;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = rnd() * h * 0.35;
    g.globalAlpha = 0.25 + rnd() * 0.5;
    g.fillRect(x, y, 1.4, 1.4);
  }
  g.globalAlpha = 1;
  // vignette (baked): darker corners via concentric ink frames
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = `rgba(10,12,28,${0.08 + i * 0.02})`;
    g.lineWidth = 10;
    g.strokeRect(-5 + i * 0, -5, w + 10, h + 10);
  }
  backdrop = { canvas: c, w, h, dpr };
  bakeStats.count++;
  return backdrop;
}

let crowdTile: HTMLCanvasElement | null = null;
/** A tile of halftone crowd heads (ink dots with pink/teal/sun shirts). */
export function crowdPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (!crowdTile) {
    const c = makeCanvas(48, 24);
    const g = c.getContext('2d')!;
    const rnd = lcg(99);
    g.fillStyle = THEME.stands;
    g.fillRect(0, 0, 48, 24);
    const cols = [THEME.pink, THEME.teal, THEME.sun, THEME.paper, '#3A4378'];
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 8; i++) {
        const x = i * 6 + (row ? 3 : 0) + 1, y = row * 12 + 2;
        g.fillStyle = cols[Math.floor(rnd() * cols.length)];
        g.globalAlpha = 0.55;
        g.fillRect(x - 1, y + 4, 5, 5);
        g.globalAlpha = 0.8;
        g.fillStyle = '#C9A88A';
        g.beginPath();
        g.arc(x + 1.5, y + 2, 1.8, 0, Math.PI * 2);
        g.fill();
      }
    g.globalAlpha = 1;
    crowdTile = c;
    bakeStats.count++;
  }
  return ctx.createPattern(crowdTile, 'repeat')!;
}

export function resetBakes(): void {
  backdrop = null;
}
