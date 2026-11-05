// DOM menu screens in the Overprint style. Gameplay HUD stays on the canvas (D3).
import { ROSTER, ROSTER_BY_ID, TEAMS, type TeamId } from '../config/roster';
import { CLUTCH_CARDS, dailyCard, TIER_DEFAULT_HEAT } from '../sim/modes';
import { PITCHES } from '../sim/pitch';
import { ACHIEVEMENTS } from '../sim/progression';
import type { ClutchSpec } from '../sim/state';
import type { PitchType, Tier } from '../sim/types';
import type { SaveStore } from '../save/save';
import { arrowNav, btn, el, field, seg, slider, activate } from './dom';
import { settingsScreen } from './settings';

export type ScreenId = 'title' | 'modes' | 'setup' | 'mill' | 'proof' | 'clutch' | 'clutchIntro' | 'cage' | 'pause' | 'settings' | 'results' | 'records' | 'howto' | 'binder' | 'resume';

export interface PlayerSetup {
  name: string;
  heat: number;
  tier: Tier;
  char: string;
}

export interface ResultsData {
  title: string;
  sub: string;
  win: boolean;
  line?: { abbr: string; runs: number[]; total: number; hits: number }[];
  rows?: { name: string; value: string }[];
  notes: string[];
  newUnlocks: string[];
}

export interface UiHost {
  save: SaveStore;
  go(id: ScreenId): void;
  back(): void;
  startShortRun(): void;
  startMill(players: PlayerSetup[], bracket?: boolean): void;
  startProof(players: PlayerSetup[]): void;
  startClutch(card: ClutchSpec): void;
  previewClutch(card: ClutchSpec): void;
  pendingCard(): ClutchSpec | null;
  startCage(pitch: PitchType | 'mix'): void;
  startDuel(): void;
  resume(): void;
  restart(): void;
  quit(): void;
  settingsChanged(): void;
  results(): ResultsData | null;
  unlockedChars(): string[];
  today(): number;
}

function screen(cls = 'dim', ...children: (Node | null)[]): HTMLElement {
  const s = el('div', { class: `screen ${cls}` });
  for (const c of children) if (c) s.append(c);
  arrowNav(s);
  return s;
}

function card(title: string, desc: string, kicker: string, fn: () => void, cls = '', id?: string): HTMLElement {
  const b = el('button', { class: `card ${cls}`, type: 'button' }, el('span', { class: 't' }, title), el('span', { class: 'd' }, desc), el('span', { class: 'k' }, kicker));
  if (id) b.dataset.id = id;
  return activate(b, fn, true);
}

