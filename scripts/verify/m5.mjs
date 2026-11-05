// M5 scenarios: modes UI (Mill handoffs/streak/results, Clutch intro, binder) + text-state contract.
import { helpers } from './lib.mjs';

async function presetSave(h, settings = {}, flags = { firstRunDone: true }) {
  await h.page.evaluate(([s, f]) => {
    localStorage.setItem('dingerpress.save', JSON.stringify({ v: 2, settings: s, flags: f, stats: { pitchesSeen: 10 } }));
  }, [settings, flags]);
  await h.page.reload();
  await h.page.waitForFunction(() => window.__ready === true);
}
const btnOf = async (h, id) => (await h.state()).buttons.find((b) => b.id === id);
const tapId = async (h, id) => {
  const b = await btnOf(h, id);
  if (!b) throw new Error('no button ' + id + ' on ' + (await h.state()).screen);
  await h.press(b);
  await h.advance(20);
};

export const m5 = [
  {
    name: 'mill-streak-handoff-results',
    async run(h) {
      await h.open('test=1&seed=40');
      await presetSave(h, {});
      await tapId(h, 'ui:play');
      await tapId(h, 'ui:mode-mill');
      await tapId(h, 'ui:party-add');
      await tapId(h, 'ui:party-start');
      let s = await h.state();
      h.expect(s.mode === 'mill' && s.mill.player === 0, 'Mill started for P1');
      for (let i = 0; i < 2; i++) {
        await h.until((x) => x.phase === 'prePitch', { label: 'prePitch' });
        await h.page.evaluate(() => window.__game.forceContact(112, 28, -4));
        s = await h.until((x) => x.phase === 'celebrate', { label: 'homer ' + i, max: 15000 });
        await h.advance(2600);
      }
      s = await h.state();
      h.expect(s.mill.streak >= 2 && s.mill.scores[0] > 700, 'streak built: ' + JSON.stringify(s.mill));
      // finish P1's turn
      await h.page.evaluate(() => { const g = window.__game.getState(); g.mill.outs = 10; g.phase = 'dead'; g.phaseT = g.time; g.deadDur = 0.05; });
      s = await h.until((x) => x.phase === 'handoff', { label: 'handoff' });
      h.expect(s.handoffTo === 'P2', 'pass to P2');
      await h.shot('handoff');
      const vs = h.page.viewportSize();
      const tap = async () => (h.vp === 'desktop' ? h.page.mouse.click(vs.width / 2, vs.height / 2) : h.page.touchscreen.tap(vs.width / 2, vs.height / 2));
      await h.advance(100);
      await tap();
      await h.advance(20);
      h.expect((await h.state()).phase === 'handoff', 'a tap within 400 ms is ignored');
      await h.advance(400);
      await tap();
      await h.advance(20);
      s = await h.state();
      h.expect(s.phase !== 'handoff' && s.mill.player === 1, 'tap after 400 ms hands over to P2');
      await h.page.evaluate(() => { const g = window.__game.getState(); g.mill.outs = 10; g.phase = 'dead'; g.phaseT = g.time; g.deadDur = 0.05; });
      s = await h.until((x) => x.screen === 'results', { label: 'results' });
      await h.shot('derby-results');
      const text = await h.page.locator('#ui').innerText();
      h.expect(/P1/.test(text) && /P2/.test(text), 'results list both players');
    },
  },
  {
    name: 'clutch-intro',
    async run(h) {
      await h.open('test=1&seed=41');
      await presetSave(h, {});
      await tapId(h, 'ui:play');
      await tapId(h, 'ui:mode-clutch');
      await tapId(h, 'ui:card-walkoff');
      let s = await h.state();
      h.expect(s.screen === 'clutchIntro', 'card intro shown');
      await h.shot('clutch-intro');
      await tapId(h, 'ui:card-start');
      s = await h.state();
      h.expect(s.screen === 'play' && s.mode === 'clutch' && s.clutch.id === 'walkoff', 'card started');
      h.expect(s.runners.length === 1 && s.score.home === 3 && s.score.away === 5, 'scenario state loaded');
    },
  },
  {
    name: 'binder',
    async run(h) {
      await h.open('test=1&seed=42');
      await presetSave(h, {}, { firstRunDone: true });
      await h.page.evaluate(() => { const a = window.__game.app; a.save.data.unlocks = ['card:firstHit', 'card:firstHr', 'char:relish']; });
      await tapId(h, 'ui:records');
      await tapId(h, 'ui:binder');
      h.expect((await h.state()).screen === 'binder', 'binder screen');
      await h.shot('binder');
      const slots = await h.page.$$eval('.binder .slot', (n) => n.map((e) => e.className + '|' + e.textContent));
      h.expect(slots.filter((x) => !x.includes('locked')).length >= 15, 'base roster + earned cards are filled');
      h.expect(slots.some((x) => x.includes('locked')), 'unearned slots are locked');
    },
  },
  {
    name: 'button-rects-fire',
    viewports: ['iphone', 'desktop'],
    async run(h) {
      await h.open('test=1&seed=43');
      await presetSave(h, {});
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' && x.humanBatting, { label: 'batting' });
      await h.page.evaluate(() => { window.__game.getState().teams[0].stars = 1; });
      await h.advance(20);
      let s = await h.state();
      for (const id of ['power', 'star']) {
        const b = s.buttons.find((x) => x.id === id);
        await h.press(b);
        await h.advance(20);
      }
      s = await h.state();
      h.expect(s.power && s.starArmed, 'POWER and STAR rects fired their actions');
      await h.press(s.buttons.find((x) => x.id === 'pause'));
      await h.advance(20);
      h.expect((await h.state()).screen === 'pause', 'pause rect paused');
      await tapId(h, 'ui:resume');
      s = await h.state();
      h.expect(s.screen === 'play', 'resumed');
      for (const k of ['mode', 'state', 'inning', 'half', 'outs', 'count', 'score', 'runners', 'last', 'stars', 'prompts', 'buttons', 'settings', 'coords']) h.expect(k in s, 'text state has ' + k);
    },
  },
  {
    name: 'advance-and-seed',
    viewports: ['desktop'],
    async run(h) {
      await h.open('test=1&seed=77');
      await presetSave(h, {});
      await helpers.startShort(h);
      const a = await h.state();
      await h.page.waitForTimeout(500);
      const b = await h.state();
      h.expect(a.time === b.time, 'rAF does not advance the sim in test mode');
      await h.advance(500);
      const c = await h.state();
      h.expect(Math.abs(c.time - b.time - 0.5) < 0.01, 'advanceTime(500) = +0.5 s sim');
      const script = async () => {
        await helpers.toContactMoment(h, 0);
        await h.page.keyboard.press('Space');
        await h.advance(6000);
        const s = await h.state();
        return JSON.stringify([s.time, s.phase, s.inning, s.half, s.outs, s.count, s.score, s.last, s.runners, s.ball && s.ball.pos]);
      };
      const one = await script();
      await h.open('test=1&seed=77');
      await presetSave(h, {});
      await helpers.startShort(h);
      await h.advance(500);
      const two = await script();
      h.expect(one === two, 'same seed + same inputs → identical state\n' + one + '\n' + two);
    },
  },
  {
    name: 'timing-bar-sign',
    viewports: ['desktop', 'iphone'],
    async run(h) {
      await h.open('test=1&seed=44');
      await presetSave(h, {});
      await helpers.startShort(h);
      for (const off of [-70, 70]) {
        await helpers.toContactMoment(h, 200);
        await h.page.evaluate((o) => { const g = window.__game.getState(); window.__game.act({ type: 'swing', t: g.releaseT + g.pitch.T + o / 1000 }); }, off);
        await h.advance(200 + off + 60); // just past the swing moment
        const s = await h.state();
        h.expect(s.timingBar && Math.sign(s.timingBar.offsetMs) === Math.sign(off), `timing bar sign for ${off} ms: ${JSON.stringify(s.timingBar)}`);
        if (off > 0) await h.shot('timing-bar');
        await helpers.toNextPitch(h);
      }
    },
  },
  {
    name: 'power-stance-and-keys',
    viewports: ['desktop'],
    async run(h) {
      await h.open('test=1&seed=45');
      await presetSave(h, { tier: 'pro', heat: 50 });
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' && x.humanBatting, { label: 'batting' });
      await h.page.evaluate(() => { window.__game.getState().teams[0].stars = 1; });
      await h.page.keyboard.press('Shift');
      await h.page.keyboard.press('e');
      await h.advance(20);
      let s = await h.state();
      h.expect(s.power && s.starArmed, 'Shift = POWER, E = star');
      await h.shot('power-stance');
      await helpers.toContactMoment(h, 0);
      await h.page.keyboard.down('w');
      await h.page.keyboard.press('Space');
      await h.page.keyboard.up('w');
      await h.advance(20);
      const dir = await h.game(() => window.__game.getState().swing?.dirV);
      h.expect(dir === 1, 'W held at swing time = lift direction');
    },
  },
  {
    name: 'save-code-buttons',
    viewports: ['iphone'],
    async run(h) {
      await h.open('test=1&seed=46');
      await tapId(h, 'ui:settings');
      for (const id of ['ui:save-copy', 'ui:save-paste', 'ui:save-reset']) h.expect(await btnOf(h, id), id + ' exists');
      await tapId(h, 'ui:save-copy');
      const code = await h.page.$eval('textarea', (t) => t.value);
      h.expect(code.length > 50 && /^[A-Za-z0-9+/=]+$/.test(code), 'base64 save code shown');
    },
  },
];

