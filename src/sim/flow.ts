// Flow: counts, PA results, dead time, half/game transitions, mode rules (Mill, Clutch, tiebreak).
import { TUNING } from '../config/tuning';
import { banner, setPhase, type Ctx } from './ctx';
import { enterPrePitch } from './atbat';
import { restArm } from './pitch';
import { awardStars, recordPa } from './stars';
import { millHomer, millOut } from './mill';
export { scoreMult } from './mill';
import {
  battingTeam, currentBatterId, fieldingTeam, humanBatter, makeFielders, makeRunner,
} from './state';

const HOME = 1;


export function goDead(c: Ctx, dur: number, newPa: boolean): void {
  c.s.deadDur = dur;
  c.s.nextNewPa = newPa;
  setPhase(c, 'dead');
}

function nextBatter(c: Ctx): void {
  const t = c.s.teams[battingTeam(c.s)];
  t.order = (t.order + 1) % t.setup.lineup.length;
  c.s.balls = 0;
  c.s.strikes = 0;
}

/** Take or whiff resolved at the mitt. */
export function onTakeOrWhiff(c: Ctx, kind: 'ball' | 'strike' | 'whiff'): void {
  const s = c.s;
  const dur = TUNING.flow.afterTakeS;
  if (s.mill) {
    if (kind === 'ball') return goDead(c, dur, false);
    s.mill.streak = 0;
    millOut(c, kind === 'whiff' ? 'Whiff — OUT' : 'Called strike — OUT');
    return;
  }
  if (s.cfg.cage) {
    c.emit({ type: 'mittPop', strikeout: false });
    return goDead(c, dur, false);
  }
  if (s.tiebreak) {
    c.emit({ type: 'mittPop', strikeout: false });
    if (kind === 'whiff') return tiebreakSwingUsed(c, false);
    return goDead(c, dur, false);
  }
  if (s.cfg.clutch?.homerSwings) {
    c.emit({ type: 'mittPop', strikeout: false });
    if (kind === 'whiff') return homerSwingUsed(c, false);
    return goDead(c, dur, false);
  }
  if (kind === 'ball') {
    s.balls++;
    c.emit({ type: 'mittPop', strikeout: false });
    if (s.balls >= 4) return walk(c);
    return goDead(c, dur, false);
  }
  s.strikes++;
  const k = s.strikes >= 3;
  c.emit({ type: 'mittPop', strikeout: k });
  if (!k) return goDead(c, dur, false);
  // Strikeout
  s.outs++;
  c.emit({ type: 'strikeout' });
  const ft = fieldingTeam(s);
  awardStars(c.s, ft, 1 + (s.starChance ? 2 : 0));
  c.emit({ type: 'starEarned', team: ft, n: 1, why: 'Strikeout' });
  if (humanBatter(s) === null) s.stats.ks++;
  recordPa(s, currentBatterId(s), 'K');
  s.paResult = 'K';
  banner(c, 'STRIKEOUT', kind === 'whiff' ? 'swinging' : 'looking', humanBatter(s) !== null ? 'bad' : 'good');
  nextBatter(c);
  checkClutch(c);
  goDead(c, TUNING.flow.afterPlayS, true);
}

function walk(c: Ctx): void {
  const s = c.s;
  // Force runners along.
  const occ = new Map<number, (typeof s.runners)[number]>();
  for (const r of s.runners) if (!r.out && !r.scored) occ.set(r.base, r);
  let b = 1;
  const moves: [(typeof s.runners)[number], number][] = [];
  while (occ.has(b)) {
    moves.push([occ.get(b)!, b + 1]);
    b++;
  }
  for (const [r, nb] of moves) {
    r.base = nb;
    r.target = nb;
    if (nb >= 4) {
      r.scored = true;
      addRuns(c, 1);
    }
  }
  s.runners.push(makeRunner(s, currentBatterId(s), 1, false));
  s.runners[s.runners.length - 1].target = 1;
  c.emit({ type: 'walk' });
  recordPa(s, currentBatterId(s), 'W');
  banner(c, 'WALK', 'take your base', 'neutral');
  nextBatter(c);
  checkWalkoff(c);
  checkClutch(c);
  goDead(c, TUNING.flow.afterPlayS, true);
}

function addRuns(c: Ctx, n: number): void {
  const s = c.s;
  const bt = battingTeam(s);
  const t = s.teams[bt];
  t.runs += n;
  t.line[s.inning - 1] = (t.line[s.inning - 1] ?? 0) + n;
  for (let i = 0; i < n; i++) c.emit({ type: 'run', team: bt });
}

