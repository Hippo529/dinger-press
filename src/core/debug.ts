// Test/debug hooks: render_game_to_text, advanceTime, ?debug=1 overlay + tuning panel + window.__game.
import { TUNING } from '../config/tuning';
import { analyse, crack, chime, mitt, organNote } from '../audio/sounds';
import { bakeStats } from '../render/bake';
import type { App } from '../state/app';
import { gameText } from '../state/textstate';
import type { GameState } from '../sim/state';
import type { Action } from '../sim/types';
import { forceContact, putRunner, stageCloseCall } from './debugStage';

type W = Window & Record<string, unknown>;

export function installHooks(app: App, debug: boolean, test: boolean): void {
  const w = window as unknown as W;
  w.render_game_to_text = () => gameText(app);
  w.advanceTime = (ms: number) => app.advanceTime(ms);
  if (debug || test) {
    w.__game = {
      app,
      getState: () => app.session?.sim.s ?? app.attract?.sim.s ?? null,
      setState: (partial: Partial<GameState>) => {
        const s = app.session?.sim.s;
        if (s) Object.assign(s, partial);
      },
      step: (n = 1) => app.advanceTime((n * 1000) / 120),
      pause: () => app.pause(),
      act: (a: Action) => app.session?.sim.act(a),
      log: () => app.audio.log.map((e) => e.name),
      events: () => app.session?.eventLog.slice() ?? [],
      input: () => app.input.log.slice(),
      tuning: TUNING,
      get bakeCount() {
        return bakeStats.count;
      },
      timeScaleLog: () => app.session?.timeScaleLog.slice() ?? [],
      putRunner: (b: number) => app.session && putRunner(app.session.sim, b),
      forceContact: (ev: number, la: number, spray: number) => app.session && forceContact(app.session.sim, ev, la, spray),
      stageCloseCall: () => (app.session ? stageCloseCall(app.session.sim) : false),
      lastThrow: () => app.session?.lastThrowBase ?? null,
      /** Offline render of key sounds for verify (RMS + crude spectral centroid). */
      audioTest: async () => {
        const OAC = window.OfflineAudioContext;
        if (!OAC) return null;
        const render = async (fn: (c: BaseAudioContext, d: AudioNode) => void) => {
          const c = new OAC(1, 44100 * 0.6, 44100);
          fn(c, c.destination);
          return analyse(await c.startRendering());
        };
        return {
          crack70: await render((c, d) => crack(c, d, 0, 70, 'solid')),
          crack110: await render((c, d) => crack(c, d, 0, 110, 'sweet')),
          mitt: await render((c, d) => mitt(c, d, 0, 1)),
          organ: await render((c, d) => organNote(c, d, 0, 523, 0.4)),
          chime: await render((c, d) => chime(c, d, 0)),
        };
      },
    };
  }
  if (debug) {
    installOverlay(app);
    installPanel();
  }
  w.__ready = true;
}

function installOverlay(app: App): void {
  const o = document.createElement('div');
  o.id = 'debug-overlay';
  document.getElementById('root')!.append(o);
  const tick = () => {
    const s = app.session?.sim.s ?? app.attract?.sim.s;
    if (s) o.textContent = `state ${app.top()} / ${s.phase}  t=${s.time.toFixed(2)}\ntrauma ${app.fx.trauma.toFixed(2)}  scale ${app.fx.timeScale().toFixed(2)}\nlast ${s.last.grade ?? '-'} ${Math.round(s.last.offsetMs)} ms  ev ${s.last.ev}`;
    requestAnimationFrame(tick);
  };
  tick();
}

const PANEL: [string, string, number, number, number][] = [
  ['timing', 'perfectMs', 10, 80, 1],
  ['timing', 'goodMs', 40, 200, 1],
  ['timing', 'weakMs', 80, 300, 1],
  ['pitch', 'flightHeat0', 0.4, 1.4, 0.01],
  ['pitch', 'flightHeat99', 0.3, 1.0, 0.01],
  ['hitstop', 'perfectMs', 0, 200, 5],
  ['hitstop', 'goodMs', 0, 200, 5],
  ['shake', 'perfect', 0, 1, 0.05],
  ['shake', 'decayPerS', 0.2, 4, 0.1],
  ['slowmo', 'scale', 0.1, 1, 0.05],
  ['camera', 'followK', 1, 15, 0.5],
  ['flow', 'afterPlayS', 0.2, 1.2, 0.05],
];

function installPanel(): void {
  const p = document.createElement('div');
  p.id = 'debug-panel';
  p.innerHTML = '<b>tuning.ts (live)</b>';
  const T = TUNING as unknown as Record<string, Record<string, number>>;
  for (const [g, k, min, max, step] of PANEL) {
    const lab = document.createElement('label');
    const r = document.createElement('input');
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    r.value = String(T[g][k]);
    const v = document.createElement('span');
    v.textContent = String(T[g][k]);
    r.addEventListener('input', () => {
      T[g][k] = Number(r.value);
      v.textContent = r.value;
    });
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    lab.append(`${g}.${k}`, r, v);
    p.append(lab);
  }
  document.getElementById('root')!.append(p);
}
