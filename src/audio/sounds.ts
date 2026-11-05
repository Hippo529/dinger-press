// Hand-built Web Audio graphs. Every builder takes a BaseAudioContext so tests can render offline.
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (b) return b;
  const len = Math.floor(ctx.sampleRate * 2);
  b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 99, last = 0;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 4294967296) * 2 - 1;
    last = 0.97 * last + 0.03 * white; // pinkish blend
    d[i] = white * 0.6 + last * 3;
  }
  noiseCache.set(ctx, b);
  return b;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Bat crack: bandpassed noise burst + low "thock"; brighter and louder with exit velocity. */
export function crack(ctx: BaseAudioContext, dest: AudioNode, t: number, ev: number, layer: 'sweet' | 'solid' | 'weak' | 'jam', variant = 0): void {
  const k = Math.max(0, Math.min(1, (ev - 55) / 60));
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = (layer === 'weak' ? 900 : 1300) + k * 2600 + variant * 180;
  bp.Q.value = layer === 'sweet' ? 2.2 : 1.1;
  const g = ctx.createGain();
  env(g, t, 0.25 + 0.75 * k, 0.002, layer === 'weak' ? 0.05 : 0.09 + 0.05 * k);
  src.connect(bp).connect(g).connect(dest);
  src.start(t, variant * 0.3, 0.3);
  // thock
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(layer === 'jam' ? 70 : 150, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
  const og = ctx.createGain();
  env(og, t, layer === 'weak' ? 0.3 : 0.6, 0.002, 0.11);
  o.connect(og).connect(dest);
  o.start(t);
  o.stop(t + 0.2);
  if (layer === 'sweet') {
    const p = ctx.createOscillator();
    p.type = 'triangle';
    p.frequency.value = 2350;
    const pg = ctx.createGain();
    env(pg, t + 0.005, 0.22, 0.002, 0.25);
    p.connect(pg).connect(dest);
    p.start(t);
    p.stop(t + 0.35);
  }
  if (layer === 'jam') {
    const b = ctx.createOscillator();
    b.type = 'sawtooth';
    b.frequency.value = 64;
    const bg = ctx.createGain();
    env(bg, t, 0.18, 0.002, 0.18);
    b.connect(bg).connect(dest);
    b.start(t);
    b.stop(t + 0.25);
  }
}

/** Mitt pop: short low-mid noise slap + body. */
export function mitt(ctx: BaseAudioContext, dest: AudioNode, t: number, loud: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1700;
  const g = ctx.createGain();
  env(g, t, 0.5 * loud, 0.001, 0.07);
  src.connect(lp).connect(g).connect(dest);
  src.start(t, 0.7, 0.15);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
  const og = ctx.createGain();
  env(og, t, 0.4 * loud, 0.001, 0.08);
  o.connect(og).connect(dest);
  o.start(t);
  o.stop(t + 0.12);
}

const DRAWBARS: [number, number][] = [[0.5, 0.55], [1, 1], [1.5, 0.45], [2, 0.6], [3, 0.3], [4, 0.25]];
/** Ballpark organ note: summed sines at drawbar ratios with vibrato. */
export function organNote(ctx: BaseAudioContext, dest: AudioNode, t: number, freq: number, dur: number, vol = 0.12): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.setValueAtTime(vol, t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  g.connect(dest);
  const vib = ctx.createOscillator();
  vib.frequency.value = 6.2;
  const vg = ctx.createGain();
  vg.gain.value = freq * 0.004;
  vib.connect(vg);
  for (const [ratio, amp] of DRAWBARS) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * ratio;
    vg.connect(o.frequency);
    const a = ctx.createGain();
    a.gain.value = amp / 3;
    o.connect(a).connect(g);
    o.start(t);
    o.stop(t + dur + 0.12);
  }
  vib.start(t);
  vib.stop(t + dur + 0.12);
}

export const NOTE = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export const STINGERS: Record<string, [number, number][]> = {
  charge: [[67, 0.14], [72, 0.14], [76, 0.14], [79, 0.28], [76, 0.14], [79, 0.5]],
  homer: [[72, 0.12], [76, 0.12], [79, 0.12], [84, 0.5]],
  strikeout: [[72, 0.12], [71, 0.12], [70, 0.12], [69, 0.45]],
  win: [[67, 0.15], [72, 0.15], [76, 0.15], [79, 0.15], [84, 0.6]],
  lose: [[67, 0.2], [66, 0.2], [65, 0.2], [64, 0.7]],
  rally: [[72, 0.1], [74, 0.1], [76, 0.1], [77, 0.1], [79, 0.3]],
};
export function stinger(ctx: BaseAudioContext, dest: AudioNode, t: number, name: string, transpose = 0): number {
  const seq = STINGERS[name] ?? STINGERS.charge;
  let at = t;
  for (const [n, d] of seq) {
    organNote(ctx, dest, at, NOTE(n + transpose), d * 0.9);
    at += d;
  }
  return at - t;
}

/** PA chime: two bell partials, long decay (sent to reverb by the caller). */
export function chime(ctx: BaseAudioContext, dest: AudioNode, t: number, notes: number[] = [81, 76]): void {
  notes.forEach((n, i) => {
    const at = t + i * 0.32;
    for (const [ratio, amp] of [[1, 0.3], [2.76, 0.08], [5.4, 0.03]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = NOTE(n) * ratio;
      const g = ctx.createGain();
      env(g, at, amp, 0.004, 1.1);
      o.connect(g).connect(dest);
      o.start(at);
      o.stop(at + 1.3);
    }
  });
}

/** Procedural walk-up motif: seeded pentatonic phrase on a reedy organ. */
export function walkup(ctx: BaseAudioContext, dest: AudioNode, t: number, seed: number): void {
  const scale = [0, 2, 4, 7, 9, 12, 14];
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const root = 60 + Math.floor(rnd() * 5);
  let at = t;
  for (let i = 0; i < 6; i++) {
    const n = root + scale[Math.floor(rnd() * scale.length)];
    const d = i === 5 ? 0.36 : rnd() > 0.6 ? 0.18 : 0.09;
    organNote(ctx, dest, at, NOTE(n), d * 0.85, 0.07);
    at += d;
  }
}

/** Long-running crowd bed: looped noise → bandpass → LFO gain → tension gain. */
export interface CrowdBed {
  tension: GainNode;
  filter: BiquadFilterNode;
  duck: GainNode;
}
export function crowdBed(ctx: BaseAudioContext, dest: AudioNode): CrowdBed {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 650;
  filter.Q.value = 0.7;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.8;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.17;
  const depth = ctx.createGain();
  depth.gain.value = 0.25;
  lfo.connect(depth).connect(lfoGain.gain);
  const tension = ctx.createGain();
  tension.gain.value = 0.1;
  const duck = ctx.createGain();
  duck.gain.value = 1;
  src.connect(filter).connect(lfoGain).connect(tension).connect(duck).connect(dest);
  src.start();
  lfo.start();
  return { tension, filter, duck };
}

/** Measure RMS and spectral centroid (crude zero-crossing based) of a rendered buffer. */
export function analyse(buf: AudioBuffer): { rms: number; centroid: number } {
  const d = buf.getChannelData(0);
  let sum = 0, zc = 0;
  for (let i = 0; i < d.length; i++) {
    sum += d[i] * d[i];
    if (i && (d[i - 1] < 0) !== (d[i] < 0)) zc++;
  }
  const n = Math.max(1, d.length);
  return { rms: Math.sqrt(sum / n), centroid: (zc / 2) * (buf.sampleRate / n) };
}
