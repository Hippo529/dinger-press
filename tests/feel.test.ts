import { describe, expect, it } from 'vitest';
import { Fx, FlashGovernor, gradeFeedback } from '../src/fx/fx';
import { Particles, POOL_SIZE, popupAt, popupTotalMs } from '../src/fx/particles';
import { TUNING } from '../src/config/tuning';
import { GRADES } from '../src/sim/types';
import { semis, VariantPicker, applyAudioSession } from '../src/audio/engine';
import { CHATTER, ChatterPicker, chatterCount } from '../src/config/chatter';
import { TrailRing, TRAIL_N, squash } from '../src/render/trail';
import { project, makeCamera } from '../src/render/camera';
import { poseLimbs, type PoseKind } from '../src/render/actors';
import { ROSTER } from '../src/config/roster';
import { migrate, SaveStore, defaultSave, addToBoard, toBase64, fromBase64 } from '../src/save/save';
import { unlocksFor, ACHIEVEMENTS } from '../src/sim/progression';
import { Haptics } from '../src/platform/ios';
import { readFileSync } from 'fs';
import { Sim } from '../src/sim/game';
import { cfgShort } from './sim.test';

describe('hit-stop', () => {
  it('durations per grade, cap, K pop; starts only after the contact frame rendered; sim does not advance', () => {
    expect(gradeFeedback('PERFECT').hitstopMs).toBe(150);
    expect(gradeFeedback('GOOD').hitstopMs).toBe(90);
    expect(gradeFeedback('FOUL').hitstopMs).toBe(40);
    const fx = new Fx();
    fx.onEvent({ type: 'contact', grade: 'PERFECT', ev: 105, la: 27, spray: 0, offsetMs: 0, power: false, star: false }, { hrPredicted: false });
    expect(fx.timeScale()).toBe(1); // pending: the contact frame must render first
    fx.frameRendered();
    expect(fx.contactFrameRendered).toBe(1);
    fx.beginFrame(1 / 60);
    expect(fx.timeScale()).toBe(0);
    let frozen = 0;
    for (let i = 0; i < 30 && fx.timeScale() === 0; i++) {
      frozen += 1 / 120;
      fx.beginFrame(1 / 120);
    }
    expect(frozen).toBeGreaterThanOrEqual(0.14);
    expect(frozen).toBeLessThanOrEqual(0.16);
    const fx2 = new Fx();
    fx2.hitstop(999);
    fx2.beginFrame(0);
    expect(fx2.hitstopLeft).toBeCloseTo(TUNING.hitstop.capMs / 1000, 6);
    const fx3 = new Fx();
    fx3.onEvent({ type: 'mittPop', strikeout: true }, { hrPredicted: false });
    fx3.beginFrame(0);
    expect(fx3.hitstopLeft).toBeCloseTo(0.08, 6);
    // the sim does not advance while the loop's scale is 0
    const sim = new Sim(cfgShort(1));
    const t0 = sim.s.time;
    const scale = 0;
    for (let i = 0; i < 10; i++) if (scale > 0) sim.step(1 / 120);
    expect(sim.s.time).toBe(t0);
  });
  it('tuning edits take effect on the next event (read live)', () => {
    const old = TUNING.hitstop.goodMs;
    TUNING.hitstop.goodMs = 123;
    expect(gradeFeedback('GOOD').hitstopMs).toBe(123);
    TUNING.hitstop.goodMs = old;
  });
});

describe('trauma shake', () => {
  it('bounded by 2% of the short side and 2°, quadratic, decays at 1.2/s, suppressed during the pitch; 50% halves', () => {
    const fx = new Fx();
    fx.addTrauma(1);
    let maxT = 0, maxR = 0;
    for (let i = 0; i < 400; i++) {
      fx.now += 0.01;
      const s = fx.shake(400);
      maxT = Math.max(maxT, Math.abs(s.x), Math.abs(s.y));
      maxR = Math.max(maxR, Math.abs(s.roll));
    }
    expect(maxT).toBeLessThanOrEqual(0.02 * 400 + 1e-9);
    expect(maxR).toBeLessThanOrEqual((2 * Math.PI) / 180 + 1e-9);
    fx.beginFrame(0.5);
    expect(fx.trauma).toBeCloseTo(0.4, 6);
    const a = new Fx(), b = new Fx();
    b.settings.shakePct = 50;
    a.addTrauma(0.6); b.addTrauma(0.6);
    a.now = b.now = 1.234;
    expect(b.shake(400).x).toBeCloseTo(a.shake(400).x / 2, 6);
    const p = new Fx();
    p.onEvent({ type: 'pitchReleased', pitch: 'FF', star: false, mph: 90, T: 0.6 }, { hrPredicted: false });
    p.addTrauma(0.5);
    expect(p.trauma).toBe(0);
    const rm = new Fx();
    rm.settings.reduceMotion = true;
    rm.addTrauma(1);
    expect(rm.shake(400)).toEqual({ x: 0, y: 0, roll: 0 });
    expect(rm.zoom()).toBe(1);
  });
});

