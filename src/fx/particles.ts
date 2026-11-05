// Pooled screen-space particles + popups. No per-frame allocation: fixed pools, reused slots.
import { TUNING } from '../config/tuning';
import { easeOutBack, easeOutCubic } from '../core/easing';

export interface Particle {
  live: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2; // 0 spark (lighter), 1 dirt/ink blob, 2 confetti
  spin: number;
}

export const POOL_SIZE = 300;

export class Particles {
  readonly pool: Particle[] = [];
  liveCount = 0;
  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) this.pool.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 2, color: '#fff', kind: 0, spin: 0 });
  }
  private cursor = 0;
  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: 0 | 1 | 2, g = 0): boolean {
    if (this.liveCount >= Math.min(POOL_SIZE, TUNING.particles.max)) return false;
    for (let k = 0; k < POOL_SIZE; k++) {
      const i = (this.cursor + k) % POOL_SIZE;
      const p = this.pool[i];
      if (p.live) continue;
      p.live = true;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color; p.kind = kind; p.g = g;
      p.spin = (vx * 0.013) % 6.28;
      this.cursor = (i + 1) % POOL_SIZE;
      this.liveCount++;
      return true;
    }
    return false;
  }
  /** Radial burst; deterministic-ish spread from an index hash (cosmetic only). */
  burst(x: number, y: number, n: number, speed: number, colors: string[], kind: 0 | 1 | 2, g = 0): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.37;
      const sp = speed * (0.55 + ((i * 7) % 10) / 20);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp - speed * 0.2, 0.35 + ((i * 3) % 7) / 20, 2 + (i % 3), colors[i % colors.length], kind, g);
    }
  }
  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.live = false;
        this.liveCount--;
        continue;
      }
      p.vy += p.g * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += dt * 8;
    }
  }
  clear(): void {
    for (const p of this.pool) p.live = false;
    this.liveCount = 0;
  }
}

export interface Popup {
  live: boolean;
  text: string;
  sub: string;
  x: number;
  y: number;
  born: number;
  color: string;
  size: number;
}

export function popupTotalMs(): number {
  const p = TUNING.popup;
  return p.inMs + p.holdMs + p.fadeMs;
}

/** Popup transform at age (ms): scale, dy, alpha. Total < 1 s. */
export function popupAt(ageMs: number): { scale: number; dy: number; alpha: number } {
  const p = TUNING.popup;
  const inK = Math.min(1, ageMs / p.inMs);
  const scale = easeOutBack(inK);
  const drift = Math.min(1, ageMs / (p.inMs + p.holdMs));
  const dy = -p.driftPx * easeOutCubic(drift);
  const fadeStart = p.inMs + p.holdMs;
  const alpha = ageMs < fadeStart ? 1 : Math.max(0, 1 - (ageMs - fadeStart) / p.fadeMs);
  return { scale, dy, alpha };
}

export class Popups {
  readonly pool: Popup[] = [];
  constructor() {
    for (let i = 0; i < 12; i++) this.pool.push({ live: false, text: '', sub: '', x: 0, y: 0, born: 0, color: '#fff', size: 32 });
  }
  add(text: string, sub: string, x: number, y: number, now: number, color: string, size = 34): void {
    let slot = this.pool.find((p) => !p.live);
    if (!slot) slot = this.pool.reduce((a, b) => (a.born < b.born ? a : b));
    slot.live = true; slot.text = text; slot.sub = sub; slot.x = x; slot.y = y; slot.born = now; slot.color = color; slot.size = size;
  }
  update(now: number): void {
    for (const p of this.pool) if (p.live && (now - p.born) * 1000 > popupTotalMs()) p.live = false;
  }
}
