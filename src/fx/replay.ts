// Home-run replay: fixed Float32Array ring of sim snapshots (D6). No video, no allocation per step.
import type { GameState } from '../sim/state';

export const REPLAY_SECONDS = 3;
export const REPLAY_HZ = 120;
export const FRAME_FLOATS = 64;
const FRAMES = REPLAY_SECONDS * REPLAY_HZ;

export class ReplayRing {
  readonly buf = new Float32Array(FRAMES * FRAME_FLOATS);
  head = 0; // next write index
  count = 0;
  active = false;
  playStart = 0; // real time
  playFrames = 0;
  playFrom = 0;

  record(s: GameState): void {
    const o = this.head * FRAME_FLOATS;
    const b = this.buf;
    b[o] = s.time;
    const ball = s.ball;
    if (ball) {
      b[o + 1] = ball.p.x; b[o + 2] = ball.p.y; b[o + 3] = ball.p.z; b[o + 4] = 1;
    } else if (s.pitch) {
      b[o + 4] = 0;
    } else b[o + 4] = -1;
    for (let i = 0; i < 9; i++) {
      const f = s.fielders[i];
      b[o + 5 + i * 2] = f ? f.pos.x : 0;
      b[o + 6 + i * 2] = f ? f.pos.y : 0;
    }
    for (let i = 0; i < 4; i++) {
      const r = s.runners[i];
      const k = o + 23 + i * 3;
      if (r && !r.out && !r.scored) {
        b[k] = r.base; b[k + 1] = r.d; b[k + 2] = 1;
      } else b[k + 2] = 0;
    }
    this.head = (this.head + 1) % FRAMES;
    this.count = Math.min(FRAMES, this.count + 1);
  }

  /** Begin playback of the most recent `seconds`. */
  start(now: number, seconds = 2.2): void {
    this.playFrames = Math.min(this.count, Math.round(seconds * REPLAY_HZ));
    this.playFrom = (this.head - this.playFrames + FRAMES) % FRAMES;
    this.playStart = now;
    this.active = this.playFrames > 10;
  }

  /** Frame offset (float index into buf) for playback at real time `now`, at 0.6× speed, looping. */
  frameAt(now: number): number {
    const k = Math.floor(((now - this.playStart) * REPLAY_HZ * 0.6) % this.playFrames);
    return ((this.playFrom + k) % FRAMES) * FRAME_FLOATS;
  }

  stop(): void {
    this.active = false;
  }
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.active = false;
  }
}
