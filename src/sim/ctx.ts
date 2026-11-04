// Context passed to sim subsystems: state + seeded RNG + event sink.
import type { Rng } from '../core/rng';
import type { GameState } from './state';
import type { SimEvent } from './types';

export interface Ctx {
  s: GameState;
  rng: Rng;
  emit: (e: SimEvent) => void;
}

export function setPhase(c: Ctx, phase: GameState['phase']): void {
  c.s.phase = phase;
  c.s.phaseT = c.s.time;
}

export function banner(c: Ctx, text: string, sub = '', tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
  c.s.banner = { text, sub, tone, t: c.s.time };
  c.emit({ type: 'banner', text, sub, tone });
}
