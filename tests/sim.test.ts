import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/game';
import { shortRun, attract } from '../src/sim/modes';
import { FixedLoop } from '../src/core/loop';
import type { ModeConfig } from '../src/sim/state';

const P = [{ name: 'You', heat: 0, tier: 'rookie' as const }];
export function cfgShort(seed: number, extra: Partial<ModeConfig> = {}): ModeConfig {
  return { ...shortRun({ seed, players: P, firstEver: false }), ...extra };
}

/** Run a sim with a simple timing bot until game over; returns the sim. */
export function playOut(sim: Sim, maxS = 1200, offsetFn: (n: number) => number = () => 0): Sim {
  let n = 0;
  let lastRelease = -1;
  while (sim.s.phase !== 'gameOver' && sim.s.time < maxS) {
    const s = sim.s;
    if (s.phase === 'pitch' && s.pitch && s.releaseT !== lastRelease && s.cfg.humanBat[s.half] !== null) {
      lastRelease = s.releaseT;
      sim.act({ type: 'swing', t: s.releaseT + s.pitch.T + offsetFn(n++) / 1000 });
    }
    if (s.phase === 'prePitch' && s.cfg.humanPitch[s.half === 0 ? 1 : 0] !== null) {
      sim.act({ type: 'chargeStart', zx: 0.3, zz: 2.4 });
      sim.act({ type: 'chargeEnd', t: s.time + 0.72 });
    }
    if (s.phase === 'handoff' && s.time - s.phaseT > 0.5) sim.act({ type: 'ready' });
    sim.step(1 / 120);
    sim.drainEvents();
  }
  return sim;
}

describe('determinism', () => {
  it('same seed + same input log → identical final state hash; different seed differs', () => {
    const a = playOut(new Sim(cfgShort(42)), 1200, (n) => ((n * 37) % 120) - 60);
    const b = new Sim(cfgShort(42));
    const log = a.inputLog.map(({ seq: _seq, ...rest }) => rest);
    for (const act of log) b.act(act);
    while (b.s.phase !== 'gameOver' && b.s.time < 1200) {
      b.step(1 / 120);
      b.drainEvents();
    }
    expect(b.hash()).toBe(a.hash());
    const c = playOut(new Sim(cfgShort(43)), 1200, (n) => ((n * 37) % 120) - 60);
    expect(c.hash()).not.toBe(a.hash());
  });
  it('attract (CPU vs CPU) is reproducible', () => {
    const run = () => {
      const s = new Sim(attract(9));
      while (s.s.phase !== 'gameOver' && s.s.time < 1500) s.step(1 / 120);
      return s.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('refresh-rate independent swing judging', () => {
  /** Drive the sim through FixedLoop at a given frame period; inject a swing at wall time W. */
  function judge(frameMs: number, swingLateMs: number): number {
    const sim = new Sim(cfgShort(5));
    const loop = new FixedLoop();
    const target = { step: (dt: number) => { sim.step(dt); sim.drainEvents(); }, afterStep: () => false, simTime: () => sim.s.time };
    let wall = 0;
    let swingWall = -1;
    for (let i = 0; i < 20000; i++) {
      // input events that happened during the previous frame are handled at frame start
      if (swingWall >= 0 && wall >= swingWall) {
        sim.act({ type: 'swing', t: loop.toSim(swingWall, false, sim.s.time) });
        swingWall = Infinity;
      }
      wall += frameMs;
      loop.advance(target, frameMs / 1000, 1, wall);
      const s = sim.s;
      if (swingWall === -1 && s.phase === 'pitch' && s.pitch) {
        // ideal contact in wall ms, then add the player's offset
        const idealSim = s.releaseT + s.pitch.T;
        swingWall = loop.anchorWall + (idealSim - loop.anchorSim) * 1000 + swingLateMs;
      }
      if (s.swing?.grade) return s.swing.offsetMs;
    }
    return NaN;
  }
  it('same physical swing time → same offset at 60 Hz and 120 Hz', () => {
    for (const late of [-37, 0, 23, 61]) {
      const a = judge(1000 / 60, late), b = judge(1000 / 120, late);
      expect(Math.abs(a - b)).toBeLessThan(1);
      expect(Math.abs(a - late)).toBeLessThan(1);
    }
  });
});
