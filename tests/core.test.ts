import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { easeInBack, easeOutBack, easeOutCubic, easeOutElastic } from '../src/core/easing';
import { DT, FixedLoop, type Steppable } from '../src/core/loop';
import { carry, launch, predict } from '../src/sim/physics';
import { STADIUMS, fenceAt } from '../src/sim/field';
import { PITCHES, fastballFlight, makePitch, pitchPos, applySteer } from '../src/sim/pitch';
import type { PitchType } from '../src/sim/types';
import { contrast, THEME, TEAM_INK } from '../src/config/theme';

describe('rng', () => {
  it('mulberry32 sequence is stable for seed 1', () => {
    const r = new Rng(1);
    const seq = [r.next(), r.next(), r.next()].map((x) => x.toFixed(6));
    const r2 = new Rng(1);
    expect([r2.next(), r2.next(), r2.next()].map((x) => x.toFixed(6))).toEqual(seq);
    expect(seq).toMatchInlineSnapshot(`
      [
        "0.627074",
        "0.002736",
        "0.527447",
      ]
    `);
  });
});

describe('easing', () => {
  it('endpoints and overshoot', () => {
    for (const f of [easeOutCubic, easeOutBack, easeInBack, easeOutElastic]) {
      expect(f(0)).toBeCloseTo(0, 6);
      expect(f(1)).toBeCloseTo(1, 6);
    }
    let max = 0;
    for (let x = 0; x <= 1; x += 0.01) max = Math.max(max, easeOutBack(x));
    expect(max).toBeGreaterThan(1.05);
    expect(easeInBack(0.3)).toBeLessThan(0); // anticipation
  });
});

describe('fixed loop', () => {
  class Counter implements Steppable {
    n = 0;
    t = 0;
    step(dt: number) { this.n++; this.t += dt; }
    afterStep() { return false; }
    simTime() { return this.t; }
  }
  it('1 s wall at scale 0.5 → 60 steps; a 1 s gap clamps to 250 ms (30 steps)', () => {
    const l = new FixedLoop();
    const c = new Counter();
    for (let i = 0; i < 60; i++) l.advance(c, 1 / 60, 0.5, i * 16.7);
    expect(c.n).toBe(60);
    const c2 = new Counter();
    new FixedLoop().advance(c2, 1.0, 1, 0);
    expect(c2.n).toBe(30);
  });
  it('interpolation alpha stays in [0,1)', () => {
    const l = new FixedLoop();
    const c = new Counter();
    l.advance(c, DT * 1.5, 1, 0);
    expect(l.alpha()).toBeCloseTo(0.5, 5);
  });
});

describe('physics calibration', () => {
  it('100 mph @ 28° carries 380–410 ft; 110 @ 30° carries 440–470 ft', () => {
    const a = carry(100, 28), b = carry(110, 30);
    expect(a).toBeGreaterThanOrEqual(380);
    expect(a).toBeLessThanOrEqual(410);
    expect(b).toBeGreaterThanOrEqual(440);
    expect(b).toBeLessThanOrEqual(470);
  });
  it('95 mph @ −10° is a grounder (first bounce ≤ 150 ft); a liner stays low', () => {
    const p = predict(launch(95, -10, 0), STADIUMS.yard);
    expect(Math.hypot(p.land!.x, p.land!.y)).toBeLessThanOrEqual(150);
    const liner = predict(launch(100, 12, 0), STADIUMS.yard);
    expect(liner.apexZ).toBeLessThan(40);
  });
  it('HR over the fence; Gutter Mailbox wall rebounds a liner', () => {
    expect(predict(launch(105, 32, -20), STADIUMS.yard).hr).toBe(true);
    const f = fenceAt(STADIUMS.gutter, 30);
    expect(f.dist).toBeGreaterThanOrEqual(290);
    expect(f.dist).toBeLessThanOrEqual(310);
    expect(f.height).toBe(38);
    // 100 mph @ 20° pulled to RF is ~31 ft high at the 290–300 ft Mailbox: rebound, not HR.
    const p = predict(launch(100, 20, 30), STADIUMS.gutter);
    expect(p.hr).toBe(false);
    expect(predict(launch(100, 20, 30), STADIUMS.yard).hr).toBe(false);
    expect(predict(launch(100, 25, 30), STADIUMS.gutter).hr).toBe(true); // clears the Mailbox by ~17 ft
  });
  it('fair/foul at ±45°', () => {
    expect(predict(launch(85, 15, 50), STADIUMS.yard).foul).toBe(true);
    expect(predict(launch(85, 15, 40), STADIUMS.yard).foul).toBe(false);
  });
});

describe('pitches', () => {
  it('every type ends exactly at its target at T; curves visibly break', () => {
    const rng = new Rng(3);
    for (const t of Object.keys(PITCHES) as PitchType[]) {
      const ps = makePitch({ type: t, target: { x: 0.4, z: 2.2 }, T: 0.6, hand: 1, star: false, breakMul: 1 }, rng);
      const p = pitchPos(ps, ps.T);
      expect(p.x).toBeCloseTo(0.4, 2);
      expect(p.z).toBeCloseTo(2.2, 2);
    }
    const cu = makePitch({ type: 'CU', target: { x: 0, z: 2.2 }, T: 0.6, hand: 1, star: false, breakMul: 1 }, rng);
    const mid = pitchPos(cu, 0.3);
    const straightZ = cu.release.z + (2.2 - cu.release.z) * 0.5;
    expect(Math.abs(mid.z - straightZ)).toBeGreaterThan(0.5);
  });
  it('fastball flight 0.85/0.65/0.50 s at HEAT 0/50/99; off-speed 15–25% slower', () => {
    expect(fastballFlight(0)).toBeCloseTo(0.85, 2);
    expect(fastballFlight(50)).toBeCloseTo(0.65, 2);
    expect(fastballFlight(99)).toBeCloseTo(0.5, 2);
    for (const t of ['CU', 'SL', 'CH', 'SP', 'SC', 'KN'] as PitchType[]) {
      expect(PITCHES[t].flightMul).toBeGreaterThanOrEqual(1.15);
      expect(PITCHES[t].flightMul).toBeLessThanOrEqual(1.25);
    }
  });
  it('steer clamps to the budget and stops after 70% of flight', () => {
    const ps = makePitch({ type: 'SL', target: { x: 0, z: 2.5 }, T: 0.6, hand: 1, star: false, breakMul: 1 }, new Rng(1));
    applySteer(ps, 99);
    expect(ps.steer).toBeCloseTo(ps.steerBudget, 6);
    ps.t = 0.5;
    applySteer(ps, -99);
    expect(ps.steer).toBeCloseTo(ps.steerBudget, 6);
  });
});

describe('readability tokens', () => {
  it('ball ≥ 4.5:1 against every background token; ball outline ≥ 4.5:1 against every uniform', () => {
    for (const bg of [THEME.sky, THEME.grass, THEME.grassStripe, THEME.dirt, THEME.stands, THEME.wall]) expect(contrast(THEME.ball, bg)).toBeGreaterThanOrEqual(4.5);
    for (const u of Object.values(TEAM_INK)) expect(contrast(THEME.ink, u.main) >= 4.5 || contrast(THEME.ball, u.main) >= 4.5).toBe(true);
    expect(contrast(THEME.ink, THEME.pink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(THEME.ink, THEME.teal)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(THEME.ink, THEME.sun)).toBeGreaterThanOrEqual(4.5);
  });
});
