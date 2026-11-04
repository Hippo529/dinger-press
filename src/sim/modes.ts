// Mode configs, auto-draft, Clutch Cards and Today's Edition.
import { ROSTER_BY_ID, type TeamId } from '../config/roster';
import { Rng, hashSeed } from '../core/rng';
import type { StadiumId } from './field';
import type { ClutchSpec, ModeConfig, TeamSetup } from './state';
import type { Aggression, PitchType, PlayerProfile, Tier } from './types';

export const TIER_DEFAULT_HEAT: Record<Tier, number> = { rookie: 0, pro: 50, allstar: 99 };

/** Balanced auto-draft: snake draft by overall rating from the available pool. */
export function autoDraft(pool: string[], captainA: string | null, captainB: string | null, seed: number): [string[], string[]] {
  const rng = new Rng(seed);
  const score = (id: string) => {
    const c = ROSTER_BY_ID[id];
    return c.contact + c.power + c.speed * 0.6 + c.pitching * 0.8 + rng.next() * 2;
  };
  const avail = pool.filter((id) => id !== captainA && id !== captainB).sort((a, b) => score(b) - score(a));
  const A: string[] = captainA ? [captainA] : [];
  const B: string[] = captainB ? [captainB] : [];
  let turn = A.length <= B.length ? 0 : 1;
  while ((A.length < 5 || B.length < 5) && avail.length) {
    const id = avail.shift()!;
    if (turn === 0 && A.length < 5) A.push(id);
    else if (B.length < 5) B.push(id);
    else A.push(id);
    turn = turn === 0 ? 1 : 0;
  }
  return [A, B];
}

export function bestPitcher(lineup: string[]): string {
  return lineup.slice().sort((a, b) => ROSTER_BY_ID[b].pitching - ROSTER_BY_ID[a].pitching)[0];
}

export function teamSetup(teamId: TeamId, lineup: string[], pitcherId?: string): TeamSetup {
  return { teamId, lineup, pitcherId: pitcherId && lineup.includes(pitcherId) ? pitcherId : bestPitcher(lineup) };
}

export interface CommonOpts {
  seed: number;
  players: PlayerProfile[];
  stadium?: StadiumId;
  aggression?: Aggression;
  assistPitch?: boolean;
  newbiePitchesLeft?: number;
  firstEver?: boolean;
  hideLocator?: boolean;
  pool?: string[];
  teams?: [TeamId, TeamId];
  captain?: string | null;
}

function base(o: CommonOpts, kind: ModeConfig['kind'], teams: [TeamSetup, TeamSetup]): ModeConfig {
  return {
    kind,
    seed: o.seed,
    players: o.players,
    teams,
    humanBat: [null, null],
    humanPitch: [null, null],
    innings: 3,
    stadium: o.stadium ?? 'yard',
    aggression: o.aggression ?? 'conservative',
    assistPitch: o.assistPitch ?? false,
    newbiePitchesLeft: o.newbiePitchesLeft ?? 0,
    firstEver: o.firstEver ?? false,
    hideLocator: o.hideLocator ?? false,
  };
}

function draftTeams(o: CommonOpts): [TeamSetup, TeamSetup] {
  const pool = o.pool ?? Object.keys(ROSTER_BY_ID).filter((id) => !ROSTER_BY_ID[id].unlock);
  const [A, B] = autoDraft(pool, o.captain ?? null, null, o.seed);
  const ids = o.teams ?? ['inkers', 'hagfish'];
  return [teamSetup(ids[0], A), teamSetup(ids[1], B)];
}

/** Short Run: player is team 0 (bats first) when batFirst, else team 1. */
export function shortRun(o: CommonOpts & { batFirst?: boolean }): ModeConfig {
  const [mine, cpu] = draftTeams(o);
  const batFirst = o.batFirst ?? true;
  const teams: [TeamSetup, TeamSetup] = batFirst ? [mine, cpu] : [cpu, mine];
  const cfg = base(o, 'short', teams);
  const me = batFirst ? 0 : 1;
  cfg.humanBat[me] = 0;
  cfg.humanPitch[me] = 0;
  return cfg;
}

export function attract(seed: number): ModeConfig {
  const o: CommonOpts = { seed, players: [{ name: 'CPU', heat: 50, tier: 'pro' }], teams: [['gophers', 'loons'], ['loons', 'inkers'], ['hagfish', 'gophers']][seed % 3] as [TeamId, TeamId] };
  return base(o, 'attract', draftTeams(o));
}

/** Pass the Proof: P1 bats top halves, P2 bats bottom halves; CPU pitches and fields. */
export function proof(o: CommonOpts): ModeConfig {
  const cfg = base(o, 'proof', draftTeams(o));
  cfg.humanBat = [0, 1];
  return cfg;
}

/** Moonshot Mill: each player swings with their own character until 10 outs. */
export function mill(o: CommonOpts & { chars: string[]; outs?: number }): ModeConfig {
  const t = draftTeams(o);
  const cfg = base(o, 'mill', t);
  cfg.mill = { outs: o.outs ?? 10, chars: o.chars };
  cfg.humanBat = [0, null];
  return cfg;
}

export function cage(o: CommonOpts & { pitch: PitchType | 'mix'; char?: string }): ModeConfig {
  const t = draftTeams({ ...o, captain: o.char ?? o.captain });
  const cfg = base(o, 'cage', t);
  cfg.cage = { pitch: o.pitch };
  cfg.humanBat = [0, null];
  return cfg;
}

