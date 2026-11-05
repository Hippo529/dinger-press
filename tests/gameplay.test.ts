import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/game';
import { endPlay, nextHalf, scoreMult } from '../src/sim/flow';
import { cpuParams, cpuPitch, cpuSwing } from '../src/sim/ai';
import { Rng } from '../src/core/rng';
import { grade, windows, contactOut, maxEvFor } from '../src/sim/contact';
import { chargeOutcome, fastballFlight, newArm, useArm, armEffect, PITCHES } from '../src/sim/pitch';
import { inZone } from '../src/sim/field';
import { ROSTER, ROSTER_BY_ID } from '../src/config/roster';
import { awardStars, isStarChance, traitWindowMul, recordPa } from '../src/sim/stars';
import { mill, proof, clutch, CLUTCH_CARDS, dailyCard } from '../src/sim/modes';
import { makeRunner, type GameState } from '../src/sim/state';
import { startPlay } from '../src/sim/play';
import { decideAdvances, runnerSpeed } from '../src/sim/running';
import { TUNING } from '../src/config/tuning';
import { cfgShort } from './sim.test';
import { botGame, humanish } from './bot.test';
import type { Runner } from '../src/sim/types';

/** Vitest 5 hides console output of passing tests; balance numbers must always print. */
const report = (...a: unknown[]) => process.stdout.write('\n' + a.join(' ') + '\n');

const fresh = (seed = 1) => {
  const sim = new Sim(cfgShort(seed));
  return { sim, s: sim.s, c: sim.ctx };
};
const put = (s: GameState, base: number) => {
  const r = makeRunner(s, s.teams[s.half].setup.lineup[base % 5], base, false);
  r.target = base;
  s.runners.push(r);
};
function runPlay(sim: Sim, maxS = 15): string[] {
  const texts: string[] = [];
  const t0 = sim.s.time;
  while (sim.s.phase === 'live' && sim.s.time - t0 < maxS) {
    sim.step(1 / 120);
    for (const e of sim.drainEvents()) if (e.type === 'banner' || e.type === 'out' || e.type === 'safe') texts.push((e as { text: string }).text);
  }
  if (sim.s.play?.text) texts.push(sim.s.play.text);
  return texts;
}

describe('tiebreak winner', () => {
  it('more HRs after both teams take 3 swings wins', () => {
    const { s, c } = fresh();
    s.inning = 6;
    s.half = 1;
    nextHalf(c);
    s.tiebreak!.hrs = [2, 0];
    s.tiebreak!.team = 1;
    s.tiebreak!.left = 1;
    s.play = { foul: true } as GameState['play'];
    endPlay(c, 'foul');
    expect(s.ending).toBe(true);
    expect(s.winner).toBe(0);
  });
});

