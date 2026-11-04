// Shared sim types. Coordinates: feet. x → right-field side (+), y → toward centre field, z up.
// Home plate apex at origin. Spray angle φ in degrees from the CF line, + toward right field.

export type Grade = 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE' | 'JAMMED' | 'TOPPED' | 'UNDER' | 'FOUL' | 'WHIFF';
export const GRADES: Grade[] = ['PERFECT', 'GOOD', 'EARLY', 'LATE', 'JAMMED', 'TOPPED', 'UNDER', 'FOUL', 'WHIFF'];
export type Tier = 'rookie' | 'pro' | 'allstar';
export type PitchType = 'FF' | 'SI' | 'CU' | 'SL' | 'CH' | 'SP' | 'SC' | 'KN';
export type Aggression = 'conservative' | 'aggressive';

export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface V2 {
  x: number;
  y: number;
}

export type Phase =
  | 'intro'
  | 'prePitch'
  | 'windup'
  | 'pitch'
  | 'live'
  | 'dead'
  | 'celebrate'
  | 'halfEnd'
  | 'handoff'
  | 'gameOver';

export type ModeKind = 'short' | 'mill' | 'proof' | 'clutch' | 'cage' | 'attract';

export interface PlayerProfile {
  name: string;
  heat: number; // 0..99
  tier: Tier;
}

/** Semantic actions. `t` is sim time (s) at which the input happened; filled in by the input layer. */
export type Action =
  | { type: 'swing'; t?: number; zx?: number; zz?: number; dirV?: -1 | 0 | 1; dirH?: -1 | 0 | 1 }
  | { type: 'aim'; t?: number; zx: number; zz: number }
  | { type: 'togglePower'; t?: number }
  | { type: 'useStar'; t?: number }
  | { type: 'selectPitch'; t?: number; index: number }
  | { type: 'chargeStart'; t?: number; zx: number; zz: number }
  | { type: 'chargeMove'; t?: number; zx: number; zz: number }
  | { type: 'chargeEnd'; t?: number; zx?: number; zz?: number }
  | { type: 'steer'; t?: number; dx: number; hold?: -1 | 0 | 1 }
  | { type: 'throwTo'; t?: number; base: number }
  | { type: 'sendHold'; t?: number; send: boolean }
  | { type: 'skip'; t?: number }
  | { type: 'ready'; t?: number };

export interface Runner {
  id: number;
  charId: string;
  base: number; // last base touched: 0 home .. 3 third
  target: number; // base the runner will stop at (4 = score)
  d: number; // ft along the path from `base` toward base+1 (negative while returning)
  speed: number; // ft/s
  delay: number; // s before starting (batter leaving the box)
  out: boolean;
  scored: boolean;
  scoredAt: number;
  forcedTo: number; // base the runner is forced to (0 = not forced)
  isBatter: boolean;
  tagWait: boolean; // holding on a catchable fly
  returning: boolean;
}

export interface Fielder {
  pos: V2;
  prev: V2;
  goal: V2;
  speed: number;
  charId: string | null; // null = press crew
  role: 'idle' | 'chase' | 'cover' | 'relay' | 'backup';
  hasBall: boolean;
  dive: number; // 0..1 dive animation
}

export type SimEvent =
  | { type: 'paStart'; batter: string; team: number }
  | { type: 'windup' }
  | { type: 'pitchReleased'; pitch: PitchType; star: boolean; mph: number; T: number }
  | { type: 'swing'; offsetMs: number }
  | { type: 'contact'; grade: Grade; ev: number; la: number; spray: number; offsetMs: number; power: boolean; star: boolean }
  | { type: 'whiff' }
  | { type: 'take'; call: 'ball' | 'strike' }
  | { type: 'mittPop'; strikeout: boolean }
  | { type: 'foul' }
  | { type: 'landed'; dist: number }
  | { type: 'caught'; fielder: number; diving: boolean }
  | { type: 'fielded'; fielder: number }
  | { type: 'throw'; base: number; from: number }
  | { type: 'out'; base: number; text: string }
  | { type: 'safe'; base: number; text: string }
  | { type: 'run'; team: number }
  | { type: 'homeRun'; dist: number; walkoff: boolean }
  | { type: 'walk' }
  | { type: 'walkoff' }
  | { type: 'clutchResult'; win: boolean }
  | { type: 'strikeout' }
  | { type: 'hit'; bases: number }
  | { type: 'halfEnd'; inning: number; half: number }
  | { type: 'gameOver'; winner: number; reason: string }
  | { type: 'starEarned'; team: number; n: number; why: string }
  | { type: 'starSpent'; team: number; kind: 'swing' | 'pitch' }
  | { type: 'starChance'; team: number }
  | { type: 'handoff'; to: number }
  | { type: 'banner'; text: string; sub: string; tone: 'good' | 'bad' | 'neutral' }
  | { type: 'chatter'; key: string }
  | { type: 'throwPrompt' }
  | { type: 'sendHoldPrompt'; base: number }
  | { type: 'derbyScore'; points: number; streak: number };
