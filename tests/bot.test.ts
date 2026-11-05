import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/game';
import { shortRun, mill, proof, clutch, cage, CLUTCH_CARDS } from '../src/sim/modes';
import { chooseThrow } from '../src/sim/fielding';
import type { ModeConfig } from '../src/sim/state';
import type { SimEvent } from '../src/sim/types';

const DT = 1 / 120;
const P = (heat = 0) => [{ name: 'Bot', heat, tier: 'rookie' as const }];

export interface BotStats {
  swings: number; hr: number; pa: number; onBase: number; pitches: number; games: number;
  takeToWindup: number[]; deadToReady: number[]; hrToReady: number[]; violations: string[]; durations: number[];
}
const newStats = (): BotStats => ({ swings: 0, hr: 0, pa: 0, onBase: 0, pitches: 0, games: 0, takeToWindup: [], deadToReady: [], hrToReady: [], violations: [], durations: [] });

type Timing = (sim: Sim, n: number) => number | null; // ms offset from ideal, or null = take

/** Plays a whole game. The human side uses `timing`; human pitching uses a fixed good charge. */
export function botGame(cfg: ModeConfig, timing: Timing, st: BotStats, maxS = 1500): Sim {
  const sim = new Sim(cfg);
  let n = 0, lastRelease = -1;
  let takeAt = -1, deadAt = -1, hrAt = -1;
  let prevD = new Map<number, number>();
  const humanBats = () => sim.s.mill ? true : sim.s.cfg.humanBat[sim.s.tiebreak ? sim.s.tiebreak.team : sim.s.half] !== null;
  while (sim.s.phase !== 'gameOver' && sim.s.time < maxS) {
    const s = sim.s;
    if (s.phase === 'pitch' && s.pitch && s.releaseT !== lastRelease && humanBats()) {
      lastRelease = s.releaseT;
      const off = timing(sim, n++);
      if (off !== null) {
        sim.act({ type: 'swing', t: s.releaseT + s.pitch.T + off / 1000 });
      }
    }
    if (s.phase === 'prePitch' && !s.mill && !s.tiebreak && s.cfg.humanPitch[s.half === 0 ? 1 : 0] !== null && !s.charging) {
      sim.act({ type: 'selectPitch', index: n % 3 });
      // work the edges like a person would: corners, sometimes just off the plate
      const corner = n % 4;
      sim.act({ type: 'chargeStart', zx: (corner % 2 ? 1 : -1) * (0.55 + (n % 3) * 0.15), zz: corner < 2 ? 1.8 : 3.3 });
      sim.act({ type: 'chargeEnd', t: s.time + 0.72 });
    }
    if (s.phase === 'live' && s.play?.secured && !s.play.firstThrowDone && s.play.throwPromptUntil < Infinity) {
      // player's throw: let the 1.2 s assist decide half the time, tap the assist's choice otherwise
      if (n % 2 === 0) {
        const h = s.fielders[s.play.holder];
        const ch = chooseThrow(h.pos, s.play.holder, s.runners);
        if (ch) sim.act({ type: 'throwTo', base: ch.base });
      }
    }
    if (s.phase === 'handoff' && s.time - s.phaseT > 0.45) sim.act({ type: 'ready' });
    const phaseBefore = s.phase;
    sim.step(DT);
    // invariants during live play: a runner between bases is always moving (never idles in the gap)
    if (s.phase === 'live' && s.play && !s.play.lite && !s.play.foul) {
      for (const r of s.runners) {
        if (r.out || r.scored || r.tagWait || r.delay > 0) continue;
        const was = prevD.get(r.id);
        if (r.d > 0 && r.d < 90 && was !== undefined && Math.abs(was - r.d) < 1e-6 && r.base < r.target) st.violations.push(`runner ${r.id} idle between bases at t=${s.time.toFixed(2)}`);
      }
      prevD = new Map(s.runners.map((r) => [r.id, r.d]));
    } else prevD.clear();
    const ev: SimEvent[] = sim.drainEvents();
    for (const e of ev) {
      if (e.type === 'pitchReleased') st.pitches++;
      if (e.type === 'swing' && humanBats()) st.swings++;
      if (e.type === 'homeRun' && humanBats()) { st.hr++; hrAt = s.time; }
      if ((e.type === 'take' || e.type === 'whiff') && s.cfg.humanPitch[s.half === 0 ? 1 : 0] === null) takeAt = -2; // CPU pitcher, resolved at mitt
      if (e.type === 'strikeout' || e.type === 'walk') takeAt = -1; // PA over: not a mid-at-bat take
      if (e.type === 'windup' && takeAt >= 0) { st.takeToWindup.push(s.time - takeAt); takeAt = -1; }
      if (e.type === 'paStart' && humanBats()) st.pa++;
      if ((e.type === 'hit' || e.type === 'walk') && humanBats()) st.onBase++;
    }
    if (phaseBefore !== 'dead' && s.phase === 'dead') {
      if (takeAt === -2) takeAt = s.time; else deadAt = s.time;
    }
    if (phaseBefore !== 'prePitch' && s.phase === 'prePitch') {
      // routine play: dead → next pitch ready directly (inning transitions/handoffs are separate ceremonies)
      if (deadAt >= 0 && phaseBefore === 'dead') st.deadToReady.push(s.time - deadAt);
      deadAt = -1;
      if (hrAt >= 0 && phaseBefore === 'celebrate') st.hrToReady.push(s.time - hrAt);
      hrAt = -1;
    }
    if (s.phase === 'halfEnd' || s.phase === 'handoff') { takeAt = -1; deadAt = -1; }
  }
  st.games++;
  st.durations.push(sim.s.time);
  return sim;
}