function checkWalkoff(c: Ctx): void {
  const s = c.s;
  if (s.cfg.kind !== 'short' && s.cfg.kind !== 'proof' && s.cfg.kind !== 'attract') return;
  if (s.half === HOME && s.inning >= s.cfg.innings && s.teams[1].runs > s.teams[0].runs && !s.ending) {
    s.walkoff = true;
    s.ending = true;
    s.winner = HOME;
    s.overReason = 'walk-off';
    c.emit({ type: 'walkoff' });
  }
}

/** End of a live play (or HR / foul / lite flight). */
export function endPlay(c: Ctx, kind: 'hr' | 'foul' | 'lite' | 'field'): void {
  const s = c.s;
  const p = s.play!;
  const human = humanBatter(s) !== null;
  if (kind === 'foul') {
    if (s.mill) {
      s.mill.streak = 0;
      return millOut(c, 'Foul — OUT');
    }
    if (s.tiebreak) return tiebreakSwingUsed(c, false);
    if (s.cfg.clutch?.homerSwings) return homerSwingUsed(c, false);
    if (!s.cfg.cage && s.strikes < 2) s.strikes++;
    banner(c, 'FOUL', '', 'neutral');
    return goDead(c, TUNING.flow.afterTakeS, false);
  }
  if (kind === 'hr') {
    const dist = s.last.dist;
    if (human && !s.cfg.cage) {
      s.stats.hr++;
      s.stats.longestHr = Math.max(s.stats.longestHr, dist);
    }
    if (s.mill) return millHomer(c, dist);
    if (s.tiebreak) return tiebreakSwingUsed(c, true);
    if (s.cfg.clutch?.homerSwings) return homerSwingUsed(c, true);
    if (s.cfg.cage) {
      banner(c, 'HOME RUN', `${dist} ft`, 'good');
      return goDead(c, TUNING.flow.afterPlayS, false);
    }
    const n = s.runners.filter((r) => !r.out && !r.scored).length;
    for (const r of s.runners) if (!r.out && !r.scored) r.target = 4;
    addRuns(c, n);
    const bt = battingTeam(s);
    s.teams[bt].hits++;
    awardStars(s, bt, 1 + (s.starChance ? 2 : 0));
    c.emit({ type: 'starEarned', team: bt, n: 1, why: 'Extra-base hit' });
    recordPa(s, currentBatterId(s), 'H');
    s.paResult = 'HR';
    checkWalkoff(c);
    c.emit({ type: 'homeRun', dist, walkoff: s.walkoff });
    banner(c, n >= 4 ? 'GRAND SLAM' : 'HOME RUN', `${dist} ft · ${s.last.ev.toFixed(0)} mph`, human ? 'good' : 'bad');
    c.emit({ type: 'hit', bases: 4 });
    nextBatter(c);
    checkClutch(c);
    setPhase(c, 'celebrate');
    return;
  }
  if (kind === 'lite') {
    if (s.mill) {
      s.mill.streak = 0;
      return millOut(c, s.last.dist ? `${s.last.dist} ft — OUT` : 'OUT');
    }
    if (s.tiebreak) return tiebreakSwingUsed(c, false);
    if (s.cfg.clutch?.homerSwings) return homerSwingUsed(c, false);
    banner(c, s.last.grade ?? '', s.last.dist ? `${s.last.ev.toFixed(0)} mph · ${s.last.dist} ft` : '', 'neutral');
    return goDead(c, TUNING.flow.afterPlayS, false);
  }
  // Fielded play: count valid runs.
  const valid = p.thirdOutForce ? [] : p.runsOnPlay.filter((r) => r.t <= p.thirdOutT);
  if (valid.length) addRuns(c, valid.length);
  const br = s.runners.find((r) => r.isBatter);
  const bt = battingTeam(s);
  let text = p.text;
  let tone: 'good' | 'bad' | 'neutral' = 'neutral';
  if (br && !br.out) {
    const bases = br.scored ? 4 : br.base;
    if (p.outsOnPlay === 0) {
      s.teams[bt].hits++;
      if (human) s.stats.hits++;
      s.paResult = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'INSIDE-THE-PARK HR'][bases] ?? 'SINGLE';
      c.emit({ type: 'hit', bases });
      recordPa(s, br.charId, 'H');
      let award = 0;
      if (bases >= 2) award += 1;
      if (s.starChance) award += 2;
      if (award) {
        awardStars(s, bt, award);
        c.emit({ type: 'starEarned', team: bt, n: award, why: bases >= 2 ? 'Extra-base hit' : 'Star Chance' });
      }
      tone = human ? 'good' : 'bad';
    } else {
      s.paResult = "FIELDER'S CHOICE";
      recordPa(s, br.charId, 'O');
    }
  } else {
    s.paResult = p.outsOnPlay >= 2 ? 'DOUBLE PLAY' : p.air ? (s.last.la > 45 ? 'Pop out' : 'Flyout') : 'Groundout';
    if (text === 'Sac fly!') s.paResult = 'SAC FLY';
    if (br) recordPa(s, br.charId, 'O');
    tone = human ? 'bad' : 'good';
  }
  if (valid.length && !text) text = valid.length > 1 ? `${valid.length} runs score!` : 'Run scores!';
  banner(c, s.paResult, text, tone);
  // Clean up runners: remove out/scored, the batter becomes a normal runner.
  s.runners = s.runners.filter((r) => !r.out && !r.scored);
  for (const r of s.runners) {
    r.isBatter = false;
    r.target = r.base;
    r.d = 0;
    r.tagWait = false;
    r.returning = false;
    r.delay = 0;
  }
  if (s.thr) s.thr = null;
  nextBatter(c);
  checkWalkoff(c);
  checkClutch(c);
  goDead(c, TUNING.flow.afterPlayS, true);
}

