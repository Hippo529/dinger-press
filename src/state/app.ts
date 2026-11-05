// App: pushdown screen stack, game sessions, frame/update, settings application, host for UI + input.
import { ROSTER, ROSTER_BY_ID, TEAMS, type TeamId } from '../config/roster';
import { AudioEngine } from '../audio/engine';
import { AudioDirector } from '../audio/director';
import { FixedLoop, DT } from '../core/loop';
import { Input, type InputHost } from '../core/input';
import { Fx } from '../fx/fx';
import { Particles, Popups } from '../fx/particles';
import { ReplayRing } from '../fx/replay';
import { Haptics, isStandalone, prefersReducedMotion, readInsets, requestPersist, toggleFullscreen, viewportSize } from '../platform/ios';
import { computeLayout } from '../render/layout';
import { Renderer } from '../render/renderer';
import { drawPrompt } from '../render/overlays';
import { THEME } from '../config/theme';
import { SaveStore, type StorageLike } from '../save/save';
import { attract, cage, clutch, mill, proof, shortRun, type CommonOpts } from '../sim/modes';
import type { ClutchSpec, ModeConfig } from '../sim/state';
import type { Action, PitchType, SimEvent } from '../sim/types';
import { buildScreen, type PlayerSetup, type ResultsData, type ScreenId, type UiHost } from '../ui/menus';
import { setPressHook } from '../ui/dom';
import { finishGame } from './results';
import { Session } from './session';

export type StackItem = ScreenId | 'play';

