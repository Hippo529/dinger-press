// Tests added after the M7 review: each goes through game code rather than calling helpers by hand.
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/game';
import { Rng } from '../src/core/rng';
import { makePitch } from '../src/sim/pitch';
import { contactOut, maxEvFor, windows } from '../src/sim/contact';
import { poseLimbs } from '../src/render/actors';
import { makeRunner } from '../src/sim/state';
import { cfgShort } from './sim.test';

function toHumanPitch(sim: Sim) {
  while (!(sim.s.phase === 'pitch' && sim.s.cfg.humanBat[sim.s.half] !== null)) {
    sim.step(1 / 120);
    sim.drainEvents();
  }
}

describe('stars through real swings', () => {
  it('a PERFECT swing awards +1 star to the batting team at contact', () => {
    const sim = new Sim(cfgShort(5));
    const s = sim.s;
    toHumanPitch(sim);
    // wait for a pitch in the zone (out-of-zone pitches grade by location, correctly)
    while (Math.abs(s.pitch!.target.x) > 0.7 || s.pitch!.target.z < 1.8 || s.pitch!.target.z > 3.3) {
      while (s.phase === 'pitch') { sim.step(1 / 120); sim.drainEvents(); }
      toHumanPitch(sim);
    }
    const before = s.teams[s.half].stars;
    sim.act({ type: 'swing', t: s.releaseT + s.pitch!.T });
    const ev = [];
    while (s.last.grade === null) {
      sim.step(1 / 120);
      ev.push(...sim.drainEvents());
    }
    expect(s.last.grade).toBe('PERFECT');
    expect(ev.some((e) => e.type === 'starEarned' && e.why === 'PERFECT')).toBe(true);
    expect(s.teams[s.half].stars).toBe(before + 1);
  });
  it("a CPU Star Pitch never cancels the batter's armed Star Swing", () => {
    let checked = 0;
    for (let seed = 1; seed < 80 && checked < 3; seed++) {
      const sim = new Sim(cfgShort(seed));
      const s = sim.s;
      while (s.phase !== 'prePitch') { sim.step(1 / 120); sim.drainEvents(); }
      // high leverage + CPU stars → the CPU may throw a Star Pitch
      s.teams[1].stars = 5;
      s.teams[0].stars = 1;
      for (const b of [1, 2, 3]) { const r = makeRunner(s, 'clem', b, false); r.target = b; s.runners.push(r); }
      s.inning = 3;
      sim.act({ type: 'useStar' });
      sim.step(1 / 120);
      expect(s.starArmed).toBe(true);
      while ((s.phase as string) !== 'pitch') { sim.step(1 / 120); sim.drainEvents(); }
      if (s.pitch!.star) {
        checked++;
        expect(s.starArmed).toBe(true);
        expect(s.win!.scale).toBeGreaterThan(1.5); // Star Swing window applied
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('Star Pitch and stamina break', () => {
  it('vertical and lateral break both scale ×1.8 for a Star Pitch, and with arm effectiveness', () => {
    const mk = (star: boolean, breakMul = 1) => makePitch({ type: 'CU', target: { x: 0, z: 2.4 }, T: 0.7, hand: 1, star, breakMul }, new Rng(1));
    const base = mk(false), star = mk(true), tired = mk(false, 0.8);
    expect(star.D / base.D).toBeCloseTo(1.8, 6);
    expect(star.B / base.B).toBeCloseTo(1.8, 6);
    expect(tired.D / base.D).toBeCloseTo(0.8, 6);
  });
});

describe('human pitch aim is clamped', () => {
  it('aim cannot be placed at the batter or in the dirt; final target clamped after scatter', () => {
    const cfg = { ...cfgShort(2) };
    cfg.humanPitch = [null, 0];
    cfg.humanBat = [null, 0];
    const sim = new Sim(cfg);
    const s = sim.s;
    while (!(s.phase === 'prePitch' && s.half === 0)) { sim.step(1 / 120); sim.drainEvents(); }
    sim.act({ type: 'chargeStart', zx: -9, zz: -3 });
    sim.step(1 / 120);
    expect(s.pitchAim).toEqual({ x: -2.0, z: 0.6 });
    sim.act({ type: 'chargeEnd', t: s.time + 1.2 }); // late release → big scatter
    while ((s.phase as string) !== 'pitch') { sim.step(1 / 120); sim.drainEvents(); }
    expect(Math.abs(s.pitch!.target.x)).toBeLessThanOrEqual(2.1);
    expect(s.pitch!.target.z).toBeGreaterThanOrEqual(0.5);
  });
});

describe('tier rules on launch angle', () => {
  it('Rookie is vertically auto-aligned (low pitch PERFECT still 27°); Pro low pitch launches lower', () => {
    const w = windows({ heat: 0, contact: 5, power: false, star: false, newbie: false, traitMul: 1 });
    const ctx = (tier: 'rookie' | 'pro') => ({ offsetMs: 0, tier, cross: { x: 0, z: 1.7 }, batterHand: 1 as const, power: false, powerRating: 5, moonshot: false, starSwing: false, dirV: 0 as const, dirH: 0 as const, maxEv: maxEvFor(5) });
    expect(contactOut('PERFECT', ctx('rookie'), w).la).toBe(27);
    expect(contactOut('PERFECT', ctx('pro'), w).la).toBeLessThan(27);
  });
  it('POWER stance is visibly wider and lower', () => {
    const a = poseLimbs({ kind: 'stance', t: 0, facing: 1, back: true });
    const b = poseLimbs({ kind: 'stance', t: 0, facing: 1, back: true, power: true });
    expect(b.legF - b.legB).toBeGreaterThan((a.legF - a.legB) * 1.5);
    expect(b.crouch).toBeGreaterThan(a.crouch);
  });
});