// ---------- tiebreak / homer-swing cards ----------
function tiebreakSwingUsed(c: Ctx, hr: boolean): void {
  const s = c.s;
  const tb = s.tiebreak!;
  tb.left--;
  if (hr) {
    tb.hrs[tb.team]++;
    c.emit({ type: 'homeRun', dist: s.last.dist, walkoff: false });
    banner(c, 'HOME RUN', `Sudden death · ${tb.hrs[0]}–${tb.hrs[1]}`, 'good');
  } else banner(c, 'NO DINGER', `${tb.left} swing${tb.left === 1 ? '' : 's'} left`, 'neutral');
  if (tb.left <= 0) {
    if (tb.team === 0) {
      tb.team = 1;
      tb.left = tb.round === 1 ? 3 : 1;
      s.fielders = makeFielders(s.cfg.teams[0]);
      if (s.cfg.kind === 'proof') return handoff(c, 1, 'tiebreak');
    } else if (tb.hrs[0] !== tb.hrs[1]) {
      s.winner = tb.hrs[1] > tb.hrs[0] ? 1 : 0;
      s.overReason = 'sudden-death derby';
      s.ending = true;
    } else {
      tb.round++;
      tb.team = 0;
      tb.left = 1;
      s.fielders = makeFielders(s.cfg.teams[1]);
      if (s.cfg.kind === 'proof') return handoff(c, 0, 'tiebreak');
    }
  }
  if (hr) return setPhase(c, 'celebrate');
  goDead(c, TUNING.flow.afterTakeS, false);
}

function homerSwingUsed(c: Ctx, hr: boolean): void {
  const s = c.s;
  const cl = s.cfg.clutch!;
  const need = cl.homersNeeded ?? 1;
  s.clutchSwings++;
  const left = (cl.homerSwings ?? 3) - s.clutchSwings;
  if (hr) {
    s.clutchHomers++;
    const done = s.clutchHomers >= need;
    c.emit({ type: 'homeRun', dist: s.last.dist, walkoff: done });
    banner(c, 'HOME RUN', done ? 'Card cleared!' : `${need - s.clutchHomers} more · ${left} swing${left === 1 ? '' : 's'} left`, 'good');
    if (done) finishClutch(c, true);
    else if (left <= 0) finishClutch(c, false);
    return setPhase(c, 'celebrate');
  }
  banner(c, 'NO DINGER', `${need - s.clutchHomers} to go · ${left} swing${left === 1 ? '' : 's'} left`, 'bad');
  if (left <= 0) finishClutch(c, false);
  goDead(c, TUNING.flow.afterTakeS, false);
}

// ---------- Clutch ----------
export function checkClutch(c: Ctx): void {
  const s = c.s;
  const cl = s.cfg.clutch;
  if (!cl || s.clutchResult || cl.homerSwings) return;
  const bt = battingTeam(s);
  const runsThisHalf = s.teams[bt].runs - s.clutchStartRuns;
  if (cl.side === 'bat') {
    if (runsThisHalf >= cl.runs) finishClutch(c, true);
    else if (s.outs >= 3) finishClutch(c, false);
  } else {
    const need = cl.outsToGet ?? 3 - cl.outs;
    if (runsThisHalf > cl.runs) finishClutch(c, false);
    else if (s.outs - cl.outs >= need || s.outs >= 3) finishClutch(c, true);
  }
}
function finishClutch(c: Ctx, win: boolean): void {
  const s = c.s;
  s.clutchResult = win ? 'win' : 'lose';
  s.ending = true;
  s.winner = win ? 0 : 1;
  s.overReason = win ? 'Card cleared' : 'Card failed';
  c.emit({ type: 'clutchResult', win });
}

