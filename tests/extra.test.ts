import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/game';
import { shortRun } from '../src/sim/modes';
import { contactRadius, grade, windows } from '../src/sim/contact';
import { momentumOf, recordPa, leverage } from '../src/sim/stars';
import { bestIntercept, chooseThrow, ballEta, runnerEta } from '../src/sim/fielding';
import { crossing } from '../src/sim/pitch';
import { ZONE_MID } from '../src/sim/field';
import { TUNING } from '../src/config/tuning';
import type { Tier } from '../src/sim/types';
import { cfgShort } from './sim.test';

/** Vitest 5 hides console output of passing tests; balance numbers must always print. */
const report = (...a: unknown[]) => process.stdout.write('\n' + a.join(' ') + '\n');

describe('teach through play', () => {
  it('first-ever pitch is a slow, centred meatball; ×1.5 windows on pitches 1–3, ×1 on 4', () => {
    const sim = new Sim(shortRun({ seed: 4, players: [{ name: 'New', heat: 0, tier: 'rookie' }], firstEver: true, newbiePitchesLeft: 3 }));
    const scales: number[] = [];
    let first = true;
    while (scales.length < 4 && sim.s.time < 400) {
      const prev = sim.s.phase;
      sim.step(1 / 120);
      sim.drainEvents();
      if (prev !== 'pitch' && sim.s.phase === 'pitch' && sim.s.cfg.humanBat[sim.s.half] !== null) {
        if (first) {
          const c = crossing(sim.s.pitch!);
          expect(Math.abs(c.x - ZONE_MID.x)).toBeLessThan(0.1);
          expect(Math.abs(c.z - ZONE_MID.z)).toBeLessThan(0.1);
          expect(sim.s.pitch!.T).toBeGreaterThanOrEqual(1.1);
          first = false;
        }
        scales.push(sim.s.win!.scale);
      }
    }
    const base = windows({ heat: 0, contact: 5, power: false, star: false, newbie: false, traitMul: 1 }).scale;
    void base;
    expect(scales[0] / scales[3]).toBeCloseTo(TUNING.timing.newbieWindow, 1);
    expect(scales[1] / scales[3]).toBeCloseTo(TUNING.timing.newbieWindow, 1);
    expect(scales[2] / scales[3]).toBeCloseTo(TUNING.timing.newbieWindow, 1);
  });
});

describe('momentum and pressure', () => {
  it('2+ hits in the last 3 PAs = hot; 3 outs with ≥2 Ks = cold; leverage rises with runners/late', () => {
    const sim = new Sim(cfgShort(1));
    const s = sim.s;
    recordPa(s, 'moose', 'H');
    recordPa(s, 'moose', 'O');
    recordPa(s, 'moose', 'H');
    expect(momentumOf(s, 'moose')).toBe('hot');
    recordPa(s, 'tilly', 'K');
    recordPa(s, 'tilly', 'O');
    recordPa(s, 'tilly', 'K');
    expect(momentumOf(s, 'tilly')).toBe('cold');
    expect(momentumOf(s, 'gertie')).toBeNull();
    const early = leverage(s);
    s.inning = 3;
    s.outs = 2;
    expect(leverage(s)).toBeGreaterThan(early);
  });
});

describe('tiers change inputs only', () => {
  it('same timing on a centred pitch grades the same in every tier', () => {
    const w = windows({ heat: 40, contact: 5, power: false, star: false, newbie: false, traitMul: 1 });
    for (const o of [-150, -90, -20, 0, 30, 70, 120, 200]) {
      const g = (tier: Tier) => grade({ offsetMs: o, tier, cross: { x: 0, z: 2.55 }, batterHand: 1, power: false, reticle: tier === 'allstar' ? { x: 0, z: 2.55 } : undefined }, w);
      expect(g('pro')).toBe(g('rookie'));
      expect(g('allstar')).toBe(g('rookie'));
    }
  });
  it('POWER shrinks the contact radius ×0.7', () => {
    expect(contactRadius(true) / contactRadius(false)).toBeCloseTo(TUNING.timing.powerRadius, 9);
  });
});

describe('fielding audit (30 bot games)', () => {
  it('chaser is always the min-intercept fielder and CPU throws always take an available out', () => {
    const violations: string[] = [];
    let throws = 0, plays = 0;
    for (let seed = 100; seed < 130; seed++) {
      const cfg = { ...cfgShort(seed) };
      cfg.humanPitch = [null, null]; // CPU fields both sides: every throw is a CPU decision
      const sim = new Sim(cfg);
      let last = -1;
      while (sim.s.phase !== 'gameOver' && sim.s.time < 1500) {
        const s = sim.s;
        if (s.phase === 'pitch' && s.pitch && s.releaseT !== last && s.cfg.humanBat[s.half] !== null) {
          last = s.releaseT;
          sim.act({ type: 'swing', t: s.releaseT + s.pitch.T + ((s.totalPitches * 43) % 180 - 90) / 1000 });
        }
        const before = s.play;
        // snapshot runners before the step so a throw can be audited against the state it was chosen in
        const snap = s.runners.map((r) => ({ ...r }));
        sim.step(1 / 120);
        for (const e of sim.drainEvents()) {
          if (e.type === 'contact' && s.play && !s.play.lite && !s.play.foul && !s.play.hr) {
            plays++;
            const best = bestIntercept(s.fielders, s.play.pred);
            if (best && best.fielder !== s.play.chaser) violations.push(`seed ${seed}: chaser ${s.play.chaser} ≠ min-intercept ${best.fielder}`);
          }
          if (e.type === 'throw') {
            throws++;
            const from = s.thr ? { x: s.thr.from.x, y: s.thr.from.y } : s.fielders[e.from].pos;
            // decision-time runners = positions before the step, with outs made earlier in this step applied
            const view = snap.map((r) => ({ ...r, out: r.out || !!s.runners.find((x) => x.id === r.id)?.out }));
            const ch = chooseThrow(from, e.from, view);
            const marginAt = (b: number) => Math.max(-9, ...view.filter((r) => !r.out && !r.scored && (r.base + 1 === b || r.target === b)).map((r) => runnerEta(r, b) - ballEta(from, e.from, b) - (r.forcedTo === b ? 0 : TUNING.fielding.tag)));
            if (ch && ch.out && marginAt(e.base) <= 0) violations.push(`seed ${seed}: threw to ${e.base} (no out) but an out was available at ${ch.base}`);
            const heading = view.some((r) => !r.out && !r.scored && (r.base + 1 === e.base || r.target >= e.base));
            if (!heading && ch?.out) violations.push(`seed ${seed}: threw to ${e.base} with nobody heading there`);
          }
        }
        void before;
      }
    }
    report(`BOT fielding audit: ${plays} balls in play, ${throws} throws, ${violations.length} violations`);
    expect(plays).toBeGreaterThan(200);
    expect(throws).toBeGreaterThan(100);
    expect(violations).toEqual([]);
  });
});
