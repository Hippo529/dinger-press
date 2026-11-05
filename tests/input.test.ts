import { describe, expect, it } from 'vitest';
import { Input, type InputHost } from '../src/core/input';
import { computeLayout } from '../src/render/layout';
import { Sim } from '../src/sim/game';
import { cfgShort } from './sim.test';
import type { Action } from '../src/sim/types';

function ev(type: string, props: Record<string, unknown>): Event {
  const e = new Event(type);
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });
  return e;
}

function harness(phase: 'pitch' | 'prePitch' = 'pitch') {
  const sim = new Sim(cfgShort(1));
  sim.s.phase = phase;
  const acts: Action[] = [];
  const layout = computeLayout(402, 681, { top: 0, right: 0, bottom: 0, left: 0 }, false);
  layout.plane = { cx: 230, cy: 360, s: 70 };
  const host: InputHost = {
    playing: () => true, state: () => sim.s, layout: () => layout, buttons: () => [{ id: 'power', label: 'Power', rect: layout.power }],
    toSim: (ms) => ms / 1000, act: (a) => acts.push(a), pause() {}, mute() {}, fullscreen() {}, firstGesture() {}, haptic() {}, pressed() {}, skip() {}, menuBack() {},
  };
  const target = new EventTarget(), keys = new EventTarget();
  new Input(host, target, keys);
  return { sim, acts, target, keys, layout };
}

describe('input layer', () => {
  it('pointerdown → swing carrying the event timeStamp; click events are ignored', () => {
    const { acts, target } = harness();
    target.dispatchEvent(ev('click', { clientX: 100, clientY: 300, timeStamp: 1000 }));
    expect(acts).toEqual([]);
    target.dispatchEvent(ev('pointerdown', { clientX: 100, clientY: 300, timeStamp: 1234, pointerType: 'touch', pointerId: 1, preventDefault() {} }));
    expect(acts.length).toBe(1);
    expect(acts[0].type).toBe('swing');
    expect(acts[0].t).toBeCloseTo(1.234, 9);
  });
  it('HUD buttons map to semantic actions instead of swinging', () => {
    const { acts, target, layout } = harness('prePitch');
    target.dispatchEvent(ev('pointerdown', { clientX: layout.power.x + 5, clientY: layout.power.y + 5, timeStamp: 5, pointerType: 'touch', pointerId: 1, preventDefault() {} }));
    expect(acts.map((a) => a.type)).toEqual(['togglePower']);
  });
  it('keys: Space swings with WASD direction, Shift = power, E = star', () => {
    const { acts, keys } = harness();
    keys.dispatchEvent(ev('keydown', { key: 'w', timeStamp: 1, repeat: false, preventDefault() {} }));
    keys.dispatchEvent(ev('keydown', { key: 'a', timeStamp: 2, repeat: false, preventDefault() {} }));
    keys.dispatchEvent(ev('keydown', { key: ' ', timeStamp: 3, repeat: false, preventDefault() {} }));
    const sw = acts.find((a) => a.type === 'swing') as Extract<Action, { type: 'swing' }>;
    expect(sw.dirV).toBe(1);
    expect(sw.dirH).toBe(-1);
    keys.dispatchEvent(ev('keydown', { key: 'Shift', timeStamp: 4, repeat: false, preventDefault() {} }));
    keys.dispatchEvent(ev('keydown', { key: 'e', timeStamp: 5, repeat: false, preventDefault() {} }));
    expect(acts.map((a) => a.type)).toEqual(['swing', 'togglePower', 'useStar']);
  });
  it('an action queued during hit-stop (sim not stepping) is applied exactly once afterwards', () => {
    const sim = new Sim(cfgShort(3));
    while (sim.s.phase !== 'prePitch') sim.step(1 / 120);
    sim.act({ type: 'togglePower', t: sim.s.time });
    // frozen: no steps → not applied yet
    expect(sim.s.power).toBe(false);
    sim.step(1 / 120);
    expect(sim.s.power).toBe(true);
    sim.step(1 / 120);
    expect(sim.s.power).toBe(true);
    expect(sim.inputLog.filter((a) => a.type === 'togglePower').length).toBe(1);
  });
});
