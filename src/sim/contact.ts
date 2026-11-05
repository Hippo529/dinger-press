// Swing grading and grade → exit velocity / launch angle / spray. Pure and deterministic:
// no RNG anywhere in this file (nothing random overrides player input).
import { TUNING } from '../config/tuning';
import { clamp, clamp01, lerp } from '../core/easing';
import { ZONE } from './field';
import type { Grade, Tier } from './types';

export interface WindowCtx {
  heat: number; // 0..99
  contact: number; // rating 0..10
  power: boolean;
  star: boolean;
  newbie: boolean;
  traitMul: number; // product of trait window multipliers (Pesky, Buddy, Streaky, Clutch)
}

export interface Windows {
  perfect: number; // ms (early side)
  perfectLate: number; // ms (late side) = perfect + fixed grace
  good: number;
  weak: number;
  foulFrom: number; // |o| beyond this (and ≤ weak) is FOUL
  scale: number;
}

export function heatWindowMul(heat: number): number {
  return lerp(1, TUNING.timing.heatWindowMin, clamp(heat, 0, 99) / 99);
}

export function windows(c: WindowCtx): Windows {
  const t = TUNING.timing;
  let k = heatWindowMul(c.heat);
  k *= 1 + t.contactRatingSpread * ((c.contact - 5) / 5);
  if (c.power) k *= t.powerWindow;
  if (c.star) k *= t.starWindow;
  if (c.newbie) k *= t.newbieWindow;
  k *= c.traitMul;
  const perfect = t.perfectMs * k;
  const good = t.goodMs * k;
  const weak = t.weakMs * k;
  return { perfect, perfectLate: perfect + t.perfectLateGraceMs, good, weak, foulFrom: good + 0.5 * (weak - good), scale: k };
}

export interface SwingCtx {
  offsetMs: number; // swing − ideal; negative = early
  tier: Tier;
  cross: { x: number; z: number }; // pitch crossing location at the contact plane
  batterHand: 1 | -1; // +1 right-handed batter (stands on the x− side)
  reticle?: { x: number; z: number }; // All-Star reticle position at swing time (zone coords)
  power: boolean;
}

/** Contact radius (ft) for the All-Star reticle. */
export function contactRadius(power: boolean): number {
  return TUNING.timing.contactRadiusFt * (power ? TUNING.timing.powerRadius : 1);
}

export function grade(s: SwingCtx, w: Windows): Grade {
  const o = s.offsetMs;
  if (o < -w.weak || o > w.weak) return 'WHIFF';
  const m = TUNING.timing.zoneMarginFt;
  if (s.tier === 'allstar' && s.reticle) {
    const r = contactRadius(s.power);
    const dx = s.reticle.x - s.cross.x, dz = s.reticle.z - s.cross.z;
    if (Math.hypot(dx, dz) > r) return 'WHIFF';
    if (dz > 0.45 * r) return 'TOPPED';
    if (dz < -0.45 * r) return 'UNDER';
  }
  // Location overrides for clearly-out-of-zone pitches.
  const insideX = s.batterHand === 1 ? s.cross.x < ZONE.xMin - m : s.cross.x > ZONE.xMax + m;
  const awayX = s.batterHand === 1 ? s.cross.x > ZONE.xMax + m : s.cross.x < ZONE.xMin - m;
  if (insideX) return 'JAMMED';
  if (awayX) return o <= 0 ? 'EARLY' : 'LATE';
  if (s.tier === 'pro') {
    if (s.cross.z > ZONE.zMax + m) return 'UNDER';
    if (s.cross.z < ZONE.zMin - m) return 'TOPPED';
  }
  if (o >= -w.perfect && o <= w.perfectLate) return 'PERFECT';
  if (Math.abs(o) <= w.good) return 'GOOD';
  if (Math.abs(o) <= w.foulFrom) return o < 0 ? 'EARLY' : 'LATE';
  return 'FOUL';
}

