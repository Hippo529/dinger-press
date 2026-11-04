// At-bat: pre-pitch, windup, release, swing grading, take/whiff resolution, contact.
import { TUNING } from '../config/tuning';
import { ROSTER_BY_ID } from '../config/roster';
import { cpuPitch, cpuSwing } from './ai';
import { contactOut, grade, maxEvFor, windows } from './contact';
import { banner, setPhase, type Ctx } from './ctx';
import { inZone } from './field';
import {
  MEATBALL_TARGET, armEffect, chargeOutcome, crossing, fastballFlight, makePitch, pitchPos, useArm, PITCHES, applySteer,
} from './pitch';
import { startPlay } from './play';
import { isStarChance, leverage, traitWindowMul } from './stars';
import {
  activeHeat, activeTier, battingTeam, currentBatterId, currentPitcherId, fieldingTeam, humanBatter, humanPitcher, type SwingRec,
} from './state';
import { onTakeOrWhiff } from './flow';

/** Enter pre-pitch. `newPa` adds the walk-up beat for the CPU pitcher. */
export function enterPrePitch(c: Ctx, newPa: boolean): void {
  const s = c.s;
  s.pitch = null;
  s.swing = null;
  s.ball = null;
  s.play = null;
  s.thr = null;
  s.charging = false;
  s.cpuSwingAt = null;
  s.steerInput = 0;
  if (newPa) {
    s.power = false;
    s.starArmed = false;
    const id = currentBatterId(s);
    s.lowerThird = { id, t: s.time };
    c.emit({ type: 'paStart', batter: id, team: battingTeam(s) });
    s.starChance = !s.mill && !s.tiebreak && isStarChance(s);
    s.starChanceTeam = s.starChance ? battingTeam(s) : -1;
    if (s.starChance) c.emit({ type: 'starChance', team: battingTeam(s) });
  }
  s.cpuPrePitchS = newPa ? 0.9 : TUNING.pitch.prePitchCpuS;
  const rep = ROSTER_BY_ID[currentPitcherId(s)].pitches;
  if (s.pitchSel >= rep.length) s.pitchSel = 0;
  setPhase(c, 'prePitch');
}

export function startWindup(c: Ctx): void {
  setPhase(c, 'windup');
  c.emit({ type: 'windup' });
}

/** Called at the end of the windup: build the pitch from CPU plan or the human's charge. */
export function releasePitch(c: Ctx): void {
  const s = c.s;
  const pid = currentPitcherId(s);
  const pch = ROSTER_BY_ID[pid];
  const team = s.teams[fieldingTeam(s)];
  const heat = activeHeat(s);
  const hp = humanPitcher(s);
  const firstEver = s.cfg.firstEver && s.totalPitches === 0 && humanBatter(s) !== null;
  let type = pch.pitches[0], target = { x: 0, z: 2.5 }, star = false, speedMul = 1;
  if (s.cfg.cage && s.cfg.cage.pitch !== 'mix') {
    type = s.cfg.cage.pitch;
    target = { x: c.rng.range(-0.6, 0.6), z: c.rng.range(1.9, 3.2) };
  } else if (hp !== null) {
    type = pch.pitches[Math.min(s.pitchSel, pch.pitches.length - 1)];
    const charge = s.cfg.assistPitch ? (TUNING.pitch.sweetLo + TUNING.pitch.sweetHi) / 2 : s.chargeLevel;
    const co = s.cfg.assistPitch ? { speedMul: 1, scatter: TUNING.pitch.assistScatterFt, quality: 'perfect' as const } : chargeOutcome(charge);
    speedMul = co.speedMul;
    target = { x: s.pitchAim.x + c.rng.gauss() * co.scatter, z: s.pitchAim.z + c.rng.gauss() * co.scatter };
    star = s.starArmed && team.stars > 0;
  } else {
    const plan = cpuPitch(c.rng, heat, pid, team.arm, team.stars, leverage(s), s.balls);
    type = plan.type;
    target = plan.target;
    star = plan.star && team.stars > 0;
    if (s.mill || s.tiebreak || (s.cfg.clutch?.homerSwings ?? 0) > 0) {
      // derby-style pitching: mostly hittable strikes
      target = { x: c.rng.range(-0.55, 0.55), z: c.rng.range(2.0, 3.1) };
      star = false;
    }
  }
  if (star) {
    team.stars -= 1;
    s.starArmed = false;
    c.emit({ type: 'starSpent', team: fieldingTeam(s), kind: 'pitch' });
  }
  const eff = armEffect(team.arm, type);
  let T = fastballFlight(heat) * PITCHES[type].flightMul;
  if (pch.traits.includes('heat')) T *= 0.96;
  T = T / (speedMul * (0.85 + 0.15 * eff));
  let breakMul = eff * (pch.traits.includes('oldtricks') ? 1.2 : 1);
  if (firstEver) {
    T = TUNING.pitch.firstPitchFlight;
    target = { ...MEATBALL_TARGET };
    breakMul = 0;
    type = 'FF';
  }
  if (!s.mill && !s.cfg.cage) useArm(team.arm, type);
  s.pitch = makePitch({ type, target, T, hand: pch.throws, star, breakMul, meatball: firstEver }, c.rng);
  s.releaseT = s.time;
  s.totalPitches++;
  s.stats.pitchesTotal++;
  // Lock windows at release (POWER/star lock too).
  const hb = humanBatter(s);
  const bid = currentBatterId(s);
  const bch = ROSTER_BY_ID[bid];
  const newbie = hb !== null && s.pitchesSeen < s.cfg.newbiePitchesLeft;
  if (hb !== null) s.pitchesSeen++;
  if (hb === null) {
    const plan = cpuSwing(c.rng, heat, crossing(s.pitch), s.strikes, s.balls, star);
    s.cpuSwingAt = plan.swing ? s.releaseT + T + plan.offsetMs / 1000 : null;
    s.cpuPower = plan.power;
    s.power = plan.power;
  }
  s.win = windows({
    heat,
    contact: bch.contact,
    power: s.power,
    star: s.starArmed && hb !== null,
    newbie,
    traitMul: traitWindowMul(s, bid, s.starChance),
  });
  c.emit({ type: 'pitchReleased', pitch: type, star, mph: s.pitch.mph, T });
  if (star) c.emit({ type: 'chatter', key: 'starPitch' });
  setPhase(c, 'pitch');
}

