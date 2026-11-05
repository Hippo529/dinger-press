// HUD drawn on canvas (never shaken): scoreboard ticket, chips, pitch chips, throw/send buttons.
import { FONTS, TEAM_INK, THEME } from '../config/theme';
import { ROSTER_BY_ID, TEAMS } from '../config/roster';
import { armEffect, PITCHES } from '../sim/pitch';
import { leverage, momentumOf } from '../sim/stars';
import { basesOccupied, battingTeam, currentBatterId, currentPitcherId, fieldingTeam, humanBatter, humanPitcher, type GameState } from '../sim/state';
import type { Layout, Rect } from './layout';

export interface HudButton {
  id: string;
  label: string;
  rect: Rect;
}

const INK = THEME.ink;

export function rr(ctx: CanvasRenderingContext2D, r: Rect, rad: number): void {
  const k = Math.min(rad, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}

/** Printed button: paper/ink fill, offset accent layer (misregistration), scale on press. */
export function chip(ctx: CanvasRenderingContext2D, r: Rect, label: string, opts: { on?: boolean; accent?: string; sub?: string; pressed?: number; misreg?: number; disabled?: boolean; size?: number }): void {
  const sc = opts.pressed ?? 1;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  ctx.translate(-cx, -cy);
  const accent = opts.accent ?? THEME.pink;
  const m = opts.misreg ?? 1.5;
  rr(ctx, { x: r.x + m, y: r.y + m, w: r.w, h: r.h }, 12);
  ctx.fillStyle = opts.disabled ? '#5A6080' : accent;
  ctx.fill();
  rr(ctx, r, 12);
  ctx.fillStyle = opts.disabled ? '#B9B2A2' : opts.on ? accent : THEME.paper;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.globalAlpha = opts.disabled ? 0.55 : 1;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = opts.size ?? Math.min(18, r.h * 0.34);
  ctx.font = `${size}px ${FONTS.display}`;
  ctx.fillText(label, cx, opts.sub ? cy - size * 0.35 : cy + 1);
  if (opts.sub) {
    ctx.font = `700 ${Math.max(10, size * 0.62)}px ${FONTS.ui}`;
    ctx.fillText(opts.sub, cx, cy + size * 0.6);
  }
  ctx.restore();
}

function pips(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, filled: number, color: string, r: number): void {
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x + i * (r * 2 + 3), y, r, 0, Math.PI * 2);
    ctx.fillStyle = i < filled ? color : 'transparent';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

function starShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr2 = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? THEME.sun : 'transparent';
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Scoreboard "ticket stub": teams + score, inning arrow, count pips with letters, bases, stars, pressure. */
export function drawScoreboard(ctx: CanvasRenderingContext2D, l: Layout, s: GameState, misreg: number): void {
  const r = l.scoreboard;
  ctx.save();
  rr(ctx, { x: r.x + misreg, y: r.y + misreg, w: r.w, h: r.h }, 8);
  ctx.fillStyle = THEME.teal;
  ctx.fill();
  rr(ctx, r, 8);
  ctx.fillStyle = THEME.paper;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // perforation
  const perfX = r.x + r.w * 0.44;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(perfX, r.y + 4);
  ctx.lineTo(perfX, r.y + r.h - 4);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textBaseline = 'middle';
  const rowH = r.h / 2;
  const nameSize = Math.min(15, rowH * 0.55);
  for (let i = 0; i < 2; i++) {
    const t = s.teams[i];
    const def = TEAMS[t.setup.teamId];
    const y = r.y + rowH * (i + 0.5);
    const bat = battingTeam(s) === i;
    ctx.fillStyle = TEAM_INK[def.color].main;
    ctx.fillRect(r.x + 6, y - rowH * 0.32, 6, rowH * 0.64);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 6, y - rowH * 0.32, 6, rowH * 0.64);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.font = `${nameSize}px ${FONTS.display}`;
    ctx.fillText((bat ? '▸' : ' ') + def.abbr, r.x + 15, y + 1);
    ctx.textAlign = 'right';
    ctx.fillText(String(s.mill ? Math.round(s.mill.scores[s.mill.player]) : t.runs), perfX - 8, y + 1);
    // stars
    for (let k = 0; k < 5; k++) starShape(ctx, r.x + 15 + nameSize * 3.6 + k * 9.5, y, 3.8, k < t.stars);
  }
  // right half: inning, count, bases, pressure
  const rx = perfX + 8;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.min(12, rowH * 0.45)}px ${FONTS.ui}`;
  const inn = s.mill ? `OUTS ${s.mill.outs}/${s.cfg.mill!.outs}` : s.tiebreak ? `SUDDEN ${s.tiebreak.left}` : s.cfg.cage ? 'THE CAGE' : `${s.half === 0 ? '▲' : '▼'}${s.inning}`;
  ctx.fillText(inn, rx, r.y + rowH * 0.5);
  if (!s.mill && !s.cfg.cage && !s.tiebreak) {
    const cx = rx + 34;
    ctx.fillText('B', cx, r.y + rowH * 0.5);
    pips(ctx, cx + 12, r.y + rowH * 0.5, 3, s.balls, THEME.teal, 3.6);
    ctx.fillStyle = INK;
    ctx.fillText('S', cx, r.y + rowH * 1.45);
    pips(ctx, cx + 12, r.y + rowH * 1.45, 2, s.strikes, THEME.pink, 3.6);
    ctx.fillStyle = INK;
    ctx.fillText('O', rx, r.y + rowH * 1.45);
    pips(ctx, rx + 12, r.y + rowH * 1.45, 2, Math.min(2, s.outs), INK, 3.6);
    // bases diamond
    const occ = basesOccupied(s);
    const dx = r.x + r.w - 46, dy = r.y + r.h * 0.5;
    const pts = [[14, 0], [0, -11], [-14, 0]];
    pts.forEach(([px, py], i) => {
      ctx.save();
      ctx.translate(dx + px, dy + py);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = occ[i] ? THEME.sun : THEME.paper;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
    });
  }
  // pressure gauge: stamped bar on the right edge
  const lev = leverage(s);
  const gx = r.x + r.w - 14, gy = r.y + 6, gh = r.h - 12;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gx, gy, 7, gh);
  ctx.fillStyle = lev > 0.6 ? THEME.pink : THEME.sun;
  ctx.fillRect(gx + 1, gy + gh * (1 - lev), 5, gh * lev);
  ctx.restore();
}

/** Nameplate with momentum mark (flame/snowflake as shapes + text, not colour alone). */
export function drawNameplate(ctx: CanvasRenderingContext2D, x: number, y: number, s: GameState, id: string, align: CanvasTextAlign): void {
  const ch = ROSTER_BY_ID[id];
  if (!ch) return;
  const mom = momentumOf(s, id);
  ctx.font = `12px ${FONTS.display}`;
  const label = ch.short + (mom === 'hot' ? ' HOT' : mom === 'cold' ? ' COLD' : '');
  const w = ctx.measureText(label).width + 20;
  const bx = align === 'left' ? x : x - w;
  ctx.fillStyle = INK;
  ctx.fillRect(bx, y, w, 20);
  ctx.fillStyle = mom === 'hot' ? THEME.sun : mom === 'cold' ? THEME.teal : THEME.paper;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + 8, y + 11);
}

export function drawChipsAndButtons(ctx: CanvasRenderingContext2D, l: Layout, s: GameState, misreg: number, pressed: Record<string, number>): HudButton[] {
  const out: HudButton[] = [];
  const hb = humanBatter(s);
  const hp = humanPitcher(s);
  const pre = s.phase === 'prePitch' || s.phase === 'windup';
  // Pause is always available in play.
  chip(ctx, l.pause, 'II', { misreg, accent: THEME.teal, pressed: pressed.pause, size: 16 });
  out.push({ id: 'pause', label: 'Pause', rect: l.pause });
  if (s.phase === 'handoff' || s.phase === 'gameOver') return out;
  if (hb !== null && (pre || s.phase === 'pitch')) {
    const locked = s.phase === 'pitch';
    chip(ctx, l.power, 'PWR', { on: s.power, accent: THEME.pink, sub: s.power ? 'ON' : 'OFF', misreg, pressed: pressed.power, disabled: locked });
    out.push({ id: 'power', label: 'Power', rect: l.power });
    const stars = s.teams[battingTeam(s)].stars;
    chip(ctx, l.star, '★', { on: s.starArmed, accent: THEME.sun, sub: `${stars}`, misreg, pressed: pressed.star, disabled: locked || (stars === 0 && !s.starArmed), size: 22 });
    out.push({ id: 'star', label: 'Star Swing', rect: l.star });
  }
  if (hp !== null && (s.phase === 'prePitch' || s.phase === 'windup' || s.phase === 'pitch')) {
    const pid = currentPitcherId(s);
    const ch = ROSTER_BY_ID[pid];
    const arm = s.teams[fieldingTeam(s)].arm;
    ch.pitches.forEach((pt, i) => {
      const r = l.pitchChips[i];
      const eff = armEffect(arm, pt);
      chip(ctx, r, PITCHES[pt].short, { on: s.pitchSel === i, accent: THEME.teal, sub: `${i + 1}·${'▮'.repeat(Math.max(0, Math.round((1 - eff) * 10)))}`, misreg, pressed: pressed['pitch' + i], disabled: s.phase !== 'prePitch' });
      out.push({ id: 'pitch' + i, label: PITCHES[pt].name, rect: r });
    });
    // stamina bar
    const st = l.stamina;
    ctx.fillStyle = INK;
    ctx.fillRect(st.x, st.y, st.w, st.h);
    ctx.fillStyle = arm.stamina > 40 ? THEME.teal : THEME.pink;
    ctx.fillRect(st.x + 1, st.y + 1, (st.w - 2) * (arm.stamina / 100), st.h - 2);
    ctx.font = `700 10px ${FONTS.ui}`;
    ctx.fillStyle = THEME.paper;
    ctx.textAlign = 'left';
    ctx.fillText(`STAMINA ${Math.round(arm.stamina)}`, st.x, st.y - 6);
    out.push({ id: 'stamina', label: 'Stamina', rect: st });
    const stars = s.teams[fieldingTeam(s)].stars;
    chip(ctx, l.star, '★', { on: s.pitchStarArmed, accent: THEME.sun, sub: `${stars}`, misreg, pressed: pressed.star, disabled: s.phase !== 'prePitch' || (stars === 0 && !s.pitchStarArmed), size: 22 });
    out.push({ id: 'star', label: 'Star Pitch', rect: l.star });
  }
  const p = s.play;
  if (p && s.phase === 'live' && hp !== null && p.secured && !p.firstThrowDone && p.throwPromptUntil < Infinity && !s.thr) {
    const labels = ['1B', '2B', '3B', 'HOME'];
    labels.forEach((lab, i) => {
      chip(ctx, l.throwBtns[i], lab, { accent: THEME.sun, sub: `${i + 1}`, misreg, pressed: pressed['throw' + i] });
      out.push({ id: 'throw' + i, label: 'Throw to ' + lab, rect: l.throwBtns[i] });
    });
  }
  if (p && s.phase === 'live' && hb !== null && p.closeCall && p.closeCall.send === null) {
    chip(ctx, l.send, 'SEND', { accent: THEME.pink, sub: ['', '1ST', '2ND', '3RD', 'HOME'][p.closeCall.base], misreg, pressed: pressed.send });
    chip(ctx, l.hold, 'HOLD', { accent: THEME.teal, sub: 'safe', misreg, pressed: pressed.hold });
    out.push({ id: 'send', label: 'Send runner', rect: l.send }, { id: 'hold', label: 'Hold runner', rect: l.hold });
  }
  void currentBatterId;
  return out;
}
