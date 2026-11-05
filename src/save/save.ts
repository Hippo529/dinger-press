// Versioned localStorage save with migrations, try/catch everywhere and an in-memory fallback.
import type { Aggression, Tier } from '../sim/types';

export const SAVE_KEY = 'dingerpress.save';
export const SAVE_VERSION = 2;

export interface Settings {
  tier: Tier;
  heat: number;
  lefty: boolean;
  aggression: Aggression;
  assistPitch: boolean;
  showLocator: boolean;
  hideLocatorExpert: boolean;
  showTimingMs: boolean;
  reduceMotion: boolean | null; // null = follow prefers-reduced-motion
  shakePct: 0 | 50 | 100;
  flashes: boolean;
  slowmo: boolean;
  muted: boolean;
  volume: number;
  silentModeAudio: boolean;
  haptics: boolean;
  batFirst: boolean;
  stadium: 'yard' | 'gutter' | 'lighthouse';
  trail: string;
  captain: string | null;
  team: 'inkers' | 'hagfish' | 'gophers' | 'loons';
}

export interface Stats {
  hr: number;
  perfect: number;
  hits: number;
  ks: number;
  games: number;
  wins: number;
  clutchWins: number;
  millBest: number;
  pitchesSeen: number;
  longestHr: number;
  maxEv: number;
  bestPerfectStreak: number;
  mercyWins: number;
}

export interface BoardEntry {
  v: number;
  who: string;
  date: string;
}

export interface SaveData {
  v: number;
  settings: Settings;
  stats: Stats;
  unlocks: string[];
  boards: Record<'longestHr' | 'bestMill' | 'maxEv' | 'perfectStreak' | 'clutchWins', BoardEntry[]>;
  flags: { firstRunDone: boolean; tutorialSeen: string[]; dailyDone: string[]; clutchCleared: string[] };
}

export function defaultSettings(): Settings {
  return {
    tier: 'rookie', heat: 0, lefty: false, aggression: 'conservative', assistPitch: false, showLocator: true, hideLocatorExpert: false,
    showTimingMs: false, reduceMotion: null, shakePct: 100, flashes: true, slowmo: true, muted: false, volume: 0.8, silentModeAudio: false,
    haptics: false, batFirst: true, stadium: 'yard', trail: 'paper', captain: null, team: 'inkers',
  };
}

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    settings: defaultSettings(),
    stats: { hr: 0, perfect: 0, hits: 0, ks: 0, games: 0, wins: 0, clutchWins: 0, millBest: 0, pitchesSeen: 0, longestHr: 0, maxEv: 0, bestPerfectStreak: 0, mercyWins: 0 },
    unlocks: [],
    boards: { longestHr: [], bestMill: [], maxEv: [], perfectStreak: [], clutchWins: [] },
    flags: { firstRunDone: false, tutorialSeen: [], dailyDone: [], clutchCleared: [] },
  };
}

/** Migrate any older shape to the current version. v0 = un-versioned prototype; v1 lacked boards/flags. */
export function migrate(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const v = typeof r.v === 'number' ? r.v : 0;
  let data: Record<string, unknown> = { ...r };
  if (v < 1) {
    // v0 stored a flat { heat, tier, hr }.
    data = { v: 1, settings: { heat: r.heat, tier: r.tier }, stats: { hr: r.hr }, unlocks: [] };
  }
  if (v < 2) {
    data.boards = data.boards ?? d.boards;
    data.flags = data.flags ?? d.flags;
    data.v = 2;
  }
  const settings = { ...d.settings, ...(clean(data.settings) as Partial<Settings>) };
  const stats = { ...d.stats, ...(clean(data.stats) as Partial<Stats>) };
  const boards = { ...d.boards, ...(clean(data.boards) as Partial<SaveData['boards']>) };
  const flags = { ...d.flags, ...(clean(data.flags) as Partial<SaveData['flags']>) };
  const unlocks = Array.isArray(data.unlocks) ? (data.unlocks as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return { v: SAVE_VERSION, settings, stats, unlocks, boards, flags };
}

function clean(o: unknown): Record<string, unknown> {
  if (!o || typeof o !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (v !== undefined && v !== null) out[k] = v;
  return out;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export class SaveStore {
  data: SaveData;
  private mem: string | null = null;
  usingMemory = false;
  constructor(private storage: StorageLike | null) {
    this.data = this.load();
  }
  private read(): string | null {
    try {
      if (!this.storage) throw new Error('no storage');
      return this.storage.getItem(SAVE_KEY);
    } catch {
      this.usingMemory = true;
      return this.mem;
    }
  }
  load(): SaveData {
    const txt = this.read();
    if (!txt) return defaultSave();
    try {
      return migrate(JSON.parse(txt));
    } catch {
      return defaultSave();
    }
  }
  save(): void {
    const txt = JSON.stringify(this.data);
    this.mem = txt;
    try {
      if (!this.storage) throw new Error('no storage');
      this.storage.setItem(SAVE_KEY, txt);
    } catch {
      this.usingMemory = true;
    }
  }
  reset(): void {
    this.data = defaultSave();
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      /* memory fallback */
    }
    this.mem = null;
  }
  exportCode(): string {
    return toBase64(JSON.stringify(this.data));
  }
  importCode(code: string): boolean {
    try {
      this.data = migrate(JSON.parse(fromBase64(code.trim())));
      this.save();
      return true;
    } catch {
      return false;
    }
  }
}

export function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Insert into a top-5 board (descending). Returns the rank (0-based) or −1. */
export function addToBoard(board: BoardEntry[], e: BoardEntry): number {
  board.push(e);
  board.sort((a, b) => b.v - a.v);
  if (board.length > 5) board.length = 5;
  return board.indexOf(e);
}
