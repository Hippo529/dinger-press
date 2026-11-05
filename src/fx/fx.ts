// Game-feel controller driven by sim events: hit-stop, trauma shake, slow-mo, zoom punch,
// flash governor and the misregistration jolt. All times here are REAL seconds.
import { TUNING } from '../config/tuning';
import { easeOutCubic } from '../core/easing';
import type { Grade, SimEvent } from '../sim/types';

export interface FxSettings {
  reduceMotion: boolean;
  shakePct: 0 | 50 | 100;
  flashes: boolean;
  slowmo: boolean;
}

export interface GradeFeedback {
  label: string;
  hitstopMs: number;
  trauma: number;
  particles: number;
  sounds: string[];
  popup: string;
  color: 'sun' | 'teal' | 'paper' | 'pink' | 'ink';
}

/** One table, so the same grade always produces the same feedback. */
export function gradeFeedback(g: Grade): GradeFeedback {
  const h = TUNING.hitstop, sk = TUNING.shake, p = TUNING.particles;
  const table: Record<Grade, GradeFeedback> = {
    PERFECT: { label: 'PERFECT', hitstopMs: h.perfectMs, trauma: sk.perfect, particles: p.burstMax, sounds: ['crack', 'crackSweet', 'crowdRoar'], popup: 'PERFECT!', color: 'sun' },
    GOOD: { label: 'GOOD', hitstopMs: h.goodMs, trauma: sk.good, particles: 15, sounds: ['crack', 'crowdUp'], popup: 'GOOD', color: 'teal' },
    EARLY: { label: 'EARLY', hitstopMs: h.weakMs, trauma: 0.08, particles: p.burstMin + 1, sounds: ['crackWeak'], popup: 'EARLY', color: 'paper' },
    LATE: { label: 'LATE', hitstopMs: h.weakMs, trauma: 0.08, particles: p.burstMin + 1, sounds: ['crackWeak'], popup: 'LATE', color: 'paper' },
    JAMMED: { label: 'JAMMED', hitstopMs: h.weakMs, trauma: 0.1, particles: p.burstMin, sounds: ['crackJam'], popup: 'JAMMED', color: 'pink' },
    TOPPED: { label: 'TOPPED', hitstopMs: h.weakMs, trauma: 0.06, particles: p.burstMin, sounds: ['crackWeak', 'thud'], popup: 'TOPPED', color: 'paper' },
    UNDER: { label: 'UNDER', hitstopMs: h.weakMs, trauma: 0.06, particles: p.burstMin, sounds: ['crackWeak', 'pop'], popup: 'UNDER', color: 'paper' },
    FOUL: { label: 'FOUL', hitstopMs: h.weakMs, trauma: 0.05, particles: p.burstMin, sounds: ['tick'], popup: 'FOUL', color: 'paper' },
    WHIFF: { label: 'WHIFF', hitstopMs: 0, trauma: 0, particles: 0, sounds: ['whoosh'], popup: 'WHIFF', color: 'pink' },
  };
  return table[g];
}

export class FlashGovernor {
  private times: number[] = [];
  count = 0;
  /** Returns true if a flash may fire at real time `t` (≤ maxPerSecond in any 1 s window). */
  request(t: number): boolean {
    this.times = this.times.filter((x) => t - x < 1);
    if (this.times.length >= TUNING.flash.maxPerSecond) return false;
    this.times.push(t);
    this.count++;
    return true;
  }
}