export interface ContactOut {
  ev: number; // mph
  la: number; // deg
  spray: number; // deg, + toward RF
}

export interface ContactCtx extends SwingCtx {
  powerRating: number; // 0..10
  moonshot: boolean; // trait
  starSwing: boolean;
  dirV: -1 | 0 | 1; // Pro: +1 upper third (lift), −1 lower third (grounder)
  dirH: -1 | 0 | 1; // Pro: −1 left, +1 right (screen/field side)
  maxEv: number;
}

export const PRO_LA_UP = 9;
export const PRO_LA_DOWN = -14;
export const PRO_SPRAY = 12;

/** Map a grade to EV/LA/spray. Deterministic in the inputs. */
export function contactOut(g: Grade, c: ContactCtx, w: Windows): ContactOut {
  const o = c.offsetMs;
  const rel = clamp(o / w.weak, -1, 1); // −1 very early .. +1 very late
  const h = c.batterHand;
  let ev = 0, la = 0, spray = h * rel * 38;
  switch (g) {
    case 'PERFECT': {
      const q = clamp01(Math.abs(o) / Math.max(1, w.perfect));
      ev = lerp(104, 98, q) + (c.moonshot ? 3 : 0);
      la = 27;
      break;
    }
    case 'GOOD': {
      const q = clamp01((Math.abs(o) - w.perfect) / Math.max(1, w.good - w.perfect));
      ev = lerp(96, 86, q);
      la = lerp(20, 3, q);
      break;
    }
    case 'EARLY':
    case 'LATE': {
      const q = clamp01((Math.abs(o) - w.good) / Math.max(1, w.foulFrom - w.good));
      ev = lerp(76, 64, q);
      la = lerp(14, -10, q);
      spray = h * Math.sign(rel || (g === 'EARLY' ? -1 : 1)) * Math.max(Math.abs(spray), 32);
      break;
    }
    case 'JAMMED':
      ev = 58;
      la = 8;
      spray = h * 25; // opposite field (late-looking)
      break;
    case 'TOPPED':
      ev = 64;
      la = -12;
      break;
    case 'UNDER':
      ev = 70;
      la = 58;
      break;
    case 'FOUL':
      ev = 75;
      la = 20;
      spray = h * Math.sign(rel || 1) * lerp(50, 60, clamp01((Math.abs(o) - w.foulFrom) / Math.max(1, w.weak - w.foulFrom)));
      break;
    case 'WHIFF':
      return { ev: 0, la: 0, spray: 0 };
  }
  // Pitch height shifts launch angle (low pitches go on the ground), except for All-Star reticle aim.
  if (c.tier !== 'allstar' && (g === 'PERFECT' || g === 'GOOD' || g === 'EARLY' || g === 'LATE')) la += clamp((c.cross.z - 2.55) * 9, -9, 9);
  ev += (c.powerRating - 5) * 1.6;
  if (c.power) ev *= TUNING.timing.powerEv;
  if (c.starSwing && (g === 'PERFECT' || g === 'GOOD')) ev = c.maxEv;
  if (g !== 'FOUL' && g !== 'TOPPED' && g !== 'UNDER' && g !== 'JAMMED') {
    if (c.tier === 'pro') {
      la += c.dirV > 0 ? PRO_LA_UP : c.dirV < 0 ? PRO_LA_DOWN : 0;
      spray += c.dirH * PRO_SPRAY;
    } else if (c.tier === 'allstar' && c.reticle) {
      // Bat below the ball centre → more loft; above → flatter.
      const r = contactRadius(c.power);
      la += clamp((c.cross.z - c.reticle.z) / r, -1, 1) * 22;
    }
  }
  if (g === 'TOPPED' && c.tier === 'pro' && c.dirV < 0) la = -14;
  return { ev: Math.round(ev * 10) / 10, la, spray: clamp(spray, -62, 62) };
}

export function maxEvFor(powerRating: number): number {
  return Math.min(118, 106 + powerRating * 1.2);
}