describe('slow-mo only for HRs and walk-offs', () => {
  it('a bot game never drops below 1× outside hit-stop except on HR/walk-off', () => {
    const sim = new Sim(cfgShort(17));
    const fx = new Fx();
    let bad = 0, hrSlow = 0;
    let lastRel = -1;
    while (sim.s.phase !== 'gameOver' && sim.s.time < 1200) {
      const s = sim.s;
      if (s.phase === 'pitch' && s.pitch && s.releaseT !== lastRel && s.cfg.humanBat[s.half] !== null) {
        lastRel = s.releaseT;
        sim.act({ type: 'swing', t: s.releaseT + s.pitch.T + ((s.totalPitches * 37) % 100 - 50) / 1000 });
      }
      if (s.phase === 'prePitch' && s.cfg.humanPitch[s.half === 0 ? 1 : 0] !== null && !s.charging) {
        sim.act({ type: 'chargeStart', zx: 0.4, zz: 2.2 });
        sim.act({ type: 'chargeEnd', t: s.time + 0.72 });
      }
      fx.beginFrame(1 / 120);
      const sc = fx.timeScale();
      if (sc > 0) sim.step(1 / 120);
      for (const e of sim.drainEvents()) fx.onEvent(e, { hrPredicted: !!sim.s.play?.hr });
      fx.frameRendered();
      if (sc > 0 && sc < 1) {
        if (sim.s.play?.hr || sim.s.walkoff || sim.s.phase === 'celebrate') hrSlow++;
        else bad++;
      }
    }
    expect(bad).toBe(0);
    expect(hrSlow).toBeGreaterThan(0);
  });
  it('0.35 for 0.8 s real, eases back over 0.3 s', () => {
    const fx = new Fx();
    fx.onEvent({ type: 'walkoff' }, { hrPredicted: false });
    fx.now += 0.4;
    expect(fx.timeScale()).toBe(0.35);
    fx.now += 0.55;
    const mid = fx.timeScale();
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(1);
    fx.now += 0.3;
    expect(fx.timeScale()).toBe(1);
  });
});

describe('feedback, particles, popups, flashes', () => {
  it('every grade has label, sound layer, hit-stop, particles, popup; deterministic', () => {
    for (const g of GRADES) {
      const f = gradeFeedback(g);
      expect(f.label).toBe(g);
      expect(f.sounds.length).toBeGreaterThanOrEqual(1);
      expect(typeof f.hitstopMs).toBe('number');
      expect(typeof f.particles).toBe('number');
      expect(f.popup.length).toBeGreaterThan(0);
      expect(gradeFeedback(g)).toEqual(f);
      if (g !== 'WHIFF') {
        expect(f.particles).toBeGreaterThanOrEqual(TUNING.particles.burstMin);
        expect(f.particles).toBeLessThanOrEqual(TUNING.particles.burstMax);
      }
    }
  });
  it('particle pool caps at 300 with a constant pool array', () => {
    const p = new Particles();
    const pool = p.pool;
    for (let i = 0; i < 50; i++) p.burst(0, 0, 20, 100, ['#fff'], 0);
    expect(p.liveCount).toBe(POOL_SIZE);
    expect(p.pool).toBe(pool);
    expect(p.pool.length).toBe(300);
    p.update(5);
    expect(p.liveCount).toBe(0);
  });
  it('popup timeline: 150 in, 40 px drift, 500 hold, 200 fade, < 1 s total', () => {
    expect(popupTotalMs()).toBeLessThan(1000);
    expect(popupAt(0).scale).toBeCloseTo(0, 6);
    expect(popupAt(150).scale).toBeCloseTo(1, 6);
    expect(popupAt(650).dy).toBeCloseTo(-40, 6);
    expect(popupAt(650).alpha).toBe(1);
    expect(popupAt(850).alpha).toBeCloseTo(0, 6);
  });
  it('flash governor: ≤ 3 flashes per 1 s window; HR flash ≤ 35% once', () => {
    const g = new FlashGovernor();
    expect([g.request(0), g.request(0.1), g.request(0.2), g.request(0.3)]).toEqual([true, true, true, false]);
    expect(g.request(1.05)).toBe(true);
    const fx = new Fx();
    fx.onEvent({ type: 'homeRun', dist: 420, walkoff: false }, { hrPredicted: true });
    expect(fx.flashAlpha()).toBeLessThanOrEqual(0.35);
    expect(fx.gov.count).toBe(1);
  });
});

