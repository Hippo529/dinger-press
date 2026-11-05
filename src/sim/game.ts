// The Sim: owns GameState, seeded RNG, the timestamped action queue and the phase machine.
import { TUNING } from '../config/tuning';
import { ROSTER_BY_ID } from '../config/roster';
import { Rng } from '../core/rng';
import { doSwing, enterPrePitch, releasePitch, startWindup, stepPitch } from './atbat';
import type { Ctx } from './ctx';

import { afterCelebrate, afterDead, endPlay, handoffReady, nextHalf } from './flow';
import { applySendHold, humanThrow, stepPlay } from './play';
import { stepRunners } from './running';
import {
  battingTeam, createState, fieldingTeam, humanBatter, humanPitcher, makeFielders, makeRunner, type GameState, type ModeConfig,
} from './state';
import type { Action, SimEvent } from './types';

type Queued = Action & { t: number; seq: number };

export class Sim {
  s: GameState;
  rng: Rng;
  private queue: Queued[] = [];
  private seq = 0;
  private events: SimEvent[] = [];
  /** Every applied action with its sim time (for replay / determinism tests). */
  readonly inputLog: Queued[] = [];
  readonly ctx: Ctx;

  constructor(cfg: ModeConfig) {
    this.rng = new Rng(cfg.seed);
    this.s = createState(cfg);
    this.ctx = { s: this.s, rng: this.rng, emit: (e) => this.events.push(e) };
    this.start();
  }

  private start(): void {
    const s = this.s;
    const cfg = s.cfg;
    if (cfg.clutch) {
      const cl = cfg.clutch;
      s.inning = cl.inning;
      s.half = cl.half;
      s.outs = cl.outs;
      s.balls = cl.balls;
      s.strikes = cl.strikes;
      const humanTeam = cfg.humanBat[0] !== null ? 0 : 1;
      s.teams[humanTeam].runs = cl.scoreHuman;
      s.teams[humanTeam === 0 ? 1 : 0].runs = cl.scoreCpu;
      s.fielders = makeFielders(cfg.teams[fieldingTeam(s)]);
      const bt = s.teams[battingTeam(s)];
      cl.bases.forEach((on, i) => {
        if (!on) return;
        const id = bt.setup.lineup[(bt.order + 4 - i) % bt.setup.lineup.length];
        const r = makeRunner(s, id, i + 1, false);
        r.target = i + 1;
        s.runners.push(r);
      });
      s.clutchStartRuns = s.teams[battingTeam(s)].runs;
      s.teams[humanTeam].stars = 1;
    }
    if (cfg.mill) {
      const n = cfg.players.length;
      s.mill = { player: 0, outs: 0, scores: new Array(n).fill(0), streak: 0, bestStreak: new Array(n).fill(0), longest: new Array(n).fill(0), queue: [...Array(n).keys()], qi: 0, round: 1, round1: null };
    }
    enterPrePitch(this.ctx, true);
  }

