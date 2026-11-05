// Hand-written perspective projection for the 2.5D field.
import type { V3 } from '../sim/types';

export interface Camera {
  pos: V3;
  look: V3;
  focal: number; // px
  cx: number; // projection centre on screen (css px)
  cy: number;
  zoom: number;
  roll: number; // radians
  ox: number; // shake offset px
  oy: number;
}

export interface Proj {
  x: number;
  y: number;
  s: number; // px per foot at that depth
  depth: number;
}

interface Basis {
  fx: number; fy: number; fz: number; // forward
  rx: number; ry: number; rz: number; // right
  ux: number; uy: number; uz: number; // up
}

const basisCache = new WeakMap<Camera, { key: string; b: Basis }>();

function basis(c: Camera): Basis {
  const key = `${c.pos.x},${c.pos.y},${c.pos.z},${c.look.x},${c.look.y},${c.look.z}`;
  const cached = basisCache.get(c);
  if (cached && cached.key === key) return cached.b;
  let fx = c.look.x - c.pos.x, fy = c.look.y - c.pos.y, fz = c.look.z - c.pos.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // right = forward × worldUp(0,0,1)
  let rx = fy, ry = -fx, rz = 0;
  const rl = Math.hypot(rx, ry) || 1;
  rx /= rl; ry /= rl;
  // up = right × forward
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const b = { fx, fy, fz, rx, ry, rz, ux, uy, uz };
  basisCache.set(c, { key, b });
  return b;
}

/** Project a world point. Points behind the camera get depth ≤ 0. Writes into `out`. */
export function project(c: Camera, x: number, y: number, z: number, out: Proj): Proj {
  const b = basis(c);
  const dx = x - c.pos.x, dy = y - c.pos.y, dz = z - c.pos.z;
  const depth = dx * b.fx + dy * b.fy + dz * b.fz;
  const sx = dx * b.rx + dy * b.ry + dz * b.rz;
  const sy = dx * b.ux + dy * b.uy + dz * b.uz;
  const d = Math.max(0.5, depth);
  const f = (c.focal * c.zoom) / d;
  let px = sx * f, py = -sy * f;
  if (c.roll) {
    const cr = Math.cos(c.roll), sr = Math.sin(c.roll);
    const tx = px * cr - py * sr;
    py = px * sr + py * cr;
    px = tx;
  }
  out.x = c.cx + px + c.ox;
  out.y = c.cy + py + c.oy;
  out.s = f;
  out.depth = depth;
  return out;
}

export function makeCamera(): Camera {
  return { pos: { x: 0, y: -20, z: 5 }, look: { x: 0, y: 60, z: 3 }, focal: 1000, cx: 0, cy: 0, zoom: 1, roll: 0, ox: 0, oy: 0 };
}

/** Static batting view: behind and slightly to the side of the plate, mirrored for left-handed batters. */
export function battingView(c: Camera, w: number, h: number, batterHand: 1 | -1, portrait: boolean): void {
  const short = Math.min(w, h);
  // Camera sits slightly toward the batter's side so the batter and the zone share the frame.
  c.pos = { x: batterHand === 1 ? -0.9 : 0.9, y: -19, z: 5.2 };
  c.look = { x: c.pos.x * 0.35, y: 60, z: 2.2 };
  // zone width 1.66 ft ≈ 22–24% of the short side (legible at 390 px)
  const zonePx = short * (portrait ? 0.3 : 0.24);
  c.focal = (zonePx / 1.66) * 19.7;
  c.cx = w / 2;
  c.cy = portrait ? h * 0.52 : h * 0.5;
  c.zoom = 1;
  c.roll = 0;
}

/** Wide field view used after contact; `target` is the follow point. */
export function fieldView(c: Camera, w: number, h: number, target: { x: number; y: number }, portrait: boolean): void {
  const short = Math.min(w, h);
  c.pos = { x: target.x * 0.25, y: -95 + target.y * 0.25, z: 95 + target.y * 0.12 };
  c.look = { x: target.x, y: target.y, z: 0 };
  c.focal = short * (portrait ? 1.25 : 1.55);
  c.cx = w / 2;
  c.cy = h * (portrait ? 0.48 : 0.5);
  c.zoom = 1;
  c.roll = 0;
}
