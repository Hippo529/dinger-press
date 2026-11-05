// Debug-only staging helpers (exposed on window.__game in test/debug mode). They call the real sim
// code paths; they just choose the inputs (contact, runners) so verify can reach rare situations.
import { STADIUMS } from '../sim/field';
import { bestIntercept } from '../sim/fielding';
import { launch, predict } from '../sim/physics';
import { startPlay } from '../sim/play';
import { computeForces, decideAdvances } from '../sim/running';
import { makeRunner, battingTeam, type GameState } from '../sim/state';
import type { Sim } from '../sim/game';

export function putRunner(sim: Sim, base: number): void {
  const s = sim.s;
  if (s.runners.some((r) => !r.out && !r.scored && r.base === base)) return;
  const t = s.teams[battingTeam(s)];
  const r = makeRunner(s, t.setup.lineup[(t.order + 5 - base) % t.setup.lineup.length], base, false);
  r.target = base;
  s.runners.push(r);
}

export function forceContact(sim: Sim, ev: number, la: number, spray: number): void {
  const s = sim.s;
  s.phase = 'pitch';
  s.last.grade = 'GOOD';
  s.last.ev = ev;
  s.last.la = la;
  s.last.spray = spray;
  s.last.swingT = s.time;
  startPlay(sim.ctx, { ev, la, spray }, { x: 0, y: 0.7, z: 2.5 }, 'GOOD');
  sim.ctx.emit({ type: 'contact', grade: 'GOOD', ev, la, spray, offsetMs: 0, power: false, star: false });
}

/** Runner on 2nd, then the first single to the outfield whose send-home decision is a close call. */
export function stageCloseCall(sim: Sim): boolean {
  const s: GameState = sim.s;
  putRunner(sim, 2);
  for (let ev = 70; ev <= 110; ev += 2)
    for (let spray = -40; spray <= 40; spray += 4)
      for (const la of [4, 8, 11, 14, 18]) {
        const pred = predict(launch(ev, la, spray), STADIUMS[s.cfg.stadium]);
        if (pred.hr || pred.foul) continue;
        const it = bestIntercept(s.fielders, pred);
        if (!it || it.air) continue;
        const runners = s.runners.map((r) => ({ ...r }));
        const br = makeRunner({ ...s, nextRunnerId: 999 } as GameState, 'clem', 0, true);
        br.delay = 0.25;
        runners.push(br);
        computeForces(runners);
        const cc = decideAdvances(runners, { securePoint: it.point, secureT: it.t, holder: it.fielder, airCatch: false, outs: s.outs, agg: s.cfg.aggression });
        if (cc) {
          forceContact(sim, ev, la, spray);
          return true;
        }
      }
  return false;
}
