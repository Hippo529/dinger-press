// CPU batter and pitcher. Skill depends only on HEAT (no hidden late-game boost).
import { TUNING } from '../config/tuning';
import { clamp, lerp } from '../core/easing';
import type { Rng } from '../core/rng';
import { ROSTER_BY_ID } from '../config/roster';
import { ZONE, inZone } from './field';
import { armEffect, type ArmState } from './pitch';
import type { PitchType } from './types';

export interface CpuParams {
  sdMs: number; // timing sd
  zoneSwing: number; // P(swing | in zone)
  chaseSwing: number; // P(swing | out of zone)
  zoneRate: number; // pitcher P(target in zone)
  accuracyFt: number; // pitcher aim error sd at full stamina
  edgeBias: number; // pitcher preference for zone edges 0..1
}

export function cpuParams(heat: number): CpuParams {
  const d = clamp(heat, 0, 99) / 99;
  const h = TUNING.heat;
  return {
    sdMs: lerp(h.cpuSdMaxMs, h.cpuSdMinMs, d),
    zoneSwing: lerp(0.55, 0.74, d),
    chaseSwing: lerp(0.36, 0.18, d),
    zoneRate: lerp(0.6, 0.66, d),
    accuracyFt: lerp(0.55, 0.2, d),
    edgeBias: lerp(0.15, 0.8, d),
  };
}

export interface CpuSwingPlan {
  swing: boolean;
  offsetMs: number;
  power: boolean;
}

/** Decide at release whether and when the CPU batter swings. */
export function cpuSwing(rng: Rng, heat: number, cross: { x: number; z: number }, strikes: number, balls: number, starPitch: boolean): CpuSwingPlan {
  const p = cpuParams(heat);
  const zone = inZone(cross.x, cross.z, 0.08);
  let prob = zone ? p.zoneSwing : p.chaseSwing;
  if (strikes === 2) prob += 0.14;
  else if (strikes === 0 && balls === 0) prob -= 0.15; // first-pitch patience
  if (balls === 3 && !zone) prob -= 0.15;
  const swing = rng.chance(clamp(prob, 0, 0.97));
  const sd = p.sdMs * (starPitch ? 1.5 : 1);
  const offsetMs = rng.gauss() * sd;
  const power = swing && strikes < 2 && balls >= 2 && rng.chance(0.35);
  return { swing, offsetMs, power };
}

export interface CpuPitchPlan {
  index: number; // index in repertoire
  type: PitchType;
  target: { x: number; z: number };
  star: boolean;
}

/** Choose pitch type and target. Avoids tired pitches; aims edges more at higher HEAT. */
export function cpuPitch(rng: Rng, heat: number, pitcherId: string, arm: ArmState, stars: number, leverage: number, balls: number): CpuPitchPlan {
  const ch = ROSTER_BY_ID[pitcherId];
  const rep = ch.pitches;
  const p = cpuParams(heat);
  // weights = effectiveness², so tired pitches get picked less
  const w = rep.map((t) => Math.pow(armEffect(arm, t), 6));
  const sum = w.reduce((a, b) => a + b, 0);
  let r = rng.next() * sum;
  let index = 0;
  for (let i = 0; i < rep.length; i++) {
    r -= w[i];
    if (r <= 0) {
      index = i;
      break;
    }
  }
  const inZ = rng.chance(balls === 3 ? 0.85 : p.zoneRate);
  let x: number, z: number;
  if (inZ) {
    const edge = rng.chance(p.edgeBias);
    x = edge ? rng.pick([ZONE.xMin + 0.15, ZONE.xMax - 0.15]) + rng.range(-0.1, 0.1) : rng.range(-0.5, 0.5);
    z = edge ? rng.pick([ZONE.zMin + 0.2, ZONE.zMax - 0.2]) : rng.range(2.1, 3.0);
  } else {
    x = rng.chance(0.5) ? ZONE.xMin - rng.range(0.3, 0.9) : ZONE.xMax + rng.range(0.3, 0.9);
    z = rng.range(ZONE.zMin - 0.6, ZONE.zMax + 0.6);
  }
  const eff = armEffect(arm, rep[index]);
  const err = p.accuracyFt * (2 - eff);
  x += rng.gauss() * err * 0.6;
  z += rng.gauss() * err * 0.6;
  const star = stars >= 2 && leverage >= 0.5 && rng.chance(0.5);
  return { index, type: rep[index], target: { x: clamp(x, -2.2, 2.2), z: clamp(z, 0.8, 4.6) }, star };
}
