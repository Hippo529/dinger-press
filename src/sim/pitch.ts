// Parametric pitch paths (D1): exact, controllable flight time with visible break.
import { TUNING } from '../config/tuning';
import { clamp, clamp01, lerp } from '../core/easing';
import { CONTACT_Y, ZONE_MID } from './field';
import type { Rng } from '../core/rng';
import type { PitchType, V3 } from './types';

export interface PitchDef {
  name: string;
  short: string;
  B: number; // lateral break, ft (for a right-handed pitcher; + = toward pitcher's arm side → batter's x+? see sign)
  D: number; // extra drop beyond the straight line, ft
  p: number; // lateral break exponent (higher = later break)
  flightMul: number; // flight time multiplier vs fastball (off-speed 1.15–1.25)
  spinHz: number; // visual spin rate (render tell)
  wobble: number; // knuckler wobble amplitude, ft
}

export const PITCHES: Record<PitchType, PitchDef> = {
  FF: { name: 'Four-Seam', short: '4S', B: 0.25, D: 0.9, p: 2, flightMul: 1.0, spinHz: 38, wobble: 0 },
  SI: { name: 'Sinker', short: 'SI', B: 0.8, D: 1.7, p: 2.5, flightMul: 1.04, spinHz: 34, wobble: 0 },
  CU: { name: 'Curve', short: 'CU', B: -0.7, D: 3.6, p: 2, flightMul: 1.25, spinHz: 42, wobble: 0 },
  SL: { name: 'Slider', short: 'SL', B: -1.2, D: 1.5, p: 3, flightMul: 1.15, spinHz: 40, wobble: 0 },
  CH: { name: 'Changeup', short: 'CH', B: 0.6, D: 2.5, p: 2, flightMul: 1.2, spinHz: 28, wobble: 0 },
  SP: { name: 'Splitter', short: 'SP', B: 0.2, D: 3.0, p: 4, flightMul: 1.18, spinHz: 18, wobble: 0 },
  SC: { name: 'Screwball', short: 'SC', B: 1.25, D: 2.1, p: 2.5, flightMul: 1.22, spinHz: 36, wobble: 0 },
  KN: { name: 'Knuckler', short: 'KN', B: 0, D: 2.2, p: 2, flightMul: 1.25, spinHz: 1.5, wobble: 0.35 },
};

/** Fastball flight time (s) for HEAT 0..99: piecewise linear 0.85 → 0.65 (50) → 0.50 (99). */
export function fastballFlight(heat: number): number {
  const h = clamp(heat, 0, 99);
  const tp = TUNING.pitch;
  return h <= 50 ? lerp(tp.flightHeat0, tp.flightHeat50, h / 50) : lerp(tp.flightHeat50, tp.flightHeat99, (h - 50) / 49);
}

/** Display speed in "arcade mph". */
export function mphFor(T: number): number {
  return Math.round(40 + 28 / T);
}

export interface PitchState {
  type: PitchType;
  release: V3;
  target: V3; // crossing point at the contact plane (x, CONTACT_Y, z)
  B: number;
  D: number;
  p: number;
  T: number;
  t: number; // elapsed since release, s
  steer: number;
  steerBudget: number;
  wobble: number;
  wobbleF: number;
  star: boolean;
  mph: number;
  hand: 1 | -1; // pitcher handedness (+1 right)
  meatball: boolean;
}

export interface PitchOrder {
  type: PitchType;
  target: { x: number; z: number };
  T: number;
  hand: 1 | -1;
  star: boolean;
  breakMul: number; // from stamina, traits, star
  meatball?: boolean;
}

export function makePitch(o: PitchOrder, rng: Rng): PitchState {
  const def = PITCHES[o.type];
  const bm = o.breakMul * (o.star ? TUNING.pitch.starBreak : 1);
  return {
    type: o.type,
    release: { x: -1.7 * o.hand, y: 54.5, z: 5.7 },
    target: { x: o.target.x, y: CONTACT_Y, z: o.target.z },
    B: o.meatball ? 0 : def.B * bm * o.hand,
    D: o.meatball ? 0.9 : def.D * (o.star ? Math.max(1, bm * 0.75) : 1),
    p: def.p,
    T: o.T,
    t: 0,
    steer: 0,
    steerBudget: Math.max(0.35, Math.abs(def.B) + def.D * 0.25) * TUNING.pitch.steerFrac * (o.star ? 1.3 : 1),
    wobble: o.meatball ? 0 : def.wobble * bm,
    wobbleF: 3 + rng.int(3),
    star: o.star,
    mph: mphFor(o.T),
    hand: o.hand,
    meatball: !!o.meatball,
  };
}

