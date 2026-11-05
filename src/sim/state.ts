// Game state shape (plain data) and constructors.
import { ROSTER_BY_ID, type TeamId } from '../config/roster';
import { B1, C, CF, HOME_POS, P, SS, type StadiumId } from './field';
import { fielderSpeed } from './fielding';
import { newArm, type ArmState, type PitchState } from './pitch';
import type { BallBody, Prediction } from './physics';
import type { Windows } from './contact';
import { runnerSpeed } from './running';
import type { Aggression, Fielder, Grade, ModeKind, Phase, PitchType, PlayerProfile, Runner, Tier } from './types';

export interface TeamSetup {
  teamId: TeamId;
  lineup: string[]; // 5 character ids, batting order
  pitcherId: string;
}

export interface ClutchSpec {
  id: string;
  title: string;
  blurb: string;
  side: 'bat' | 'pitch';
  inning: number;
  half: 0 | 1;
  outs: number;
  balls: number;
  strikes: number;
  bases: [boolean, boolean, boolean];
  scoreHuman: number;
  scoreCpu: number;
  /** batting: runs needed this half; pitching: max runs allowed this half */
  runs: number;
  outsToGet?: number; // pitching: outs needed (default 3 − outs)
  homerSwings?: number; // Moonshot or Bust: swings allowed
  homersNeeded?: number; // homers needed within those swings (default 1)
}

export interface ModeConfig {
  kind: ModeKind;
  seed: number;
  players: PlayerProfile[];
  teams: [TeamSetup, TeamSetup]; // 0 away (bats top), 1 home
  humanBat: [number | null, number | null]; // player index controlling team i when batting
  humanPitch: [number | null, number | null]; // player index controlling team i when fielding
  innings: number;
  stadium: StadiumId;
  aggression: Aggression;
  assistPitch: boolean;
  newbiePitchesLeft: number;
  firstEver: boolean;
  hideLocator: boolean;
  clutch?: ClutchSpec;
  mill?: { outs: number; chars: string[] }; // one character per player
  cage?: { pitch: PitchType | 'mix' };
}

export interface TeamState {
  setup: TeamSetup;
  order: number; // next batter index
  runs: number;
  hits: number;
  stars: number;
  arm: ArmState;
  line: number[]; // runs per inning
}

export interface SwingRec {
  t: number; // sim time of the swing
  offsetMs: number;
  grade: Grade | null;
  power: boolean;
  star: boolean;
  zx: number;
  zz: number;
  dirV: -1 | 0 | 1;
  dirH: -1 | 0 | 1;
}

export interface ThrowState {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  t0: number;
  t1: number;
  base: number;
  thrower: number;
  receiver: number;
}

export interface PlayState {
  pred: Prediction;
  chaser: number;
  secureT: number; // absolute sim time the chaser secures the ball
  air: boolean;
  diving: boolean;
  secured: boolean;
  holder: number; // fielder index holding the ball, −1 none
  cov: Record<number, number>;
  outsOnPlay: number;
  runsOnPlay: { id: number; t: number }[];
  thirdOutForce: boolean;
  thirdOutT: number;
  throwPromptUntil: number; // absolute sim time for the assist throw (player fielding)
  firstThrowDone: boolean;
  closeCall: { runnerId: number; base: number; until: number; send: boolean | null; defaultSend: boolean } | null;
  text: string;
  hitBases: number;
  hr: boolean;
  foul: boolean;
  lite: boolean; // no fielding (Mill / Cage / tiebreak)
  startT: number;
  landedEmitted: boolean;
  minTimeScaleNote: number;
}

export interface GameState {
  cfg: ModeConfig;
  time: number;
  phase: Phase;
  phaseT: number; // sim time when the phase started
  inning: number;
  half: 0 | 1;
  outs: number;
  balls: number;
  strikes: number;
  teams: [TeamState, TeamState];
  runners: Runner[]; // on base or in play this half
  nextRunnerId: number;
  fielders: Fielder[];
  pitch: PitchState | null;
  releaseT: number;
  win: Windows | null; // windows locked at release
  swing: SwingRec | null;
  ball: BallBody | null;
  play: PlayState | null;
  thr: ThrowState | null;
  // batter UI state
  power: boolean;
  starArmed: boolean;
  aim: { x: number; z: number };
  // pitcher UI state
  pitchSel: number;
  charging: boolean;
  chargeStartT: number;
  pitchAim: { x: number; z: number };
  steerInput: number; // −1..1 held keys
  cpuSwingAt: number | null; // scheduled CPU swing (sim time)
  cpuPower: boolean;
  cpuPrePitchS: number; // CPU set time for this pitch
  chargeLevel: number; // human charge at release (1 = full ring)
  deadDur: number;
  nextNewPa: boolean;
  paResult: string;
  // results / UI
  last: { grade: Grade | null; offsetMs: number; ev: number; la: number; spray: number; dist: number; swingT: number; call: string };
  banner: { text: string; sub: string; tone: 'good' | 'bad' | 'neutral'; t: number } | null;
  lowerThird: { id: string; t: number } | null;
  starChance: boolean;
  starChanceTeam: number;
  pitchesSeen: number; // human batting pitches (newbie windows)
  totalPitches: number;
  momentum: Record<string, string[]>;
  perfectStreak: number;
  bestPerfectStreak: number;
  hitStreak: number;
  winner: number;
  overReason: string;
  walkoff: boolean;
  tiebreak: { team: 0 | 1; left: number; hrs: [number, number]; round: number } | null;
  mill: { player: number; outs: number; scores: number[]; streak: number; bestStreak: number[]; longest: number[] } | null;
  clutchResult: 'win' | 'lose' | null;
  clutchStartRuns: number;
  clutchSwings: number;
  clutchHomers: number;
  stats: { hr: number; perfect: number; longestHr: number; maxEv: number; ks: number; hits: number; pitchesTotal: number; swings: number };
  ending: boolean;
  handoffTo: number;
  afterHandoff: 'half' | 'tiebreak' | 'mill' | null;
}

