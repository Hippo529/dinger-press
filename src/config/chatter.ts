// PA announcer "Gus Ferrule": situational chatter. Never repeats a line back-to-back.
export const CHATTER: Record<string, string[]> = {
  paStart: [
    'Now batting… {name}.',
    '{name} digs in. The ink is wet.',
    'Here comes {name}. Hide the snacks.',
    'Stepping in: {name}. Allegedly ready.',
    '{name}, ladies and gentlemen. Some of you came for this.',
    'Up next, {name}, fresh off the press.',
  ],
  homeRun: [
    'GOODBYE, BASEBALL!',
    'That one is printed in the next edition!',
    'Somebody call the parking lot!',
    'Moonshot! Gus needs a minute.',
    'Off the bat and out of the paper!',
    "That ball has left the county. Tell it we said hi.",
  ],
  strikeout: [
    'Sit down, champ.',
    'Three strikes, one long walk back.',
    'Struck out. The fan behind home plate felt that breeze.',
    'K! Put it on the fridge.',
    'Swing and a regret.',
  ],
  walk: ['Ball four. Take the scenic route.', 'Free pass! Even Gus could do that.', 'Walk. The pitcher is reconsidering choices.'],
  hit: [
    'Base knock!',
    'That one found grass.',
    'Hit! The scorer approves.',
    'Clean single. Neat, tidy, printed.',
    'Into the outfield it goes.',
  ],
  extraBase: ['Two-bagger and then some!', 'Off the wall! Somebody fetch it!', 'Running hard — extra bases!'],
  doublePlay: ['Two for the price of one!', 'Twin killing! Gus loves a deal.', 'Turned two. Textbook. Literally, we printed the textbook.'],
  out: ['Routine. Gus is yawning.', 'Caught. Next!', 'And that is an out.', 'Gloved. Rude.'],
  starChance: ['STAR CHANCE! Everybody lean forward.', 'Big moment. The crowd is holding its breath and its nachos.', 'This is the at-bat they print posters about.'],
  starPitch: ['Uh oh. That pitch had a siren on it.', 'Star Pitch! Hide your eyes.'],
  halfEnd: ['Switch sides! Stretch your legs.', 'That will do it for the half.', 'Teams trade places. The ink dries.'],
  mercy: ['Mercy! The press has stopped.', "That's enough. Somebody turn off the scoreboard."],
  walkoff: ['WALK-OFF! Run onto the field! (Please don\'t.)', 'Ballgame! Go home happy!'],
  diving: ['Diving catch! Grass stains for days!', 'Laid out for it! Gus spilled his coffee!'],
  gameOver: ['That is the final. Thanks for reading.', 'Final edition, folks. Drive safe.'],
};

export function chatterCount(): number {
  return Object.values(CHATTER).reduce((a, b) => a + b.length, 0);
}

/** Cosmetic picker (no game impact): cycles through a key's lines, never the same line twice in a row. */
export class ChatterPicker {
  private last = '';
  private n = 0;
  pick(key: string, vars: Record<string, string> = {}): string | null {
    const lines = CHATTER[key];
    if (!lines || !lines.length) return null;
    this.n = (this.n * 1103515245 + 12345 + key.length) >>> 0;
    let i = this.n % lines.length;
    if (lines[i] === this.last && lines.length > 1) i = (i + 1) % lines.length;
    const raw = lines[i];
    this.last = raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  }
  get lastRaw(): string {
    return this.last;
  }
}
