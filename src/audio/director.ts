// Maps sim events to sounds, drives crowd tension, applies variation rules, logs everything.
import { TUNING } from '../config/tuning';
import { ROSTER_BY_ID } from '../config/roster';
import { leverage } from '../sim/stars';
import { humanBatter, type GameState } from '../sim/state';
import type { SimEvent } from '../sim/types';
import { semis, type AudioEngine } from './engine';
import { chime, crack, crowdBed, mitt, stinger, walkup, type CrowdBed } from './sounds';

// ZzFX one-shots: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, ...]
const ZZ: Record<string, (number | undefined)[]> = {
  whip: [0.5, 0, 420, 0, 0.02, 0.08, 4, 1.5, -18, , , , , 1.2],
  swish: [0.6, 0, 280, 0.01, 0.03, 0.12, 4, 1, 12, , , , , 2],
  strike: [0.5, 0, 660, 0, 0.05, 0.12, 2, 1.4, , , , , , , , , , 0.6],
  ball: [0.35, 0, 330, 0, 0.03, 0.08, 0, 1],
  star: [0.5, 0, 990, 0.01, 0.08, 0.25, 0, 1.6, , , 330, 0.06],
  starTell: [0.9, 0, 700, 0.02, 0.18, 0.2, 1, 1, , , -260, 0.12, 0.25],
  streak: [0.45, 0, 880, 0, 0.04, 0.2, 0, 1.2, , , 220, 0.05],
  out: [0.4, 0, 180, 0, 0.05, 0.16, 2, 1, -8],
  tick: [0.4, 0, 1200, 0, 0.01, 0.05, 4, 1],
  thud: [0.5, 0, 90, 0, 0.03, 0.1, 0, 1, -4],
  pop: [0.45, 0, 520, 0, 0.02, 0.07, 0, 1, 30],
  click: [0.3, 0, 1600, 0, 0.005, 0.02, 0, 1],
};

export class AudioDirector {
  private crowd: CrowdBed | null = null;
  private hitStreak = 0;
  private crackVariant = 0;
  constructor(readonly eng: AudioEngine) {}

  private dest(): AudioNode | null {
    return this.eng.sfx;
  }
  private ensureCrowd(): void {
    if (this.crowd || !this.eng.ctx || !this.eng.crowdBus) return;
    try {
      this.crowd = crowdBed(this.eng.ctx, this.eng.crowdBus);
      this.eng.record('crowd');
    } catch {
      /* ignore */
    }
  }

  zz(name: string, semisShift = 0, vary = true): void {
    const rate = (vary ? this.eng.variants.rate(TUNING.audio.variationSemis) : 1) * semis(semisShift);
    this.eng.zzfx(name, ZZ[name], rate);
  }

  play(name: string, fn: (ctx: BaseAudioContext, dest: AudioNode, t: number) => void, reverb = false): void {
    this.eng.record(name);
    const ctx = this.eng.ctx, d = this.dest();
    if (!ctx || !d) return;
    try {
      fn(ctx, d, ctx.currentTime + 0.005);
      if (reverb && this.eng.reverbSend) fn(ctx, this.eng.reverbSend, ctx.currentTime + 0.005);
    } catch {
      /* ignore */
    }
  }

  /** Crowd roar / groan envelopes on the tension gain. */
  crowdSwell(kind: 'roar' | 'groan' | 'ooh', amount = 1): void {
    this.eng.record('crowd' + kind[0].toUpperCase() + kind.slice(1));
    const c = this.crowd, ctx = this.eng.ctx;
    if (!c || !ctx) return;
    const t = ctx.currentTime;
    const g = c.tension.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (kind === 'roar') {
      g.linearRampToValueAtTime(0.75 * amount, t + 0.25);
      g.exponentialRampToValueAtTime(0.12, t + 2.8);
      c.filter.frequency.setTargetAtTime(1300, t, 0.1);
      c.filter.frequency.setTargetAtTime(650, t + 1, 0.8);
    } else if (kind === 'groan') {
      c.filter.frequency.setTargetAtTime(380, t, 0.05);
      g.linearRampToValueAtTime(0.4 * amount, t + 0.2);
      g.exponentialRampToValueAtTime(0.1, t + 1.6);
      c.filter.frequency.setTargetAtTime(650, t + 1, 0.6);
    } else {
      g.linearRampToValueAtTime(0.3, t + 0.15);
      g.exponentialRampToValueAtTime(0.1, t + 1.0);
    }
  }