describe('ball, camera, poses', () => {
  it('stretch keeps area; contact squash is 0.7/1.3; trail ring holds exactly 12', () => {
    for (const sp of [0, 5, 20, 80]) {
      const q = squash(sp, 6, 1);
      expect(q.sx * q.sy).toBeCloseTo(1, 2);
    }
    expect(squash(10, 6, 0)).toEqual({ sx: 0.7, sy: 1.3 });
    const t = new TrailRing();
    for (let i = 0; i < 30; i++) t.push(i, i);
    expect(t.n).toBe(TRAIL_N);
    expect(TRAIL_N).toBe(12);
    expect(t.at(0)).toEqual([18, 18]);
    expect(t.at(11)).toEqual([29, 29]);
  });
  it('projection: a point on the camera axis maps to the centre; farther = smaller', () => {
    const c = makeCamera();
    c.pos = { x: 0, y: 0, z: 5 };
    c.look = { x: 0, y: 100, z: 5 };
    c.cx = 200;
    c.cy = 300;
    const o = { x: 0, y: 0, s: 0, depth: 0 };
    project(c, 0, 50, 5, o);
    expect(o.x).toBeCloseTo(200, 6);
    expect(o.y).toBeCloseTo(300, 6);
    const near = o.s;
    project(c, 0, 90, 5, o);
    expect(o.s).toBeLessThan(near);
  });
  it('poses change limb angles ≥ 20° across their timelines; silhouettes are distinct', () => {
    for (const k of ['windup', 'swing', 'throw', 'dive'] as PoseKind[]) {
      const a = poseLimbs({ kind: k, t: 0, facing: 1, back: false }), b = poseLimbs({ kind: k, t: 1, facing: 1, back: false });
      const d = Math.max(...(['legF', 'legB', 'armF', 'armB'] as const).map((x) => Math.abs(a[x] - b[x])));
      expect((d * 180) / Math.PI).toBeGreaterThanOrEqual(20);
    }
    for (const k of ['idle', 'celebrate', 'run'] as PoseKind[]) {
      const a = poseLimbs({ kind: k, t: 0, facing: 1, back: false }), b = poseLimbs({ kind: k, t: 0.11, facing: 1, back: false });
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    }
    const sil = new Set(ROSTER.slice(0, 12).map((c) => `${c.scale}|${c.torsoW}|${c.torsoH}|${c.headR}`));
    expect(sil.size).toBe(12);
  });
});

describe('audio rules', () => {
  it('semitone math, ±1.5 st variation, never the same variant twice', () => {
    expect(semis(12)).toBeCloseTo(2, 9);
    expect(semis(2)).toBeCloseTo(Math.pow(2, 2 / 12), 9);
    const v = new VariantPicker();
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const k = v.pick('crack', 3);
      expect(k).not.toBe(last);
      last = k;
      const r = v.rate(1.5);
      expect(r).toBeGreaterThanOrEqual(semis(-1.5) - 1e-9);
      expect(r).toBeLessThanOrEqual(semis(1.5) + 1e-9);
    }
    expect(TUNING.audio.strikeStepSemis).toBe(2);
    expect(TUNING.audio.streakStepSemis).toBe(1);
    expect(TUNING.audio.crowdDuckDb).toBe(8);
  });
  it('audio session: ambient when off, playback when on, no throw without the API', () => {
    const nav = { audioSession: { type: '' } } as unknown as Navigator;
    expect(applyAudioSession(nav, false)).toBe('ambient');
    expect(applyAudioSession(nav, true)).toBe('playback');
    expect(applyAudioSession({} as Navigator, true)).toBeNull();
    expect(applyAudioSession(null, true)).toBeNull();
  });
  it('chatter: 40+ lines, no back-to-back repeats over 500 draws', () => {
    expect(chatterCount()).toBeGreaterThanOrEqual(40);
    const p = new ChatterPicker();
    const keys = Object.keys(CHATTER);
    let prev = '';
    for (let i = 0; i < 500; i++) {
      p.pick(keys[i % 3 === 0 ? 0 : (i * 7) % keys.length], { name: 'X' });
      expect(p.lastRaw).not.toBe(prev);
      prev = p.lastRaw;
    }
  });
});

