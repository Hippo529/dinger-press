// One lazily-created AudioContext, master/sfx/crowd buses, convolver reverb with a generated IR,
// iOS unlock + audio-session handling, and a debug event log of every sound triggered.
import { TUNING } from '../config/tuning';
import { ZZFX_RATE, zzfxBuild } from './zzfx';

export interface LogEntry {
  name: string;
  t: number; // performance.now() ms
  rate?: number;
}

export function semis(s: number): number {
  return Math.pow(2, s / 12);
}

/** Picks a variant index that is never the same as the last one (when n > 1). */
export class VariantPicker {
  private last = new Map<string, number>();
  private seed = 1;
  pick(key: string, n: number): number {
    if (n <= 1) return 0;
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    let i = this.seed % n;
    if (i === this.last.get(key)) i = (i + 1) % n;
    this.last.set(key, i);
    return i;
  }
  /** Random pitch shift within ±range semitones → playback rate. */
  rate(range: number): number {
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    const u = (this.seed / 4294967296) * 2 - 1;
    return semis(u * range);
  }
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  crowdBus: GainNode | null = null;
  reverbSend: GainNode | null = null;
  readonly log: LogEntry[] = [];
  readonly variants = new VariantPicker();
  muted = false;
  volume = TUNING.audio.master;
  private zz = new Map<string, AudioBuffer>();
  unlocked = false;
  silentModeAudio = false;
  private silentEl: HTMLAudioElement | null = null;

  record(name: string, rate?: number): void {
    this.log.push({ name, t: performance.now(), rate });
    if (this.log.length > 400) this.log.splice(0, 100);
  }

  /** Create context on demand. Never at import time (iOS). */
  ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.applySession();
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.crowdBus = ctx.createGain();
      this.crowdBus.gain.value = 0.5;
      this.crowdBus.connect(this.master);
      const conv = ctx.createConvolver();
      conv.buffer = this.makeImpulse(ctx, 1.6, 2.4);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.25;
      this.reverbSend.connect(conv).connect(this.master);
      return ctx;
    } catch {
      return null;
    }
  }

  /** Generated impulse response: exponentially decaying stereo noise ("big stadium"). */
  makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 12345;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /** Called synchronously inside the first pointerdown/keydown (and after visibility returns). */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      if (ctx.state !== 'running') void ctx.resume();
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(0);
      if (this.silentModeAudio) this.silentElementUnlock();
      if (!this.unlocked) this.record('unlock');
      this.unlocked = true;
    } catch {
      /* ignore */
    }
  }

  suspend(): void {
    try {
      void this.ctx?.suspend();
    } catch {
      /* ignore */
    }
  }

  /** navigator.audioSession: 'ambient' respects the ringer switch, 'playback' ignores it. */
  applySession(): void {
    applyAudioSession(typeof navigator !== 'undefined' ? navigator : null, this.silentModeAudio);
  }

  private silentElementUnlock(): void {
    try {
      if (!this.silentEl) {
        const el = document.createElement('audio');
        el.setAttribute('x-webkit-airplay', 'deny');
        el.preload = 'auto';
        el.loop = true;
        // 0.1 s of silence as a WAV data URI (generated, not an asset file)
        el.src = silentWavUri();
        this.silentEl = el;
      }
      void this.silentEl.play().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  /** Play (and cache) a ZzFX one-shot. */
  zzfx(name: string, params: (number | undefined)[], rate = 1, gain = 1, reverb = 0.15): void {
    this.record(name, rate);
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    try {
      let buf = this.zz.get(name);
      if (!buf) {
        const data = zzfxBuild(...params) as Float32Array;
        buf = ctx.createBuffer(1, data.length, ZZFX_RATE);
        buf.getChannelData(0).set(data);
        this.zz.set(name, buf);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.sfx);
      if (reverb > 0 && this.reverbSend) {
        const r = ctx.createGain();
        r.gain.value = reverb;
        g.connect(r).connect(this.reverbSend);
      }
      src.start();
    } catch {
      /* ignore */
    }
  }
}

export function applyAudioSession(nav: Navigator | null, silentModeAudio: boolean): string | null {
  try {
    const sess = (nav as unknown as { audioSession?: { type: string } } | null)?.audioSession;
    if (!sess) return null;
    sess.type = silentModeAudio ? 'playback' : 'ambient';
    return sess.type;
  } catch {
    return null;
  }
}

function silentWavUri(): string {
  const n = 4410;
  const bytes = new Uint8Array(44 + n * 2);
  const v = new DataView(bytes.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true);
  v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'data:audio/wav;base64,' + btoa(bin);
}