export function makeFielders(team: TeamSetup): Fielder[] {
  const others = team.lineup.filter((id) => id !== team.pitcherId);
  const named: Record<number, string> = { [P]: team.pitcherId };
  [C, SS, CF, B1].forEach((pos, i) => {
    if (others[i]) named[pos] = others[i];
  });
  return HOME_POS.map((h, i) => {
    const id = named[i] ?? null;
    const sp = id ? ROSTER_BY_ID[id].speed : 5;
    return { pos: { ...h }, prev: { ...h }, goal: { ...h }, speed: fielderSpeed(sp), charId: id, role: 'idle', hasBall: false, dive: 0 } as Fielder;
  });
}

export function newTeam(setup: TeamSetup): TeamState {
  return { setup, order: 0, runs: 0, hits: 0, stars: 0, arm: newArm(), line: [] };
}

export function makeRunner(s: GameState, charId: string, base: number, isBatter: boolean): Runner {
  const ch = ROSTER_BY_ID[charId];
  return {
    id: s.nextRunnerId++,
    charId,
    base,
    target: base,
    d: 0,
    speed: runnerSpeed(ch ? ch.speed : 5),
    delay: 0,
    out: false,
    scored: false,
    scoredAt: 0,
    forcedTo: 0,
    isBatter,
    tagWait: false,
    returning: false,
  };
}

export function createState(cfg: ModeConfig): GameState {
  const teams: [TeamState, TeamState] = [newTeam(cfg.teams[0]), newTeam(cfg.teams[1])];
  return {
    cfg,
    time: 0,
    phase: 'prePitch',
    phaseT: 0,
    inning: 1,
    half: 0,
    outs: 0,
    balls: 0,
    strikes: 0,
    teams,
    runners: [],
    nextRunnerId: 1,
    fielders: makeFielders(cfg.teams[1]),
    pitch: null,
    releaseT: 0,
    win: null,
    swing: null,
    ball: null,
    play: null,
    thr: null,
    power: false,
    starArmed: false,
    aim: { x: 0, z: 2.55 },
    pitchSel: 0,
    charging: false,
    chargeStartT: 0,
    pitchAim: { x: 0, z: 2.55 },
    steerInput: 0,
    cpuSwingAt: null,
    cpuPower: false,
    cpuPrePitchS: 0.9,
    chargeLevel: 0.8,
    deadDur: 0.5,
    nextNewPa: true,
    paResult: '',
    last: { grade: null, offsetMs: 0, ev: 0, la: 0, spray: 0, dist: 0, swingT: -99, call: '' },
    banner: null,
    lowerThird: null,
    starChance: false,
    starChanceTeam: -1,
    pitchesSeen: 0,
    totalPitches: 0,
    momentum: {},
    perfectStreak: 0,
    bestPerfectStreak: 0,
    hitStreak: 0,
    winner: -1,
    overReason: '',
    walkoff: false,
    tiebreak: null,
    mill: null,
    clutchResult: null,
    clutchStartRuns: 0,
    clutchSwings: 0,
    clutchHomers: 0,
    stats: { hr: 0, perfect: 0, longestHr: 0, maxEv: 0, ks: 0, hits: 0, pitchesTotal: 0, swings: 0 },
    ending: false,
    handoffTo: -1,
    afterHandoff: null,
  };
}

// ---------- derived helpers ----------
export const battingTeam = (s: GameState): 0 | 1 => (s.tiebreak ? s.tiebreak.team : s.half);
export const fieldingTeam = (s: GameState): 0 | 1 => (battingTeam(s) === 0 ? 1 : 0);
export function currentBatterId(s: GameState): string {
  const t = s.teams[battingTeam(s)];
  if (s.mill) return s.cfg.mill!.chars[s.mill.player];
  return t.setup.lineup[t.order % t.setup.lineup.length];
}
export function currentPitcherId(s: GameState): string {
  return s.teams[fieldingTeam(s)].setup.pitcherId;
}
export function humanBatter(s: GameState): number | null {
  if (s.mill) return s.mill.player;
  return s.cfg.humanBat[battingTeam(s)];
}
export function humanPitcher(s: GameState): number | null {
  if (s.mill || s.tiebreak) return null;
  return s.cfg.humanPitch[fieldingTeam(s)];
}
/** HEAT that governs this pitch: the human involved, else 50 (attract) . */
export function activeHeat(s: GameState): number {
  const hb = humanBatter(s);
  if (hb !== null) return s.cfg.players[hb]?.heat ?? 50;
  const hp = humanPitcher(s);
  if (hp !== null) return s.cfg.players[hp]?.heat ?? 50;
  return 50;
}
export function activeTier(s: GameState): Tier {
  const hb = humanBatter(s);
  return hb !== null ? s.cfg.players[hb]?.tier ?? 'rookie' : 'pro';
}
export function basesOccupied(s: GameState): [boolean, boolean, boolean] {
  const occ: [boolean, boolean, boolean] = [false, false, false];
  for (const r of s.runners) if (!r.out && !r.scored && r.base >= 1 && r.base <= 3) occ[r.base - 1] = true;
  return occ;
}
export function scoreDiff(s: GameState, team: number): number {
  return s.teams[team].runs - s.teams[team === 0 ? 1 : 0].runs;
}