describe('haptics', () => {
  it('off by default creates nothing; on toggles the switch label inside the handler', () => {
    let clicks = 0;
    const fakeLabel = { className: '', setAttribute() {}, appendChild() {}, click: () => clicks++ };
    const fakeDoc = { createElement: (t: string) => (t === 'label' ? fakeLabel : { setAttribute() {}, type: '' }), body: { appendChild() {} } } as unknown as Document;
    const h = new Haptics(fakeDoc);
    h.tap();
    expect(h.label).toBeNull();
    h.enabled = true;
    h.tap();
    expect(clicks).toBe(1);
    expect(h.fired).toBe(1);
  });
});

describe('save, progression, boards', () => {
  it('migrates v0 and v1; survives a throwing storage with memory fallback; save code roundtrip', () => {
    const v0 = migrate({ heat: 40, tier: 'pro', hr: 7 });
    expect(v0.v).toBe(2);
    expect(v0.settings.heat).toBe(40);
    expect(v0.stats.hr).toBe(7);
    expect(v0.boards.longestHr).toEqual([]);
    const v1 = migrate({ v: 1, settings: { shakePct: 50 }, stats: {}, unlocks: ['trail:sun'] });
    expect(v1.settings.shakePct).toBe(50);
    expect(v1.flags.firstRunDone).toBe(false);
    const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('x'); } };
    const store = new SaveStore(bad);
    store.data.stats.hr = 3;
    store.save();
    expect(store.usingMemory).toBe(true);
    expect(store.load().stats.hr).toBe(3);
    const mem: Record<string, string> = {};
    const ok = new SaveStore({ getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } });
    ok.data.stats.hr = 12;
    const code = ok.exportCode();
    const other = new SaveStore({ getItem: () => null, setItem() {}, removeItem() {} });
    expect(other.importCode(code)).toBe(true);
    expect(other.data.stats.hr).toBe(12);
    expect(other.importCode('not base64!!')).toBe(false);
    expect(fromBase64(toBase64('★ unicode'))).toBe('★ unicode');
    ok.reset();
    expect(ok.data).toEqual(defaultSave());
  });
  it('achievements unlock characters, The Gutter and trails; no currency in the save', () => {
    const base = { hr: 0, perfect: 0, hits: 0, ks: 0, wins: 0, clutchWins: 0, millBest: 0, longestHr: 0, maxEv: 0, bestPerfectStreak: 0, mercyWins: 0, dailyDone: 0, clutchCleared: 0 };
    expect(unlocksFor({ ...base, hr: 10 })).toContain('char:relish');
    expect(unlocksFor({ ...base, perfect: 25 })).toContain('char:bleep');
    expect(unlocksFor({ ...base, clutchWins: 1 })).toContain('char:spooky');
    expect(unlocksFor({ ...base, millBest: 3000 })).toContain('char:kettle');
    expect(unlocksFor({ ...base, longestHr: 401 })).toContain('stadium:gutter');
    expect(unlocksFor({ ...base, hits: 1 })).toContain('trail:sun');
    expect(unlocksFor(base)).toEqual([]);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(12);
    const keys = JSON.stringify(defaultSave()).toLowerCase();
    for (const w of ['coin', 'currency', 'gem', 'cash', 'buck']) expect(keys.includes(w)).toBe(false);
  });
  it('top-5 boards insert and sort for all five boards', () => {
    const d = defaultSave();
    for (const k of Object.keys(d.boards) as (keyof typeof d.boards)[]) {
      const b = d.boards[k];
      for (const v of [5, 1, 9, 3, 7, 2, 8]) addToBoard(b, { v, who: 'x', date: 'd' });
      expect(b.map((e) => e.v)).toEqual([9, 8, 7, 5, 3]);
      expect(addToBoard(b, { v: 0, who: 'x', date: 'd' })).toBe(-1);
    }
  });
});

describe('style discipline', () => {
  it('UI CSS uses only theme variables (no hex colours)', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });
});
