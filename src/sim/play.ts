// Live ball: flight, chase, catch/field, throws, runners, outs and runs.
import { TUNING } from '../config/tuning';
import { ROSTER_BY_ID } from '../config/roster';
import { setPhase, type Ctx } from './ctx';
import { BASES, STADIUMS } from './field';
import { assignRoles, bestIntercept, chooseThrow, explainOut, explainSafe, throwSpeedFrom } from './fielding';
import { launch, predict, stepBall } from './physics';
import { computeForces, decideAdvances, isMoving, stepRunners, tagUps } from './running';
import { currentBatterId, humanBatter, humanPitcher, makeRunner, type PlayState } from './state';
import type { ContactOut } from './contact';
import type { Grade, V3 } from './types';
import { endPlay } from './flow';

export function startPlay(c: Ctx, out: ContactOut, at: V3, g: Grade): void {
  const s = c.s;
  const st = STADIUMS[s.cfg.stadium];
  const ball = launch(out.ev, out.la, out.spray, Math.max(0.6, at.z));
  ball.p.x = at.x;
  ball.p.y = 1.5;
  s.ball = ball;
  const pred = predict(ball, st);
  const lite = !!(s.mill || s.cfg.cage || s.tiebreak || s.cfg.clutch?.homerSwings);
  const play: PlayState = {
    pred, chaser: -1, secureT: Infinity, air: false, diving: false, secured: false, holder: -1, cov: {},
    outsOnPlay: 0, runsOnPlay: [], thirdOutForce: false, thirdOutT: Infinity, throwPromptUntil: Infinity, firstThrowDone: false,
    closeCall: null, text: '', hitBases: 0, hr: pred.hr, foul: pred.foul || g === 'FOUL', lite, startT: s.time,
    landedEmitted: false, minTimeScaleNote: 1,
  };
  s.play = play;
  setPhase(c, 'live');
  if (play.foul) {
    c.emit({ type: 'foul' });
    return;
  }
  if (lite) return;
  // Batter-runner joins the runners list.
  const br = makeRunner(s, currentBatterId(s), 0, true);
  br.delay = TUNING.running.batterDelay;
  s.runners.push(br);
  computeForces(s.runners);
  if (pred.hr) {
    for (const r of s.runners) if (!r.out) r.target = 4;
    return;
  }
  const it = bestIntercept(s.fielders, pred);
  if (!it) return;
  play.chaser = it.fielder;
  play.secureT = s.time + it.t;
  play.air = it.air;
  play.diving = it.air && it.slack < TUNING.fielding.divingSlack;
  play.cov = assignRoles(s.fielders, it, out.spray);
  const burners = new Set(s.runners.filter((r) => ROSTER_BY_ID[r.charId]?.traits.includes('burner')).map((r) => r.id));
  const close = decideAdvances(s.runners, {
    securePoint: it.point, secureT: it.t, holder: it.fielder, airCatch: it.air, outs: s.outs, agg: s.cfg.aggression, aggressiveIds: burners,
  });
  if (close && humanBatter(s) !== null) {
    play.closeCall = { runnerId: close.runnerId, base: close.base, until: s.time + TUNING.flow.sendHoldS, send: null, defaultSend: close.defaultSend };
    c.emit({ type: 'sendHoldPrompt', base: close.base });
  }
  // Situational explanation for clean hits.
  const landD = pred.land ? Math.hypot(pred.land.x, pred.land.y) : 0;
  if (!it.air) {
    if (out.la >= 5 && out.la <= 25 && out.ev >= 92 && landD > 150) play.text = 'LINE DRIVE — no chance!';
    else if (landD > 230) play.text = 'In the gap!';
    else if (out.la < 5 && Math.hypot(it.point.x, it.point.y) > 160) play.text = 'Through the hole!';
  } else if (play.diving) play.text = 'Diving catch!';
}

/** Apply a SEND/HOLD decision to the contested runner. */
export function applySendHold(c: Ctx, send: boolean): void {
  const p = c.s.play;
  if (!p || !p.closeCall || p.closeCall.send !== null) return;
  p.closeCall.send = send;
  const r = c.s.runners.find((x) => x.id === p.closeCall!.runnerId);
  if (!r || r.out || r.scored) return;
  const base = p.closeCall.base;
  if (send) r.target = Math.max(r.target, base);
  else if (r.base < base) r.target = Math.max(r.forcedTo, base - 1, r.base);
}

