// Original roster. Ratings 0..10. Silhouette params drive the procedural character renderer.
import type { PitchType } from '../sim/types';

export type Trait = 'moonshot' | 'pesky' | 'buddy' | 'streaky' | 'oldtricks' | 'heat' | 'crowd' | 'showboat' | 'burner' | 'clutch';
export type Prop = 'cap' | 'bigcap' | 'beanie' | 'goggles' | 'bun' | 'flattop' | 'moustache' | 'ponytail' | 'bottle' | 'robot' | 'sheet' | 'teapot' | 'tophat' | 'pockets';

export interface Character {
  id: string;
  name: string;
  short: string; // nameplate
  bats: 1 | -1; // +1 right-handed
  throws: 1 | -1;
  contact: number;
  power: number;
  speed: number;
  pitching: number;
  pitches: PitchType[];
  traits: Trait[];
  buddy?: string;
  rival?: string;
  catchphrases: string[];
  // silhouette
  scale: number; // overall height multiplier
  torsoW: number; // torso width multiplier
  torsoH: number;
  headR: number; // head radius multiplier
  props: Prop[];
  skin: string; // ink-friendly skin token key
  unlock?: { kind: 'hr' | 'perfect' | 'clutchWin' | 'mill'; n: number; label: string };
  motifSeed: number;
}

const C = (c: Character) => c;