export class App implements InputHost, UiHost {
  readonly fx = new Fx();
  readonly parts = new Particles();
  readonly pops = new Popups();
  readonly replay = new ReplayRing();
  readonly audio = new AudioEngine();
  readonly director = new AudioDirector(this.audio);
  readonly renderer: Renderer;
  readonly loop = new FixedLoop();
  readonly save: SaveStore;
  readonly haptics = new Haptics();
  readonly input: Input;
  stack: StackItem[] = ['title'];
  session: Session | null = null;
  attract: Session | null = null;
  lastCfg: ModeConfig | null = null;
  private resultsData: ResultsData | null = null;
  private gameOverAt = -1;
  hidden = false;
  private seedBase: number;
  private seedN = 0;
  private wall = 0;
  private lastDraw = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly ui: HTMLElement, readonly testMode: boolean, seed: number | null, storage: StorageLike | null) {
    this.save = new SaveStore(storage);
    this.renderer = new Renderer(canvas, this.fx, this.parts, this.pops, this.replay);
    this.input = new Input(this, canvas);
    this.seedBase = seed ?? Math.floor(Math.random() * 1e9);
    setPressHook(() => {
      this.firstGesture();
      this.haptic();
      this.director.zz('click', 0, false);
    });
    this.applySettings();
    this.resize();
    this.startAttract();
    this.showUi();
  }

  nextSeed(): number {
    return (this.seedBase + this.seedN++ * 7919) >>> 0;
  }

  // ---------- screens ----------
  top(): StackItem {
    return this.stack[this.stack.length - 1];
  }
  go(id: ScreenId): void {
    this.stack.push(id);
    this.showUi();
  }
  back(): void {
    if (this.stack.length > 1) this.stack.pop();
    this.showUi();
  }
  menuBack(): void {
    const t = this.top();
    if (t === 'pause' || t === 'resume') return this.resume();
    if (t !== 'title' && t !== 'results') this.back();
  }
  showUi(): void {
    const t = this.top();
    this.ui.replaceChildren();
    if (t !== 'play') {
      const el = buildScreen(t, this);
      this.ui.append(el);
      const first = el.querySelector<HTMLElement>('button');
      if (first && !this.testMode) first.focus({ preventScroll: true });
    }
  }

  // ---------- sessions ----------
  private deps() {
    return { fx: this.fx, renderer: this.renderer, parts: this.parts, pops: this.pops, replay: this.replay, audio: this.director, onEvent: (e: SimEvent) => this.onSimEvent(e) };
  }
  private startAttract(): void {
    this.attract = new Session(attract(this.nextSeed()), { ...this.deps(), audio: new AudioDirector(new AudioEngine()), onEvent: undefined }, [], false);
  }
  private common(): CommonOpts {
    const st = this.save.data.settings;
    const pool = this.unlockedChars();
    const other = (Object.keys(TEAMS) as TeamId[]).filter((t) => t !== st.team)[this.seedN % 3];
    return {
      seed: this.nextSeed(),
      players: [{ name: 'You', heat: st.heat, tier: st.tier }],
      stadium: st.stadium,
      aggression: st.aggression,
      assistPitch: st.assistPitch,
      newbiePitchesLeft: Math.max(0, 3 - this.save.data.stats.pitchesSeen),
      firstEver: !this.save.data.flags.firstRunDone,
      hideLocator: st.hideLocatorExpert,
      pool,
      teams: [st.team, other],
      captain: st.captain && pool.includes(st.captain) ? st.captain : null,
    };
  }
  begin(cfg: ModeConfig): void {
    this.lastCfg = cfg;
    this.session = new Session(cfg, this.deps(), this.save.data.flags.tutorialSeen, !this.save.data.flags.firstRunDone);
    this.fx.trauma = 0;
    this.resultsData = null;
    this.gameOverAt = -1;
    this.stack = ['play'];
    this.loop.reset(0, performance.now());
    this.showUi();
  }
  startShortRun(): void {
    this.begin(shortRun({ ...this.common(), batFirst: this.save.data.settings.batFirst }));
  }
  private profiles(ps: PlayerSetup[]) {
    return ps.map((p) => ({ name: p.name, heat: p.heat, tier: p.tier }));
  }
  startMill(players: PlayerSetup[]): void {
    this.begin(mill({ ...this.common(), players: this.profiles(players), chars: players.map((p) => p.char), firstEver: false }));
  }
  startProof(players: PlayerSetup[]): void {
    this.begin(proof({ ...this.common(), players: this.profiles(players), firstEver: false }));
  }
  startClutch(card: ClutchSpec): void {
    this.begin(clutch({ ...this.common(), firstEver: false }, card));
  }
  startCage(pitch: PitchType | 'mix'): void {
    this.begin(cage({ ...this.common(), pitch, firstEver: false }));
  }
  restart(): void {
    if (this.lastCfg) this.begin({ ...this.lastCfg, seed: this.nextSeed(), firstEver: false, newbiePitchesLeft: Math.max(0, 3 - this.save.data.stats.pitchesSeen) });
  }
  resume(): void {
    this.hidden = false;
    this.audio.unlock();
    while (this.stack.length > 1 && this.top() !== 'play') this.stack.pop();
    if (this.top() !== 'play' && this.session && this.session.sim.s.phase !== 'gameOver') this.stack = ['play'];
    this.loop.reset(this.session?.sim.s.time ?? 0, performance.now());
    this.showUi();
  }
  quit(): void {
    this.session = null;
    this.stack = ['title'];
    this.showUi();
  }
  pause(): void {
    if (this.top() === 'play') this.go('pause');
  }
  results(): ResultsData | null {
    return this.resultsData;
  }
  unlockedChars(): string[] {
    const u = new Set(this.save.data.unlocks);
    return ROSTER.filter((c) => !c.unlock || u.has('char:' + c.id)).map((c) => c.id);
  }
  today(): number {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  private onSimEvent(e: SimEvent): void {
    if (e.type === 'gameOver') this.gameOverAt = this.fx.now;
  }

  private endGame(): void {
    const s = this.session!.sim.s;
    this.save.data.flags.tutorialSeen = [...this.session!.tutorialSeen];
    if (s.cfg.kind !== 'cage') this.resultsData = finishGame(s, this.save, this.today());
    this.gameOverAt = -1;
    this.stack = ['results'];
    this.showUi();
  }

  // ---------- settings ----------
  settingsChanged(): void {
    this.save.save();
    this.applySettings();
  }
  applySettings(): void {
    const st = this.save.data.settings;
    const rm = st.reduceMotion ?? prefersReducedMotion();
    this.fx.settings = { reduceMotion: rm, shakePct: st.shakePct, flashes: st.flashes, slowmo: st.slowmo };
    document.documentElement.classList.toggle('reduce-motion', rm);
    this.renderer.settings = { showLocator: st.showLocator, lefty: st.lefty, showTimingMs: st.showTimingMs };
    this.audio.volume = st.volume;
    this.audio.silentModeAudio = st.silentModeAudio;
    this.audio.applySession();
    this.audio.setMuted(st.muted);
    this.haptics.enabled = st.haptics;
    if (this.renderer.w) this.renderer.layout = computeLayout(this.renderer.w, this.renderer.h, readInsets(), st.lefty);
  }

  resize(): void {
    const { w, h } = viewportSize();
    this.renderer.resize(w, h, window.devicePixelRatio || 1, readInsets());
  }

  // ---------- InputHost ----------
  playing(): boolean {
    return this.top() === 'play' && !!this.session && !this.hidden;
  }
  state() {
    return this.session?.sim.s ?? null;
  }
  layout() {
    return this.renderer.layout;
  }
  buttons() {
    return this.renderer.buttons;
  }
  toSim(eventMs: number): number {
    const s = this.session?.sim.s;
    return this.loop.toSim(eventMs, this.testMode, s?.time ?? 0);
  }
  act(a: Action): void {
    this.session?.sim.act(a);
  }
  mute(): void {
    const st = this.save.data.settings;
    st.muted = !st.muted;
    this.settingsChanged();
  }
  fullscreen(): void {
    toggleFullscreen();
  }
  private gestured = false;
  firstGesture(): void {
    this.audio.unlock();
    if (!this.gestured) {
      this.gestured = true;
      if (isStandalone()) requestPersist();
    }
  }
  haptic(): void {
    this.haptics.tap();
  }
  pressed(id: string): void {
    this.renderer.pressed[id] = this.fx.now;
  }
  skip(): void {
    this.fx.skipSlowmo();
    if (this.session) this.session.caption = null;
  }

  // ---------- visibility ----------
  onHidden(): void {
    if (this.hidden) return;
    this.hidden = true;
    this.audio.suspend();
    if (this.top() === 'play') this.stack.push('resume');
    this.showUi();
  }
  onVisible(): void {
    if (!this.hidden) return;
    if (this.top() !== 'resume') {
      this.hidden = false;
      this.audio.unlock();
    }
    this.showUi();
  }

  // ---------- frame ----------
  /** Advance everything by realDt seconds of wall time. */
  update(realDt: number): void {
    this.wall += realDt * 1000;
    this.fx.beginFrame(realDt);
    const t = this.top();
    const active = t === 'play' && !this.hidden ? this.session : t === 'title' ? this.attract : null;
    if (active) {
      const scale = active === this.attract ? 1 : this.fx.timeScale();
      this.loop.advance(active, realDt, scale, this.testMode ? this.wall : performance.now());
      if (active === this.session) this.session.timeScaleLog.push({ t: active.sim.s.time, scale, hr: !!active.sim.s.play?.hr || active.sim.s.phase === 'celebrate' });
      if (this.session && this.session.timeScaleLog.length > 4000) this.session.timeScaleLog.splice(0, 1000);
      this.director.frame(active.sim.s);
    }
    if (this.attract && this.attract.sim.s.phase === 'gameOver') this.startAttract();
    this.parts.update(realDt);
    this.pops.update(this.fx.now);
    if (this.gameOverAt >= 0 && this.fx.now - this.gameOverAt > 1.4 && this.top() === 'play') this.endGame();
  }

  draw(): void {
    const t = this.top();
    const sess = t === 'title' ? this.attract : this.session ?? this.attract;
    if (!sess) return;
    const s = sess.sim.s;
    const alpha = sess === this.attract || t === 'play' ? this.loop.alpha() : 0;
    const rdt = Math.max(0, Math.min(0.5, this.fx.now - this.lastDraw));
    this.lastDraw = this.fx.now;
    this.renderer.render(s, s.time + alpha * DT, sess.ballAt(alpha), rdt, sess !== this.attract);
    if (t === 'play' && this.session?.caption && this.session.caption.until > this.fx.now) {
      const l = this.renderer.layout;
      drawPrompt(this.renderer.ctx, { ...l, prompt: { ...l.prompt, y: l.prompt.y + 44 } }, this.session.caption.text, 0, THEME.teal);
    }
  }

  /** Test hook: step the sim deterministically by `ms` then render once. */
  advanceTime(ms: number): void {
    const n = Math.max(1, Math.round(ms / (DT * 1000)));
    for (let i = 0; i < n; i++) this.update(DT);
    this.draw();
  }

  charName(id: string): string {
    return ROSTER_BY_ID[id]?.name ?? id;
  }
}
