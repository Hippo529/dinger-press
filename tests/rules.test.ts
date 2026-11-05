import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/game';
import { afterDead, endPlay, nextHalf, onTakeOrWhiff } from '../src/sim/flow';
import { makeRunner, type GameState } from '../src/sim/state';
import { cfgShort } from './sim.test';
import { startPlay } from '../src/sim/play';
import { bestIntercept, coverage, explainOut, explainSafe } from '../src/sim/fielding';
import { launch, predict } from '../src/sim/physics';
import { STADIUMS, SS, B1, B2, B3, C, CF, RF } from '../src/sim/field';
import { decideAdvances, runnerSpeed } from '../src/sim/running';
import type { Runner } from '../src/sim/types';

function fresh(seed = 1) {
  const sim = new Sim(cfgShort(seed));
  return { sim, s: sim.s, c: sim.ctx };
}
function putRunner(s: GameState, base: number) {
  const r = makeRunner(s, s.teams[s.half].setup.lineup[base % 5], base, false);
  r.target = base;
  s.runners.push(r);
  return r;
}
function stepUntil(sim: Sim, pred: () => boolean, maxS = 30) {
  const t0 = sim.s.time;
  while (!pred() && sim.s.time - t0 < maxS) {
    sim.step(1 / 120);
    sim.drainEvents();
  }
}

describe('count and plate appearances', () => {
  it('4 balls walk, 3 strikes K, foul with two strikes adds nothing', () => {
    const { s, c } = fresh();
    for (let i = 0; i < 3; i++) onTakeOrWhiff(c, 'ball');
    expect(s.balls).toBe(3);
    onTakeOrWhiff(c, 'ball');
    expect(s.balls).toBe(0);
    expect(s.runners.some((r) => r.base === 1)).toBe(true);
    onTakeOrWhiff(c, 'strike');
    onTakeOrWhiff(c, 'whiff');
    expect(s.strikes).toBe(2);
    s.play = { foul: true } as GameState['play'];
    endPlay(c, 'foul');
    expect(s.strikes).toBe(2);
    onTakeOrWhiff(c, 'strike');
    expect(s.outs).toBe(1);
    expect(s.strikes).toBe(0);
  });
  it('bases-loaded walk forces a run and leaves the bases loaded', () => {
    const { s, c } = fresh();
    [1, 2, 3].forEach((b) => putRunner(s, b));
    s.balls = 3;
    onTakeOrWhiff(c, 'ball');
    expect(s.teams[0].runs).toBe(1);
    const occ = [1, 2, 3].map((b) => s.runners.some((r) => !r.scored && r.base === b));
    expect(occ).toEqual([true, true, true]);
  });
});

describe('innings, mercy, walk-off, extras, tiebreak', () => {
  it('home leads after the top of the 3rd → game over', () => {
    const { s, c } = fresh();
    s.inning = 3;
    s.half = 0;
    s.teams[1].runs = 2;
    s.teams[0].runs = 1;
    nextHalf(c);
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe(1);
  });
  it('bottom 3rd go-ahead run is a walk-off and ends immediately', () => {
    const { s, c } = fresh();
    s.inning = 3;
    s.half = 1;
    s.teams[0].runs = 2;
    s.teams[1].runs = 2;
    [1, 2, 3].forEach((b) => putRunner(s, b));
    s.balls = 3;
    onTakeOrWhiff(c, 'ball');
    expect(s.walkoff).toBe(true);
    afterDead(c);
    expect(s.phase).toBe('gameOver');
    expect(s.overReason).toBe('walk-off');
  });
  it('mercy: lead > 5 after the 1st or 2nd ends the game', () => {
    for (const inn of [1, 2]) {
      const { s, c } = fresh();
      s.inning = inn;
      s.half = 1;
      s.teams[0].runs = 7;
      nextHalf(c);
      expect(s.phase).toBe('gameOver');
      expect(s.overReason).toBe('mercy rule');
    }
    const { s, c } = fresh();
    s.inning = 1;
    s.half = 1;
    s.teams[0].runs = 5;
    nextHalf(c);
    expect(s.phase).not.toBe('gameOver');
  });
  it('extras 4–6 start each half with a runner on 2nd; tied after 6 → 3-swing derby, then 1-swing rounds', () => {
    const { s, c } = fresh();
    s.inning = 3;
    s.half = 1;
    nextHalf(c);
    expect(s.inning).toBe(4);
    expect(s.runners.map((r) => r.base)).toEqual([2]);
    s.half = 0;
    nextHalf(c);
    expect(s.half).toBe(1);
    expect(s.runners.map((r) => r.base)).toEqual([2]);
    s.inning = 6;
    nextHalf(c);
    expect(s.tiebreak).not.toBeNull();
    expect(s.tiebreak!.left).toBe(3);
    // away: 1 HR in 3 swings; home: 1 HR → tie → 1-swing round
    const tb = s.tiebreak!;
    tb.hrs = [1, 1];
    tb.team = 1;
    tb.left = 1;
    s.play = { foul: true } as GameState['play'];
    endPlay(c, 'foul');
    expect(s.tiebreak!.round).toBe(2);
    expect(s.tiebreak!.left).toBe(1);
    expect(s.tiebreak!.team).toBe(0);
  });
});