export const ROSTER: Character[] = [
  C({ id: 'moose', name: 'Moose Kaboodle', short: 'KABOODLE', bats: 1, throws: 1, contact: 4, power: 10, speed: 2, pitching: 3, pitches: ['FF', 'CH'], traits: ['moonshot'], rival: 'tilly',
    catchphrases: ['Moose is loose!', 'Big swing, bigger dreams.', 'Somebody call the moon.'], scale: 1.32, torsoW: 1.55, torsoH: 1.1, headR: 0.75, props: ['cap'], skin: 'skinA', motifSeed: 11 }),
  C({ id: 'tilly', name: 'Tilly Twigg', short: 'TWIGG', bats: -1, throws: 1, contact: 8, power: 2, speed: 10, pitching: 3, pitches: ['FF', 'CU'], traits: ['pesky'], rival: 'moose',
    catchphrases: ['Zoom zoom, see ya!', 'Small but loud!', 'Catch me if you can.'], scale: 0.76, torsoW: 0.8, torsoH: 0.85, headR: 1.15, props: ['bigcap'], skin: 'skinB', motifSeed: 22 }),
  C({ id: 'gertie', name: 'Gertie Bloom', short: 'BLOOM', bats: 1, throws: -1, contact: 7, power: 3, speed: 3, pitching: 8, pitches: ['CU', 'KN', 'CH'], traits: ['oldtricks'],
    catchphrases: ['Back in my day…', 'Knit one, strike two.', 'Mind your manners, sonny.'], scale: 0.9, torsoW: 1.15, torsoH: 0.9, headR: 1.0, props: ['bun'], skin: 'skinC', motifSeed: 33 }),
  C({ id: 'velma', name: 'Velma Vroom', short: 'VROOM', bats: 1, throws: 1, contact: 4, power: 5, speed: 6, pitching: 9, pitches: ['FF', 'SL', 'SP'], traits: ['heat'],
    catchphrases: ['Buckle up.', 'Speed limit? Never heard of it.', 'Blink and you missed it.'], scale: 1.15, torsoW: 0.95, torsoH: 1.1, headR: 0.95, props: ['goggles'], skin: 'skinD', motifSeed: 44 }),
  C({ id: 'noodle', name: 'Noodle Ramirez', short: 'RAMIREZ', bats: -1, throws: -1, contact: 9, power: 5, speed: 6, pitching: 4, pitches: ['FF', 'CH'], traits: ['buddy'], buddy: 'pip',
    catchphrases: ['All arms, all day.', 'Slap it where they ain\'t.', 'Noodle knows.'], scale: 1.22, torsoW: 0.7, torsoH: 1.25, headR: 0.9, props: ['cap'], skin: 'skinB', motifSeed: 55 }),
  C({ id: 'pip', name: 'Pip Saltzman', short: 'SALTZMAN', bats: 1, throws: 1, contact: 6, power: 3, speed: 8, pitching: 5, pitches: ['CU', 'CH'], traits: ['buddy'], buddy: 'noodle',
    catchphrases: ['Is it my turn yet?', 'Propeller: engaged.', 'I ate my vegetables for this.'], scale: 0.8, torsoW: 0.9, torsoH: 0.85, headR: 1.1, props: ['beanie'], skin: 'skinA', motifSeed: 66 }),
  C({ id: 'brick', name: 'Brick Hollander', short: 'HOLLANDER', bats: 1, throws: 1, contact: 5, power: 9, speed: 3, pitching: 4, pitches: ['FF', 'SI'], traits: ['streaky'],
    catchphrases: ['Built different. Built square.', 'Brick by brick.', 'I don\'t bunt.'], scale: 1.18, torsoW: 1.4, torsoH: 1.0, headR: 0.9, props: ['flattop'], skin: 'skinC', motifSeed: 77 }),
  C({ id: 'sonny', name: 'Sonny Dumplin', short: 'DUMPLIN', bats: -1, throws: 1, contact: 6, power: 8, speed: 2, pitching: 6, pitches: ['SI', 'CH', 'CU'], traits: ['crowd'],
    catchphrases: ['Sunny side up!', 'Crowd, give me a woo!', 'Snack break after this.'], scale: 1.0, torsoW: 1.6, torsoH: 0.85, headR: 1.05, props: ['cap'], skin: 'skinD', motifSeed: 88 }),
  C({ id: 'duke', name: 'Duke Plunkett', short: 'PLUNKETT', bats: 1, throws: -1, contact: 5, power: 5, speed: 4, pitching: 8, pitches: ['SC', 'SI', 'CU'], traits: ['showboat'],
    catchphrases: ['Ta-daaa.', 'The Duke will see you now.', 'Applause is customary.'], scale: 1.08, torsoW: 1.05, torsoH: 1.05, headR: 0.95, props: ['moustache', 'tophat'], skin: 'skinA', motifSeed: 99 }),
  C({ id: 'ozzie', name: 'Ozzie Pockets', short: 'POCKETS', bats: -1, throws: 1, contact: 7, power: 4, speed: 9, pitching: 4, pitches: ['FF', 'SL'], traits: ['burner'],
    catchphrases: ['Got a base in my pocket.', 'Running is a lifestyle.', 'Wheels up!'], scale: 0.95, torsoW: 1.0, torsoH: 0.95, headR: 0.95, props: ['pockets', 'cap'], skin: 'skinB', motifSeed: 111 }),
  C({ id: 'clem', name: 'Clem Ashby', short: 'ASHBY', bats: 1, throws: 1, contact: 7, power: 7, speed: 6, pitching: 7, pitches: ['FF', 'SL', 'CH', 'CU'], traits: ['clutch'],
    catchphrases: ['Pressure is a privilege.', 'Big moment, small heartbeat.', 'Let\'s finish it.'], scale: 1.12, torsoW: 0.95, torsoH: 1.1, headR: 0.95, props: ['ponytail', 'cap'], skin: 'skinC', motifSeed: 122 }),
  C({ id: 'reggie', name: 'Reggie Fumbles', short: 'FUMBLES', bats: 1, throws: 1, contact: 5, power: 7, speed: 5, pitching: 6, pitches: ['KN', 'FF'], traits: ['streaky'],
    catchphrases: ['Whoops! I mean… nailed it.', 'Nobody saw that.', 'Fumbles never fumbles. Usually.'], scale: 1.0, torsoW: 1.1, torsoH: 1.0, headR: 1.0, props: ['goggles', 'cap'], skin: 'skinD', motifSeed: 133 }),
  // ---- unlockables ----
  C({ id: 'relish', name: 'Sir Relish', short: 'SIR RELISH', bats: 1, throws: 1, contact: 6, power: 8, speed: 5, pitching: 5, pitches: ['FF', 'SL', 'CH'], traits: ['crowd'],
    catchphrases: ['Condiments to the chef!', 'A dash of green.', 'Squeeze play!'], scale: 1.1, torsoW: 1.0, torsoH: 1.3, headR: 0.6, props: ['bottle'], skin: 'skinR', motifSeed: 144,
    unlock: { kind: 'hr', n: 10, label: 'Hit 10 career home runs' } }),
  C({ id: 'bleep', name: 'Bleep', short: 'BLEEP', bats: 1, throws: 1, contact: 10, power: 4, speed: 3, pitching: 7, pitches: ['FF', 'SL', 'SP'], traits: ['pesky'],
    catchphrases: ['STRIKE ZONE: CALIBRATED.', 'BEEP. HIT. BOOP.', 'I USED TO CALL THESE.'], scale: 1.05, torsoW: 1.25, torsoH: 1.05, headR: 0.9, props: ['robot'], skin: 'skinM', motifSeed: 155,
    unlock: { kind: 'perfect', n: 25, label: 'Land 25 PERFECT swings' } }),
  C({ id: 'spooky', name: 'Spooky Ferguson', short: 'FERGUSON', bats: -1, throws: -1, contact: 6, power: 5, speed: 10, pitching: 6, pitches: ['KN', 'SP'], traits: ['burner'],
    catchphrases: ['Boo-yah.', 'I\'ve been dead for this.', 'Haunting the basepaths.'], scale: 1.0, torsoW: 1.1, torsoH: 1.15, headR: 1.0, props: ['sheet'], skin: 'skinG', motifSeed: 166,
    unlock: { kind: 'clutchWin', n: 1, label: 'Win any Clutch Card' } }),
  C({ id: 'kettle', name: 'Big Mama Kettle', short: 'KETTLE', bats: 1, throws: 1, contact: 7, power: 10, speed: 2, pitching: 8, pitches: ['SC', 'CU', 'SI', 'FF'], traits: ['moonshot'],
    catchphrases: ['Tea time is over.', 'Steamin\'.', 'Pour it on!'], scale: 1.2, torsoW: 1.7, torsoH: 1.0, headR: 0.8, props: ['teapot'], skin: 'skinM', motifSeed: 177,
    unlock: { kind: 'mill', n: 3000, label: 'Score 3000 in Moonshot Mill' } }),
];

export const ROSTER_BY_ID: Record<string, Character> = Object.fromEntries(ROSTER.map((c) => [c.id, c]));
export const BASE_ROSTER = ROSTER.filter((c) => !c.unlock).map((c) => c.id);

export type TeamId = 'inkers' | 'hagfish' | 'gophers' | 'loons';
export interface TeamDef {
  id: TeamId;
  name: string;
  city: string;
  abbr: string;
  color: 'pink' | 'teal' | 'sun' | 'ink';
}
export const TEAMS: Record<TeamId, TeamDef> = {
  inkers: { id: 'inkers', city: 'Pressville', name: 'Inkers', abbr: 'PRS', color: 'pink' },
  hagfish: { id: 'hagfish', city: 'Harbor', name: 'Hagfish', abbr: 'HBR', color: 'teal' },
  gophers: { id: 'gophers', city: 'Gulch', name: 'Gophers', abbr: 'GUL', color: 'sun' },
  loons: { id: 'loons', city: 'Lumberton', name: 'Loons', abbr: 'LUM', color: 'ink' },
};

export const CREW_NAMES = ['Press Crew'];