function startThrow(c: Ctx, base: number, from: number): void {
  const s = c.s;
  const p = s.play!;
  const f = s.fielders[from];
  const recv = p.cov[base] ?? 1;
  const to = BASES[base];
  const d = Math.hypot(to.x - f.pos.x, to.y - f.pos.y);
  const relay = d > TUNING.fielding.relayDist + 40 ? 0.3 : 0;
  const t0 = s.time + TUNING.fielding.transfer;
  s.thr = { from: { x: f.pos.x, y: f.pos.y, z: 5 }, to: { x: to.x, y: to.y, z: 4 }, t0, t1: t0 + relay + d / throwSpeedFrom(from), base, thrower: from, receiver: recv };
  p.firstThrowDone = true;
  p.throwPromptUntil = Infinity;
  c.emit({ type: 'throw', base, from });
}

/** Human (or assist) chooses where the first throw goes. */
export function humanThrow(c: Ctx, base: number | null): void {
  const s = c.s;
  const p = s.play;
  if (!p || !p.secured || s.thr || p.firstThrowDone || p.holder < 0) return;
  const h = s.fielders[p.holder];
  const choice = base ?? chooseThrow(h.pos, p.holder, s.runners)?.base ?? null;
  if (choice === null) {
    p.firstThrowDone = true;
    p.throwPromptUntil = Infinity;
    return;
  }
  startThrow(c, choice, p.holder);
}

function cpuThrowDecision(c: Ctx): void {
  const s = c.s;
  const p = s.play!;
  if (p.holder < 0 || s.outs >= 3) return;
  const h = s.fielders[p.holder];
  const ch = chooseThrow(h.pos, p.holder, s.runners);
  if (ch) startThrow(c, ch.base, p.holder);
  else p.firstThrowDone = true;
}

function recordOut(c: Ctx, r: { out: boolean; isBatter: boolean; forcedTo: number }, base: number, text: string, force: boolean): void {
  const s = c.s;
  const p = s.play!;
  r.out = true;
  s.outs++;
  p.outsOnPlay++;
  c.emit({ type: 'out', base, text });
  if (s.outs >= 3) {
    p.thirdOutForce = force;
    p.thirdOutT = s.time;
  }
  if (r.isBatter) computeForces(s.runners.filter((x) => !x.isBatter || !x.out));
}

function resolveThrow(c: Ctx): void {
  const s = c.s;
  const p = s.play!;
  const thr = s.thr!;
  s.thr = null;
  p.holder = thr.receiver;
  for (const f of s.fielders) f.hasBall = false;
  s.fielders[thr.receiver].hasBall = true;
  // Find the runner this throw can retire.
  let target = null as null | (typeof s.runners)[number];
  for (const r of s.runners) {
    if (r.out || r.scored || r.returning || r.tagWait) continue;
    if (r.base + 1 !== thr.base) continue;
    if (r.d <= 0 && r.delay <= 0 && r.target <= r.base) continue;
    if (!target || r.d > target.d) target = r;
  }
  if (!target) {
    // Nobody heading here: check runners that already reached it.
    return afterResolve(c);
  }
  const remain = 90 - target.d;
  const eta = Math.max(0, target.delay) + remain / target.speed;
  const force = target.forcedTo === thr.base;
  const margin = eta - (force ? 0 : TUNING.fielding.tag);
  if (margin > 0) {
    recordOut(c, target, thr.base, explainOut(margin, p.outsOnPlay + 1), force);
    p.text = explainOut(margin, p.outsOnPlay);
  } else {
    c.emit({ type: 'safe', base: thr.base, text: explainSafe(margin) });
    if (!p.text) p.text = explainSafe(margin);
  }
  afterResolve(c);
}

function afterResolve(c: Ctx): void {
  const s = c.s;
  if (s.outs >= 3) return;
  cpuThrowDecision(c);
}

