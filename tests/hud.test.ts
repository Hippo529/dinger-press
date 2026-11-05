import { describe, expect, it } from 'vitest';
import { drawScoreboard } from '../src/render/hud';
import { drawParticles, drawPopups, drawTimingBar, drawZone } from '../src/render/overlays';
import { computeLayout } from '../src/render/layout';
import { Particles, Popups } from '../src/fx/particles';
import { Sim } from '../src/sim/game';
import { cfgShort } from './sim.test';
import { THEME } from '../src/config/theme';

/** Recording 2D context mock: every method call is logged with its args. */
function mockCtx() {
  const calls: { m: string; a: unknown[]; fill?: unknown; stroke?: unknown }[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000' };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, p: string) {
      if (p === 'calls') return calls;
      if (p === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (p in state) return state[p];
      return (...a: unknown[]) => calls.push({ m: p, a, fill: state.fillStyle, stroke: state.strokeStyle });
    },
    set(_t, p: string, v) {
      state[p] = v;
      return true;
    },
  };
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

const L = computeLayout(402, 874, { top: 47, right: 0, bottom: 34, left: 0 }, false);
L.plane = { cx: 230, cy: 600, s: 72 };

describe('nothing by colour alone', () => {
  it('count uses letters + filled/empty pips; bases use filled/outlined squares', () => {
    const sim = new Sim(cfgShort(1));
    sim.s.balls = 2;
    sim.s.strikes = 1;
    const ctx = mockCtx();
    drawScoreboard(ctx, L, sim.s, 1.5);
    const texts = ctx.calls.filter((c) => c.m === 'fillText').map((c) => c.a[0]);
    expect(texts).toEqual(expect.arrayContaining(['B', 'S', 'O']));
    const arcs = ctx.calls.filter((c) => c.m === 'arc').length;
    expect(arcs).toBeGreaterThanOrEqual(7); // 3 ball + 2 strike + 2 out pips, each outlined
    expect(ctx.calls.filter((c) => c.m === 'stroke').length).toBeGreaterThanOrEqual(7);
  });
  it('timing marker is a left-pointing triangle when early, right-pointing when late, plus the word', () => {
    const sim = new Sim(cfgShort(2));
    sim.s.win = { perfect: 40, perfectLate: 48, good: 100, weak: 160, foulFrom: 130, scale: 1 };
    const shape = (o: number) => {
      sim.s.last.grade = o < 0 ? 'EARLY' : 'LATE';
      sim.s.last.offsetMs = o;
      const ctx = mockCtx();
      drawTimingBar(ctx, { x: 20, y: 700, w: 360, h: 40 }, sim.s, false, 0.5);
      const pts = ctx.calls.filter((c) => c.m === 'moveTo' || c.m === 'lineTo').map((c) => c.a[0] as number);
      const tip = pts[pts.length - 3];
      const base = (pts[pts.length - 2] + pts[pts.length - 1]) / 2;
      const words = ctx.calls.filter((c) => c.m === 'fillText').map((c) => String(c.a[0]));
      return { dir: Math.sign(tip - base), words };
    };
    const e = shape(-80), l = shape(80);
    expect(e.dir).toBe(-1);
    expect(l.dir).toBe(1);
    expect(e.words.join('|')).toMatch(/EARLY/);
    expect(l.words.join('|')).toMatch(/LATE/);
  });
  it('zone is an ink + paper double outline with 3×3 ticks; ≥ 70 px wide at 402 px', () => {
    const ctx = mockCtx();
    const r = drawZone(ctx, L, 1);
    const strokes = ctx.calls.filter((c) => c.m === 'strokeRect');
    expect(strokes.map((c) => c.stroke)).toEqual([THEME.ink, THEME.paper]);
    expect(r.w).toBeGreaterThanOrEqual(70);
  });
});

describe('ball occlusion between release and contact', () => {
  it('no particle is drawn over the ball rect, and popups are moved off it', () => {
    const parts = new Particles();
    const ball = { x: 200, y: 500, w: 20, h: 20 };
    for (let i = 0; i < 50; i++) parts.spawn(150 + (i % 10) * 10, 480 + Math.floor(i / 10) * 10, 0, 0, 1, 3, '#fff', 1);
    const ctx = mockCtx();
    drawParticles(ctx, parts, ball);
    for (const c of ctx.calls.filter((x) => x.m === 'arc')) {
      const [x, y] = c.a as number[];
      expect(x > ball.x - 3 && x < ball.x + ball.w + 3 && y > ball.y - 3 && y < ball.y + ball.h + 3).toBe(false);
    }
    const pops = new Popups();
    pops.add('GOOD', '', 210, 505, 0, '#fff');
    const pc = mockCtx();
    drawPopups(pc, pops, 0.3, 1.5, ball);
    const tr = pc.calls.find((c) => c.m === 'translate')!;
    expect((tr.a[1] as number) + 30).toBeLessThanOrEqual(ball.y);
  });
});
