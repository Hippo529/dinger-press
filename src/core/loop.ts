// Fixed-timestep accumulator with a 250 ms clamp, time-scale (hit-stop/slow-mo) and render alpha.
// Also maps input timestamps (wall clock) to sim time so swings are judged at their exact time.

export const DT = 1 / 120;
export const MAX_FRAME = 0.25;

export interface Steppable {
  step(dt: number): void;
  /** Return true to stop stepping for the rest of this frame (e.g. hit-stop requested). */
  afterStep(): boolean;
  simTime(): number;
}

export class FixedLoop {
  acc = 0; // accumulated SIM seconds not yet stepped
  steps = 0;
  /** Clock anchor: wall ms ↔ sim seconds at the end of the last frame. */
  anchorWall = 0;
  anchorSim = 0;
  anchorScale = 1;

  /**
   * Advance by `realDt` seconds of wall time at time-scale `scale`. Returns steps taken.
   * The real frame is clamped to 250 ms (spiral-of-death guard).
   */
  advance(target: Steppable, realDt: number, scale: number, wallNowMs: number): number {
    const dt = Math.min(MAX_FRAME, Math.max(0, realDt));
    this.acc += dt * scale;
    let n = 0;
    while (this.acc >= DT - 1e-12) {
      target.step(DT);
      this.acc -= DT;
      n++;
      if (target.afterStep()) {
        this.acc = Math.min(this.acc, DT * 0.5);
        break;
      }
    }
    this.steps += n;
    this.anchorWall = wallNowMs;
    this.anchorSim = target.simTime() + this.acc;
    this.anchorScale = scale;
    return n;
  }

  /** Interpolation alpha in [0,1). */
  alpha(): number {
    return Math.max(0, Math.min(1, this.acc / DT));
  }

  /** Map an event timestamp (ms, performance.now() base) to sim seconds. */
  toSim(eventMs: number, testMode: boolean, simNow: number): number {
    if (testMode) return simNow;
    const t = this.anchorSim + ((eventMs - this.anchorWall) / 1000) * this.anchorScale;
    // Events from the previous frame map to sim times the sim has already stepped past. That is fine:
    // swings are graded analytically at their own timestamp. Only bound it to a sane window.
    return Math.max(simNow - MAX_FRAME, Math.min(simNow + MAX_FRAME, t));
  }

  reset(simNow: number, wallNowMs: number): void {
    this.acc = 0;
    this.anchorSim = simNow;
    this.anchorWall = wallNowMs;
    this.anchorScale = 1;
  }
}