// ---------- after dead / celebrate ----------
export function afterDead(c: Ctx): void {
  const s = c.s;
  if (s.ending) return gameOver(c);
  if (s.mill && s.mill.outs >= s.cfg.mill!.outs) return nextMillPlayer(c);
  if (!s.mill && !s.tiebreak && !s.cfg.cage && s.outs >= 3) {
    c.emit({ type: 'halfEnd', inning: s.inning, half: s.half });
    banner(c, s.half === 0 ? `END OF TOP ${s.inning}` : `END OF ${s.inning}`, `${s.teams[0].runs} – ${s.teams[1].runs}`, 'neutral');
    return setPhase(c, 'halfEnd');
  }
  enterPrePitch(c, s.nextNewPa);
}

export function afterCelebrate(c: Ctx): void {
  const s = c.s;
  for (const r of s.runners) if (!r.out) r.scored = true;
  s.runners = s.runners.filter((r) => !r.scored && !r.out);
  afterDead(c);
}

function nextMillPlayer(c: Ctx): void {
  const s = c.s;
  const m = s.mill!;
  if (m.player + 1 >= s.cfg.players.length) {
    let best = 0;
    m.scores.forEach((v, i) => {
      if (v > m.scores[best]) best = i;
    });
    s.winner = best;
    s.overReason = 'Mill complete';
    return gameOver(c);
  }
  m.player++;
  m.outs = 0;
  m.streak = 0;
  handoff(c, m.player, 'mill');
}

function handoff(c: Ctx, to: number, after: 'half' | 'tiebreak' | 'mill'): void {
  c.s.handoffTo = to;
  c.s.afterHandoff = after;
  c.emit({ type: 'handoff', to });
  setPhase(c, 'handoff');
}

export function handoffReady(c: Ctx): void {
  const s = c.s;
  if (s.phase !== 'handoff') return;
  if ((s.time - s.phaseT) * 1000 < TUNING.flow.handoffIgnoreMs) return;
  s.afterHandoff = null;
  enterPrePitch(c, true);
}

export function gameOver(c: Ctx): void {
  const s = c.s;
  if (s.winner < 0) s.winner = s.teams[1].runs > s.teams[0].runs ? 1 : 0;
  setPhase(c, 'gameOver');
  c.emit({ type: 'gameOver', winner: s.winner, reason: s.overReason || 'final' });
}

/** Called when the half-inning banner ends. */
export function nextHalf(c: Ctx): void {
  const s = c.s;
  const [a, h] = [s.teams[0].runs, s.teams[1].runs];
  const kind = s.cfg.kind;
  if (kind === 'clutch') return gameOver(c);
  if (s.half === 0) {
    if (s.inning >= s.cfg.innings && h > a) {
      s.winner = 1;
      s.overReason = 'final';
      return gameOver(c);
    }
  } else {
    if (s.inning < s.cfg.innings && Math.abs(a - h) > 5) {
      s.winner = a > h ? 0 : 1;
      s.overReason = 'mercy rule';
      return gameOver(c);
    }
    if (s.inning >= s.cfg.innings && a !== h) {
      s.winner = a > h ? 0 : 1;
      s.overReason = s.inning > s.cfg.innings ? 'extras' : 'final';
      return gameOver(c);
    }
    if (s.inning >= 6) return startTiebreak(c);
  }
  // Advance the half.
  s.teams[0].line[s.inning - 1] ??= 0;
  s.teams[1].line[s.inning - 1] ??= 0;
  if (s.half === 1) s.inning++;
  s.half = s.half === 0 ? 1 : 0;
  s.outs = 0;
  s.balls = 0;
  s.strikes = 0;
  s.runners = [];
  s.fielders = makeFielders(s.cfg.teams[fieldingTeam(s)]);
  restArm(s.teams[fieldingTeam(s)].arm);
  if (s.inning >= 4) {
    // Extras: runner on 2nd = the previous batter in the order.
    const t = s.teams[battingTeam(s)];
    const prev = t.setup.lineup[(t.order + t.setup.lineup.length - 1) % t.setup.lineup.length];
    const r = makeRunner(s, prev, 2, false);
    r.target = 2;
    s.runners.push(r);
  }
  if (kind === 'proof') return handoff(c, battingTeam(s), 'half');
  enterPrePitch(c, true);
}

function startTiebreak(c: Ctx): void {
  const s = c.s;
  s.tiebreak = { team: 0, left: 3, hrs: [0, 0], round: 1 };
  s.runners = [];
  s.outs = 0;
  s.balls = 0;
  s.strikes = 0;
  s.fielders = makeFielders(s.cfg.teams[1]);
  banner(c, 'SUDDEN DEATH', 'Three swings each. Most dingers wins.', 'neutral');
  if (s.cfg.kind === 'proof') return handoff(c, 0, 'tiebreak');
  enterPrePitch(c, true);
}