// ---------- Clutch Cards ----------
const B = (a: boolean, b: boolean, c: boolean): [boolean, boolean, boolean] => [a, b, c];
export const CLUTCH_CARDS: ClutchSpec[] = [
  { id: 'walkoff', title: 'Walk It Off', blurb: 'Down 2, bases loaded, two outs. Walk it off.', side: 'bat', inning: 3, half: 1, outs: 2, balls: 0, strikes: 0, bases: B(true, true, true), scoreHuman: 3, scoreCpu: 5, runs: 3 },
  { id: 'protect', title: 'Protect the One', blurb: 'Up one in the last inning. Three outs, no runs.', side: 'pitch', inning: 3, half: 0, outs: 0, balls: 0, strikes: 0, bases: B(false, false, false), scoreHuman: 2, scoreCpu: 1, runs: 0 },
  { id: 'squeeze', title: 'Squeeze It', blurb: 'Tied. Runner on third, one out. Bring him home.', side: 'bat', inning: 3, half: 1, outs: 1, balls: 0, strikes: 0, bases: B(false, false, true), scoreHuman: 2, scoreCpu: 2, runs: 1 },
  { id: 'strand', title: "Strand 'Em", blurb: 'Bases loaded, nobody out, up two. Allow one at most.', side: 'pitch', inning: 2, half: 0, outs: 0, balls: 0, strikes: 0, bases: B(true, true, true), scoreHuman: 4, scoreCpu: 2, runs: 1 },
  { id: 'moonshot', title: 'Moonshot or Bust', blurb: 'Down one. Three swings to hit one out.', side: 'bat', inning: 3, half: 1, outs: 0, balls: 0, strikes: 0, bases: B(false, false, false), scoreHuman: 1, scoreCpu: 2, runs: 1, homerSwings: 3 },
  { id: 'nerves', title: 'Ninth-Inning Nerves', blurb: 'Down three, nobody on, nobody out. Tie it up.', side: 'bat', inning: 3, half: 1, outs: 0, balls: 0, strikes: 0, bases: B(false, false, false), scoreHuman: 1, scoreCpu: 4, runs: 3 },
  { id: 'closebook', title: 'Close the Book', blurb: 'Up two, runners on first and second, one out. Two more outs.', side: 'pitch', inning: 3, half: 0, outs: 1, balls: 0, strikes: 0, bases: B(true, true, false), scoreHuman: 5, scoreCpu: 3, runs: 1 },
  { id: 'grind', title: 'Two-Strike Grind', blurb: 'Down one, runner on second, two outs, 0-2. Grind out a run.', side: 'bat', inning: 3, half: 1, outs: 2, balls: 0, strikes: 2, bases: B(false, true, false), scoreHuman: 2, scoreCpu: 3, runs: 1 },
];

/** Today's Edition: generated parameters from a YYYYMMDD seed. */
export function dailyCard(yyyymmdd: number): ClutchSpec {
  const rng = new Rng(hashSeed('edition-' + yyyymmdd));
  const side = rng.chance(0.55) ? 'bat' : 'pitch';
  const gap = 1 + rng.int(3); // magnitude 1..3
  const bm = rng.int(8);
  const bases = B(!!(bm & 1), !!(bm & 2), !!(bm & 4));
  const outs = rng.int(3);
  const balls = rng.int(3);
  const strikes = rng.int(3);
  const human = 2 + rng.int(4);
  if (side === 'bat') {
    return { id: `daily-${yyyymmdd}`, title: "Today's Edition", blurb: `Down ${gap}, ${baseText(bases)}, ${outs} out${outs === 1 ? '' : 's'}. Score ${gap + 1} to win.`, side, inning: 3, half: 1, outs, balls, strikes, bases, scoreHuman: human, scoreCpu: human + gap, runs: gap + 1 };
  }
  return { id: `daily-${yyyymmdd}`, title: "Today's Edition", blurb: `Up ${gap}, ${baseText(bases)}, ${outs} out${outs === 1 ? '' : 's'}. Allow fewer than ${gap}.`, side, inning: 3, half: 0, outs, balls, strikes, bases, scoreHuman: human + gap, scoreCpu: human, runs: gap - 1 };
}
function baseText(b: [boolean, boolean, boolean]): string {
  const n = b.filter(Boolean).length;
  if (n === 0) return 'bases empty';
  if (n === 3) return 'bases loaded';
  return ['first', 'second', 'third'].filter((_, i) => b[i]).join(' & ').replace(/^/, 'runner' + (n > 1 ? 's on ' : ' on '));
}

/** Clutch: the human is team 0 when batting in the top or ... we place the human on whichever side the card needs. */
export function clutch(o: CommonOpts, card: ClutchSpec): ModeConfig {
  const [mine, cpu] = draftTeams(o);
  // Human bats in `card.half` when side=bat; human fields in `card.half` when side=pitch.
  const humanTeam = card.side === 'bat' ? card.half : card.half === 0 ? 1 : 0;
  const teams: [TeamSetup, TeamSetup] = humanTeam === 0 ? [mine, cpu] : [cpu, mine];
  const cfg = base(o, 'clutch', teams);
  cfg.humanBat[humanTeam] = 0;
  cfg.humanPitch[humanTeam] = 0;
  cfg.clutch = card;
  cfg.innings = 3;
  return cfg;
}
