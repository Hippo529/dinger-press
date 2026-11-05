// M3/M6 scenarios: feel, audio, input, platform hardening, accessibility.
import { helpers } from './lib.mjs';

async function presetSave(h, settings = {}, flags = { firstRunDone: true }) {
  await h.page.evaluate(([s, f]) => {
    localStorage.setItem('dingerpress.save', JSON.stringify({ v: 2, settings: s, flags: f, stats: { pitchesSeen: 10 } }));
  }, [settings, flags]);
  await h.page.reload();
  await h.page.waitForFunction(() => window.__ready === true);
}
const pd = (h, type, x, y, id = 3) =>
  h.page.evaluate(([t, px, py, pid]) => {
    document.getElementById('game').dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: px, clientY: py, pointerType: 'touch', pointerId: pid, isPrimary: true }));
  }, [type, x, y, id]);

export const m3 = [
  {
    name: 'audio-unlock-and-log',
    async run(h) {
      await h.open('test=1&seed=20');
      await helpers.startShort(h); // real taps → first gesture
      await h.advance(200);
      const st = await h.page.evaluate(() => window.__game.app.audio.ctx?.state);
      h.expect(st === 'running', 'AudioContext running after the first tap: ' + st);
      await helpers.toContactMoment(h, 0);
      if (h.vp === 'desktop') await h.page.keyboard.press('Space'); else await pd(h, 'pointerdown', 200, 500);
      await h.advance(4000);
      const log = await h.game(() => window.__game.log());
      for (const n of ['unlock', 'crowd', 'crack', 'walkup', 'whip']) h.expect(log.includes(n), `audio log has ${n}: ${[...new Set(log)].join(',')}`);
      if (h.vp === 'desktop') {
        const a = await h.game(() => window.__game.audioTest());
        for (const k of ['crack70', 'crack110', 'mitt', 'organ', 'chime']) h.expect(a[k].rms > 0.01, `${k} RMS ${a[k].rms}`);
        h.expect(a.crack110.centroid > a.crack70.centroid, `crack brighter at 110 mph (${a.crack110.centroid.toFixed(0)} vs ${a.crack70.centroid.toFixed(0)})`);
      }
    },
  },
  {
    name: 'bake-discipline',
    async run(h) {
      await h.open('test=1&seed=21');
      await helpers.startShort(h);
      await h.advance(1500);
      const b0 = await h.game(() => window.__game.bakeCount);
      await h.advance(20000);
      const b1 = await h.game(() => window.__game.bakeCount);
      h.expect(b1 === b0, `no re-bakes during 20 s of play (${b0} → ${b1})`);
      const vs = h.page.viewportSize();
      await h.page.setViewportSize({ width: vs.width - 10, height: vs.height });
      await h.page.waitForTimeout(150);
      await h.advance(100);
      const b2 = await h.game(() => window.__game.bakeCount);
      h.expect(b2 > b1, 'resize re-bakes');
      const cw = await h.page.evaluate(() => { const c = document.getElementById('game'); return { w: c.width, css: parseFloat(c.style.width), dpr: devicePixelRatio }; });
      h.expect(cw.w === Math.round(cw.css * Math.min(2, cw.dpr)), `backing store = css × min(dpr,2) (${JSON.stringify(cw)})`);
    },
  },
  {
    name: 'fonts-offline',
    viewports: ['iphone'],
    ignoreConsole: /net::ERR_FAILED/, // the deliberately aborted font request
    async run(h) {
      await h.page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const t0 = Date.now();
      await h.open('test=1&seed=22');
      await helpers.startShort(h);
      const s = await h.until((x) => x.phase === 'pitch', { label: 'pitch' });
      h.expect(Date.now() - t0 < 8000 && s.screen === 'play', 'playable without web fonts');
    },
  },
  {
    name: 'lower-third-locator',
    async run(h) {
      await h.open('test=1&seed=23');
      await presetSave(h, {});
      await helpers.startShort(h);
      let s = await h.until((x) => x.phase === 'prePitch' && x.lowerThird, { label: 'lower third' });
      const batter = await h.game(() => window.__game.app.charName(window.__game.getState().teams[window.__game.getState().half].setup.lineup[window.__game.getState().teams[window.__game.getState().half].order]));
      h.expect(s.lowerThird.name === batter && s.lowerThird.catchphrase, 'lower third shows the batter with a catchphrase');
      await h.advance(350); // let the lower third finish sliding in
      await h.shot('walk-up');
      s = await h.until((x) => x.phase === 'pitch', { label: 'pitch', step: 10 });
      const T = s.ball.flightT;
      await h.advance(T * 1000 * 0.3);
      s = await h.state();
      h.expect(s.locator === null, 'no locator at 30% of flight');
      await h.advance(T * 1000 * 0.22);
      s = await h.state();
      const cross = await h.game(() => { const g = window.__game.getState(); return { x: g.pitch.target.x + g.pitch.steer, z: g.pitch.target.z }; });
      h.expect(s.locator && Math.abs(s.locator.x - cross.x) <= 0.05 && Math.abs(s.locator.z - cross.z) <= 0.05, 'locator at the crossing point by 50%');
    },
  },
  {
    name: 'star-chip-and-star-pitch',
    viewports: ['iphone'],
    async run(h) {
      await h.open('test=1&seed=24');
      await presetSave(h, { batFirst: false });
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' && x.humanPitching, { label: 'pitching' });
      await h.page.evaluate(() => { const g = window.__game.getState(); g.teams[g.half === 0 ? 1 : 0].stars = 2; });
      await h.advance(20);
      let s = await h.state();
      const star = s.buttons.find((b) => b.id === 'star');
      await h.tapRect(star);
      await h.advance(20);
      s = await h.state();
      h.expect(s.starArmed, 'STAR chip armed the Star Pitch');
      const chip = s.buttons.find((b) => b.id === 'pitch1');
      await h.tapRect(chip);
      await h.advance(20);
      s = await h.state();
      h.expect(s.pitchSel === 1, 'pitch chip selected');
      // press-and-hold in the zone (finger 60 px below the aim marker), release in the sweet band
      const zc = await h.game(() => window.__game.app.renderer.layout.plane);
      await pd(h, 'pointerdown', zc.cx, zc.cy + 60);
      await h.advance(720);
      await pd(h, 'pointerup', zc.cx, zc.cy + 60);
      await h.advance(400);
      s = await h.state();
      h.expect(s.charge.quality === 'perfect', 'charge released in the sweet band: ' + JSON.stringify(s.charge));
      h.expect(s.stars[s.half === 'top' ? 1 : 0] === 1, 'one star spent: ' + JSON.stringify({ stars: s.stars, half: s.half, phase: s.phase, armed: s.starArmed }));
      const log = await h.game(() => window.__game.log());
      h.expect(log.includes('starTell'), 'loud Star Pitch tell in the audio log');
    },
  },
  {
    name: 'assist-pitching',
    viewports: ['iphone'],
    async run(h) {
      await h.open('test=1&seed=25');
      await presetSave(h, { batFirst: false, assistPitch: true });
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' && x.humanPitching, { label: 'pitching' });
      await h.advance(20);
      const zc = await h.game(() => window.__game.app.renderer.layout.plane);
      await h.page.touchscreen.tap(zc.cx, zc.cy + 60);
      await h.advance(50);
      const s = await h.state();
      h.expect(s.phase === 'windup' || s.phase === 'pitch', 'single tap pitches with assist: ' + JSON.stringify({ phase: s.phase, assist: s.settings.assistPitch, hp: s.humanPitching, input: await h.game(() => window.__game.input().slice(-3)) }));
    },
  },
  {
    name: 'cage-tells-and-ms',
    viewports: ['iphone'],
    async run(h) {
      await h.open('test=1&seed=26');
      await presetSave(h, {});
      for (const p of ['FF', 'CU', 'SL', 'KN']) {
        await h.page.evaluate((pt) => window.__game.app.startCage(pt), p);
        await h.until((x) => x.phase === 'pitch', { label: 'pitch ' + p });
        const T = (await h.state()).ball.flightT;
        await h.advance(T * 650);
        await h.shot('cage-' + p);
      }
      await helpers.toContactMoment(h, 30);
      await h.page.evaluate(() => { const g = window.__game.getState(); window.__game.act({ type: 'swing', t: g.releaseT + g.pitch.T + 0.03 }); });
      await h.advance(100);
      const s = await h.state();
      h.expect(s.timingBar && s.timingBar.ms === true, 'Cage shows the ms readout');
      h.expect(s.outs === 0, 'no outs in the Cage');
    },
  },
  {
    name: 'tutorial-captions',
    viewports: ['iphone'],
    async run(h) {
      await h.open('test=1&seed=27');
      await helpers.startShort(h);
      // take pitches until a caption appears
      let s;
      for (let i = 0; i < 40; i++) {
        await h.advance(250);
        s = await h.state();
        if (s.caption) break;
      }
      h.expect(s.caption, 'an in-context explainer caption appeared on the first run');
      await h.page.touchscreen.tap(h.page.viewportSize().width / 2, 300);
      await h.advance(20);
      s = await h.state();
      h.expect(!s.caption || s.phase === 'pitch', 'tap dismissed the caption');
    },
  },
  {
    name: 'bot-full-game',
    viewports: ['desktop'],
    async run(h) {
      await h.open('test=1&seed=28');
      await presetSave(h, {});
      await helpers.startShort(h);
      const res = await h.page.evaluate(() => {
        const G = window.__game;
        let last = -1;
        for (let i = 0; i < 9000; i++) {
          const g = G.getState();
          if (!g || g.phase === 'gameOver') break;
          const bt = g.tiebreak ? g.tiebreak.team : g.half;
          if (g.phase === 'pitch' && g.pitch && g.releaseT !== last && g.cfg.humanBat[bt] !== null) {
            last = g.releaseT;
            G.act({ type: 'swing', t: g.releaseT + g.pitch.T + ((i * 37) % 160 - 80) / 1000 });
          }
          if (g.phase === 'prePitch' && g.cfg.humanPitch[bt === 0 ? 1 : 0] !== null && !g.charging) {
            G.act({ type: 'chargeStart', zx: 0.4, zz: 2.3 });
            G.act({ type: 'chargeEnd', t: g.time + 0.72 });
          }
          window.advanceTime(100);
        }
        const g = G.getState();
        return { phase: g.phase, reason: g.overReason, score: [g.teams[0].runs, g.teams[1].runs] };
      });
      h.expect(res.phase === 'gameOver', 'bot finished a Short Run in the browser: ' + JSON.stringify(res));
      const s = await h.until((x) => x.screen === 'results', { label: 'results' });
      await h.press(s.buttons.find((b) => b.id === 'ui:again'));
      await h.advance(50);
      h.expect((await h.state()).screen === 'play', 'restart → play');
    },
  },
  {
    name: 'safe-area-and-no-scroll',
    viewports: ['iphone', 'iphone-land'],
    async run(h) {
      await h.open('test=1&seed=29');
      await h.page.evaluate(() => { document.documentElement.dataset.testInset = '30'; window.dispatchEvent(new Event('resize')); });
      await h.page.waitForTimeout(100);
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch', { label: 'prePitch' });
      const s = await h.state();
      const vs = h.page.viewportSize();
      for (const b of s.buttons.filter((x) => !x.id.startsWith('ui:'))) {
        h.expect(b.x >= 30 - 0.5 && b.y >= 30 - 0.5 && b.x + b.w <= vs.width - 30 + 0.5 && b.y + b.h <= vs.height - 30 + 0.5, `button ${b.id} inside safe area ${JSON.stringify(b)}`);
      }
      const meta = await h.page.getAttribute('meta[name=viewport]', 'content');
      h.expect(meta.includes('viewport-fit=cover'), 'viewport-fit=cover');
      await h.page.touchscreen.tap(50, 300);
      await h.page.mouse.wheel(0, 400);
      const sy = await h.page.evaluate(() => window.scrollY + document.documentElement.scrollTop);
      h.expect(sy === 0, 'page never scrolls');
    },
  },
  {
    name: 'keyboard-only',
    viewports: ['desktop'],
    async run(h) {
      await h.open('test=1&seed=30');
      await presetSave(h, {});
      await h.page.keyboard.press('Enter'); // PLAY is focused on load
      await h.advance(20);
      let s = await h.state();
      h.expect(s.screen === 'modes', 'Enter on PLAY → modes: ' + s.screen);
      await h.page.keyboard.press('Escape');
      s = await h.state();
      h.expect(s.screen === 'title', 'Esc backs out of menus');
      await h.page.keyboard.press('Enter'); // PLAY again
      await h.page.keyboard.press('Enter'); // first card (Short Run) is focused
      await h.advance(20);
      s = await h.state();
      h.expect(s.screen === 'play', 'keyboard reached play: ' + s.screen);
      await helpers.toContactMoment(h, 0);
      await h.page.keyboard.press('Space');
      await h.advance(30);
      h.expect((await h.state()).last.grade, 'Space swings');
      await h.page.keyboard.press('Escape');
      s = await h.state();
      h.expect(s.screen === 'pause', 'Esc pauses');
      await h.page.keyboard.press('Enter');
      await h.advance(20);
      h.expect((await h.state()).screen === 'play', 'Enter resumes');
      await h.page.keyboard.press('m');
      h.expect((await h.state()).settings.muted === true, 'M mutes');
    },
  },
  {
    name: 'targets-and-lefty',
    viewports: ['iphone'],
    async run(h) {
      await h.open('test=1&seed=31');
      await presetSave(h, {});
      await helpers.startShort(h);
      await h.until((x) => x.phase === 'prePitch' && x.humanBatting, { label: 'batting' });
      let s = await h.state();
      for (const b of s.buttons) h.expect(b.w >= 44 && b.h >= 44, `${b.id} ≥ 44 px (${b.w}×${b.h})`);
      const right = s.buttons.find((b) => b.id === 'power');
      await h.page.evaluate(() => { const a = window.__game.app; a.save.data.settings.lefty = true; a.settingsChanged(); });
      await h.advance(20);
      s = await h.state();
      const left = s.buttons.find((b) => b.id === 'power');
      const vw = h.page.viewportSize().width;
      h.expect(Math.abs(left.x + left.w / 2 - (vw - (right.x + right.w / 2))) < 2, 'POWER chip mirrored for left-handed play');
    },
  },
  {
    name: 'tiers',
    viewports: ['iphone'],
    async run(h) {
      for (const tier of ['rookie', 'pro', 'allstar']) {
        await h.open('test=1&seed=32');
        await presetSave(h, { tier, heat: 30 });
        await helpers.startShort(h);
        const s = await h.until((x) => x.phase === 'pitch' && x.humanBatting, { label: 'pitch' });
        h.expect(s.tier === tier, `tier ${tier} active`);
        if (tier === 'allstar') {
          const zc = await h.game(() => window.__game.app.renderer.layout.plane);
          await pd(h, 'pointerdown', zc.cx, zc.cy + 50, 9);
          await pd(h, 'pointermove', zc.cx + 10, zc.cy + 60, 9);
          await h.advance(10);
          const a = await h.state();
          const yAim = zc.cy - (a.aim.z - 2.55) * zc.s;
          h.expect(yAim < zc.cy + 60 - 40, 'reticle drawn above the thumb');
        }
      }
    },
  },
];