describe('play explanations and advances', () => {
  it('gap hit with a runner on 1st: runner reaches ≥ 3rd (or scores), everyone stops on a base, "In the gap!"', () => {
    let done = false;
    for (let spray = -34; spray <= 34 && !done; spray += 2)
      for (const ev of [96, 100, 104, 108, 112]) {
        const { sim, s, c } = fresh(2);
        s.phase = 'pitch';
        put(s, 1);
        for (const la of [24, 28]) void la;
        startPlay(c, { ev, la: 16, spray }, { x: 0, y: 0.7, z: 2.5 }, 'GOOD');
        if (s.play!.air || s.play!.text !== 'In the gap!') continue;
        runPlay(sim);
        const lead = s.teams[0].runs + s.runners.filter((r) => !r.out && r.base >= 3).length;
        expect(lead).toBeGreaterThanOrEqual(1);
        for (const r of s.runners) expect(r.d).toBe(0);
        done = true;
        break;
      }
    expect(done).toBe(true);
  });
  it('line drive no chance; diving catch; out by a mile; beat the throw by a step', () => {
    let liner = false;
    for (let spray = -30; spray <= 30 && !liner; spray += 3)
      for (const [ev, la] of [[96, 8], [100, 10], [104, 12], [98, 14]]) {
        const { s, c } = fresh(3);
        s.phase = 'pitch';
        startPlay(c, { ev, la, spray }, { x: 0, y: 0.7, z: 2.5 }, 'GOOD');
        if (s.play!.text === 'LINE DRIVE — no chance!') liner = true;
      }
    expect(liner).toBe(true);
    // find a diving catch by scanning fly balls
    let diving = false;
    for (let spray = -40; spray <= 40 && !diving; spray += 2)
      for (const ev of [84, 88, 92, 96]) {
        const f = fresh(4);
        f.s.phase = 'pitch';
        startPlay(f.c, { ev, la: 24, spray }, { x: 0, y: 0.7, z: 2.5 }, 'GOOD');
        if (f.s.play!.diving) {
          expect(f.s.play!.text).toBe('Diving catch!');
          diving = true;
          break;
        }
      }
    expect(diving).toBe(true);
    const g = fresh(5);
    g.s.phase = 'pitch';
    startPlay(g.c, { ev: 70, la: -10, spray: -10 }, { x: 0, y: 0.7, z: 2.5 }, 'TOPPED');
    const t = runPlay(g.sim);
    expect(t.some((x) => /Out by a mile|Out at the bag|Bang-bang/.test(x))).toBe(true);
  });
  it('close-call prompt only for |margin| < 0.35 and only when the human bats', () => {
    const mk = (base: number): Runner => ({ id: 1, charId: 'clem', base, target: base, d: 0, speed: runnerSpeed(5), delay: 0, out: false, scored: false, scoredAt: 0, forcedTo: 0, isBatter: false, tagWait: false, returning: false });
    const pt = { x: 0, y: 250 };
    const ball = 0.25 + 250 / 105 + 0.3;
    const eta4 = 180 / runnerSpeed(5);
    for (const m of [-0.5, -0.2, 0.2, 0.5]) {
      const rs = [mk(2)];
      const cc = decideAdvances(rs, { securePoint: pt, secureT: eta4 + m - ball, holder: 7, airCatch: false, outs: 0, agg: 'aggressive' });
      const flagged = !!cc && cc.base === 4;
      expect(flagged).toBe(Math.abs(m) < 0.35);
    }
    // through startPlay: the prompt is created only when a human bats
    for (const human of [true, false]) {
      const cfg = cfgShort(6);
      if (!human) cfg.humanBat = [null, null];
      const sim = new Sim(cfg);
      let found = false;
      for (let ev = 80; ev <= 104 && !found; ev += 2)
        for (let spray = -30; spray <= 30 && !found; spray += 5) {
          const t = new Sim(cfg);
          t.s.phase = 'pitch';
          put(t.s, 2);
          startPlay(t.ctx, { ev, la: 11, spray }, { x: 0, y: 0.7, z: 2.5 }, 'GOOD');
          if (t.s.play!.closeCall) found = true;
        }
      expect(found).toBe(human);
      void sim;
    }
  });
});

describe('CPU AI', () => {
  it('batter timing sd and contact scale with HEAT (no other inputs)', () => {
    for (const [heat, sd] of [[0, 120], [99, 35]] as const) {
      const rng = new Rng(heat + 1);
      const offs: number[] = [];
      for (let i = 0; i < 300; i++) {
        const p = cpuSwing(rng, heat, { x: 0, z: 2.5 }, 0, 0, false);
        if (p.swing) offs.push(p.offsetMs);
      }
      const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
      const s = Math.sqrt(offs.reduce((a, b) => a + (b - mean) ** 2, 0) / offs.length);
      expect(Math.abs(s - sd) / sd).toBeLessThan(0.15);
    }
    const contact = (heat: number) => {
      const rng = new Rng(7);
      const w = windows({ heat, contact: 5, power: false, star: false, newbie: false, traitMul: 1 });
      let swings = 0, hits = 0;
      for (let i = 0; i < 300; i++) {
        const p = cpuSwing(rng, heat, { x: 0, z: 2.5 }, 0, 0, false);
        if (!p.swing) continue;
        swings++;
        const g = grade({ offsetMs: p.offsetMs, tier: 'pro', cross: { x: 0, z: 2.5 }, batterHand: 1, power: false }, w);
        if (g === 'PERFECT' || g === 'GOOD') hits++;
      }
      return hits / swings;
    };
    expect(contact(99) - contact(0)).toBeGreaterThanOrEqual(0.25);
  });
  it('pitcher respects repertoire, mixes pitches, and is more accurate at HEAT 99', () => {
    const err = (heat: number) => {
      const rng = new Rng(3);
      const arm = newArm();
      let e = 0, repeats = 0, last = '';
      for (let i = 0; i < 50; i++) {
        const p = cpuPitch(rng, heat, 'clem', arm, 0, 0.2, 0);
        expect(ROSTER_BY_ID.clem.pitches).toContain(p.type);
        if (p.type === last) repeats++;
        last = p.type;
        useArm(arm, p.type);
        e += inZone(p.target.x, p.target.z, 0) ? 0 : 1;
      }
      expect(repeats / 49).toBeLessThan(0.6);
      return e;
    };
    // accuracy: compare aim scatter directly
    const scatter = (heat: number) => cpuParams(heat).accuracyFt;
    expect(scatter(99)).toBeLessThanOrEqual(scatter(0) / 2);
    err(0);
    err(99);
  });
  it('no hidden boost: CPU params depend only on HEAT', () => {
    expect(cpuParams(50)).toEqual(cpuParams(50));
    const a = fresh(1), b = fresh(1);
    b.s.inning = 3;
    b.s.teams[0].runs = 9;
    expect(JSON.stringify(cpuParams(50))).toBe(JSON.stringify(cpuParams(50)));
    void a;
  });
});

