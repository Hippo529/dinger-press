// End-of-game bookkeeping: career stats, boards, unlocks, results screen data.
import { ROSTER_BY_ID, TEAMS } from '../config/roster';
import { scoreMult } from '../sim/flow';
import { ACHIEVEMENTS, unlocksFor } from '../sim/progression';
import type { GameState } from '../sim/state';
import { addToBoard, type SaveStore } from '../save/save';
import type { ResultsData } from '../ui/menus';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function unlockLabel(u: string): string {
  const [kind, id] = u.split(':');
  if (kind === 'char') return `New player: ${ROSTER_BY_ID[id]?.name ?? id}`;
  if (kind === 'stadium') return `New stadium: ${id === 'gutter' ? 'The Gutter' : 'Lighthouse Point'}`;
  if (kind === 'trail') return `Ball trail: ${id}`;
  if (kind === 'bat') return `Bat skin: ${id}`;
  if (kind === 'card') return `Binder card: ${ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id}`;
  return u;
}

export function finishGame(s: GameState, store: SaveStore, dateNum: number, playerName = 'YOU'): ResultsData {
  const data = store.data;
  const st = data.stats;
  const kind = s.cfg.kind;
  const heat = s.cfg.players[0]?.heat ?? 0;
  st.hr += s.stats.hr;
  st.perfect += s.stats.perfect;
  st.hits += s.stats.hits;
  st.ks += s.stats.ks;
  st.games++;
  st.pitchesSeen += s.pitchesSeen;
  st.longestHr = Math.max(st.longestHr, s.stats.longestHr);
  st.maxEv = Math.max(st.maxEv, s.stats.maxEv);
  st.bestPerfectStreak = Math.max(st.bestPerfectStreak, s.bestPerfectStreak);
  const humanTeam = s.cfg.humanBat[0] !== null ? 0 : 1;
  const won = s.winner === humanTeam;
  const date = today();
  const notes: string[] = [];
  if (s.stats.longestHr > 0 && addToBoard(data.boards.longestHr, { v: s.stats.longestHr, who: playerName, date }) >= 0) notes.push(`Longest homer: ${s.stats.longestHr} ft`);
  if (s.stats.maxEv > 0) addToBoard(data.boards.maxEv, { v: s.stats.maxEv, who: playerName, date });
  if (s.bestPerfectStreak > 0) addToBoard(data.boards.perfectStreak, { v: s.bestPerfectStreak, who: playerName, date });
  let title = 'FINAL';
  let sub = s.overReason;
  const rows: { name: string; value: string }[] = [];
  if (kind === 'short') {
    if (won) st.wins++;
    if (won && s.overReason === 'mercy rule') st.mercyWins++;
    title = won ? (s.walkoff ? 'WALK-OFF!' : s.overReason === 'mercy rule' ? 'MERCY!' : 'YOU WIN') : 'TOUGH LOSS';
  } else if (kind === 'proof') {
    const n = s.cfg.players[s.winner]?.name ?? 'P' + (s.winner + 1);
    title = `${n.toUpperCase()} WINS`;
  } else if (kind === 'clutch') {
    const card = s.cfg.clutch!;
    title = s.clutchResult === 'win' ? 'CARD CLEARED' : 'NOT TODAY';
    sub = card.title;
    if (s.clutchResult === 'win') {
      st.clutchWins++;
      addToBoard(data.boards.clutchWins, { v: st.clutchWins, who: playerName, date });
      if (card.id.startsWith('daily')) {
        if (!data.flags.dailyDone.includes(String(dateNum))) data.flags.dailyDone.push(String(dateNum));
      } else if (!data.flags.clutchCleared.includes(card.id)) data.flags.clutchCleared.push(card.id);
    }
  } else if (kind === 'mill') {
    const m = s.mill!;
    title = 'MILL RESULTS';
    s.cfg.players.forEach((p, i) => {
      rows.push({ name: `${p.name} · ${ROSTER_BY_ID[s.cfg.mill!.chars[i]].short}`, value: String(Math.round(m.scores[i])) });
      if (m.scores[i] > 0) addToBoard(data.boards.bestMill, { v: Math.round(m.scores[i]), who: p.name, date });
      st.millBest = Math.max(st.millBest, Math.round(m.scores[i]));
    });
    rows.sort((a, b) => Number(b.value) - Number(a.value));
    sub = `${s.cfg.players[s.winner]?.name ?? ''} takes it · HEAT ×${scoreMult(heat, s.cfg.hideLocator).toFixed(2)}`;
  } else if (kind === 'cage') {
    title = 'CAGE DONE';
  }
  data.flags.firstRunDone = true;
  const prog = { ...st, dailyDone: data.flags.dailyDone.length, clutchCleared: data.flags.clutchCleared.length };
  const before = new Set(data.unlocks);
  const all = unlocksFor(prog);
  const fresh = all.filter((u) => !before.has(u));
  data.unlocks = [...new Set([...data.unlocks, ...all])];
  store.save();
  const line = kind === 'short' || kind === 'proof' || kind === 'clutch'
    ? s.teams.map((t) => {
        const n = Math.max(s.cfg.innings, s.inning);
        const runs = Array.from({ length: n }, (_, i) => t.line[i] ?? 0);
        return { abbr: TEAMS[t.setup.teamId].abbr, runs, total: t.runs, hits: t.hits };
      })
    : undefined;
  if (s.stats.perfect) notes.push(`${s.stats.perfect} PERFECT swing${s.stats.perfect > 1 ? 's' : ''}`);
  if (s.stats.maxEv) notes.push(`Top exit velo ${s.stats.maxEv.toFixed(1)} mph`);
  return { title, sub, win: kind === 'clutch' ? s.clutchResult === 'win' : won, line, rows: rows.length ? rows : undefined, notes, newUnlocks: fresh.map(unlockLabel) };
}