m5.push({
  name: 'single-file-from-disk',
  viewports: ['desktop', 'iphone'],
  async run(h) {
    const url = 'file://' + process.cwd() + '/dist-single/index.html?test=1&seed=51';
    await h.page.goto(url);
    await h.page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
    const scripts = await h.page.$$eval('script[src]', (s) => s.map((x) => x.getAttribute('src')));
    h.expect(scripts.length === 0, 'single file: no external scripts ' + scripts.join(','));
    await helpers.startShort(h);
    await helpers.toContactMoment(h, 0);
    await h.page.evaluate(() => { const g = window.__game.getState(); window.__game.act({ type: 'swing', t: g.releaseT + g.pitch.T }); });
    await h.advance(50);
    const s = await h.state();
    h.expect(s.last.grade === 'PERFECT', 'plays from file:// — swing graded ' + s.last.grade);
  },
});

m5.push({
  name: 'stretch-skin-lighthouse',
  viewports: ['iphone', 'desktop'],
  async run(h) {
    await h.open('test=1&seed=52');
    await h.page.evaluate(() => localStorage.setItem('dingerpress.save', JSON.stringify({ v: 2, settings: { bat: 'zebra', stadium: 'lighthouse' }, flags: { firstRunDone: true }, stats: { pitchesSeen: 10 }, unlocks: ['bat:zebra', 'stadium:lighthouse'] })));
    await h.page.reload();
    await h.page.waitForFunction(() => window.__ready === true);
    await helpers.startShort(h);
    await h.until((x) => x.phase === 'prePitch' && x.humanBatting, { label: 'batting' });
    const bat = await h.game(() => window.__game.app.renderer.settings.bat);
    h.expect(bat === 'zebra', 'zebra bat skin active');
    await h.advance(400);
    await h.shot('bat-skin');
    await h.page.evaluate(() => window.__game.forceContact(98, 34, 3));
    await h.advance(1800);
    await h.shot('lighthouse');
    const st = await h.game(() => window.__game.getState().cfg.stadium);
    h.expect(st === 'lighthouse', 'Lighthouse Point in play');
  },
});