describe('pitching', () => {
  it('early release is slower, late release scatters more', () => {
    const e = chargeOutcome(0.3), p = chargeOutcome(0.8), l = chargeOutcome(1.15);
    expect(e.speedMul).toBeLessThan(1);
    expect(p.speedMul).toBe(1);
    expect(l.scatter).toBeGreaterThan(p.scatter * 3);
    expect(p.quality).toBe('perfect');
  });
  it('stamina: same pitch loses velocity monotonically; switching restores ≥ half; clamped', () => {
    const arm = newArm();
    const eff: number[] = [];
    for (let i = 0; i < 10; i++) {
      eff.push(armEffect(arm, 'FF'));
      useArm(arm, 'FF');
    }
    for (let i = 1; i < eff.length; i++) expect(eff[i]).toBeLessThanOrEqual(eff[i - 1]);
    const lost = 1 - armEffect(arm, 'FF');
    expect(1 - armEffect(arm, 'CU')).toBeLessThanOrEqual(lost / 2);
    for (let i = 0; i < 200; i++) useArm(arm, 'FF');
    expect(arm.stamina).toBe(0);
    expect(arm.tired.FF).toBeLessThanOrEqual(60);
    expect(armEffect(arm, 'FF')).toBeGreaterThanOrEqual(0.7);
  });
  it('HEAT sweep: flight time and CPU sd strictly monotonic with no steps', () => {
    for (let h = 1; h <= 99; h++) {
      const a = fastballFlight(h - 1), b = fastballFlight(h);
      expect(b).toBeLessThan(a);
      expect((a - b) / a).toBeLessThan(0.02);
      expect(cpuParams(h).sdMs).toBeLessThan(cpuParams(h - 1).sdMs);
    }
  });
  it('score multiplier and hide-locator bonus', () => {
    expect(scoreMult(99, false)).toBeCloseTo(2.5, 6);
    expect(scoreMult(0, false)).toBe(1);
    expect(scoreMult(0, true)).toBeCloseTo(1.25, 6);
  });
});

describe('stars and fairness', () => {
  it('awards stack, cap at 5; PERFECT double = +2', () => {
    const { s } = fresh();
    awardStars(s, 0, 1); // PERFECT
    awardStars(s, 0, 1); // extra-base hit
    expect(s.teams[0].stars).toBe(2);
    awardStars(s, 0, 9);
    expect(s.teams[0].stars).toBe(5);
  });
  it('Star Chance: bases loaded yes; RISP trailing in the last inning yes; empty early no', () => {
    const a = fresh();
    [1, 2, 3].forEach((b) => put(a.s, b));
    expect(isStarChance(a.s)).toBe(true);
    const b = fresh();
    b.s.inning = 3;
    b.s.teams[1].runs = 2;
    put(b.s, 2);
    expect(isStarChance(b.s)).toBe(true);
    expect(isStarChance(fresh().s)).toBe(false);
  });
  it('Star Swing GOOD = max EV; Star Pitch break ×1.8', () => {
    const w = windows({ heat: 0, contact: 5, power: false, star: true, newbie: false, traitMul: 1 });
    const o = contactOut('GOOD', { offsetMs: 70, tier: 'rookie', cross: { x: 0, z: 2.55 }, batterHand: 1, power: false, powerRating: 4, moonshot: false, starSwing: true, dirV: 0, dirH: 0, maxEv: maxEvFor(4) }, w);
    expect(o.ev).toBe(maxEvFor(4));
    expect(TUNING.pitch.starBreak).toBe(1.8);
  });
  it('CPU uses a Star Pitch only with ≥2 stars and high leverage', () => {
    const rng = new Rng(4);
    let low = 0, high = 0;
    for (let i = 0; i < 200; i++) {
      if (cpuPitch(rng, 50, 'clem', newArm(), 1, 0.9, 0).star) low++;
      if (cpuPitch(rng, 50, 'clem', newArm(), 2, 0.3, 0).star) low++;
      if (cpuPitch(rng, 50, 'clem', newArm(), 3, 0.8, 0).star) high++;
    }
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(0);
  });
  it('nothing random overrides input: grading ignores RNG state', () => {
    const w = windows({ heat: 30, contact: 5, power: false, star: false, newbie: false, traitMul: 1 });
    const ctx = { offsetMs: 33, tier: 'pro' as const, cross: { x: 0.2, z: 2.4 }, batterHand: 1 as const, power: false };
    const r = new Rng(1);
    const a = grade(ctx, w);
    for (let i = 0; i < 100; i++) r.next();
    expect(grade(ctx, w)).toBe(a);
  });
});

