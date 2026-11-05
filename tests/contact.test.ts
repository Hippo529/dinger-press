import { describe, expect, it } from 'vitest';
import { contactOut, grade, maxEvFor, windows, PRO_LA_DOWN, PRO_LA_UP, PRO_SPRAY, type ContactCtx, type WindowCtx } from '../src/sim/contact';
import { TUNING } from '../src/config/tuning';
import type { Tier } from '../src/sim/types';

const base: WindowCtx = { heat: 0, contact: 5, power: false, star: false, newbie: false, traitMul: 1 };
const mid = { x: 0, z: 2.55 };
const g = (o: number, w = windows(base), tier: Tier = 'rookie', cross = mid, hand: 1 | -1 = 1) => grade({ offsetMs: o, tier, cross, batterHand: hand, power: false }, w);

describe('grading windows (HEAT 0 baseline)', () => {
  it('boundaries', () => {
    expect(g(0)).toBe('PERFECT');
    expect(g(-40)).toBe('PERFECT');
    expect(g(48)).toBe('PERFECT');
    expect(g(-41)).toBe('GOOD');
    expect(g(49)).toBe('GOOD');
    expect(g(100)).toBe('GOOD');
    expect(g(-101)).toBe('EARLY');
    expect(g(101)).toBe('LATE');
    expect(g(-130)).toBe('EARLY');
    expect(g(131)).toBe('FOUL');
    expect(g(160)).toBe('FOUL');
    expect(g(-161)).toBe('WHIFF');
    expect(g(161)).toBe('WHIFF');
  });
  it('multipliers: POWER, Star, newbie, contact rating, Pesky — and the +8 ms grace stays fixed', () => {
    const cases: [Partial<WindowCtx>, number][] = [
      [{ power: true }, TUNING.timing.powerWindow],
      [{ star: true }, TUNING.timing.starWindow],
      [{ newbie: true }, TUNING.timing.newbieWindow],
      [{ contact: 10 }, 1 + TUNING.timing.contactRatingSpread],
      [{ contact: 0 }, 1 - TUNING.timing.contactRatingSpread],
      [{ traitMul: 1.08 }, 1.08],
      [{ heat: 99 }, TUNING.timing.heatWindowMin],
    ];
    for (const [p, k] of cases) {
      const w = windows({ ...base, ...p });
      expect(w.scale).toBeCloseTo(k, 5);
      expect(w.perfect).toBeCloseTo(40 * k, 5);
      expect(w.perfectLate - w.perfect).toBeCloseTo(8, 9);
      expect(g(w.perfectLate, w)).toBe('PERFECT');
      expect(g(w.perfectLate + 1, w)).toBe('GOOD');
    }
  });
  it('HEAT sweep 0..99 is strictly monotonic with no steps (<2%)', () => {
    let prev = windows({ ...base, heat: 0 }).scale;
    for (let h = 1; h <= 99; h++) {
      const k = windows({ ...base, heat: h }).scale;
      expect(k).toBeLessThan(prev);
      expect((prev - k) / prev).toBeLessThan(0.02);
      prev = k;
    }
  });
});

describe('location overrides', () => {
  it('inside → JAMMED, away → EARLY/LATE (all tiers); Pro high/low → UNDER/TOPPED; Rookie auto-aligned', () => {
    for (const tier of ['rookie', 'pro'] as Tier[]) {
      expect(g(-60, windows(base), tier, { x: -1.4, z: 2.5 })).toBe('JAMMED'); // RHB inside = x−
      expect(g(-60, windows(base), tier, { x: 1.4, z: 2.5 })).toBe('EARLY');
      expect(g(60, windows(base), tier, { x: 1.4, z: 2.5 })).toBe('LATE');
      expect(g(0, windows(base), tier, { x: 1.4, z: 2.5 })).toBe('EARLY');
    }
    expect(g(-60, windows(base), 'pro', { x: 0, z: 4.1 })).toBe('UNDER');
    expect(g(-60, windows(base), 'pro', { x: 0, z: 1.0 })).toBe('TOPPED');
    expect(g(0, windows(base), 'rookie', { x: 0, z: 4.1 })).toBe('PERFECT');
    expect(g(0, windows(base), 'rookie', { x: 0, z: 1.0 })).toBe('PERFECT');
    // LHB: inside is x+
    expect(g(-60, windows(base), 'rookie', { x: 1.4, z: 2.5 }, -1)).toBe('JAMMED');
  });
  it('All-Star reticle: miss → WHIFF, bat above → TOPPED, below → UNDER', () => {
    const w = windows(base);
    const ag = (dx: number, dz: number) => grade({ offsetMs: 0, tier: 'allstar', cross: mid, batterHand: 1, power: false, reticle: { x: mid.x + dx, z: mid.z + dz } }, w);
    expect(ag(0, 0)).toBe('PERFECT');
    expect(ag(0.6, 0)).toBe('WHIFF');
    expect(ag(0, 0.3)).toBe('TOPPED');
    expect(ag(0, -0.3)).toBe('UNDER');
  });
});

describe('contact → EV / LA / spray', () => {
  const ctx = (o: number, extra: Partial<ContactCtx> = {}): ContactCtx => ({ offsetMs: o, tier: 'rookie', cross: mid, batterHand: 1, power: false, powerRating: 5, moonshot: false, starSwing: false, dirV: 0, dirH: 0, maxEv: maxEvFor(5), ...extra });
  const w = windows(base);
  it('early pulls (RHB → LF, negative), late goes the other way; LHB mirrored; deterministic', () => {
    const e = contactOut('GOOD', ctx(-60), w), l = contactOut('GOOD', ctx(60), w);
    expect(e.spray).toBeLessThan(0);
    expect(l.spray).toBeGreaterThan(0);
    expect(contactOut('GOOD', ctx(-60, { batterHand: -1 }), w).spray).toBeGreaterThan(0);
    expect(contactOut('GOOD', ctx(-60), w)).toEqual(e);
  });
  it('Pro thirds: +9° / 0 / −14° launch and ±12° spray', () => {
    const p = (dirV: -1 | 0 | 1, dirH: -1 | 0 | 1) => contactOut('PERFECT', ctx(0, { tier: 'pro', dirV, dirH }), w);
    const midLa = p(0, 0).la;
    expect(p(1, 0).la - midLa).toBe(PRO_LA_UP);
    expect(p(-1, 0).la - midLa).toBe(PRO_LA_DOWN);
    expect(p(0, 1).spray - p(0, 0).spray).toBe(PRO_SPRAY);
    expect(p(0, -1).spray - p(0, 0).spray).toBe(-PRO_SPRAY);
    expect(PRO_LA_UP).toBe(9);
    expect(PRO_LA_DOWN).toBe(-14);
  });
  it('POWER +15% EV; Star Swing on GOOD = max EV; Moonshot +3 on PERFECT', () => {
    const a = contactOut('PERFECT', ctx(0), w).ev;
    expect(contactOut('PERFECT', ctx(0, { power: true }), w).ev).toBeCloseTo(a * 1.15, 0);
    expect(contactOut('GOOD', ctx(60, { starSwing: true }), w).ev).toBe(maxEvFor(5));
    expect(contactOut('PERFECT', ctx(0, { moonshot: true }), w).ev).toBeCloseTo(a + 3, 5);
  });
});
