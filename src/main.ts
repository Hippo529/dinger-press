// Boot: theme vars, page hardening, fonts (≤1.5 s), App, rAF loop, test hooks.
import './ui/styles.css';
import { cssVars } from './config/theme';
import { installHooks } from './core/debug';
import { hardenPage, onResize, onVisibility } from './platform/ios';
import { App } from './state/app';

const params = new URLSearchParams(location.search);
const testMode = params.has('test');
const debug = params.get('debug') === '1';
const seedParam = params.get('seed');
const seed = seedParam !== null && !Number.isNaN(Number(seedParam)) ? Number(seedParam) : null;

document.documentElement.setAttribute('style', cssVars());
const root = document.getElementById('root')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
hardenPage(root);

function storage() {
  try {
    const s = window.localStorage;
    s.getItem('x');
    return s;
  } catch {
    return null;
  }
}

async function fontsReady(): Promise<void> {
  try {
    await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fall back to system fonts */
  }
}

async function boot(): Promise<void> {
  await fontsReady();
  const app = new App(canvas, ui, testMode, seed, storage());
  onResize(() => app.resize());
  onVisibility(() => app.onHidden(), () => app.onVisible());
  installHooks(app, debug, testMode);
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    if (!testMode) app.update(dt);
    app.draw();
    requestAnimationFrame(frame);
  };
  app.draw();
  requestAnimationFrame(frame);
}

void boot();
