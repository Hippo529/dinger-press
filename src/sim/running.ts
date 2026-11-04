// Baserunning: advance decisions from predicted fielding, movement, close-call detection.
import { TUNING } from '../config/tuning';
import { BASES } from './field';
import { ballEta, runnerEta } from './fielding';
import type { Aggression, Runner, V2 } from './types';

export function runnerSpeed(speedRating: number): number {
  return TUNING.running.baseSpeed + TUNING.running.perSpeed * speedRating;
}

export function threshold(agg: Aggression): number {
  return agg === 'aggressive' ? TUNING.running.aggressive : TUNING.running.conservative;
}

/** Recompute force targets: runner forced iff every base behind it down to the batter is occupied. */
export function computeForces(runners: Runner[]): void {
  const onBase = new Set(runners.filter((r) => !r.out && !r.scored && !r.isBatter).map((r) => r.base));
  for (const r of runners) {
    r.forcedTo = 0;
    if (r.out || r.scored) continue;
    if (r.isBatter) {
      r.forcedTo = 1;
      continue;
    }
    let forced = true;
    for (let b = 1; b < r.base; b++) if (!onBase.has(b)) forced = false;
    if (r.base >= 1 && forced) r.forcedTo = r.base + 1;
  }
}

export interface AdvanceInput {
  securePoint: V2;
  secureT: number; // s from now until the ball is secured
  holder: number; // fielder index that secures it
  airCatch: boolean;
  outs: number;
  agg: Aggression;
  aggressiveIds?: Set<number>; // runner ids that always run aggressively (Burner trait)
}

export interface CloseCall {
  runnerId: number;
  base: number; // contested base
  margin: number;
  defaultSend: boolean;
}

/**
 * Set every runner's target base for this play. Processes lead → trail so nobody passes the runner
 * ahead. Returns the most advanced close call (|margin| < closeCall), if any.
 */
export function decideAdvances(runners: Runner[], a: AdvanceInput): CloseCall | null {
  const order = runners.filter((r) => !r.out && !r.scored).sort((x, y) => y.base - x.base);
  let aheadTarget = 5; // bases a runner may not reach (exclusive cap); 4 (home) can be shared
  let close: CloseCall | null = null;
  const holdOnFly = a.airCatch && a.outs < 2;
  for (const r of order) {
    const thr = a.aggressiveIds?.has(r.id) ? TUNING.running.aggressive : threshold(a.agg);
    if (holdOnFly && !r.isBatter) {
      r.target = r.base;
      r.tagWait = true;
      aheadTarget = Math.min(aheadTarget, r.base === 0 ? 5 : r.base);
      continue;
    }
    let tgt = Math.max(r.base, r.forcedTo || r.base);
    if (r.isBatter) tgt = Math.max(tgt, 1);
    for (let b = tgt + 1; b <= 4; b++) {
      if (b < 4 && b >= aheadTarget) break;
      const margin = a.secureT + ballEta(a.securePoint, a.holder, b) - runnerEta(r, b);
      const go = margin > thr;
      if (Math.abs(margin) < TUNING.running.closeCall && (!close || b > close.base)) {
        close = { runnerId: r.id, base: b, margin, defaultSend: go };
      }
      if (!go) break;
      tgt = b;
    }
    r.target = Math.max(tgt, r.forcedTo, r.isBatter ? 1 : r.base);
    if (r.target < 4) aheadTarget = r.target;
  }
  return close;
}

/** Tag-up after a caught fly: runners advance if the throw from the catch point can't beat them. */
export function tagUps(runners: Runner[], from: V2, holder: number, agg: Aggression, outsAfter: number): Runner[] {
  const tagged: Runner[] = [];
  if (outsAfter >= 3) return tagged;
  const thr = threshold(agg);
  const order = runners.filter((r) => !r.out && !r.scored && !r.isBatter).sort((x, y) => y.base - x.base);
  let aheadFree = 5;
  for (const r of order) {
    r.tagWait = false;
    const next = r.base + 1;
    const eta = ballEta(from, holder, next);
    const run = (90 - 0) / r.speed + 0.15; // leave from the bag after the catch
    if (next < aheadFree && eta - run > thr && (r.base === 3 || r.base === 2)) {
      r.target = next;
      tagged.push(r);
    } else {
      r.target = r.base;
      aheadFree = r.base;
    }
    r.d = Math.min(r.d, 0);
  }
  return tagged;
}

/** Move runners one step. Returns ids of runners who scored during this step. */
export function stepRunners(runners: Runner[], dt: number, time: number): number[] {
  const scored: number[] = [];
  for (const r of runners) {
    if (r.out || r.scored || r.tagWait) continue;
    if (r.delay > 0) {
      r.delay -= dt;
      continue;
    }
    if (r.returning) {
      r.d -= r.speed * dt;
      if (r.d <= 0) {
        r.d = 0;
        r.returning = false;
      }
      continue;
    }
    if (r.base >= r.target && r.d <= 0) continue;
    r.d += r.speed * dt;
    while (r.d >= 90) {
      r.d -= 90;
      r.base++;
      if (r.base >= 4) {
        r.scored = true;
        r.scoredAt = time;
        r.d = 0;
        scored.push(r.id);
        break;
      }
      if (r.base >= r.target) {
        r.d = 0;
        break;
      }
    }
  }
  return scored;
}

/** World position of a runner. */
export function runnerPos(r: Runner): V2 {
  if (r.scored) return { ...BASES[0] };
  const a = BASES[Math.min(r.base, 4)];
  const b = BASES[Math.min(r.base + 1, 4)];
  const t = Math.max(0, Math.min(1, r.d / 90));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function isMoving(r: Runner): boolean {
  if (r.out || r.scored) return false;
  if (r.tagWait) return true;
  return r.returning || r.delay > 0 || r.d > 0 || r.target > r.base;
}
