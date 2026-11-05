// M2+ scenarios: fielding prompts, innings, mercy, game over, HR feel, platform behaviour.
import { helpers } from './lib.mjs';

async function presetSave(h, settings = {}, flags = {}) {
  await h.page.evaluate(([s, f]) => {
    localStorage.setItem('dingerpress.save', JSON.stringify({ v: 2, settings: s, flags: { firstRunDone: true, ...f }, stats: { pitchesSeen: 10 } }));
  }, [settings, flags]);
  await h.page.reload();
  await h.page.waitForFunction(() => window.__ready === true);
}
const mut = (h, fn) => h.page.evaluate(fn);

async function fieldFirst(h, seed) {
  await h.open(`test=1&seed=${seed}`);
  await presetSave(h, { batFirst: false });
  await helpers.startShort(h);
  const s = await h.until((x) => x.phase === 'prePitch' && x.humanPitching, { label: 'player fielding' });
  return s;
}

export const m2 = [
  {
    name: 'throw-prompt',
    async run(h) {
      await fieldFirst(h, 7);
      await mut(h, () => { window.__game.putRunner(1); window.__game.forceContact(85, -8, -12); });
      const s = await h.until((x) => x.prompts.includes('throw'), { label: 'throw prompt', step: 20 });
      await h.shot('throw-prompt');
      const b2 = s.buttons.find((b) => b.id === 'throw1');
      h.expect(b2 && b2.w >= 44 && b2.h >= 44, '2B throw button ≥ 44 px');
      if (h.vp === 'desktop') await h.page.keyboard.press('2');
      else await h.page.touchscreen.tap(b2.x + b2.w / 2, b2.y + b2.h / 2);
      await h.advance(20);
      const thrown = await h.game(() => window.__game.lastThrow());
      h.expect(thrown === 2, 'throw went to the tapped/keyed base (2B), got ' + thrown);
    },
  },
  {
    name: 'throw-assist',
    viewports: ['iphone'],
    async run(h) {
      await fieldFirst(h, 8);
      await mut(h, () => { window.__game.forceContact(80, -6, 8); });
      const s0 = await h.until((x) => x.prompts.includes('throw'), { label: 'throw prompt', step: 10 });
      const s1 = await h.until(() => false || null, { step: 10, max: 1 }).catch(() => null);
      void s1;
      let t = s0.time;
      for (let i = 0; i < 200; i++) {
        await h.advance(10);
        if ((await h.game(() => window.__game.lastThrow())) !== null) break;
      }
      t = (await h.state()).time - s0.time;
      h.expect(t >= 1.1 && t <= 1.3, `assist threw after ${t.toFixed(2)} s (≈1.2)`);
    },
  },
  {
    name: 'send-hold',
    async run(h) {
      await h.open('test=1&seed=9');
      await presetSave(h, {});
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' && x.humanBatting, { label: 'batting' });
      const ok = await h.game(() => window.__game.stageCloseCall());
      h.expect(ok, 'found a close-call contact');
      const s = await h.until((x) => x.prompts.includes('sendHold'), { label: 'send/hold prompt', step: 10, max: 2000 });
      const send = s.buttons.find((b) => b.id === 'send');
      h.expect(send && s.buttons.some((b) => b.id === 'hold'), 'SEND and HOLD buttons visible');
      await h.press(send);
      await h.advance(20);
      const after = await h.state();
      h.expect(!after.prompts.includes('sendHold'), 'prompt resolved by one tap');
    },
  },
  {
    name: 'inning-change',
    async run(h) {
      await h.open('test=1&seed=10');
      await presetSave(h, {});
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch', { label: 'prePitch' });
      await mut(h, () => { const s = window.__game.getState(); s.outs = 2; s.strikes = 2; s.balls = 0; });
      // take pitches until the strikeout ends the half
      let s = await h.until((x) => x.phase === 'halfEnd' || x.outs < 2, { label: 'half end', max: 60000 });
      if (s.phase !== 'halfEnd') {
        await mut(h, () => { const g = window.__game.getState(); g.outs = 3; g.phase = 'dead'; g.phaseT = g.time; g.deadDur = 0.05; });
        s = await h.until((x) => x.phase === 'halfEnd', { label: 'half end (forced)' });
      }
      await h.advance(300);
      await h.shot('inning-transition');
      s = await h.until((x) => x.half === 'bottom' && x.phase === 'prePitch', { label: 'bottom half' });
      h.expect(s.inning === 1 && s.outs === 0 && s.humanPitching, 'sides swapped: player now pitching in the bottom 1st');
    },
  },
  {
    name: 'mercy-gameover-restart',
    async run(h) {
      await h.open('test=1&seed=11');
      await presetSave(h, {});
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch', { label: 'prePitch' });
      await mut(h, () => {
        const g = window.__game.getState();
        g.teams[0].runs = 9; g.teams[0].line = [9]; g.inning = 1; g.half = 1; g.outs = 3; g.phase = 'dead'; g.phaseT = g.time; g.deadDur = 0.05;
      });
      let s = await h.until((x) => x.phase === 'gameOver', { label: 'game over' });
      h.expect(s.reason === 'mercy rule', 'mercy rule ended it: ' + s.reason);
      s = await h.until((x) => x.screen === 'results', { label: 'results screen' });
      await h.shot('game-over');
      const again = s.buttons.find((b) => b.id === 'ui:again');
      h.expect(again, 'PLAY AGAIN button');
      await h.press(again);
      await h.advance(50);
      s = await h.state();
      h.expect(s.screen === 'play' && s.inning === 1 && s.score.away === 0, 'restart started a fresh game: ' + JSON.stringify({ screen: s.screen, inning: s.inning, score: s.score, phase: s.phase }));
    },
  },
  {
    name: 'homer-slowmo',
    async run(h) {
      await h.open('test=1&seed=12');
      await presetSave(h, {});
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' && x.humanBatting, { label: 'batting' });
      await mut(h, () => window.__game.forceContact(112, 28, -5));
      await h.advance(200);
      let s = await h.state();
      h.expect(s.fx.slowmo && s.fx.timeScale < 0.5, `slow-mo active (scale ${s.fx.timeScale})`);
      await h.shot('homer-slowmo');
      s = await h.until((x) => x.phase === 'celebrate', { label: 'celebration', max: 15000 });
      await h.advance(400);
      s = await h.state();
      h.expect(s.replay.active && s.replay.frames >= 240, `replay running from the ring (${s.replay.frames} frames)`);
      await h.shot('homer-celebration');
      const R = s.replay.rect, B = s.replay.bannerRect;
      const hit = R && !(R.x > B.x + B.w || R.x + R.w < B.x || R.y > B.y + B.h || R.y + R.h < B.y);
      h.expect(!hit, 'replay inset does not cover the HOME RUN banner: ' + JSON.stringify({ R, B }));
      h.expect(s.ticker && !/wall|Two-bagger|extra bases/i.test(s.ticker), 'home-run chatter, not an extra-base line: ' + s.ticker);
      // any tap skips ceremony
      if (h.vp === 'desktop') await h.page.keyboard.press('Enter');
      else { const vs = h.page.viewportSize(); await h.page.touchscreen.tap(vs.width / 2, vs.height / 2); }
      await h.advance(10);
      s = await h.state();
      h.expect(s.phase !== 'celebrate', 'tap ended the celebration within a frame: ' + s.phase);
    },
  },
  {
    name: 'visibility-pause',
    async run(h) {
      await h.open('test=1&seed=13');
      await helpers.startShort(h);
      await h.advance(500);
      const t0 = (await h.state()).time;
      await h.page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await h.advance(1000);
      let s = await h.state();
      h.expect(s.paused && s.screen === 'resume', 'paused with tap-to-resume overlay');
      h.expect(Math.abs(s.time - t0) < 0.01, 'sim frozen while hidden');
      await h.page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      s = await h.state();
      const r = s.buttons.find((b) => b.id === 'ui:resume');
      h.expect(r, 'resume button');
      await h.press(r);
      await h.advance(100);
      s = await h.state();
      h.expect(s.screen === 'play' && !s.paused && s.time > t0, 'resumed');
    },
  },
  {
    name: 'settings-persist',
    async run(h) {
      await h.open('test=1&seed=14');
      let s = await h.state();
      await h.press(s.buttons.find((b) => b.id === 'ui:settings'));
      s = await h.state();
      await h.shot('settings');
      const b50 = s.buttons.find((b) => b.id === 'ui:set-shake-50');
      h.expect(b50, 'shake 50% control');
      await h.press(b50);
      await h.page.waitForTimeout(800);
      await h.page.reload();
      await h.page.waitForFunction(() => window.__ready === true);
      s = await h.state();
      h.expect(s.settings.shakePct === 50, 'shake setting persisted across reload: ' + s.settings.shakePct);
    },
  },
  {
    name: 'reduced-motion',
    contextOpts: { reducedMotion: 'reduce' },
    async run(h) {
      await h.open('test=1&seed=15');
      await presetSave(h, {});
      let s = await h.state();
      h.expect(s.settings.reduceMotion === true, 'Reduce Motion defaults on from prefers-reduced-motion');
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' && x.humanBatting, { label: 'batting' });
      await mut(h, () => window.__game.forceContact(112, 28, -5));
      let maxShake = 0, minScale = 1;
      for (let i = 0; i < 40; i++) {
        await h.advance(50);
        s = await h.state();
        maxShake = Math.max(maxShake, Math.abs(s.fx.shake.x), Math.abs(s.fx.shake.y));
        if (!s.fx.hitstop && s.fx.timeScale > 0) minScale = Math.min(minScale, s.fx.timeScale);
        h.expect(s.fx.zoom === 1, 'no zoom punch');
      }
      h.expect(maxShake === 0, 'shake offset is zero: ' + maxShake);
      h.expect(minScale >= 1, 'no slow-mo (still freeze instead): ' + minScale);
      h.expect(s.fx.flashCount === 0, 'no flashes');
    },
  },
];