/** Per-step update during the pitch phase. */
export function stepPitch(c: Ctx, dt: number): void {
  const s = c.s;
  const ps = s.pitch!;
  ps.t = s.time - s.releaseT;
  if (s.steerInput !== 0 && humanPitcher(s) !== null) applySteer(ps, s.steerInput * TUNING.pitch.steerRateFtPerS * dt);
  if (s.cpuSwingAt !== null && s.time >= s.cpuSwingAt) {
    const t = s.cpuSwingAt;
    s.cpuSwingAt = null;
    doSwing(c, { t, offsetMs: 0, grade: null, power: s.cpuPower, star: false, zx: 0, zz: 0, dirV: 0, dirH: 0 });
    if (s.phase !== 'pitch') return;
  }
  const w = s.win!;
  const resolveAt = ps.T + w.weak / 1000 + 0.03;
  if (s.swing && s.swing.grade === 'WHIFF') {
    if (ps.t >= Math.max(ps.T + 0.12, s.swing.t - s.releaseT + 0.05)) {
      onTakeOrWhiff(c, 'whiff');
    }
    return;
  }
  if (!s.swing && ps.t >= resolveAt) {
    const cr = crossing(ps);
    const strike = inZone(cr.x, cr.z, 0.12);
    s.last.call = strike ? 'STRIKE' : 'BALL';
    c.emit({ type: 'take', call: strike ? 'strike' : 'ball' });
    onTakeOrWhiff(c, strike ? 'strike' : 'ball');
  }
}

/** Resolve a swing at its exact timestamp against the analytic pitch path. */
export function doSwing(c: Ctx, rec: SwingRec): void {
  const s = c.s;
  if (s.phase !== 'pitch' || s.swing || !s.pitch || !s.win) return;
  const ps = s.pitch;
  const offsetMs = (rec.t - s.releaseT - ps.T) * 1000;
  rec.offsetMs = offsetMs;
  rec.power = s.power;
  rec.star = s.starArmed;
  s.swing = rec;
  s.stats.swings++;
  const bid = currentBatterId(s);
  const bch = ROSTER_BY_ID[bid];
  const hb = humanBatter(s);
  const tier = hb !== null ? activeTier(s) : 'pro';
  const cr = crossing(ps);
  const reticle = tier === 'allstar' && hb !== null ? { x: rec.zx, z: rec.zz } : undefined;
  const ctx = { offsetMs, tier, cross: cr, batterHand: bch.bats, reticle, power: s.power };
  const g = grade(ctx, s.win);
  rec.grade = g;
  s.last.grade = g;
  s.last.offsetMs = offsetMs;
  s.last.swingT = s.time;
  s.last.call = '';
  if (rec.star && hb !== null) {
    const t = s.teams[battingTeam(s)];
    if (t.stars > 0) {
      t.stars--;
      c.emit({ type: 'starSpent', team: battingTeam(s), kind: 'swing' });
    }
    s.starArmed = false;
  }
  c.emit({ type: 'swing', offsetMs });
  if (g === 'WHIFF') {
    s.last.ev = 0;
    c.emit({ type: 'whiff' });
    return;
  }
  const out = contactOut(g, {
    ...ctx,
    powerRating: bch.power,
    moonshot: bch.traits.includes('moonshot'),
    starSwing: rec.star,
    dirV: tier === 'pro' ? rec.dirV : 0,
    dirH: tier === 'pro' ? rec.dirH : 0,
    maxEv: maxEvFor(bch.power),
  }, s.win);
  s.last.ev = out.ev;
  s.last.la = out.la;
  s.last.spray = out.spray;
  s.last.dist = 0;
  if (out.ev > s.stats.maxEv && hb !== null) s.stats.maxEv = out.ev;
  if (g === 'PERFECT') {
    s.perfectStreak++;
    s.bestPerfectStreak = Math.max(s.bestPerfectStreak, s.perfectStreak);
    if (hb !== null) s.stats.perfect++;
  } else s.perfectStreak = 0;
  c.emit({ type: 'contact', grade: g, ev: out.ev, la: out.la, spray: out.spray, offsetMs, power: s.power, star: rec.star });
  const pos = pitchPos(ps, ps.T);
  startPlay(c, out, { x: cr.x, y: pos.y, z: cr.z }, g);
}

export function bannerCount(c: Ctx): void {
  banner(c, `${c.s.balls}-${c.s.strikes}`);
}
