// Field geometry, stadium fences and fielder home positions.
import type { V2, V3 } from './types';

export const BASE_DIST = 90;
const D = BASE_DIST / Math.SQRT2;
/** Base positions: 0 home, 1 first, 2 second, 3 third, 4 home (scored). */
export const BASES: V2[] = [
  { x: 0, y: 0 },
  { x: D, y: D },
  { x: 0, y: 2 * D },
  { x: -D, y: D },
  { x: 0, y: 0 },
];
export const MOUND: V2 = { x: 0, y: 60.5 };
export const CONTACT_Y = 0.7; // contact plane (front of plate), ft
export const ZONE = { xMin: -0.83, xMax: 0.83, zMin: 1.6, zMax: 3.5 };
export const ZONE_MID = { x: 0, z: (ZONE.zMin + ZONE.zMax) / 2 };

export function inZone(x: number, z: number, margin = 0): boolean {
  return x >= ZONE.xMin - margin && x <= ZONE.xMax + margin && z >= ZONE.zMin - margin && z <= ZONE.zMax + margin;
}

export const POS_NAMES = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const P = 0, C = 1, B1 = 2, B2 = 3, B3 = 4, SS = 5, LF = 6, CF = 7, RF = 8;

function polar(dist: number, deg: number): V2 {
  const r = (deg * Math.PI) / 180;
  return { x: dist * Math.sin(r), y: dist * Math.cos(r) };
}
/** Fielder home positions by index (P, C, 1B, 2B, 3B, SS, LF, CF, RF). */
export const HOME_POS: V2[] = [
  { x: 0, y: 58 },
  { x: 0, y: -4 },
  polar(108, 37),
  polar(146, 16),
  polar(112, -33),
  polar(146, -16),
  polar(285, -27),
  polar(312, 0),
  polar(285, 27),
];

export function sprayOf(x: number, y: number): number {
  return (Math.atan2(x, y) * 180) / Math.PI;
}

export type StadiumId = 'yard' | 'gutter' | 'lighthouse';
export interface Stadium {
  id: StadiumId;
  name: string;
  // keys at spray angles -45, -22.5, 0, 22.5, 45 ; [dist, height]
  keys: [number, number][];
  hazard: 'none' | 'mailbox' | 'beam';
}

export const STADIUMS: Record<StadiumId, Stadium> = {
  yard: { id: 'yard', name: 'Pressville Yard', keys: [[330, 10], [375, 10], [400, 10], [375, 10], [330, 10]], hazard: 'none' },
  gutter: {
    id: 'gutter',
    name: 'The Gutter',
    keys: [[335, 10], [380, 10], [405, 10], [320, 38], [290, 38]],
    hazard: 'mailbox',
  },
  lighthouse: { id: 'lighthouse', name: 'Lighthouse Point', keys: [[340, 12], [390, 12], [430, 12], [390, 12], [340, 12]], hazard: 'beam' },
};

/** Fence distance and height at spray angle (deg). Outside ±45° returns the line value. */
export function fenceAt(st: Stadium, sprayDeg: number): { dist: number; height: number } {
  const a = Math.max(-45, Math.min(45, sprayDeg));
  const f = (a + 45) / 22.5;
  const i = Math.min(3, Math.floor(f));
  const t = f - i;
  const k0 = st.keys[i], k1 = st.keys[i + 1];
  let height = k0[1] + (k1[1] - k0[1]) * t;
  // The Gutter's Mailbox wall is a hard 38 ft from +15° to +45°.
  if (st.hazard === 'mailbox') height = a >= 15 ? 38 : 10;
  return { dist: k0[0] + (k1[0] - k0[0]) * t, height };
}

export function dist2(a: V2, b: V2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function v3(x = 0, y = 0, z = 0): V3 {
  return { x, y, z };
}
