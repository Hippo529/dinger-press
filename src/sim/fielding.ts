// Automated fielding: deterministic intercept, coverage per fundamentals, throw decisions.
import { TUNING } from '../config/tuning';
import { BASES, B1, B2, B3, C, CF, HOME_POS, LF, MOUND, P, RF, SS, dist2 } from './field';
import type { Prediction } from './physics';
import type { Fielder, Runner, V2 } from './types';

export interface Intercept {
  fielder: number;
  t: number; // sim seconds after contact
  point: V2;
  air: boolean; // caught before first landing
  slack: number; // t − earliest reach time
}

export function fielderSpeed(speedRating: number): number {
  return TUNING.fielding.speedBase + TUNING.fielding.perSpeed * speedRating;
}

/** Earliest intercept for one fielder along the predicted path. */
export function interceptFor(f: Fielder, idx: number, pred: Prediction): Intercept | null {
  if (pred.hr) return null;
  const ft = TUNING.fielding;
  const s = pred.samples;
  for (let k = 1; k < s.length; k++) {
    const p = s[k];
    if (p.z > ft.catchHeight) continue;
    const catchable = !p.air || p.z <= ft.catchHeight;
    if (!catchable) continue;
    // Catcher and pitcher don't chase balls that land deep.
    const reach = ft.react + (idx === P ? ft.pitcherReact : 0) + Math.hypot(f.pos.x - p.x, f.pos.y - p.y) / f.speed;
    if (reach <= p.t) {
      const air = p.air && p.z > 0.05;
      if (air && p.z > ft.catchHeight) continue;
      return { fielder: idx, t: p.t, point: { x: p.x, y: p.y }, air, slack: p.t - reach };
    }
  }
  // Ball stops (or ends) where nobody reached it in time: go to the resting point.
  const last = s[s.length - 1];
  const reach = ft.react + Math.hypot(f.pos.x - last.x, f.pos.y - last.y) / f.speed;
  return { fielder: idx, t: Math.max(reach, last.t), point: { x: last.x, y: last.y }, air: false, slack: 0 };
}

/** The chaser is the fielder with the smallest intercept time (ties → lower index). */
export function bestIntercept(fielders: Fielder[], pred: Prediction): Intercept | null {
  let best: Intercept | null = null;
  for (let i = 0; i < fielders.length; i++) {
    const it = interceptFor(fielders[i], i, pred);
    if (!it) continue;
    // Pitchers and catchers only take balls in their own territory (comebackers, dribblers, pop-ups).
    if (fielders.length === 9 && i === P && Math.hypot(it.point.x - MOUND.x, it.point.y - MOUND.y) > 40) continue;
    if (fielders.length === 9 && i === C && Math.hypot(it.point.x, it.point.y) > 35) continue;
    if (!best || it.t < best.t - 1e-9) best = it;
  }
  return best;
}

/** Who covers which base, given the chaser and ball direction. Returns base → fielder index. */
export function coverage(chaser: number, sprayDeg: number): Record<number, number> {
  const cov: Record<number, number> = {};
  cov[1] = chaser === B1 ? P : B1;
  const leftSide = sprayDeg < 0;
  let second = leftSide ? B2 : SS;
  if (second === chaser) second = leftSide ? SS : B2;
  cov[2] = second;
  cov[3] = chaser === B3 ? (second === SS ? P : SS) : B3;
  cov[4] = chaser === C ? P : C;
  return cov;
}

/** Relay man for deep balls: SS for left/centre, 2B for right. */
export function relayMan(sprayDeg: number, chaser: number, cov: Record<number, number>): number {
  let r = sprayDeg > 12 ? B2 : SS;
  if (r === chaser || r === cov[2]) r = r === SS ? B2 : SS;
  if (r === chaser || r === cov[2]) return -1;
  return r;
}