function secureBall(c: Ctx): void {
  const s = c.s;
  const p = s.play!;
  p.secured = true;
  p.holder = p.chaser;
  const f = s.fielders[p.chaser];
  f.hasBall = true;
  if (s.ball) {
    s.ball.stopped = true;
    s.ball.p = { x: f.pos.x, y: f.pos.y, z: 4 };
  }
  if (p.air) {
    c.emit({ type: 'caught', fielder: p.chaser, diving: p.diving });
    const br = s.runners.find((r) => r.isBatter && !r.out);
    if (br) recordOut(c, br, 0, p.diving ? 'Diving catch!' : 'Caught!', false);
    if (!p.text) p.text = p.diving ? 'Diving catch!' : 'Caught!';
    if (s.outs < 3) {
      const tagged = tagUps(s.runners, f.pos, p.chaser, s.cfg.aggression, s.outs);
      if (tagged.some((r) => r.base === 3)) p.text = 'Sac fly!';
      for (const r of s.runners) if (!r.out && !r.scored && !r.isBatter && r.d > 0) r.returning = true;
    }
  } else c.emit({ type: 'fielded', fielder: p.chaser });
  if (s.outs >= 3) return;
  if (humanPitcher(s) !== null && !p.firstThrowDone) {
    p.throwPromptUntil = s.time + TUNING.flow.assistThrowS;
    c.emit({ type: 'throwPrompt' });
  } else cpuThrowDecision(c);
}

function moveFielders(c: Ctx, dt: number): void {
  const s = c.s;
  const p = s.play;
  for (let i = 0; i < s.fielders.length; i++) {
    const f = s.fielders[i];
    f.prev.x = f.pos.x;
    f.prev.y = f.pos.y;
    if (p && i === p.holder && p.secured) continue;
    const reactOk = !p || s.time - p.startT >= TUNING.fielding.react;
    if (!reactOk) continue;
    const dx = f.goal.x - f.pos.x, dy = f.goal.y - f.pos.y;
    const d = Math.hypot(dx, dy);
    const step = f.speed * dt;
    if (d <= step) {
      f.pos.x = f.goal.x;
      f.pos.y = f.goal.y;
    } else {
      f.pos.x += (dx / d) * step;
      f.pos.y += (dy / d) * step;
    }
    if (p && i === p.chaser && p.diving && !p.secured && p.secureT - s.time < 0.35) f.dive = Math.min(1, f.dive + dt * 4);
  }
}

export function stepPlay(c: Ctx, dt: number): void {
  const s = c.s;
  const p = s.play!;
  const st = STADIUMS[s.cfg.stadium];
  if (s.ball && !p.secured && !s.ball.hr) {
    const f = stepBall(s.ball, dt, st);
    if (f === 'land' && !p.landedEmitted) {
      p.landedEmitted = true;
      const d = Math.hypot(s.ball.p.x, s.ball.p.y);
      s.last.dist = Math.round(d);
      c.emit({ type: 'landed', dist: d });
    }
    if (f === 'hr') {
      const d = Math.round(Math.hypot(s.ball.p.x, s.ball.p.y) * 1.04 + 8);
      s.last.dist = d;
      return endPlay(c, 'hr');
    }
  }
  if (p.foul) {
    if (s.time - p.startT >= TUNING.flow.foulDeadS) endPlay(c, 'foul');
    return;
  }
  if (p.lite) {
    if (s.ball && (s.ball.landed || s.ball.stopped) && s.time - p.startT > 0.6) endPlay(c, 'lite');
    else if (s.time - p.startT > 6) endPlay(c, 'lite');
    return;
  }
  moveFielders(c, dt);
  if (!p.secured && s.time >= p.secureT) secureBall(c);
  if (p.secured && !s.thr && !p.firstThrowDone && s.time >= p.throwPromptUntil) humanThrow(c, null);
  if (p.closeCall && p.closeCall.send === null && s.time >= p.closeCall.until) p.closeCall.send = p.closeCall.defaultSend;
  if (s.thr && s.time >= s.thr.t1) resolveThrow(c);
  if (s.outs < 3) {
    const scored = stepRunners(s.runners, dt, s.time);
    for (const id of scored) p.runsOnPlay.push({ id, t: s.time });
  }
  if (s.ball && p.secured && p.holder >= 0) {
    const h = s.fielders[p.holder];
    if (s.thr) {
      const k = Math.max(0, Math.min(1, (s.time - s.thr.t0) / (s.thr.t1 - s.thr.t0)));
      const a = s.thr.from, b = s.thr.to;
      s.ball.p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k + Math.sin(Math.PI * k) * 6 };
    } else s.ball.p = { x: h.pos.x, y: h.pos.y, z: 4 };
  }
  const anyMoving = s.runners.some(isMoving);
  const pendingThrow = p.secured && !p.firstThrowDone && p.throwPromptUntil < Infinity;
  if (s.outs >= 3 || (p.secured && !s.thr && !anyMoving && !pendingThrow)) endPlay(c, 'field');
  else if (s.time - p.startT > TUNING.flow.liveTimeoutS) endPlay(c, 'field');
}

