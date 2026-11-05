// Input layer: raw Pointer/Keyboard events → semantic actions carrying the event timeStamp
// (mapped to sim time). Pointer Events, acting on pointerdown (never click).
import { inRect, padDirection, screenToZone, type Layout } from '../render/layout';
import type { HudButton } from '../render/hud';
import { activeTier, humanBatter, humanPitcher, type GameState } from '../sim/state';
import type { Action } from '../sim/types';

export interface InputHost {
  playing(): boolean;
  state(): GameState | null;
  layout(): Layout;
  buttons(): HudButton[];
  toSim(eventMs: number): number;
  act(a: Action): void;
  pause(): void;
  mute(): void;
  fullscreen(): void;
  firstGesture(): void;
  haptic(): void;
  pressed(id: string): void;
  skip(): void;
  menuBack(): void;
}

export const RETICLE_OFFSET_PX = 56;
export const AIM_OFFSET_PX = 60;

export class Input {
  private held = new Set<string>();
  private drag: { id: number; mode: 'reticle' | 'charge' | 'steer'; lastX: number } | null = null;
  mouseAim: { x: number; z: number } | null = null;
  private spaceCharging = false;
  log: { type: string; t: number }[] = [];

  constructor(private host: InputHost, target: EventTarget, keyTarget: EventTarget = window) {
    // Pointer Events only; acting on pointerdown. There is deliberately no 'click' listener.
    target.addEventListener('pointerdown', (e) => this.down(e as PointerEvent));
    target.addEventListener('pointermove', (e) => this.move(e as PointerEvent));
    target.addEventListener('pointerup', (e) => this.up(e as PointerEvent));
    target.addEventListener('pointercancel', (e) => this.up(e as PointerEvent));
    keyTarget.addEventListener('keydown', (e) => this.key(e as KeyboardEvent, true));
    keyTarget.addEventListener('keyup', (e) => this.key(e as KeyboardEvent, false));
  }

  private emit(a: Action, eventMs: number): void {
    const t = this.host.toSim(eventMs);
    this.log.push({ type: a.type, t });
    if (this.log.length > 200) this.log.shift();
    this.host.act({ ...a, t } as Action);
  }

  private dirs(): { dirV: -1 | 0 | 1; dirH: -1 | 0 | 1 } {
    const up = this.held.has('w') || this.held.has('arrowup');
    const dn = this.held.has('s') || this.held.has('arrowdown');
    const lf = this.held.has('a') || this.held.has('arrowleft');
    const rt = this.held.has('d') || this.held.has('arrowright');
    return { dirV: up && !dn ? 1 : dn && !up ? -1 : 0, dirH: lf && !rt ? -1 : rt && !lf ? 1 : 0 };
  }

  /** Map a HUD button id to an action. Returns true if handled. */
  private button(b: HudButton, ms: number): void {
    const id = b.id;
    this.host.pressed(id);
    this.host.haptic();
    if (id === 'pause') return this.host.pause();
    if (id === 'power') return this.emit({ type: 'togglePower' }, ms);
    if (id === 'star') return this.emit({ type: 'useStar' }, ms);
    if (id.startsWith('pitch')) return this.emit({ type: 'selectPitch', index: Number(id.slice(5)) }, ms);
    if (id.startsWith('throw')) return this.emit({ type: 'throwTo', base: Number(id.slice(5)) + 1 }, ms);
    if (id === 'send' || id === 'hold') return this.emit({ type: 'sendHold', send: id === 'send' }, ms);
  }

  down(e: PointerEvent): void {
    this.host.firstGesture();
    if (!this.host.playing()) return;
    e.preventDefault();
    const s = this.host.state();
    if (!s) return;
    const l = this.host.layout();
    const x = e.clientX, y = e.clientY, ms = e.timeStamp;
    for (const b of this.host.buttons()) {
      if (b.id === 'stamina') continue;
      if (inRect(b.rect, x, y)) return this.button(b, ms);
    }
    if (s.phase === 'handoff') return this.emit({ type: 'ready' }, ms);
    const hb = humanBatter(s), hp = humanPitcher(s);
    const batPhase = s.phase === 'pitch';
    // Desktop duel: both sides human → the mouse belongs to the pitcher, Space to the batter.
    const mouseIsPitcher = hb !== null && hp !== null && e.pointerType === 'mouse';
    if (hb !== null && !mouseIsPitcher && (batPhase || s.phase === 'prePitch' || s.phase === 'windup')) {
      const tier = activeTier(s);
      if (tier === 'allstar') {
        if (e.pointerType === 'mouse') {
          if (batPhase) this.emit({ type: 'swing', zx: s.aim.x, zz: s.aim.z }, ms);
          return;
        }
        const z = screenToZone(l, x, y - RETICLE_OFFSET_PX);
        this.emit({ type: 'aim', zx: z.x, zz: z.z }, ms);
        this.drag = { id: e.pointerId, mode: 'reticle', lastX: x };
        return;
      }
      if (!batPhase) return; // taps before release do nothing (no accidental skips)
      this.host.haptic();
      if (tier === 'pro') {
        const d = padDirection(l, x, y);
        return this.emit({ type: 'swing', dirV: d.dirV, dirH: d.dirH }, ms);
      }
      return this.emit({ type: 'swing' }, ms);
    }
    if (hp !== null && s.phase === 'prePitch') {
      const z = screenToZone(l, x, y - (e.pointerType === 'mouse' ? 0 : AIM_OFFSET_PX));
      this.drag = { id: e.pointerId, mode: 'charge', lastX: x };
      this.host.haptic();
      return this.emit({ type: 'chargeStart', zx: z.x, zz: z.z }, ms);
    }
    if (hp !== null && s.phase === 'pitch') {
      this.drag = { id: e.pointerId, mode: 'steer', lastX: x };
      return;
    }
    this.host.skip();
    this.emit({ type: 'skip' }, ms);
  }

