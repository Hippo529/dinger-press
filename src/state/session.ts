// A running game: wraps the Sim, fans sim events out to fx/audio/particles/popups, records replay.
import { THEME } from '../config/theme';
import { TUNING } from '../config/tuning';
import { Sim } from '../sim/game';
import type { ModeConfig } from '../sim/state';
import { humanBatter } from '../sim/state';
import type { SimEvent, V3 } from '../sim/types';
import type { Fx } from '../fx/fx';
import { gradeFeedback } from '../fx/fx';
import type { Particles, Popups } from '../fx/particles';
import type { ReplayRing } from '../fx/replay';
import type { AudioDirector } from '../audio/director';
import type { Renderer } from '../render/renderer';
import type { Steppable } from '../core/loop';
import { ChatterPicker } from '../config/chatter';
import { ROSTER_BY_ID } from '../config/roster';

export interface SessionDeps {
  fx: Fx;
  renderer: Renderer;
  parts: Particles;
  pops: Popups;
  replay: ReplayRing;
  audio: AudioDirector;
  onEvent?: (e: SimEvent, s: Session) => void;
}

export const TUTORIAL: Record<string, string> = {
  ball: 'BALL — four balls is a free walk',
  strike: 'STRIKE — three strikes is an out',
  out: 'OUT — three outs and the sides swap',
  half: 'INNINGS — three of them make a Short Run',
};

export class Session implements Steppable {
  readonly sim: Sim;
  prevBall: V3 | null = null;
  curBall: V3 | null = null;
  readonly eventLog: { type: string; t: number; real: number }[] = [];
  caption: { text: string; until: number } | null = null;
  lastThrowBase: number | null = null;
  ticker: { text: string; until: number } | null = null;
  readonly chatter = new ChatterPicker();
  tutorialSeen: Set<string>;
  timeScaleLog: { t: number; scale: number; hr: boolean }[] = [];

  constructor(readonly cfg: ModeConfig, readonly d: SessionDeps, tutorialSeen: string[], readonly tutorialOn: boolean) {
    this.sim = new Sim(cfg);
    this.tutorialSeen = new Set(tutorialSeen);
    d.replay.reset();
    d.parts.clear();
    this.flush();
  }

  simTime(): number {
    return this.sim.s.time;
  }

  step(dt: number): void {
    const s = this.sim.s;
    if (s.ball) this.prevBall = { ...s.ball.p };
    this.sim.step(dt);
    if (s.ball) {
      this.curBall = s.ball.p;
      if (!this.prevBall) this.prevBall = { ...s.ball.p };
    } else {
      this.curBall = null;
      this.prevBall = null;
    }
    if (s.phase === 'live' || s.phase === 'pitch') this.d.replay.record(s);
    this.flush();
  }

  afterStep(): boolean {
    return this.d.fx.pendingHitstop > 0;
  }

  /** Interpolated batted-ball position for rendering. */
  ballAt(alpha: number): V3 | null {
    if (!this.curBall) return null;
    const p = this.prevBall ?? this.curBall;
    return { x: p.x + (this.curBall.x - p.x) * alpha, y: p.y + (this.curBall.y - p.y) * alpha, z: p.z + (this.curBall.z - p.z) * alpha };
  }

  flush(): void {
    for (const e of this.sim.drainEvents()) this.handle(e);
  }

  private say(key: string, vars: Record<string, string> = {}): void {
    const text = this.chatter.pick(key, vars);
    if (text) this.ticker = { text, until: this.d.fx.now + 2.6 };
  }

  private chat(e: SimEvent): void {
    const s = this.sim.s;
    switch (e.type) {
      case 'paStart':
        if (s.totalPitches > 0) this.say('paStart', { name: ROSTER_BY_ID[e.batter]?.name ?? '' });
        break;
      case 'homeRun':
        this.say(e.walkoff ? 'walkoff' : 'homeRun');
        break;
      case 'strikeout':
        this.say('strikeout');
        break;
      case 'walk':
        this.say('walk');
        break;
      case 'hit':
        if (e.bases < 4) this.say(e.bases >= 2 ? 'extraBase' : 'hit');
        break;
      case 'caught':
        if (e.diving) this.say('diving');
        break;
      case 'starChance':
        this.say('starChance');
        break;
      case 'chatter':
        this.say(e.key);
        break;
      case 'halfEnd':
        this.say('halfEnd');
        break;
      case 'gameOver':
        this.say(e.reason === 'mercy rule' ? 'mercy' : e.reason === 'walk-off' ? 'walkoff' : 'gameOver');
        break;
      case 'banner':
        if (e.text === 'DOUBLE PLAY') this.say('doublePlay');
        else if (/out$/i.test(e.text)) this.say('out');
        break;
    }
  }

