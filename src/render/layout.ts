// HUD layout: one source of truth for drawing AND hit-testing (D3). All units CSS px.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Layout {
  w: number;
  h: number;
  portrait: boolean;
  insets: Insets;
  lefty: boolean;
  scoreboard: Rect;
  pause: Rect;
  power: Rect;
  star: Rect;
  pitchChips: Rect[]; // up to 4
  stamina: Rect;
  throwBtns: Rect[]; // index 0..3 => 1B, 2B, 3B, HOME
  send: Rect;
  hold: Rect;
  timingBar: Rect;
  banner: Rect;
  prompt: Rect;
  pad: Rect; // swing pad (Pro direction thirds)
  /** contact-plane mapping: screen = (cx + x·s, cy − (z − 2.55)·s) */
  plane: { cx: number; cy: number; s: number };
}

export const MIN_TARGET = 44;

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function computeLayout(w: number, h: number, insets: Insets, lefty: boolean): Layout {
  const portrait = h >= w;
  const m = 12;
  const top = insets.top + 8;
  const bottom = h - insets.bottom - m;
  const left = insets.left + m;
  const right = w - insets.right - m;
  const chip = portrait ? 68 : 62;
  const sbW = portrait ? right - left - 54 : Math.min(420, (right - left) * 0.5);
  const scoreboard = { x: left, y: top, w: sbW, h: portrait ? 58 : 52 };
  const pause = { x: portrait ? right - 46 : left + sbW + 8, y: top + 6, w: 46, h: 46 };
  // POWER/STAR in the thumb corner (bottom-right; mirrored for left-handed players).
  const cornerX = lefty ? left : right - chip;
  const power = { x: cornerX, y: bottom - chip, w: chip, h: chip };
  const star = { x: cornerX, y: bottom - 2 * chip - 10, w: chip, h: chip };
  // Pitch chips along the bottom on the other side.
  const pcW = portrait ? Math.min(78, (right - left - chip - 24) / 4) : 74;
  const pcH = 56;
  const pcStart = lefty ? left + chip + 14 : left;
  const pitchChips = [0, 1, 2, 3].map((i) => ({ x: pcStart + i * (pcW + 6), y: bottom - pcH, w: pcW, h: pcH }));
  const stamina = { x: pcStart, y: bottom - pcH - 16, w: 4 * pcW + 18, h: 8 };
  // Throw buttons: a diamond, bottom centre.
  const tb = { w: portrait ? 76 : 70, h: 52 };
  const dcx = w / 2, dcy = bottom - (portrait ? 96 : 84);
  const dx = portrait ? 74 : 86, dy = portrait ? 56 : 46;
  const throwBtns = [
    { x: dcx + dx - tb.w / 2, y: dcy - tb.h / 2, ...tb }, // 1B (right)
    { x: dcx - tb.w / 2, y: dcy - dy - tb.h / 2, ...tb }, // 2B (top)
    { x: dcx - dx - tb.w / 2, y: dcy - tb.h / 2, ...tb }, // 3B (left)
    { x: dcx - tb.w / 2, y: dcy + dy - tb.h / 2, ...tb }, // HOME (bottom)
  ];
  const sh = { w: 128, h: 56 };
  const send = { x: w / 2 + 8, y: bottom - sh.h - 70, ...sh };
  const hold = { x: w / 2 - 8 - sh.w, y: bottom - sh.h - 70, ...sh };
  const tbw = Math.min(right - left - 2 * chip, 360);
  const timingBar = { x: w / 2 - tbw / 2, y: portrait ? bottom - chip - 64 : bottom - 52, w: tbw, h: 40 };
  const banner = { x: left, y: portrait ? h * 0.2 : Math.max(top + 64, h * 0.3), w: right - left, h: 92 };
  // Landscape: right half of the row under the scoreboard (beside the lower third), above the pitcher's
  // head and well clear of the strike zone.
  const prompt = portrait ? { x: left, y: top + scoreboard.h + 36, w: right - left, h: 36 } : { x: w / 2 + 10, y: top + scoreboard.h + 34, w: right - (w / 2 + 10), h: 36 };
  const pad = { x: insets.left, y: top + scoreboard.h + 6, w: w - insets.left - insets.right, h: bottom - (top + scoreboard.h + 6) };
  return { w, h, portrait, insets, lefty, scoreboard, pause, power, star, pitchChips, stamina, throwBtns, send, hold, timingBar, banner, prompt, pad, plane: { cx: w / 2, cy: h / 2, s: 60 } };
}

/** Screen → contact-plane zone coords. */
export function screenToZone(l: Layout, x: number, y: number): { x: number; z: number } {
  return { x: (x - l.plane.cx) / l.plane.s, z: 2.55 - (y - l.plane.cy) / l.plane.s };
}
export function zoneToScreen(l: Layout, x: number, z: number): { x: number; y: number } {
  return { x: l.plane.cx + x * l.plane.s, y: l.plane.cy - (z - 2.55) * l.plane.s };
}

/** Pro swing pad: which third the tap is in. */
export function padDirection(l: Layout, x: number, y: number): { dirV: -1 | 0 | 1; dirH: -1 | 0 | 1 } {
  const p = l.pad;
  const fy = (y - p.y) / p.h, fx = (x - p.x) / p.w;
  return {
    dirV: fy < 1 / 3 ? 1 : fy > 2 / 3 ? -1 : 0,
    dirH: fx < 1 / 3 ? -1 : fx > 2 / 3 ? 1 : 0,
  };
}