  /** Queue an action at sim time `t` (defaults to now). */
  act(a: Action): void {
    const q = { ...a, t: a.t ?? this.s.time, seq: this.seq++ } as Queued;
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].t > q.t) i--;
    this.queue.splice(i, 0, q);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(dt: number): void {
    const s = this.s;
    s.time += dt;
    while (this.queue.length && this.queue[0].t <= s.time + 1e-9) {
      const a = this.queue.shift()!;
      this.inputLog.push(a);
      this.handle(a);
    }
    this.update(dt);
  }

  private handle(a: Queued): void {
    const s = this.s;
    const c = this.ctx;
    const hb = humanBatter(s);
    const hp = humanPitcher(s);
    const prePhase = s.phase === 'prePitch' || s.phase === 'windup';
    switch (a.type) {
      case 'swing':
        if (hb === null || s.phase !== 'pitch') return;
        doSwing(c, { t: a.t, offsetMs: 0, grade: null, power: s.power, star: s.starArmed, zx: a.zx ?? s.aim.x, zz: a.zz ?? s.aim.z, dirV: a.dirV ?? 0, dirH: a.dirH ?? 0 });
        return;
      case 'aim':
        s.aim = { x: a.zx, z: a.zz };
        return;
      case 'togglePower':
        if (hb !== null && prePhase) s.power = !s.power;
        return;
      case 'useStar': {
        if (!prePhase) return;
        const team = hb !== null ? battingTeam(s) : hp !== null ? fieldingTeam(s) : null;
        if (team === null) return;
        if (s.starArmed) s.starArmed = false;
        else if (s.teams[team].stars > 0) s.starArmed = true;
        return;
      }
      case 'selectPitch': {
        if (hp === null || s.phase !== 'prePitch') return;
        const n = ROSTER_BY_ID[s.teams[fieldingTeam(s)].setup.pitcherId].pitches.length;
        if (a.index >= 0 && a.index < n) s.pitchSel = a.index;
        return;
      }
      case 'chargeStart':
        if (hp === null || s.phase !== 'prePitch') return;
        s.pitchAim = { x: a.zx, z: a.zz };
        if (s.cfg.assistPitch) {
          s.chargeLevel = (TUNING.pitch.sweetLo + TUNING.pitch.sweetHi) / 2;
          startWindup(c);
        } else {
          s.charging = true;
          s.chargeStartT = a.t;
        }
        return;
      case 'chargeMove':
        if (hp !== null && s.charging) s.pitchAim = { x: a.zx, z: a.zz };
        return;
      case 'chargeEnd':
        if (hp === null || !s.charging || s.phase !== 'prePitch') return;
        if (a.zx !== undefined && a.zz !== undefined) s.pitchAim = { x: a.zx, z: a.zz };
        s.chargeLevel = (a.t - s.chargeStartT) / TUNING.pitch.chargeFillS;
        s.charging = false;
        startWindup(c);
        return;
      case 'steer':
        if (hp === null) return;
        if (a.hold !== undefined) s.steerInput = a.hold;
        else if (s.phase === 'pitch' && s.pitch) {
          const ps = s.pitch;
          if (ps.t / ps.T <= TUNING.pitch.steerUntilS) ps.steer = Math.max(-ps.steerBudget, Math.min(ps.steerBudget, ps.steer + a.dx));
        }
        return;
      case 'throwTo':
        if (hp !== null && s.phase === 'live') humanThrow(c, a.base);
        return;
      case 'sendHold':
        if (hb !== null && s.phase === 'live') applySendHold(c, a.send);
        return;
      case 'ready':
        handoffReady(c);
        return;
      case 'skip':
        this.skip();
        return;
    }
  }

  private skip(): void {
    const s = this.s;
    const c = this.ctx;
    if (s.phase === 'celebrate') return afterCelebrate(c);
    if (s.phase === 'halfEnd') return nextHalf(c);
    if (s.phase === 'dead' && s.time - s.phaseT > 0.15) return afterDead(c);
    if (s.phase === 'live' && s.play?.hr && s.time - s.play.startT > 0.3) {
      const last = s.play.pred.samples[s.play.pred.samples.length - 1];
      s.last.dist = Math.round(Math.hypot(last.x, last.y) * 1.04 + 8);
      if (s.ball) {
        s.ball.p = { x: last.x, y: last.y, z: last.z };
        s.ball.hr = true;
      }
      return endPlay(c, 'hr');
    }
    if (s.phase === 'prePitch' && humanPitcher(s) === null && s.time - s.phaseT < s.cpuPrePitchS) s.cpuPrePitchS = Math.min(s.cpuPrePitchS, s.time - s.phaseT + 0.2);
  }

  private update(dt: number): void {
    const s = this.s;
    const c = this.ctx;
    const el = s.time - s.phaseT;
    switch (s.phase) {
      case 'prePitch':
        if (humanPitcher(s) === null && el >= s.cpuPrePitchS) startWindup(c);
        break;
      case 'windup':
        if (el >= (humanPitcher(s) !== null ? 0.3 : TUNING.pitch.windupS)) releasePitch(c);
        break;
      case 'pitch':
        stepPitch(c, dt);
        break;
      case 'live':
        stepPlay(c, dt);
        break;
      case 'dead':
        if (el >= s.deadDur) afterDead(c);
        break;
      case 'celebrate': {
        for (const r of s.runners) if (!r.out && !r.scored) r.target = 4;
        const trot = s.runners.map((r) => r.speed);
        s.runners.forEach((r) => (r.speed *= TUNING.running.trotMult * 1.8));
        stepRunners(s.runners, dt, s.time);
        s.runners.forEach((r, i) => (r.speed = trot[i]));
        if (el >= TUNING.flow.celebrateS) afterCelebrate(c);
        break;
      }
      case 'halfEnd':
        if (el >= TUNING.flow.halfEndS) nextHalf(c);
        break;
      case 'handoff':
      case 'gameOver':
        break;
    }
  }

  /** Stable hash of the gameplay-relevant state (determinism tests). */
  hash(): string {
    const s = this.s;
    const core = {
      t: Math.round(s.time * 1000), ph: s.phase, i: s.inning, h: s.half, o: s.outs, b: s.balls, k: s.strikes,
      r: s.teams.map((t) => [t.runs, t.hits, t.stars, t.order, Math.round(t.arm.stamina)]),
      rn: s.runners.map((r) => [r.charId, r.base, r.out, r.scored]), last: s.last, rng: this.rng.state, w: s.winner,
    };
    const str = JSON.stringify(core);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
}