export function buildScreen(id: ScreenId, host: UiHost): HTMLElement {
  const st = host.save.data.settings;
  switch (id) {
    case 'title':
      return screen(
        'clear',
        el('div', { class: 'logo', role: 'heading', 'aria-level': '1' }, 'DINGER', el('br'), 'PRESS'),
        el('div', { class: 'tagline' }, 'Overprint Baseball · Night Edition'),
        el('div', { class: 'spacer' }),
        el('div', { class: 'col stagger' },
          btn('PLAY', () => host.go('modes'), 'primary', false, 'play'),
          el('div', { class: 'row' }, btn('How to play', () => host.go('howto'), 'small teal', false, 'howto'), btn('Records', () => host.go('records'), 'small teal', false, 'records'), btn('Settings', () => host.go('settings'), 'small teal', false, 'settings')),
        ),
      );
    case 'modes':
      return screen('dim',
        el('h2', {}, 'Pick a Run'),
        el('div', { class: 'col stagger' },
          card('SHORT RUN', '3 innings vs the CPU. Mercy at 6.', '▶', () => host.startShortRun(), 'hot', 'mode-short'),
          card('MOONSHOT MILL', 'Dinger derby. 10 outs. Pass the phone, 1–8 players.', '★', () => host.go('mill'), '', 'mode-mill'),
          card('PASS THE PROOF', 'Two players, one phone. Each bats their own half.', '⇄', () => host.go('proof'), '', 'mode-proof'),
          card('CLUTCH CARDS', "Half-inning scenarios + Today's Edition.", '♣', () => host.go('clutch'), '', 'mode-clutch'),
          card('THE CAGE', 'Practice. No outs. Millisecond readout.', '◎', () => host.go('cage'), '', 'mode-cage'),
          card('DESKTOP DUEL', 'Shared keyboard: P1 swings with Space, P2 pitches with the mouse.', '⌨', () => host.startDuel(), '', 'mode-duel'),
          el('div', { class: 'row' }, btn('Setup', () => host.go('setup'), 'small teal', false, 'setup'), btn('Back', () => host.back(), 'small', false, 'back')),
        ),
      );
    case 'setup':
      return setupScreen(host);
    case 'mill':
      return partyScreen(host, 'mill');
    case 'proof':
      return partyScreen(host, 'proof');
    case 'clutch': {
      const cleared = new Set(host.save.data.flags.clutchCleared);
      const daily = dailyCard(host.today());
      return screen('dim',
        el('h2', {}, 'Clutch Cards'),
        el('div', { class: 'col stagger' },
          card("TODAY'S EDITION", daily.blurb, '☀', () => host.previewClutch(daily), host.save.data.flags.dailyDone.includes(String(host.today())) ? 'stamped hot' : 'hot', 'card-daily'),
          ...CLUTCH_CARDS.map((c, i) => card(c.title.toUpperCase(), c.blurb, String(i + 1), () => host.previewClutch(c), cleared.has(c.id) ? 'stamped' : '', 'card-' + c.id)),
          btn('Back', () => host.back(), 'small', false, 'back'),
        ),
      );
    }
    case 'clutchIntro': {
      const c = host.pendingCard();
      if (!c) return screen('dim', btn('Back', () => host.back(), 'small', false, 'back'));
      const bases = ['1ST', '2ND', '3RD'].filter((_, i) => c.bases[i]).join(' · ') || 'BASES EMPTY';
      const goal = c.homerSwings ? `Hit ${c.homersNeeded ?? 1} home run${(c.homersNeeded ?? 1) > 1 ? 's' : ''} in ${c.homerSwings} swings` : c.side === 'bat' ? `Score ${c.runs} run${c.runs > 1 ? 's' : ''} before the third out` : `Get ${c.outsToGet ?? 3 - c.outs} out${(c.outsToGet ?? 3 - c.outs) > 1 ? 's' : ''} — allow ${c.runs === 0 ? 'no runs' : `${c.runs} run${c.runs > 1 ? 's' : ''} at most`}`;
      return screen('dim',
        el('div', { class: 'stamp' }, c.title.toUpperCase()),
        el('div', { class: 'tagline' }, c.side === 'bat' ? 'You bat' : 'You pitch'),
        el('div', { class: 'col stagger' },
          el('div', { class: 'panel' },
            el('h3', {}, 'THE SITUATION'),
            el('p', {}, c.blurb),
            field('Score', el('span', { class: 'heat' }, `${c.scoreHuman}–${c.scoreCpu}`)),
            field('Outs · count', el('span', { class: 'heat' }, `${c.outs} · ${c.balls}-${c.strikes}`)),
            field('Runners', el('span', { class: 'heat' }, bases)),
          ),
          el('div', { class: 'panel' }, el('h3', {}, 'TO WIN'), el('p', {}, goal)),
          btn('PLAY CARD', () => host.startClutch(c), 'primary', false, 'card-start'),
          btn('Back', () => host.back(), 'small', false, 'back'),
        ),
      );
    }
    case 'cage': {
      let pitch: PitchType | 'mix' = 'FF';
      const opts = (['mix', 'FF', 'SI', 'CU', 'SL', 'CH', 'SP', 'SC', 'KN'] as const).map((p) => ({ v: p as PitchType | 'mix', label: p === 'mix' ? 'MIX' : PITCHES[p].short }));
      return screen('dim',
        el('h2', {}, 'The Cage'),
        el('div', { class: 'col' },
          el('div', { class: 'panel' },
            el('h3', {}, 'Pitch'),
            seg(opts.slice(0, 5), pitch, (v) => (pitch = v), 'cage-pitch-a'),
            el('div', { style: 'height:8px' }),
            seg(opts.slice(5), pitch, (v) => (pitch = v), 'cage-pitch-b'),
            field('HEAT', slider(0, 99, st.heat, (v) => { st.heat = v; host.settingsChanged(); }, 'cage-heat')),
          ),
          btn('START', () => host.startCage(pitch), 'primary', false, 'cage-start'),
          btn('Back', () => host.back(), 'small', false, 'back'),
        ),
      );
    }
    case 'pause':
      return screen('dim',
        el('h2', {}, 'Paused'),
        el('div', { class: 'col stagger' },
          btn('RESUME', () => host.resume(), 'primary', false, 'resume'),
          btn('Restart', () => host.restart(), '', false, 'restart'),
          btn('Settings', () => host.go('settings'), 'teal', false, 'settings'),
          btn('Quit to title', () => host.quit(), '', false, 'quit'),
        ),
      );
    case 'settings':
      return settingsScreen(host, screen);
    case 'results':
      return resultsScreen(host);
    case 'records':
      return recordsScreen(host);
    case 'howto':
      return screen('dim howto',
        el('h2', {}, 'How to Play'),
        el('div', { class: 'col stagger' },
          el('div', { class: 'panel' }, el('h3', {}, 'SWING'), el('p', {}, 'Tap (or Space) as the ball reaches the zone. Early pulls, late goes the other way. The timing bar shows you where you were.')),
          el('div', { class: 'panel' }, el('h3', {}, 'STRIKES & BALLS'), el('p', {}, 'Take a pitch in the box: STRIKE. Outside: BALL. 3 strikes = out. 4 balls = free walk to first.')),
          el('div', { class: 'panel' }, el('h3', {}, 'OUTS & INNINGS'), el('p', {}, '3 outs and the sides switch. 3 innings in a Short Run. Up by 6+ after the 1st or 2nd? Mercy.')),
          el('div', { class: 'panel' }, el('h3', {}, 'PITCHING'), el('p', {}, 'Pick a pitch, hold in the zone, release in the gold band. Drag to steer. Mix pitches — tired arms get hit.')),
          btn('Got it', () => host.back(), 'primary', false, 'back'),
        ),
      );
    case 'binder':
      return binderScreen(host);
    case 'resume':
      return screen('resume', el('h2', {}, 'Paused'), btn('TAP TO RESUME', () => host.resume(), 'primary', false, 'resume'), el('p', { class: 'note' }, 'Sound and play resume when you tap.'));
  }
}

