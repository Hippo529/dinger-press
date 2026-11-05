// Achievements → unlocks. Pure: stats in, unlock ids out. No currency, no stat upgrades.
export interface ProgressStats {
  hr: number;
  perfect: number;
  hits: number;
  ks: number;
  wins: number;
  clutchWins: number;
  millBest: number;
  longestHr: number;
  maxEv: number;
  bestPerfectStreak: number;
  mercyWins: number;
  dailyDone: number;
  clutchCleared: number;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  test: (s: ProgressStats) => boolean;
  unlocks: string[]; // 'char:relish', 'stadium:gutter', 'trail:sun', 'bat:gold', 'card:<id>'
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstHit', name: 'First Ink', desc: 'Get your first hit', test: (s) => s.hits >= 1, unlocks: ['trail:sun', 'card:firstHit'] },
  { id: 'firstHr', name: 'Dinger!', desc: 'Hit your first home run', test: (s) => s.hr >= 1, unlocks: ['trail:pink', 'card:firstHr'] },
  { id: 'hr10', name: 'Ten Spot', desc: 'Hit 10 career home runs', test: (s) => s.hr >= 10, unlocks: ['char:relish', 'card:hr10'] },
  { id: 'perfect25', name: 'Calibrated', desc: 'Land 25 PERFECT swings', test: (s) => s.perfect >= 25, unlocks: ['char:bleep', 'card:perfect25'] },
  { id: 'clutchWin', name: 'Ice Water', desc: 'Win any Clutch Card', test: (s) => s.clutchWins >= 1, unlocks: ['char:spooky', 'card:clutchWin'] },
  { id: 'mill3000', name: 'Moon Miller', desc: 'Score 3000 in Moonshot Mill', test: (s) => s.millBest >= 3000, unlocks: ['char:kettle', 'card:mill3000'] },
  { id: 'hr400', name: 'Into the Gutter', desc: 'Hit a 400+ ft home run', test: (s) => s.longestHr >= 400, unlocks: ['stadium:gutter', 'card:hr400'] },
  { id: 'win1', name: 'First Edition', desc: 'Win a Short Run', test: (s) => s.wins >= 1, unlocks: ['trail:teal', 'card:win1'] },
  { id: 'ks10', name: 'Ink Blot', desc: 'Strike out 10 batters', test: (s) => s.ks >= 10, unlocks: ['trail:comet', 'card:ks10'] },
  { id: 'perfectStreak3', name: 'Hat Trick', desc: '3 PERFECT swings in a row', test: (s) => s.bestPerfectStreak >= 3, unlocks: ['bat:gold', 'card:perfectStreak3'] },
  { id: 'ev110', name: 'Exit Wound', desc: 'Hit a ball 110+ mph', test: (s) => s.maxEv >= 110, unlocks: ['bat:zebra', 'card:ev110'] },
  { id: 'mercy', name: 'Mercy Me', desc: 'Win by the mercy rule', test: (s) => s.mercyWins >= 1, unlocks: ['bat:riso', 'card:mercy'] },
  { id: 'daily', name: 'Morning Edition', desc: "Clear Today's Edition", test: (s) => s.dailyDone >= 1, unlocks: ['card:daily'] },
  { id: 'clutchAll', name: 'Collector', desc: 'Clear all 8 Clutch Cards', test: (s) => s.clutchCleared >= 8, unlocks: ['stadium:lighthouse', 'card:clutchAll'] },
];

/** Returns the full set of unlock ids earned by these stats. */
export function unlocksFor(s: ProgressStats): string[] {
  const out = new Set<string>();
  for (const a of ACHIEVEMENTS) if (a.test(s)) for (const u of a.unlocks) out.add(u);
  return [...out];
}

export function earnedAchievements(s: ProgressStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(s)).map((a) => a.id);
}

export const TRAILS = ['paper', 'sun', 'pink', 'teal', 'comet'];
export const BATS = ['wood', 'gold', 'zebra', 'riso'];