m5.push({
  name: 'desktop-duel',
  viewports: ['desktop'],
  async run(h) {
    await h.open('test=1&seed=53');
    await h.page.evaluate(() => localStorage.setItem('dingerpress.save', JSON.stringify({ v: 2, settings: {}, flags: { firstRunDone: true }, stats: { pitchesSeen: 10 } })));
    await h.page.reload();
    await h.page.waitForFunction(() => window.__ready === true);
    await h.press((await h.state()).buttons.find((b) => b.id === 'ui:play'));
    await h.advance(20);
    await h.press((await h.state()).buttons.find((b) => b.id === 'ui:mode-duel'));
    await h.advance(20);
    let s = await h.until((x) => x.phase === 'prePitch', { label: 'prePitch' });
    h.expect(s.humanBatting && s.humanPitching, 'both sides human');
    const zc = await h.game(() => window.__game.app.renderer.layout.plane);
    await h.page.keyboard.press('2'); // P2 picks a pitch
    await h.page.mouse.move(zc.cx, zc.cy);
    await h.page.mouse.down();
    await h.advance(720);
    await h.page.mouse.up();
    s = await h.until((x) => x.phase === 'pitch', { label: 'P2 pitched with the mouse' });
    h.expect(s.charge.quality === 'perfect' && s.pitchSel === 1, 'mouse hold/release pitch: ' + JSON.stringify(s.charge));
    await helpers.toContactMoment(h, 0);
    await h.page.keyboard.press('Space'); // P1 swings
    await h.advance(30);
    s = await h.state();
    h.expect(s.last.grade, 'Space swung for P1: ' + s.last.grade);
  },
});