function setupScreen(host: UiHost): HTMLElement {
  const st = host.save.data.settings;
  const chars = host.unlockedChars();
  const heatVal = el('span');
  const heat = slider(0, 99, st.heat, (v) => { st.heat = v; host.settingsChanged(); }, 'setup-heat');
  heatVal.append(heat);
  const teamOpts = (Object.keys(TEAMS) as TeamId[]).map((t) => ({ v: t, label: TEAMS[t].abbr }));
  const stadiums = [{ v: 'yard' as const, label: 'YARD' }, ...(host.save.data.unlocks.includes('stadium:gutter') ? [{ v: 'gutter' as const, label: 'GUTTER' }] : []), ...(host.save.data.unlocks.includes('stadium:lighthouse') ? [{ v: 'lighthouse' as const, label: 'LIGHT' }] : [])];
  return screen('dim',
    el('h2', {}, 'Setup'),
    el('div', { class: 'col' },
      el('div', { class: 'panel' },
        field('Tier', seg<Tier>([{ v: 'rookie', label: 'ROOKIE' }, { v: 'pro', label: 'PRO' }, { v: 'allstar', label: 'ALL-STAR' }], st.tier, (v) => {
          st.tier = v;
          st.heat = TIER_DEFAULT_HEAT[v];
          (heat.querySelector('input') as HTMLInputElement).value = String(st.heat);
          (heat.querySelector('.heat') as HTMLElement).textContent = String(st.heat);
          host.settingsChanged();
        }, 'setup-tier')),
        field('HEAT (0–99)', heatVal),
        field('Your team', seg<TeamId>(teamOpts, st.team, (v) => { st.team = v; host.settingsChanged(); }, 'setup-team')),
        field('Captain', seg<string>([{ v: 'auto', label: 'AUTO' }, ...chars.slice(0, 3).map((c) => ({ v: c, label: ROSTER_BY_ID[c].short.slice(0, 6) }))], st.captain ?? 'auto', (v) => { st.captain = v === 'auto' ? null : v; host.settingsChanged(); }, 'setup-captain')),
        field('Bat first', seg<string>([{ v: 'on', label: 'YES' }, { v: 'off', label: 'NO' }], st.batFirst ? 'on' : 'off', (v) => { st.batFirst = v === 'on'; host.settingsChanged(); }, 'setup-batfirst')),
        field('Stadium', seg(stadiums, st.stadium, (v) => { st.stadium = v; host.settingsChanged(); }, 'setup-stadium')),
        field('Bat', seg<string>(['wood', 'gold', 'zebra', 'riso'].filter((b) => b === 'wood' || host.save.data.unlocks.includes('bat:' + b)).map((b) => ({ v: b, label: b.toUpperCase() })), st.bat ?? 'wood', (v) => { st.bat = v; host.settingsChanged(); }, 'setup-bat')),
      ),
      el('p', { class: 'note' }, 'Tiers change the controls only. HEAT smoothly scales pitch speed, timing windows and CPU skill — and multiplies your scores.'),
      btn('Done', () => host.back(), 'primary', false, 'done'),
    ),
  );
}

