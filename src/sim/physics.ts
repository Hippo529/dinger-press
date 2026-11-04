// Batted-ball point-mass ballistics: gravity, quadratic drag, Magnus lift from backspin.
import { TUNING } from '../config/tuning';
import { fenceAt, sprayOf, type Stadium } from './field';
import type { V3 } from './types';

export const MPH = 1.46667; // ft/s per mph

export interface BallBody {
  p: V3;
  v: V3;
  spin: number; // >0 backspin lift factor, <0 topspin
  landed: boolean; // has touched the ground at least once
  rolling: boolean;
  stopped: boolean;
  hr: boolean;
  foul: boolean;
  fenceHit: boolean;
  firstLand: V3 | null;
}

export function launch(evMph: number, laDeg: number, sprayDeg: number, z0 = 2.8): BallBody {
  const v = evMph * MPH;
  const la = (laDeg * Math.PI) / 180;
  const sp = (sprayDeg * Math.PI) / 180;
  const h = v * Math.cos(la);
  // Backspin grows with launch angle; grounders get topspin.
  const spin = laDeg < 4 ? -0.4 : Math.min(1.25, 0.35 + laDeg / 40);
  return {
    p: { x: 0, y: 1.5, z: z0 },
    v: { x: h * Math.sin(sp), y: h * Math.cos(sp), z: v * Math.sin(la) },
    spin,
    landed: false,
    rolling: false,
    stopped: false,
    hr: false,
    foul: false,
    fenceHit: false,
    firstLand: null,
  };
}

export function cloneBody(b: BallBody): BallBody {
  return { ...b, p: { ...b.p }, v: { ...b.v }, firstLand: b.firstLand ? { ...b.firstLand } : null };
}

export type StepFlag = 'none' | 'land' | 'bounce' | 'hr' | 'fence' | 'stop';

/** Advance one fixed step. Mutates b. Returns the notable event in this step. */
export function stepBall(b: BallBody, dt: number, st: Stadium): StepFlag {
  if (b.stopped || b.hr) return 'none';
  const ph = TUNING.physics;
  const { p, v } = b;
  let flag: StepFlag = 'none';
  if (b.rolling) {
    const sp = Math.hypot(v.x, v.y);
    const dec = ph.rollFriction * dt;
    if (sp <= dec || sp < 0.5) {
      v.x = v.y = 0;
      b.stopped = true;
      return 'stop';
    }
    const k = (sp - dec) / sp;
    v.x *= k;
    v.y *= k;
  } else {
    const sp = Math.hypot(v.x, v.y, v.z);
    const drag = ph.drag * sp;
    // Lift ⟂ to v in the vertical plane, magnitude k·spin·|v|².
    let nx = 0, ny = 0, nz = 1;
    if (sp > 1e-6) {
      const vz = v.z / sp;
      nx = -vz * (v.x / sp);
      ny = -vz * (v.y / sp);
      nz = 1 - vz * vz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
    }
    const lift = ph.magnus * b.spin * sp * sp;
    v.x += (-drag * v.x + lift * nx) * dt;
    v.y += (-drag * v.y + lift * ny) * dt;
    v.z += (-ph.gravity - drag * v.z + lift * nz) * dt;
  }
  const px = p.x, py = p.y;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;

  // Fence crossing.
  const r0 = Math.hypot(px, py), r1 = Math.hypot(p.x, p.y);
  const spray = sprayOf(p.x, p.y);
  if (r1 > 100) {
    const fence = fenceAt(st, spray);
    if (r0 < fence.dist && r1 >= fence.dist) {
      if (Math.abs(spray) > 45) {
        b.foul = true;
      } else if (p.z > fence.height) {
        b.hr = true;
        return 'hr';
      } else {
        // Rebound off the wall: reverse radial component, damped.
        const ux = p.x / r1, uy = p.y / r1;
        const vr = v.x * ux + v.y * uy;
        v.x -= 1.35 * vr * ux;
        v.y -= 1.35 * vr * uy;
        v.z *= 0.6;
        p.x = ux * (fence.dist - 0.5);
        p.y = uy * (fence.dist - 0.5);
        b.fenceHit = true;
        flag = 'fence';
      }
    }
  }

  if (p.z <= 0 && v.z <= 0) {
    p.z = 0;
    if (!b.landed) {
      b.landed = true;
      b.firstLand = { x: p.x, y: p.y, z: 0 };
      if (Math.abs(sprayOf(p.x, p.y)) > 45) b.foul = true;
      flag = 'land';
    } else if (flag === 'none') flag = 'bounce';
    if (-v.z > 4) {
      v.z = -v.z * ph.restitution;
      v.x *= ph.groundKeep;
      v.y *= ph.groundKeep;
      b.spin *= 0.3;
    } else {
      v.z = 0;
      b.rolling = true;
    }
  }
  return flag;
}

export interface PathSample {
  t: number;
  x: number;
  y: number;
  z: number;
  air: boolean; // has not landed yet
}

export interface Prediction {
  samples: PathSample[];
  landT: number; // first ground contact (Infinity if HR)
  land: V3 | null;
  hr: boolean;
  hrT: number;
  foul: boolean;
  endT: number;
  apexZ: number;
}

/** Deterministic forward prediction with the same integrator (samples every `every` steps). */
export function predict(b0: BallBody, st: Stadium, maxT = 12, every = 2): Prediction {
  const b = cloneBody(b0);
  const dt = TUNING.physics.dt;
  const samples: PathSample[] = [];
  let t = 0, landT = Infinity, hrT = Infinity, apexZ = b.p.z;
  let land: V3 | null = null;
  let k = 0;
  samples.push({ t: 0, x: b.p.x, y: b.p.y, z: b.p.z, air: true });
  while (t < maxT) {
    const f = stepBall(b, dt, st);
    t += dt;
    k++;
    if (b.p.z > apexZ) apexZ = b.p.z;
    if (f === 'land') {
      landT = t;
      land = { ...b.p };
    }
    if (f === 'hr') {
      hrT = t;
      samples.push({ t, x: b.p.x, y: b.p.y, z: b.p.z, air: true });
      break;
    }
    if (k % every === 0 || f === 'land' || f === 'stop') samples.push({ t, x: b.p.x, y: b.p.y, z: b.p.z, air: !b.landed });
    if (b.stopped) break;
    if (b.foul && b.landed) break;
  }
  return { samples, landT, land, hr: b.hr, hrT, foul: b.foul, endT: t, apexZ };
}

/** Carry distance (first landing or fence crossing distance for HRs, ignoring the fence). */
export function carry(evMph: number, laDeg: number): number {
  const b = launch(evMph, laDeg, 0);
  const dt = TUNING.physics.dt;
  const open: Stadium = { id: 'yard', name: 'open', keys: [[9999, 0], [9999, 0], [9999, 0], [9999, 0], [9999, 0]], hazard: 'none' };
  for (let t = 0; t < 15; t += dt) {
    if (stepBall(b, dt, open) === 'land') return Math.hypot(b.p.x, b.p.y);
  }
  return Math.hypot(b.p.x, b.p.y);
}
