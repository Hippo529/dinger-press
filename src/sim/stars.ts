// Stars, leverage (pressure), momentum and trait multipliers.
import { ROSTER_BY_ID } from '../config/roster';
import { basesOccupied, battingTeam, type GameState } from './state';

export const MAX_STARS = 5;

export function awardStars(s: GameState, team: number, n: number): number {
  const t = s.teams[team];
  const before = t.stars;
  t.stars = Math.min(MAX_STARS, t.stars + n);
  return t.stars - before;
}

/** Leverage 0..1 from inning, score gap, runners and outs. Drives the pressure bar and crowd. */
export function leverage(s: GameState): number {
  const bat = battingTeam(s);
  const gap = s.teams[bat].runs - s.teams[bat === 0 ? 1 : 0].runs;
  const occ = basesOccupied(s);
  const runners = occ.filter(Boolean).length;
  const late = Math.min(1, s.inning / Math.max(1, s.cfg.innings));
  const close = gap <= 0 && gap >= -3 ? 1 : gap === 1 ? 0.7 : Math.max(0, 0.6 - 0.15 * Math.abs(gap));
  const risp = occ[1] || occ[2] ? 1 : 0;
  const base = 0.15 + 0.12 * runners + 0.12 * risp + 0.06 * s.outs;
  return Math.max(0, Math.min(1, base * (0.5 + 0.5 * close) * (0.6 + 0.6 * late)));
}

/** Star Chance: bases loaded any time, or RISP while trailing/tied in the last regulation inning (or later). */
export function isStarChance(s: GameState): boolean {
  const occ = basesOccupied(s);
  if (occ[0] && occ[1] && occ[2]) return true;
  const bat = battingTeam(s);
  const gap = s.teams[bat].runs - s.teams[bat === 0 ? 1 : 0].runs;
  return (occ[1] || occ[2]) && gap <= 0 && s.inning >= s.cfg.innings;
}

/** Momentum: last 3 plate appearances → 'hot' | 'cold' | null. */
export function momentumOf(s: GameState, charId: string): 'hot' | 'cold' | null {
  const m = s.momentum[charId];
  if (!m || m.length < 2) return null;
  const last = m.slice(-3);
  const hits = last.filter((x) => x === 'H').length;
  if (hits >= 2) return 'hot';
  const ks = last.filter((x) => x === 'K').length;
  if (last.length === 3 && hits === 0 && ks >= 2) return 'cold';
  return null;
}
export function recordPa(s: GameState, charId: string, r: 'H' | 'O' | 'K' | 'W'): void {
  const m = (s.momentum[charId] ??= []);
  m.push(r);
  if (m.length > 6) m.shift();
}

/** Product of the batter's trait window multipliers. */
export function traitWindowMul(s: GameState, charId: string, starChance: boolean): number {
  const ch = ROSTER_BY_ID[charId];
  if (!ch) return 1;
  let k = 1;
  if (ch.traits.includes('pesky')) k *= 1.08;
  if (ch.traits.includes('buddy') && ch.buddy) {
    const lineup = s.teams[battingTeam(s)].setup.lineup;
    if (lineup.includes(ch.buddy)) k *= 1.06;
  }
  if (ch.traits.includes('streaky') && momentumOf(s, charId) === 'hot') k *= 1.05;
  if (ch.traits.includes('clutch') && starChance) k *= 1.06;
  return k;
}