function partyScreen(host: UiHost, kind: 'mill' | 'proof'): HTMLElement {
  const st = host.save.data.settings;
  const chars = host.unlockedChars();
  const players: PlayerSetup[] = [];
  let bracket = false;
  const list = el('div', { class: 'col' });
  const add = () => {
    const i = players.length;
    players.push({ name: `P${i + 1}`, heat: st.heat, tier: st.tier, char: chars[(i * 3) % chars.length] });
  };
  add();
  if (kind === 'proof') add();
  const render = () => {
    list.replaceChildren(
      ...players.map((p, i) => {
        const charBtn = btn(ROSTER_BY_ID[p.char].short, () => {
          p.char = chars[(chars.indexOf(p.char) + 1) % chars.length];
          charBtn.textContent = ROSTER_BY_ID[p.char].short;
        }, 'small teal', true, `party-char-${i}`);
        return el('div', { class: 'panel' },
          el('h3', {}, p.name),
          kind === 'mill' ? field('Slugger', charBtn) : null,
          field('Tier', seg<Tier>([{ v: 'rookie', label: 'RKE' }, { v: 'pro', label: 'PRO' }, { v: 'allstar', label: 'ALL★' }], p.tier, (v) => { p.tier = v; }, `party-tier-${i}`)),
          field('HEAT', slider(0, 99, p.heat, (v) => { p.heat = v; }, `party-heat-${i}`)),
        );
      }),
    );
  };
  render();
  const controls = kind === 'mill'
    ? el('div', { class: 'row' },
        btn('+ Player', () => { if (players.length < 8) { add(); render(); } }, 'small teal', false, 'party-add'),
        btn('− Player', () => { if (players.length > 1) { players.pop(); render(); } }, 'small', false, 'party-remove'),
        el('span', { class: 'note' }, 'Bracket (4+):'),
        seg<string>([{ v: 'off', label: 'OFF' }, { v: 'on', label: 'ON' }], 'off', (v) => { bracket = v === 'on'; }, 'party-bracket'))
    : null;
  return screen('dim',
    el('h2', {}, kind === 'mill' ? 'Moonshot Mill' : 'Pass the Proof'),
    el('div', { class: 'col' },
      list,
      controls,
      btn('START', () => (kind === 'mill' ? host.startMill(players, bracket) : host.startProof(players)), 'primary', false, 'party-start'),
      btn('Back', () => host.back(), 'small', false, 'back'),
    ),
  );
}