// Smooth value noise for shake channels.
function noise1(seed: number, t: number): number {
  const i = Math.floor(t), f = t - i;
  const h = (n: number) => {
    const x = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

export class Fx {
  settings: FxSettings = { reduceMotion: false, shakePct: 100, flashes: true, slowmo: true };
  now = 0; // real seconds
  hitstopLeft = 0;
  hitstopEndedAt = -99;
  pendingHitstop = 0; // ms, activated at the start of the frame AFTER the contact frame rendered
  contactFrameRendered = 0; // frames rendered between contact and freeze (tests assert ≥1)
  vibrate = 0; // 0..1 decays during freeze
  trauma = 0;
  slowStart = -99;
  punchT = -99;
  punchActive = false;
  flash = { alpha: 0, until: 0, start: 0 };
  readonly gov = new FlashGovernor();
  misregT = -99;
  noShakeWindow = false; // true between release and contact
  stillBanner = ''; // reduce-motion replacement for slow-mo
  stillUntil = 0;
  lastFeedback: GradeFeedback | null = null;
  slowCount = 0;

  /** Called once per frame before stepping the sim. */
  beginFrame(realDt: number): void {
    this.now += realDt;
    if (this.pendingHitstop > 0) {
      this.hitstopLeft = Math.min(this.pendingHitstop, TUNING.hitstop.capMs) / 1000;
      this.pendingHitstop = 0;
      this.vibrate = 1;
      this.punchActive = !this.settings.reduceMotion;
    } else if (this.hitstopLeft > 0) {
      this.hitstopLeft -= realDt;
      if (this.hitstopLeft <= 0) {
        this.hitstopLeft = 0;
        this.hitstopEndedAt = this.now;
        if (this.punchActive) this.punchT = this.now;
        this.punchActive = false;
      }
    }
    this.vibrate = Math.max(0, this.vibrate - realDt / Math.max(0.04, TUNING.hitstop.perfectMs / 1000));
    this.trauma = Math.max(0, this.trauma - TUNING.shake.decayPerS * realDt);
  }

  /** Marks that a frame was drawn (lets hit-stop start strictly after the contact frame). */
  frameRendered(): void {
    if (this.pendingHitstop > 0) this.contactFrameRendered++;
  }

  timeScale(): number {
    if (this.hitstopLeft > 0) return 0;
    if (this.now < this.stillUntil) return 0;
    const sm = TUNING.slowmo;
    const el = this.now - this.slowStart;
    if (el >= 0 && el < sm.holdS) return sm.scale;
    if (el >= sm.holdS && el < sm.holdS + sm.easeS) return sm.scale + (1 - sm.scale) * easeOutCubic((el - sm.holdS) / sm.easeS);
    return 1;
  }

  slowmoActive(): boolean {
    const el = this.now - this.slowStart;
    return el >= 0 && el < TUNING.slowmo.holdS + TUNING.slowmo.easeS;
  }

  skipSlowmo(): void {
    if (this.slowmoActive()) this.slowStart = -99;
    this.stillUntil = 0;
  }

  addTrauma(x: number): void {
    if (this.noShakeWindow) return;
    this.trauma = Math.min(1, this.trauma + x);
  }

  hitstop(ms: number): void {
    if (ms <= 0) return;
    this.pendingHitstop = Math.max(this.pendingHitstop, ms);
    this.contactFrameRendered = 0;
  }

  private startSlowmo(): void {
    if (this.settings.reduceMotion || !this.settings.slowmo) {
      // Still freeze + banner instead of slow-mo.
      this.stillUntil = this.now + 0.3;
      this.stillBanner = 'HOME RUN';
      return;
    }
    this.slowStart = this.now;
    this.slowCount++;
  }

  private doFlash(alpha: number, dur: number): void {
    if (!this.settings.flashes || this.settings.reduceMotion) return;
    if (!this.gov.request(this.now)) return;
    this.flash = { alpha: Math.min(alpha, TUNING.flash.homerAlpha), start: this.now, until: this.now + dur };
  }

  onEvent(e: SimEvent, ctx: { hrPredicted: boolean }): void {
    const sk = TUNING.shake;
    switch (e.type) {
      case 'pitchReleased':
        this.noShakeWindow = true;
        break;
      case 'contact': {
        this.noShakeWindow = false;
        const fb = gradeFeedback(e.grade);
        this.lastFeedback = fb;
        this.hitstop(fb.hitstopMs);
        this.addTrauma(fb.trauma);
        if (e.grade === 'PERFECT' || (e.ev >= 100 && e.grade === 'GOOD')) this.misregT = this.now;
        if (ctx.hrPredicted) this.startSlowmo();
        break;
      }
      case 'whiff':
      case 'take':
        this.noShakeWindow = false;
        break;
      case 'mittPop':
        this.noShakeWindow = false;
        if (e.strikeout) this.hitstop(TUNING.hitstop.strikeoutMs);
        this.addTrauma(sk.mittPop);
        break;
      case 'homeRun':
        this.addTrauma(e.walkoff ? sk.walkoff : sk.homer);
        this.doFlash(TUNING.flash.homerAlpha, 0.18);
        this.misregT = this.now;
        break;
      case 'walkoff':
        this.addTrauma(sk.walkoff);
        this.startSlowmo();
        break;
      case 'caught':
        if (e.diving) this.addTrauma(0.15);
        break;
    }
  }

  /** World-layer shake offset (px, px, radians). Zero when Reduce Motion or 0%. */
  shake(shortSide: number): { x: number; y: number; roll: number } {
    const pct = this.settings.reduceMotion ? 0 : this.settings.shakePct / 100;
    const sk = TUNING.shake;
    const amt = Math.pow(this.trauma, sk.exponent) * pct;
    if (amt <= 0) return { x: 0, y: 0, roll: 0 };
    const t = this.now * sk.noiseSpeed;
    return {
      x: amt * sk.maxTransFrac * shortSide * noise1(1, t),
      y: amt * sk.maxTransFrac * shortSide * noise1(2, t),
      roll: (amt * sk.maxRollDeg * Math.PI * noise1(3, t)) / 180,
    };
  }

  /** Camera zoom from the hit-stop punch. */
  zoom(): number {
    if (this.settings.reduceMotion) return 1;
    const z = TUNING.camera.punchZoom;
    if (this.punchActive) return z;
    const el = (this.now - this.punchT) * 1000;
    if (el < TUNING.camera.punchOutMs) return z + (1 - z) * easeOutCubic(el / TUNING.camera.punchOutMs);
    return 1;
  }

  /** Misregistration offset for accent ink layers (px). */
  misreg(): number {
    const el = (this.now - this.misregT) * 1000;
    const base = 1.5;
    if (this.settings.reduceMotion) return base;
    if (el < TUNING.flash.misregJoltMs) return base + (TUNING.flash.misregJoltPx - base) * (1 - el / TUNING.flash.misregJoltMs);
    return base;
  }

  flashAlpha(): number {
    if (this.now >= this.flash.until) return 0;
    return this.flash.alpha * (1 - (this.now - this.flash.start) / (this.flash.until - this.flash.start));
  }

  /** Bat/ball vibration during freeze, px along the bat axis. */
  vibration(): number {
    if (this.hitstopLeft <= 0) return 0;
    return TUNING.hitstop.vibratePx * this.vibrate * Math.sin(this.now * 190);
  }
}
