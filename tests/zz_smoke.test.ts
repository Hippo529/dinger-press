import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { Sim } from '../src/sim/game';
import { attract } from '../src/sim/modes';
it('smoke', () => {
  const out: string[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const sim = new Sim(attract(seed));
    let steps = 0; const counts: Record<string, number> = {};
    while (sim.s.phase !== 'gameOver' && steps < 120 * 60 * 30) {
      sim.step(1 / 120); steps++;
      for (const e of sim.drainEvents()) { counts[e.type] = (counts[e.type] || 0) + 1; if (e.type === 'banner' && seed === 1) out.push(`  [${sim.s.inning}${sim.s.half ? 'b' : 't'} o${sim.s.outs}] ${e.text} — ${e.sub}`); }
    }
    out.push(`seed ${seed}: phase=${sim.s.phase} t=${sim.s.time.toFixed(0)}s inn=${sim.s.inning} score=${sim.s.teams[0].runs}-${sim.s.teams[1].runs} reason=${sim.s.overReason} pitches=${sim.s.totalPitches} ` + JSON.stringify(counts));
  }
  writeFileSync('/tmp/claude-0/smoke.txt', out.join('\n'));
});