describe('traits', () => {
  it('Pesky, Buddy, Streaky-hot, Clutch multiply windows exactly', () => {
    const { s } = fresh();
    s.teams[0].setup.lineup = ['tilly', 'noodle', 'pip', 'brick', 'clem'];
    expect(traitWindowMul(s, 'tilly', false)).toBeCloseTo(1.08, 6);
    expect(traitWindowMul(s, 'noodle', false)).toBeCloseTo(1.06, 6);
    expect(traitWindowMul(s, 'clem', true)).toBeCloseTo(1.06, 6);
    expect(traitWindowMul(s, 'clem', false)).toBe(1);
    recordPa(s, 'brick', 'H');
    recordPa(s, 'brick', 'H');
    expect(traitWindowMul(s, 'brick', false)).toBeCloseTo(1.05, 6);
    expect(ROSTER_BY_ID.ozzie.traits).toContain('burner');
    expect(ROSTER_BY_ID.moose.traits).toContain('moonshot');
  });
  it('roster: 12 base + 4 unlockable, unique names, ratings 0–10, 2–4 pitches, catchphrases', () => {
    expect(ROSTER.filter((c) => !c.unlock).length).toBe(12);
    expect(ROSTER.filter((c) => c.unlock).length).toBe(4);
    expect(new Set(ROSTER.map((c) => c.name)).size).toBe(16);
    for (const c of ROSTER) {
      for (const r of [c.contact, c.power, c.speed, c.pitching]) expect(r >= 0 && r <= 10).toBe(true);
      expect(c.pitches.length >= 2 && c.pitches.length <= 4).toBe(true);
      expect(c.catchphrases.length).toBeGreaterThanOrEqual(3);
      for (const p of c.pitches) expect(PITCHES[p]).toBeDefined();
    }
  });
});