  /** −8 dB for 300 ms under the bat crack. */
  duckCrowd(): void {
    this.eng.record('crowdDuck');
    const c = this.crowd, ctx = this.eng.ctx;
    if (!c || !ctx) return;
    const t = ctx.currentTime;
    const k = Math.pow(10, -TUNING.audio.crowdDuckDb / 20);
    c.duck.gain.cancelScheduledValues(t);
    c.duck.gain.setValueAtTime(k, t);
    c.duck.gain.setValueAtTime(k, t + TUNING.audio.crowdDuckMs / 1000);
    c.duck.gain.linearRampToValueAtTime(1, t + TUNING.audio.crowdDuckMs / 1000 + 0.12);
  }

  setTension(x: number): void {
    const c = this.crowd, ctx = this.eng.ctx;
    if (!c || !ctx) return;
    c.tension.gain.setTargetAtTime(0.08 + 0.22 * x, ctx.currentTime, 0.8);
  }

  frame(s: GameState): void {
    this.ensureCrowd();
    this.setTension(leverage(s));
  }

  onEvent(e: SimEvent, s: GameState): void {
    const human = humanBatter(s) !== null;
    switch (e.type) {
      case 'paStart': {
        const ch = ROSTER_BY_ID[e.batter];
        if (ch) this.play('walkup', (c, d, t) => walkup(c, d, t, ch.motifSeed));
        break;
      }
      case 'pitchReleased':
        this.zz('whip');
        if (e.star) this.zz('starTell', 0, false);
        break;
      case 'swing':
        this.zz('swish');
        break;
      case 'contact': {
        const layer = e.grade === 'PERFECT' ? 'sweet' : e.grade === 'GOOD' ? 'solid' : e.grade === 'JAMMED' ? 'jam' : 'weak';
        this.crackVariant = this.eng.variants.pick('crack', 3);
        this.play('crack', (c, d, t) => crack(c, d, t, e.ev, layer, this.crackVariant));
        if (e.grade === 'PERFECT') this.eng.record('crackSweet');
        this.duckCrowd();
        if (e.grade === 'PERFECT') this.crowdSwell('roar', 0.8);
        else if (e.grade === 'GOOD') this.crowdSwell('ooh');
        else if (e.grade === 'TOPPED') this.zz('thud');
        else if (e.grade === 'UNDER') this.zz('pop');
        else if (e.grade === 'FOUL') this.zz('tick');
        break;
      }
      case 'whiff':
        this.crowdSwell('ooh');
        break;
      case 'mittPop':
        this.play('mitt', (c, d, t) => mitt(c, d, t, e.strikeout ? 1.2 : 0.9));
        break;
      case 'take':
        if (e.call === 'strike') this.zz('strike', TUNING.audio.strikeStepSemis * s.strikes, false);
        else this.zz('ball');
        break;
      case 'strikeout':
        this.play('organ', (c, d, t) => stinger(c, d, t, 'strikeout'));
        if (human) this.crowdSwell('groan');
        else this.crowdSwell('roar', 0.6);
        break;
      case 'hit':
        this.hitStreak++;
        this.zz('streak', TUNING.audio.streakStepSemis * (this.hitStreak - 1), false);
        break;
      case 'out':
        this.hitStreak = 0;
        this.zz('out');
        if (human) this.crowdSwell('groan', 0.6);
        break;
      case 'homeRun':
        this.play('organ', (c, d, t) => stinger(c, d, t, 'homer'));
        this.play('chime', (c, d, t) => chime(c, d, t, [84, 79, 76]), true);
        this.crowdSwell('roar', 1);
        break;
      case 'starEarned':
        this.zz('star');
        break;
      case 'starChance':
        this.play('organ', (c, d, t) => stinger(c, d, t, 'charge'));
        break;
      case 'walk':
      case 'halfEnd':
      case 'handoff':
        this.play('chime', (c, d, t) => chime(c, d, t), true);
        break;
      case 'walkoff':
        this.crowdSwell('roar', 1.2);
        break;
      case 'gameOver':
        this.play('organ', (c, d, t) => stinger(c, d, t, e.winner === 0 || s.cfg.humanBat[e.winner] !== null ? 'win' : 'lose'));
        break;
      case 'throwPrompt':
      case 'sendHoldPrompt':
        this.zz('click', 0, false);
        break;
      case 'derbyScore':
        if (e.streak > 1) this.zz('streak', e.streak, false);
        break;
    }
  }
}
