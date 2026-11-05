// Verify scenarios. Each: { name, viewports?, run(h) } — h from verify.mjs makeHelpers.
import { helpers } from './lib.mjs';
import { m2 } from './m2.mjs';
import { m3 } from './m3.mjs';
import { m5 } from './m5.mjs';

export const scenarios = [
  {
    name: 'title',
    async run(h) {
      await h.open('test=1&seed=1');
      let s = await h.state();
      h.expect(s.screen === 'title', 'boots to title, got ' + s.screen);
      h.expect(s.coords && s.buttons && s.settings, 'text state has coords/buttons/settings');
      await h.advance(6000);
      s = await h.state();
      h.expect(s.attractPitches > 0, 'attract loop throws pitches behind the logo');
      h.expect(s.buttons.some((b) => b.id === 'ui:play'), 'PLAY button reported with rect');
      await h.shot('title-attract');
    },
  },
  {
    name: 'title-to-first-pitch',
    async run(h) {
      await h.open('test=1&seed=1');
      const t0 = (await h.state()).time ?? 0;
      await helpers.startShort(h);
      let s = await h.state();
      h.expect(s.screen === 'play' && s.mode === 'short', 'Short Run started');
      h.expect(s.humanBatting, 'first run: player bats first');
      s = await h.until((x) => x.phase === 'pitch', { label: 'first pitch released' });
      h.expect(s.time - t0 <= 5, `first pitch within 5 s (${s.time})`);
      await h.advance(300);
      s = await h.state();
      h.expect(s.ball && s.ball.pos && s.ball.vel.y < 0, 'ball in flight with velocity toward plate');
      h.expect(s.prompts.includes('firstPitchCue'), 'first-pitch cue shown');
      h.expect(s.timingBar === null, 'timing bar hidden before the first swing');
      h.expect(Math.abs(s.ball.pos.x) < 2.5, 'meatball comes down the middle');
      h.expect(s.ball.flightT >= 1.1, `meatball is slow (${s.ball.flightT})`);
      await h.shot('first-pitch');
    },
  },
  {
    name: 'swing-input',
    async run(h) {
      await h.open('test=1&seed=2');
      await helpers.startShort(h);
      const s0 = await helpers.toContactMoment(h, 0);
      if (h.vp === 'desktop') await h.page.keyboard.press('Space');
      else {
        // pointerdown alone (no pointerup) must swing
        await h.page.evaluate(() => {
          const c = document.getElementById('game');
          c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 500, pointerType: 'touch', pointerId: 7, isPrimary: true }));
        });
      }
      await h.advance(30);
      const s = await h.state();
      h.expect(s.last.grade !== null, 'swing produced a grade');
      h.expect(s.phase !== s0.phase || s.last.grade, 'state changed after input');
      h.expect(s.last.grade === 'PERFECT', 'swing at the ideal moment grades PERFECT, got ' + s.last.grade);
      await h.advance(20);
      await h.shot('perfect-freeze');
      const st = await h.state();
      h.expect(st.fx.contactFrames >= 1 || st.fx.hitstop, 'contact frame rendered before/with hit-stop');
    },
  },
  {
    name: 'grades-reachable',
    viewports: ['desktop'],
    async run(h) {
      await h.open('test=1&seed=3');
      await helpers.startShort(h);
      const got = new Set();
      const want = { PERFECT: (w) => 0, EARLY: (w) => -(w.good + 0.25 * (w.weak - w.good)), LATE: (w) => w.good + 0.25 * (w.weak - w.good), WHIFF: (w) => -(w.weak + 80) };
      for (const [g, f] of Object.entries(want)) {
        for (let tries = 0; tries < 8 && !got.has(g); tries++) {
          await helpers.toContactMoment(h, 200);
          await h.game((fn) => {
            const st = window.__game.getState();
            const off = new Function('w', 'return (' + fn + ')(w)')(st.win);
            window.__game.act({ type: 'swing', t: st.releaseT + st.pitch.T + off / 1000 });
          }, f.toString());
          await h.advance(400);
          got.add((await h.state()).last.grade);
          await helpers.toNextPitch(h);
        }
      }
      for (const g of ['PERFECT', 'EARLY', 'LATE', 'WHIFF']) h.expect(got.has(g), `grade ${g} reachable; got ${[...got]}`);
    },
  },
  {
    name: 'power-chip',
    viewports: ['iphone', 'iphone-land'],
    async run(h) {
      await h.open('test=1&seed=4');
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' || x.phase === 'windup', { label: 'pre-pitch' });
      let s = await h.state();
      const chip = s.buttons.find((b) => b.id === 'power');
      h.expect(chip && chip.w >= 44 && chip.h >= 44, 'POWER chip ≥44 px');
      await h.page.touchscreen.tap(chip.x + chip.w / 2, chip.y + chip.h / 2);
      await h.advance(20);
      s = await h.state();
      h.expect(s.power === true, 'POWER toggled on');
      h.expect(s.last.grade === null, 'tapping POWER did not swing');
      await h.until((x) => x.phase === 'pitch', { label: 'pitch' });
      await h.page.touchscreen.tap(chip.x + chip.w / 2, chip.y + chip.h / 2);
      await h.advance(20);
      s = await h.state();
      h.expect(s.power === true, 'POWER locked after release');
    },
  },
  {
    name: 'debug-hooks',
    viewports: ['desktop'],
    async run(h) {
      await h.open('test=1&debug=1&seed=5');
      const ok = await h.page.evaluate(() => ['getState', 'setState', 'step', 'pause', 'act', 'log'].every((k) => typeof window.__game[k] === 'function'));
      h.expect(ok, '__game API present');
      h.expect(await h.page.$('#debug-overlay'), 'debug overlay present');
      const sliders = await h.page.$$('#debug-panel input[type=range]');
      h.expect(sliders.length >= 6, 'tuning panel has ≥6 sliders');
      await helpers.startShort(h);
      await h.advance(2000);
      await h.shot('debug');
    },
  },
  ...m2,
  ...m3,
  ...m5,
];