function resultsScreen(host: UiHost): HTMLElement {
  const r = host.results();
  if (!r) return screen('dim', btn('Menu', () => host.quit(), 'primary'));
  const table = r.line
    ? el('table', { class: 'line' },
        el('tr', {}, el('th', {}, ''), ...r.line[0].runs.map((_, i) => el('th', {}, String(i + 1))), el('th', {}, 'R'), el('th', {}, 'H')),
        ...r.line.map((t) => el('tr', {}, el('th', {}, t.abbr), ...t.runs.map((x) => el('td', {}, String(x))), el('td', {}, String(t.total)), el('td', {}, String(t.hits)))),
      )
    : null;
  const rows = r.rows ? el('div', { class: 'panel col' }, ...r.rows.map((x) => field(x.name, el('span', { class: 'heat' }, x.value)))) : null;
  return screen('dim',
    el('div', { class: 'stamp' }, r.title),
    el('div', { class: 'tagline' }, r.sub),
    el('div', { class: 'col stagger' },
      table,
      rows,
      ...r.notes.map((n) => el('p', { class: 'note' }, n)),
      ...r.newUnlocks.map((u) => el('div', { class: 'panel' }, el('h3', {}, 'UNLOCKED'), el('p', {}, u))),
      btn('PLAY AGAIN', () => host.restart(), 'primary', false, 'again'),
      btn('Menu', () => host.quit(), '', false, 'menu'),
    ),
  );
}

function recordsScreen(host: UiHost): HTMLElement {
  const b = host.save.data.boards;
  const names: [keyof typeof b, string, (v: number) => string][] = [
    ['longestHr', 'Longest homer', (v) => `${Math.round(v)} ft`],
    ['bestMill', 'Best Mill', (v) => `${Math.round(v)}`],
    ['maxEv', 'Top exit velo', (v) => `${v.toFixed(1)} mph`],
    ['perfectStreak', 'PERFECT streak', (v) => `${v}`],
    ['clutchWins', 'Clutch wins', (v) => `${v}`],
  ];
  const earned = new Set(host.save.data.unlocks);
  return screen('dim',
    el('h2', {}, 'Records'),
    el('div', { class: 'col stagger' },
      ...names.map(([k, label, f]) => el('div', { class: 'panel' }, el('h3', {}, label.toUpperCase()), ...(b[k].length ? b[k].map((e, i) => field(`${i + 1}. ${e.who} · ${e.date}`, el('span', { class: 'heat' }, f(e.v)))) : [el('p', {}, '— no entries yet —')]))),
      el('div', { class: 'panel' }, el('h3', {}, 'ACHIEVEMENTS'), ...ACHIEVEMENTS.map((a) => field(`${a.unlocks.some((u) => earned.has(u)) ? '★' : '☆'} ${a.name}`, el('span', {}, a.desc)))),
      btn('Card binder', () => host.go('binder'), 'teal', false, 'binder'),
      btn('Back', () => host.back(), 'small', false, 'back'),
    ),
  );
}

function binderScreen(host: UiHost): HTMLElement {
  const earned = new Set(host.save.data.unlocks);
  const slots = [
    ...ROSTER.map((c) => ({ id: 'char:' + c.id, label: c.name, have: !c.unlock || earned.has('char:' + c.id) })),
    ...ACHIEVEMENTS.map((a) => ({ id: 'card:' + a.id, label: a.name, have: earned.has('card:' + a.id) })),
  ];
  return screen('dim',
    el('h2', {}, 'Card Binder'),
    el('div', { class: 'binder' }, ...slots.map((s) => el('div', { class: `slot ${s.have ? '' : 'locked'}` }, s.have ? s.label : '???'))),
    el('div', { style: 'height:12px' }),
    btn('Back', () => host.back(), 'small', false, 'back'),
  );
}