  move(e: PointerEvent): void {
    if (!this.host.playing()) return;
    const s = this.host.state();
    if (!s) return;
    const l = this.host.layout();
    if (e.pointerType === 'mouse' && !this.drag) {
      const z = screenToZone(l, e.clientX, e.clientY);
      this.mouseAim = z;
      if (humanBatter(s) !== null && activeTier(s) === 'allstar') this.host.act({ type: 'aim', zx: z.x, zz: z.z, t: this.host.toSim(e.timeStamp) });
      return;
    }
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const ms = e.timeStamp;
    if (this.drag.mode === 'reticle') {
      const z = screenToZone(l, e.clientX, e.clientY - RETICLE_OFFSET_PX);
      this.host.act({ type: 'aim', zx: z.x, zz: z.z, t: this.host.toSim(ms) });
    } else if (this.drag.mode === 'charge') {
      const off = e.pointerType === 'mouse' ? 0 : AIM_OFFSET_PX;
      const z = screenToZone(l, e.clientX, e.clientY - off);
      this.host.act({ type: 'chargeMove', zx: z.x, zz: z.z, t: this.host.toSim(ms) });
    } else if (this.drag.mode === 'steer') {
      const dx = (e.clientX - this.drag.lastX) / Math.max(20, l.plane.s);
      this.drag.lastX = e.clientX;
      if (dx) this.host.act({ type: 'steer', dx, t: this.host.toSim(ms) });
    }
  }

  up(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    const s = this.host.state();
    if (!s || !this.host.playing()) return;
    const l = this.host.layout();
    const ms = e.timeStamp;
    if (d.mode === 'reticle') {
      const z = screenToZone(l, e.clientX, e.clientY - RETICLE_OFFSET_PX);
      if (s.phase === 'pitch') this.emit({ type: 'swing', zx: z.x, zz: z.z }, ms);
    } else if (d.mode === 'charge') {
      const off = e.pointerType === 'mouse' ? 0 : AIM_OFFSET_PX;
      const z = screenToZone(l, e.clientX, e.clientY - off);
      this.emit({ type: 'chargeEnd', zx: z.x, zz: z.z }, ms);
    } else if (d.mode === 'steer') {
      // drag-release keeps the steer applied
    }
  }

  key(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (down) this.held.add(k);
    else this.held.delete(k);
    if (down) this.host.firstGesture();
    if (!this.host.playing()) {
      if (down && k === 'escape') this.host.menuBack();
      return;
    }
    const s = this.host.state();
    if (!s) return;
    const ms = e.timeStamp;
    const hb = humanBatter(s), hp = humanPitcher(s);
    if (!down) {
      if (k === ' ' && this.spaceCharging) {
        this.spaceCharging = false;
        this.emit({ type: 'chargeEnd' }, ms);
      }
      if ((k === 'a' || k === 'd' || k === 'arrowleft' || k === 'arrowright') && hp !== null) {
        const d = this.dirs();
        this.emit({ type: 'steer', dx: 0, hold: d.dirH }, ms);
      }
      return;
    }
    if (e.repeat) return;
    if (k === ' ' || k === 'enter' || k.startsWith('arrow') || k === 'escape') e.preventDefault();
    if (k === 'escape' || k === 'p') return this.host.pause();
    if (k === 'm') return this.host.mute();
    if (k === 'f') return this.host.fullscreen();
    if (s.phase === 'handoff' && (k === ' ' || k === 'enter')) return this.emit({ type: 'ready' }, ms);
    if (k === 'shift') return this.emit({ type: 'togglePower' }, ms);
    if (k === 'e') return this.emit({ type: 'useStar' }, ms);
    if (k >= '1' && k <= '4') {
      const i = Number(k) - 1;
      if (hp !== null && s.phase === 'prePitch') return this.emit({ type: 'selectPitch', index: i }, ms);
      if (s.phase === 'live') return this.emit({ type: 'throwTo', base: i + 1 }, ms);
    }
    if ((k === 'a' || k === 'd' || k === 'arrowleft' || k === 'arrowright') && hp !== null) {
      const d = this.dirs();
      return this.emit({ type: 'steer', dx: 0, hold: d.dirH }, ms);
    }
    if (k === ' ') {
      if (hb !== null && s.phase === 'pitch') {
        const d = this.dirs();
        return this.emit({ type: 'swing', dirV: d.dirV, dirH: d.dirH, zx: s.aim.x, zz: s.aim.z }, ms);
      }
      if (hb !== null && (s.phase === 'prePitch' || s.phase === 'windup')) return;
      if (hp !== null && s.phase === 'prePitch') {
        const a = this.mouseAim ?? s.pitchAim;
        this.spaceCharging = true;
        return this.emit({ type: 'chargeStart', zx: a.x, zz: a.z }, ms);
      }
    }
    if (k === ' ' || k === 'enter') {
      this.host.skip();
      this.emit({ type: 'skip' }, ms);
    }
  }
}
