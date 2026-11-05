// Pure helpers for the ball: squash/stretch (area-preserving) and a fixed 12-point trail ring.
import { TUNING } from '../config/tuning';

export const TRAIL_N = 12;

export class TrailRing {
  readonly buf = new Float32Array(TRAIL_N * 2);
  head = 0;
  n = 0;
  push(x: number, y: number): void {
    this.buf[this.head * 2] = x;
    this.buf[this.head * 2 + 1] = y;
    this.head = (this.head + 1) % TRAIL_N;
    this.n = Math.min(TRAIL_N, this.n + 1);
  }
  clear(): void {
    this.n = 0;
  }
  /** i-th oldest point (0 = oldest). */
  at(i: number): [number, number] {
    const k = (this.head - this.n + i + TRAIL_N * 2) % TRAIL_N;
    return [this.buf[k * 2], this.buf[k * 2 + 1]];
  }
}

/** Squash factor along the motion axis: sx along velocity, sy = 1/sx (area preserved). */
export function squash(speedPx: number, radiusPx: number, contactAgeS: number): { sx: number; sy: number } {
  let sx = 1;
  if (contactAgeS >= 0 && contactAgeS < (TUNING.squash.contactFrames + 0.05) / 60) {
    // contact squash is the brief's exact 0.7×/1.3× across the bat normal (1–2 frames)
    return { sx: TUNING.squash.ballContact[0], sy: TUNING.squash.ballContact[1] };
  } else if (speedPx > radiusPx * 1.2) sx = Math.min(TUNING.squash.stretchMax, 1 + speedPx / (radiusPx * 12));
  return { sx, sy: 1 / sx };
}