const perfect: Timing = () => 0;
const random: Timing = (sim, n) => {
  const T = sim.s.pitch!.T;
  // A masher tapping with no regard to the pitch: uniform over windup + flight. Taps that land during
  // the windup are ignored by the game (no swing), exactly as for a real player.
  const u = ((n * 7919 + 13) % 997) / 997;
  const off = u * (0.55 + T + 0.3) - (0.55 + T);
  return off < -T ? null : off * 1000;
};
const mixed: Timing = (_sim, n) => (n % 4 === 3 ? null : ((n * 53) % 160) - 80);
/** Human-like batter: takes pitches it can see are balls (the locator), loose timing. */
export const humanish: Timing = (sim, n) => {
  const ps = sim.s.pitch!;
  const x = ps.target.x + ps.steer, z = ps.target.z;
  const ball = Math.abs(x) > 1.0 || z < 1.4 || z > 3.7;
  if (ball && n % 5 !== 0) return null;
  if (!ball && sim.s.strikes === 0 && n % 3 === 0) return null; // takes a first strike sometimes
  return ((n * 61) % 240) - 120;
};

describe('bot balance', () => {
  it('perfect-timing Rookie bot homers often but not always; random bot rarely reaches base; plausible pitch counts; dead-time limits; no runner idles', () => {
    const P1 = newStats(), R = newStats(), M = newStats();
    for (let seed = 1; seed <= 6; seed++) botGame(shortRun({ seed, players: P(0), firstEver: false }), perfect, P1);
    for (let seed = 11; seed <= 16; seed++) botGame(shortRun({ seed, players: P(0), firstEver: false }), random, R);
    const fullGames: number[] = [];
    for (let seed = 21; seed <= 26; seed++) {
      const before = M.pitches;
      const sim = botGame(shortRun({ seed, players: P(50), firstEver: false }), humanish, M);
      // a 3-inning game = all six halves played (not mercy, not ended after the top of the 3rd)
      if (sim.s.overReason !== 'mercy rule' && sim.s.half === 1) fullGames.push(M.pitches - before);
    }
    const hrRate = P1.hr / P1.swings, obp = R.onBase / Math.max(1, R.pa);
    const max = (a: number[]) => (a.length ? Math.max(...a) : 0);
    console.log(`BOT perfect Rookie: ${P1.hr} HR / ${P1.swings} swings = ${(hrRate * 100).toFixed(1)}%  (PA ${P1.pa})`);
    console.log(`BOT random timing: on base ${R.onBase} / ${R.pa} PA = ${obp.toFixed(3)}`);
    console.log(`BOT human-like HEAT 50: pitches per full 3-inning game = ${fullGames.join(', ')}`);
    console.log(`BOT dead time max: take→windup ${max([...P1.takeToWindup, ...R.takeToWindup, ...M.takeToWindup]).toFixed(2)} s, dead→ready ${max([...P1.deadToReady, ...M.deadToReady]).toFixed(2)} s, HR→ready ${max([...P1.hrToReady, ...M.hrToReady]).toFixed(2)} s`);
    expect(hrRate).toBeGreaterThan(0.25);
    expect(hrRate).toBeLessThan(0.85);
    expect(obp).toBeLessThan(0.2);
    for (const p of fullGames) {
      expect(p).toBeGreaterThanOrEqual(40);
      expect(p).toBeLessThanOrEqual(160);
    }
    expect(max([...P1.takeToWindup, ...R.takeToWindup, ...M.takeToWindup])).toBeLessThanOrEqual(0.8);
    expect(max([...P1.deadToReady, ...M.deadToReady])).toBeLessThanOrEqual(1.2);
    expect(max([...P1.hrToReady, ...M.hrToReady])).toBeLessThanOrEqual(3.5);
    expect([...P1.violations, ...R.violations, ...M.violations]).toEqual([]);
  });
});

describe('every mode plays to its end state', () => {
  it('Mill, Proof, a Clutch Card and a Cage session', () => {
    const st = newStats();
    const m = botGame(mill({ seed: 3, players: [{ name: 'A', heat: 0, tier: 'rookie' }, { name: 'B', heat: 30, tier: 'pro' }], chars: ['moose', 'tilly'] }), mixed, st);
    expect(m.s.phase).toBe('gameOver');
    expect(m.s.mill!.outs).toBe(10);
    const pr = botGame(proof({ seed: 4, players: [{ name: 'A', heat: 0, tier: 'rookie' }, { name: 'B', heat: 99, tier: 'pro' }] }), mixed, st);
    expect(pr.s.phase).toBe('gameOver');
    const cl = botGame(clutch({ seed: 5, players: P(0) }, CLUTCH_CARDS[0]), mixed, st);
    expect(cl.s.phase).toBe('gameOver');
    expect(['win', 'lose']).toContain(cl.s.clutchResult);
    const cg = new Sim(cage({ seed: 6, players: P(0), pitch: 'CU' }));
    for (let i = 0; i < 120 * 20; i++) {
      cg.step(DT);
      cg.drainEvents();
    }
    expect(cg.s.totalPitches).toBeGreaterThan(5);
    expect(cg.s.outs).toBe(0);
  });
});