  private showCaption(key: string): void {
    if (!this.tutorialOn || this.tutorialSeen.has(key)) return;
    this.tutorialSeen.add(key);
    this.caption = { text: TUTORIAL[key], until: this.d.fx.now + 3.5 };
  }

  private handle(e: SimEvent): void {
    const s = this.sim.s;
    const { fx, renderer: r, parts, pops, audio } = this.d;
    this.eventLog.push({ type: e.type, t: s.time, real: fx.now });
    this.chat(e);
    if (this.eventLog.length > 600) this.eventLog.splice(0, 200);
    fx.onEvent(e, { hrPredicted: !!s.play?.hr });
    audio.onEvent(e, s);
    const l = r.layout;
    const cx = l ? l.w / 2 : 200;
    const bannerY = l ? l.banner.y + l.banner.h / 2 : 200;
    switch (e.type) {
      case 'pitchReleased':
        r.clearTrail();
        break;
      case 'throw':
        this.lastThrowBase = e.base;
        break;
      case 'contact': {
        r.contactT = fx.now;
        const fb = gradeFeedback(e.grade);
        const b = r.ballScreen;
        const col = (THEME as Record<string, string>)[fb.color] ?? THEME.paper;
        parts.burst(b.x, b.y, Math.min(fb.particles, TUNING.particles.burstMax), 260, [col, THEME.paper, THEME.sun], 0, 300);
        const pred = s.play?.pred;
        const solid = e.grade === 'PERFECT' || e.grade === 'GOOD' || e.ev >= 90;
        let dist = 0;
        if (pred) {
          const last = pred.hr ? pred.samples[pred.samples.length - 1] : pred.land;
          if (last) dist = Math.round(Math.hypot(last.x, last.y) * (pred.hr ? 1.04 : 1) + (pred.hr ? 8 : 0));
        }
        const sub = solid && e.grade !== 'FOUL' ? `${e.ev.toFixed(0)} mph · ${dist} ft` : '';
        pops.add(fb.popup, sub, cx, bannerY - 50, fx.now, e.grade === 'PERFECT' ? THEME.sun : THEME.paper, e.grade === 'PERFECT' ? 42 : 32);
        if (e.grade === 'WHIFF') break;
        break;
      }
      case 'swing':
        r.swingRealT = fx.now;
        break;
      case 'whiff':
        pops.add('WHIFF', '', cx, bannerY - 50, fx.now, THEME.paper, 30);
        break;
      case 'mittPop': {
        const z = r.zoneRect;
        const mx = z ? z.x + z.w / 2 : cx, my = z ? z.y + z.h : bannerY;
        r.mittSquashT = fx.now;
        const n = TUNING.particles.mittMin + ((s.totalPitches * 5) % (TUNING.particles.mittMax - TUNING.particles.mittMin + 1));
        parts.burst(mx, my, n, 90, [THEME.dirt, THEME.paper], 1, 200);
        break;
      }
      case 'take':
        if (humanBatter(s) !== null) this.showCaption(e.call);
        break;
      case 'out':
        pops.add('OUT', e.text, cx, bannerY + 30, fx.now, THEME.paper, 30);
        if (humanBatter(s) !== null) this.showCaption('out');
        break;
      case 'safe':
        pops.add('SAFE', e.text, cx, bannerY + 30, fx.now, THEME.sun, 30);
        break;
      case 'caught':
        if (e.diving) pops.add('DIVING CATCH!', '', cx, bannerY - 50, fx.now, THEME.sun, 32);
        break;
      case 'starEarned':
        if (l) pops.add('+★', e.why, l.star.x + l.star.w / 2 - 40, l.star.y - 10, fx.now, THEME.sun, 26);
        break;
      case 'homeRun': {
        const top = l ? l.h * 0.28 : 150;
        const total = TUNING.particles.fireworksMax;
        for (let i = 0; i < 3; i++) parts.burst(cx + (i - 1) * (l ? l.w * 0.28 : 100), top + (i % 2) * 40, Math.floor(total / 4), 220, [THEME.sun, THEME.pink, THEME.teal, THEME.paper], 0, 120);
        for (let i = 0; i < Math.floor(total / 4); i++) parts.spawn(cx + ((i * 37) % 300) - 150, -10, ((i * 13) % 60) - 30, 40 + (i % 5) * 20, 2.5, 4, [THEME.pink, THEME.teal, THEME.sun][i % 3], 2, 60);
        this.d.replay.start(fx.now);
        break;
      }
      case 'walkoff':
        pops.add('WALK-OFF!', '', cx, bannerY - 60, fx.now, THEME.sun, 44);
        break;
      case 'halfEnd':
        if (s.cfg.kind === 'short') this.showCaption('half');
        break;
    }
    this.d.onEvent?.(e, this);
  }
}
