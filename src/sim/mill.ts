// Moonshot Mill scoring: distance × streak multiplier, PERFECT bonus, HEAT multiplier.
import { TUNING } from '../config/tuning';
import { banner, setPhase, type Ctx } from './ctx';
import { goDead } from './flow';
import { activeHeat } from './state';

export function scoreMult(heat: number, hidden: boolean): number {
  return (1 + TUNING.heat.scoreMult * (Math.max(0, Math.min(99, heat)) / 99)) * (hidden ? TUNING.heat.hiddenLocatorMult : 1);
}

// ---------- Moonshot Mill ----------
export function millOut(c: Ctx, text: string): void {
  const m = c.s.mill!;
  m.outs++;
  banner(c, 'OUT', `${text} · ${m.outs}/${c.s.cfg.mill!.outs}`, 'bad');
  goDead(c, TUNING.flow.afterTakeS, false);
}
export function millHomer(c: Ctx, dist: number): void {
  const s = c.s;
  const m = s.mill!;
  const heat = activeHeat(s);
  let pts = dist * (1 + 0.25 * m.streak);
  if (s.last.grade === 'PERFECT') pts += 100;
  pts *= scoreMult(heat, s.cfg.hideLocator);
  m.scores[m.player] += pts;
  m.streak++;
  m.bestStreak[m.player] = Math.max(m.bestStreak[m.player], m.streak);
  m.longest[m.player] = Math.max(m.longest[m.player], dist);
  c.emit({ type: 'derbyScore', points: pts, streak: m.streak });
  c.emit({ type: 'homeRun', dist, walkoff: false });
  banner(c, 'HOME RUN', `${dist} ft · +${Math.round(pts)}${m.streak > 1 ? ` · STREAK ×${(1 + 0.25 * (m.streak - 1)).toFixed(2)}` : ''}`, 'good');
  setPhase(c, 'celebrate');
}