/** Assign every fielder a goal for this play. */
export function assignRoles(fielders: Fielder[], it: Intercept, sprayDeg: number): Record<number, number> {
  const cov = coverage(it.fielder, sprayDeg);
  const covering = new Set(Object.values(cov));
  const deep = Math.hypot(it.point.x, it.point.y) > TUNING.fielding.relayDist;
  const relay = deep ? relayMan(sprayDeg, it.fielder, cov) : -1;
  for (let i = 0; i < fielders.length; i++) {
    const f = fielders[i];
    if (i === it.fielder) {
      f.role = 'chase';
      f.goal = { ...it.point };
    } else if (i === relay) {
      f.role = 'relay';
      const tgt = BASES[2];
      f.goal = { x: it.point.x + (tgt.x - it.point.x) * 0.45, y: it.point.y + (tgt.y - it.point.y) * 0.45 };
    } else if (covering.has(i)) {
      const base = Number(Object.keys(cov).find((b) => cov[Number(b)] === i));
      f.role = 'cover';
      f.goal = { ...BASES[base] };
    } else if (i === LF || i === CF || i === RF) {
      f.role = 'backup';
      const h = HOME_POS[i];
      f.goal = { x: h.x + (it.point.x - h.x) * 0.35, y: h.y + (it.point.y - h.y) * 0.35 };
    } else {
      f.role = 'backup';
      f.goal = { x: HOME_POS[i].x * 0.8, y: HOME_POS[i].y * 0.8 };
    }
  }
  return cov;
}

// ---------- throws ----------

export function throwSpeedFrom(idx: number): number {
  return idx >= LF ? TUNING.fielding.throwOutfield : TUNING.fielding.throwInfield;
}

/** Ball ETA (s from now) to a base from a holder position, including transfer and any relay. */
export function ballEta(from: V2, holderIdx: number, base: number): number {
  const ft = TUNING.fielding;
  const d = dist2(from, BASES[base]);
  const relay = d > ft.relayDist + 40 ? 0.3 : 0;
  return ft.transfer + relay + d / throwSpeedFrom(holderIdx);
}

/** Runner ETA (s from now) to reach `base` (≥ runner.base+1) along the paths. */
export function runnerEta(r: Runner, base: number): number {
  if (r.out || r.scored) return Infinity;
  if (r.returning) return Infinity;
  const remain = (base - r.base) * 90 - r.d;
  if (remain <= 0) return 0;
  return Math.max(0, r.delay) + remain / r.speed;
}

export interface ThrowChoice {
  base: number;
  runner: number; // runner id or −1
  margin: number; // runner ETA − ball ETA (− tag) ; >0 means out
  out: boolean;
}

/**
 * Pick the best throw: the out with the largest margin, preferring the lead runner on ties (0.05 s).
 * If no out is possible, throw ahead of the lead moving runner (or null if nobody moves).
 */
export function chooseThrow(from: V2, holderIdx: number, runners: Runner[]): ThrowChoice | null {
  const tag = TUNING.fielding.tag;
  let best: ThrowChoice | null = null;
  let leadMoving: Runner | null = null;
  for (const r of runners) {
    if (r.out || r.scored) continue;
    const moving = r.d > 0 || r.delay > 0 || r.target > r.base;
    if (!moving) continue;
    if (!leadMoving || r.base + r.d / 90 > leadMoving.base + leadMoving.d / 90) leadMoving = r;
    const next = r.base + 1;
    const candidates = r.target > next ? [next, r.target] : [next];
    for (const b of candidates) {
      if (b > 4) continue;
      const force = r.forcedTo === b;
      const margin = runnerEta(r, b) - ballEta(from, holderIdx, b) - (force ? 0 : tag);
      const cand = { base: b, runner: r.id, margin, out: margin > 0 };
      if (!best || margin > best.margin + 0.05 || (Math.abs(margin - best.margin) <= 0.05 && b > best.base)) best = cand;
    }
  }
  if (best && best.out) return best;
  if (!leadMoving) return null;
  const ahead = Math.min(4, Math.max(leadMoving.target, leadMoving.base + 1));
  return { base: ahead, runner: -1, margin: best ? best.margin : -9, out: false };
}

export function explainOut(margin: number, nthOut: number): string {
  if (nthOut >= 2) return 'Two! Turned the double play';
  if (margin > 1.2) return 'Out by a mile';
  if (margin < 0.25) return 'Bang-bang — OUT';
  return 'Out at the bag';
}
export function explainSafe(margin: number): string {
  if (margin > -0.3) return 'Beat the throw by a step';
  return 'Safe — no contest';
}