/** Position at time t since release (extrapolated linearly past the contact plane). */
export function pitchPos(ps: PitchState, t: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const s = t / ps.T;
  if (s <= 1) return posAtS(ps, Math.max(0, s), out);
  posAtS(ps, 1, out);
  const vx = dxds(ps, 1) / ps.T, vy = (CONTACT_Y - ps.release.y) / ps.T, vz = dzds(ps, 1) / ps.T;
  const dt = t - ps.T;
  out.x += vx * dt;
  out.y += vy * dt;
  out.z = Math.max(0.1, out.z + vz * dt);
  return out;
}

function posAtS(ps: PitchState, s: number, out: V3): V3 {
  const { release: r, target: g } = ps;
  const Bx = ps.B + ps.steer;
  out.x = r.x + (g.x - r.x - ps.B) * s + Bx * Math.pow(s, ps.p) + ps.wobble * Math.sin(ps.wobbleF * Math.PI * s) * Math.sin(Math.PI * s);
  out.y = r.y + (CONTACT_Y - r.y) * s;
  out.z = r.z + (g.z - r.z - ps.D) * s + ps.D * s * s;
  return out;
}
function dxds(ps: PitchState, s: number): number {
  return ps.target.x - ps.release.x - ps.B + (ps.B + ps.steer) * ps.p * Math.pow(s, ps.p - 1);
}
function dzds(ps: PitchState, s: number): number {
  return ps.target.z - ps.release.z - ps.D + 2 * ps.D * s;
}

/** Velocity (ft/s) at time t. */
export function pitchVel(ps: PitchState, t: number): V3 {
  const s = clamp01(t / ps.T);
  return { x: dxds(ps, s) / ps.T, y: (CONTACT_Y - ps.release.y) / ps.T, z: dzds(ps, s) / ps.T };
}

/** Final crossing location including steer. */
export function crossing(ps: PitchState): { x: number; z: number } {
  return { x: ps.target.x + ps.steer, z: ps.target.z };
}

/** Apply steer input, clamped to the budget, only until steerUntilS of the flight. */
export function applySteer(ps: PitchState, dx: number): void {
  if (ps.t / ps.T > TUNING.pitch.steerUntilS) return;
  ps.steer = clamp(ps.steer + dx, -ps.steerBudget, ps.steerBudget);
}

// ---------- stamina / tiredness ----------
export interface ArmState {
  stamina: number; // 0..100
  tired: Partial<Record<PitchType, number>>; // 0..60
}
export function newArm(): ArmState {
  return { stamina: 100, tired: {} };
}
/** Effectiveness multiplier (speed, break, accuracy) for a pitch type. */
export function armEffect(arm: ArmState, type: PitchType): number {
  const st = TUNING.stamina;
  return Math.max(0.7, 1 - st.staminaEffect * (1 - arm.stamina / 100) - st.tiredEffect * (arm.tired[type] ?? 0));
}
export function useArm(arm: ArmState, type: PitchType): void {
  const st = TUNING.stamina;
  arm.stamina = clamp(arm.stamina - st.perPitch, 0, 100);
  for (const k of Object.keys(arm.tired) as PitchType[]) if (k !== type) arm.tired[k] = Math.max(0, (arm.tired[k] ?? 0) - st.tiredDecay);
  arm.tired[type] = Math.min(60, (arm.tired[type] ?? 0) + st.tiredPerUse);
}
export function restArm(arm: ArmState): void {
  arm.stamina = clamp(arm.stamina + TUNING.stamina.inningRecover, 0, 100);
}

// ---------- player charge → pitch ----------
export interface ChargeResult {
  speedMul: number; // ≤ 1
  scatter: number; // ft
  quality: 'early' | 'perfect' | 'late';
}
/** charge in 0..∞ (1 = ring full). Sweet band gives full velocity and accuracy. */
export function chargeOutcome(charge: number): ChargeResult {
  const tp = TUNING.pitch;
  if (charge < tp.sweetLo) {
    const k = clamp01((tp.sweetLo - charge) / tp.sweetLo);
    return { speedMul: 1 - tp.earlyVeloLoss * k, scatter: 0.12 + 0.25 * k, quality: 'early' };
  }
  if (charge <= tp.sweetHi) return { speedMul: 1, scatter: 0.06, quality: 'perfect' };
  const k = clamp01((charge - tp.sweetHi) / (1.25 - tp.sweetHi));
  return { speedMul: 1, scatter: 0.2 + tp.lateScatterFt * k, quality: 'late' };
}

export const MEATBALL_TARGET = { x: ZONE_MID.x, z: ZONE_MID.z };