describe('fielding', () => {
  it('chaser is the minimum-intercept fielder; coverage follows fundamentals', () => {
    const { s } = fresh();
    // −20° is the hole: the 3B (112 ft deep) cuts it off before it reaches the SS (146 ft) — the
    // minimum-intercept rule, and real fundamentals. (Checklist step said "SS" here; see progress.md.)
    const hole = bestIntercept(s.fielders, predict(launch(85, -8, -20), STADIUMS.yard))!;
    expect(hole.fielder).toBe(B3);
    for (let i = 0; i < s.fielders.length; i++) {
      const pr = predict(launch(85, -8, -20), STADIUMS.yard);
      const it = bestIntercept([s.fielders[i]], pr);
      if (it) expect(it.t).toBeGreaterThanOrEqual(hole.t - 1e-9);
    }
    const g = bestIntercept(s.fielders, predict(launch(85, -8, -12), STADIUMS.yard))!;
    expect(g.fielder).toBe(SS);
    const f = bestIntercept(s.fielders, predict(launch(95, 30, 18), STADIUMS.yard))!;
    expect([RF, CF]).toContain(f.fielder);
    const cov = coverage(SS, -20);
    expect(cov[1]).toBe(B1);
    expect(cov[2]).toBe(B2);
    expect(cov[3]).toBe(B3);
    expect(cov[4]).toBe(C);
    expect(coverage(B2, 10)[2]).toBe(SS);
  });
  it('runner on 1st, 0 out, hard grounder to short → double play', () => {
    const { sim, s, c } = fresh(3);
    s.phase = 'pitch';
    putRunner(s, 1);
    startPlay(c, { ev: 88, la: -6, spray: -18 }, { x: 0, y: 0.7, z: 2.5 }, 'GOOD');
    stepUntil(sim, () => s.phase !== 'live', 15);
    expect(s.outs).toBe(2);
    expect(s.banner?.text).toBe('DOUBLE PLAY');
  });
  it('explanations', () => {
    expect(explainSafe(-0.1)).toBe('Beat the throw by a step');
    expect(explainOut(1.5, 1)).toBe('Out by a mile');
    expect(explainOut(0.3, 2)).toBe('Two! Turned the double play');
  });
  it('sac fly: runner on 3rd, 1 out, deep fly caught → run scores, batter out', () => {
    const { sim, s, c } = fresh(4);
    s.outs = 1;
    s.phase = 'pitch';
    putRunner(s, 3);
    startPlay(c, { ev: 96, la: 34, spray: 5 }, { x: 0, y: 0.7, z: 2.5 }, 'GOOD');
    expect(s.play!.air).toBe(true);
    stepUntil(sim, () => s.phase !== 'live', 15);
    expect(s.outs).toBe(2);
    expect(s.teams[0].runs).toBe(1);
    expect(s.banner?.text).toBe('SAC FLY');
  });
});

describe('running decisions', () => {
  function r(base: number, id: number): Runner {
    return { id, charId: 'clem', base, target: base, d: 0, speed: runnerSpeed(5), delay: 0, out: false, scored: false, scoredAt: 0, forcedTo: 0, isBatter: false, tagWait: false, returning: false };
  }
  it('Aggressive takes the extra base at margin ≈ 0.2; Conservative holds; close calls flagged only when |margin| < 0.35', () => {
    // A runner on 2nd; ball secured in the outfield such that the throw home is ~0.2 s late.
    const run = r(2, 1);
    const eta3 = (90 - 0) / run.speed, eta4 = 180 / run.speed;
    // find secureT that gives margin 0.2 at home for a throw from shallow CF
    const pt = { x: 0, y: 250 };
    const ball = 0.25 + 250 / 105 + 0.3;
    const secureT = eta4 + 0.2 - ball;
    const agg = [r(2, 1)];
    const close = decideAdvances(agg, { securePoint: pt, secureT, holder: CF, airCatch: false, outs: 0, agg: 'aggressive' });
    expect(agg[0].target).toBe(4);
    expect(close && Math.abs(close.margin) < 0.35).toBe(true);
    const con = [r(2, 1)];
    decideAdvances(con, { securePoint: pt, secureT, holder: CF, airCatch: false, outs: 0, agg: 'conservative' });
    expect(con[0].target).toBe(3);
    void eta3;
    // a big margin is not a close call
    const easy = [r(2, 1)];
    const none = decideAdvances(easy, { securePoint: pt, secureT: secureT + 2, holder: CF, airCatch: false, outs: 0, agg: 'conservative' });
    expect(none === null || none.base !== 4).toBe(true);
  });
});