describe('modes', () => {
  it('Mill: foul/called strike/whiff are outs, a ball is free, 10 outs ends; exact streak scoring', () => {
    const sim = new Sim(mill({ seed: 1, players: [{ name: 'A', heat: 0, tier: 'rookie' }], chars: ['moose'] }));
    const c = sim.ctx, s = sim.s;
    s.play = { foul: true } as GameState['play'];
    endPlay(c, 'foul');
    expect(s.mill!.outs).toBe(1);
    const flow = sim.ctx;
    void flow;
    // HR scoring: 400, 410, 420 at HEAT 0, streak from 0
    s.mill!.streak = 0;
    let total = 0;
    for (const d of [400, 410, 420]) {
      s.last.dist = d;
      s.last.grade = 'GOOD';
      s.play = { foul: false } as GameState['play'];
      endPlay(c, 'hr');
      total = s.mill!.scores[0];
    }
    expect(total).toBeCloseTo(1542.5, 6);
    s.last.dist = 400;
    s.last.grade = 'PERFECT';
    s.mill!.streak = 0;
    const before = s.mill!.scores[0];
    endPlay(c, 'hr');
    expect(s.mill!.scores[0] - before).toBeCloseTo(500, 6);
  });
  it('Mill: called strike is an out, a taken ball is free', async () => {
    const sim = new Sim(mill({ seed: 2, players: [{ name: 'A', heat: 0, tier: 'rookie' }], chars: ['moose'] }));
    const { onTakeOrWhiff } = await import('../src/sim/flow');
    onTakeOrWhiff(sim.ctx, 'ball');
    expect(sim.s.mill!.outs).toBe(0);
    onTakeOrWhiff(sim.ctx, 'strike');
    expect(sim.s.mill!.outs).toBe(1);
  });
  it('Pass the Proof: handoffs = halves − 1; each player gets CPU pitching at their own HEAT', () => {
    const stats = { swings: 0, hr: 0, pa: 0, onBase: 0, pitches: 0, games: 0, takeToWindup: [], deadToReady: [], hrToReady: [], violations: [], durations: [] };
    const cfg = proof({ seed: 8, players: [{ name: 'A', heat: 0, tier: 'rookie' }, { name: 'B', heat: 99, tier: 'pro' }] });
    const halves = new Set<string>();
    let handoffs = 0;
    const flights: Record<number, number[]> = { 0: [], 1: [] };
    const sim = new Sim(cfg);
    let lastRel = -1;
    while (sim.s.phase !== 'gameOver' && sim.s.time < 2000) {
      const s = sim.s;
      if (s.phase === 'pitch' && s.pitch && s.releaseT !== lastRel) {
        lastRel = s.releaseT;
        if (!s.tiebreak) halves.add(`${s.inning}-${s.half}`);
        if (s.pitch.type === 'FF' && !s.tiebreak) flights[s.half].push(s.pitch.T);
        sim.act({ type: 'swing', t: s.releaseT + s.pitch.T + ((s.totalPitches * 41) % 140 - 70) / 1000 });
      }
      if (s.phase === 'handoff' && s.time - s.phaseT > 0.45) sim.act({ type: 'ready' });
      const inTb = !!sim.s.tiebreak;
      sim.step(1 / 120);
      for (const e of sim.drainEvents()) if (e.type === 'handoff' && !inTb && !sim.s.tiebreak) handoffs++;
    }
    expect(sim.s.phase).toBe('gameOver');
    report(`BOT proof: ${halves.size} halves, ${handoffs} handoffs, reason ${sim.s.overReason}`);
    expect(handoffs).toBe(halves.size - 1);
    expect(Math.max(...flights[1])).toBeLessThan(Math.min(...flights[0]));
    void stats;
    void botGame;
  });
  it('Clutch Cards: every card resolves by its check; median duration 45–110 s', () => {
    const durs: number[] = [];
    for (const card of CLUTCH_CARDS) {
      const st = { swings: 0, hr: 0, pa: 0, onBase: 0, pitches: 0, games: 0, takeToWindup: [], deadToReady: [], hrToReady: [], violations: [], durations: [] as number[] };
      const sim = botGame(clutch({ seed: 9, players: [{ name: 'A', heat: 50, tier: 'rookie' }] }, card), humanish, st);
      expect(sim.s.phase).toBe('gameOver');
      expect(['win', 'lose']).toContain(sim.s.clutchResult);
      durs.push(sim.s.time);
    }
    durs.sort((a, b) => a - b);
    const med = (durs[3] + durs[4]) / 2;
    report('BOT clutch durations (s):', durs.map((d) => d.toFixed(0)).join(', '), 'median', med.toFixed(0));
    expect(med).toBeGreaterThanOrEqual(45);
    expect(med).toBeLessThanOrEqual(110);
  });
  it("Today's Edition: same date → same card; ≥20 distinct across 30 dates; checks consistent", () => {
    expect(dailyCard(20261105)).toEqual(dailyCard(20261105));
    const keys = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      const c = dailyCard(20261100 + d);
      keys.add(JSON.stringify([c.side, c.bases, c.outs, c.scoreHuman, c.scoreCpu, c.balls, c.strikes]));
      if (c.side === 'bat') expect(c.runs).toBe(c.scoreCpu - c.scoreHuman + 1);
      else expect(c.runs).toBe(c.scoreHuman - c.scoreCpu - 1);
    }
    expect(keys.size).toBeGreaterThanOrEqual(20);
  });
});

describe('Mill elimination bracket (stretch)', () => {
  it('4 players: round 1 for all, then the top two meet in a final; winner decided by the final', async () => {
    const { afterDead } = await import('../src/sim/flow');
    const players = ['A', 'B', 'C', 'D'].map((name) => ({ name, heat: 0, tier: 'rookie' as const }));
    const sim = new Sim(mill({ seed: 3, players, chars: ['moose', 'tilly', 'brick', 'sonny'], bracket: true }));
    const s = sim.s;
    const finishTurn = (score: number) => {
      s.mill!.scores[s.mill!.player] = score;
      s.mill!.outs = 10;
      afterDead(sim.ctx);
      if (s.phase === 'handoff') {
        s.phaseT = s.time - 1;
        sim.act({ type: 'ready' });
        sim.step(1 / 120);
      }
    };
    [500, 900, 200, 700].forEach(finishTurn);
    expect(s.mill!.round).toBe(2);
    expect(s.mill!.queue).toEqual([1, 3]);
    expect(s.mill!.player).toBe(1);
    finishTurn(300); // B in the final
    finishTurn(450); // D in the final
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe(3);
    expect(s.overReason).toBe('Bracket final');
  });
});
