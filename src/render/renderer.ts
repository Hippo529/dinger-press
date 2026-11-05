// Composes a frame: world layer (shaken/zoomed) → HUD (never shaken). Reads state, never mutates it.
import { FONTS, PITCH_TELL, TEAM_INK, THEME } from '../config/theme';
import { ROSTER_BY_ID, TEAMS } from '../config/roster';
import { TUNING } from '../config/tuning';
import { contactRadius } from '../sim/contact';
import { CONTACT_Y, STADIUMS } from '../sim/field';
import { PITCHES, crossing, pitchPos } from '../sim/pitch';
import { runnerPos } from '../sim/running';
import { activeTier, battingTeam, currentBatterId, currentPitcherId, fieldingTeam, humanBatter, humanPitcher, type GameState } from '../sim/state';
import type { Fx } from '../fx/fx';
import type { Particles, Popups } from '../fx/particles';
import type { ReplayRing } from '../fx/replay';
import { drawCharacter, type Pose } from './actors';
import { bakeStats, makeCanvas, paperGrain, skyBackdrop } from './bake';
import { battingView, fieldView, makeCamera, project, type Camera, type Proj } from './camera';
import { drawChipsAndButtons, drawNameplate, drawScoreboard, type HudButton } from './hud';
import { computeLayout, type Insets, type Layout, type Rect } from './layout';
import { drawBanner, drawCharge, drawHandoff, drawLocator, drawLowerThird, drawParticles, drawPopups, drawPrompt, drawReticle, drawTimingBar, drawZone } from './overlays';
import { drawReplay } from './replayDraw';
import { drawField, drawWallNumbers } from './world';
import { easeOutCubic } from '../core/easing';

export interface RenderSettings {
  showLocator: boolean;
  lefty: boolean;
  showTimingMs: boolean;
}

const PJ: Proj = { x: 0, y: 0, s: 0, depth: 0 };
const TRAIL_N = 12;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  w = 0;
  h = 0;
  layout!: Layout;
  cam: Camera = makeCamera();
  private batCam: Camera = makeCamera();
  private fieldCam: Camera = makeCamera();
  view: 'bat' | 'field' = 'bat';
  private viewT = 0;
  camTarget = { x: 0, y: 120 };
  private bakeKey = '';
  private bake: HTMLCanvasElement | null = null;
  readonly trail = new Float32Array(TRAIL_N * 2);
  trailN = 0;
  private trailHead = 0;
  buttons: HudButton[] = [];
  pressed: Record<string, number> = {};
  ballScreen = { x: 0, y: 0, r: 4, visible: false };
  zoneRect: Rect | null = null;
  mittSquashT = -99;
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  settings: RenderSettings = { showLocator: true, lefty: false, showTimingMs: false };
  frames = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly fx: Fx, readonly parts: Particles, readonly pops: Popups, readonly replay: ReplayRing) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(w: number, h: number, dpr: number, insets: Insets): void {
    this.dpr = Math.min(2, dpr || 1);
    this.w = w;
    this.h = h;
    this.insets = insets;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.bakeKey = '';
    this.layout = computeLayout(w, h, insets, this.settings.lefty);
  }

  /** Batting-view field + backdrop baked once per (size, hand, stadium). */
  private battingBake(s: GameState, hand: 1 | -1): HTMLCanvasElement {
    const key = `${this.w}x${this.h}@${this.dpr}|${hand}|${s.cfg.stadium}`;
    if (this.bake && key === this.bakeKey) return this.bake;
    const c = makeCanvas(this.w * this.dpr, this.h * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    g.drawImage(skyBackdrop(this.w, this.h, this.dpr).canvas, 0, 0, this.w, this.h);
    drawField(g, this.batCam, STADIUMS[s.cfg.stadium], this.w, this.h, 0);
    drawWallNumbers(g, this.batCam, STADIUMS[s.cfg.stadium], FONTS.display);
    this.bake = c;
    this.bakeKey = key;
    bakeStats.count++;
    return c;
  }

  private pushTrail(x: number, y: number): void {
    this.trail[this.trailHead * 2] = x;
    this.trail[this.trailHead * 2 + 1] = y;
    this.trailHead = (this.trailHead + 1) % TRAIL_N;
    this.trailN = Math.min(TRAIL_N, this.trailN + 1);
  }
  clearTrail(): void {
    this.trailN = 0;
  }

  /** Main entry. `rt` = render sim time (s.time + interpolation), `ballPos` = interpolated batted-ball position. */
  render(s: GameState, rt: number, ballPos: { x: number; y: number; z: number } | null, realDt: number, hud = true): void {
    const ctx = this.ctx;
    const l = this.layout;
    const fx = this.fx;
    const bid = currentBatterId(s);
    const bch = ROSTER_BY_ID[bid];
    const hand = bch?.bats ?? 1;
    battingView(this.batCam, this.w, this.h, hand, l.portrait);
    // plane mapping for input + overlays
    project(this.batCam, 0, CONTACT_Y, 2.55, PJ);
    l.plane.cx = PJ.x;
    l.plane.cy = PJ.y;
    l.plane.s = PJ.s;
    // view selection
    // Hold the batting view through the contact freeze so the hit itself is what freezes.
    const freezing = fx.hitstopLeft > 0 || fx.pendingHitstop > 0 || fx.now - fx.hitstopEndedAt < 0.06;
    const wantField = !!s.play && (s.phase === 'live' || s.phase === 'celebrate' || s.phase === 'dead') && !(freezing && this.view === 'bat');
    const want = wantField ? 'field' : 'bat';
    if (want !== this.view) {
      this.view = want;
      this.viewT = fx.now;
      if (want === 'field') this.camTarget = { x: 0, y: 90 };
    }
    if (this.view === 'field') {
      const p = s.play!;
      const land = p.pred.land ?? p.pred.samples[p.pred.samples.length - 1];
      const b = ballPos ?? { x: 0, y: 60, z: 0 };
      const tx = p.hr ? b.x : b.x * 0.6 + land.x * 0.4, ty = p.hr ? b.y : b.y * 0.6 + land.y * 0.4;
      const k = 1 - Math.exp(-TUNING.camera.followK * realDt);
      this.camTarget.x += (tx - this.camTarget.x) * k;
      this.camTarget.y += (Math.max(60, ty) - this.camTarget.y) * k;
      fieldView(this.fieldCam, this.w, this.h, this.camTarget, l.portrait);
      const bl = easeOutCubic(Math.min(1, (fx.now - this.viewT) / 0.35));
      blendCam(this.cam, this.batCam, this.fieldCam, bl);
    } else {
      copyCam(this.cam, this.batCam);
    }
    // ---------- world layer ----------
    const short = Math.min(this.w, this.h);
    const sh = fx.shake(short);
    const zoom = fx.zoom();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = THEME.sky;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(this.cam.cx + sh.x, this.cam.cy + sh.y);
    ctx.rotate(sh.roll);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.cam.cx, -this.cam.cy);
    if (this.view === 'bat') {
      ctx.drawImage(this.battingBake(s, hand), 0, 0, this.w, this.h);
    } else {
      ctx.drawImage(skyBackdrop(this.w, this.h, this.dpr).canvas, 0, 0, this.w, this.h);
      drawField(ctx, this.cam, STADIUMS[s.cfg.stadium], this.w, this.h, s.phase === 'celebrate' ? 0.6 + 0.4 * Math.sin(fx.now * 8) : 0);
      drawWallNumbers(ctx, this.cam, STADIUMS[s.cfg.stadium], FONTS.display);
    }
    this.drawActors(s, rt, hand);
    this.drawBall(s, rt, ballPos);
    ctx.restore();
    // ---------- screen-space fx ----------
    const pitchLive = s.phase === 'pitch' && !s.swing;
    const avoid = pitchLive && this.ballScreen.visible ? { x: this.ballScreen.x - this.ballScreen.r - 6, y: this.ballScreen.y - this.ballScreen.r - 6, w: this.ballScreen.r * 2 + 12, h: this.ballScreen.r * 2 + 12 } : null;
    drawParticles(ctx, this.parts, avoid);
    // ---------- HUD (not shaken) ----------
    if (hud) this.drawHud(s, rt, avoid);
    else this.buttons = [];
    // paper grain over everything
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ctx.createPattern(paperGrain(), 'repeat')!;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = 1;
    const fa = fx.flashAlpha();
    if (fa > 0) {
      ctx.fillStyle = `rgba(255,250,240,${fa})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    this.frames++;
    fx.frameRendered();
  }

  private uniform(team: number) {
    return TEAM_INK[TEAMS[this.stateTeams[team]].color];
  }
  private stateTeams: [keyof typeof TEAMS, keyof typeof TEAMS] = ['inkers', 'hagfish'];

  private drawActors(s: GameState, rt: number, hand: 1 | -1): void {
    const ctx = this.ctx;
    const cam = this.cam;
    this.stateTeams = [s.teams[0].setup.teamId, s.teams[1].setup.teamId];
    const ft = fieldingTeam(s), bt = battingTeam(s);
    const fUni = this.uniform(ft), bUni = this.uniform(bt);
    const now = this.fx.now;
    const bid = currentBatterId(s);
    type Item = { d: number; draw: () => void };
    const items: Item[] = [];
    const add = (x: number, y: number, z: number, ch: string | null, uni: { main: string; trim: string }, pose: Pose) => {
      project(cam, x, y, z, PJ);
      if (PJ.depth < 3) return;
      const px = PJ.x, py = PJ.y, ps = PJ.s, d = PJ.depth;
      items.push({ d, draw: () => drawCharacter(ctx, px, py, ps, ch ? ROSTER_BY_ID[ch] : null, uni, pose, now) });
    };
    // fielders
    s.fielders.forEach((f, i) => {
      if (this.view === 'bat' && i === 1) return; // catcher hidden behind the camera in batting view
      let pose: Pose = { kind: 'field', t: now, facing: 1, back: false };
      if (i === 0) {
        if (s.phase === 'windup') pose = { kind: 'windup', t: (rt - s.phaseT) / (humanPitcher(s) !== null ? 0.3 : TUNING.pitch.windupS), facing: 1, back: false };
        else if (s.phase === 'pitch') pose = { kind: 'throw', t: (rt - s.releaseT) / 0.25, facing: 1, back: false };
        else pose = { kind: 'idle', t: now, facing: 1, back: false };
      } else if (i === 1) pose = { kind: 'catcher', t: now, facing: 1, back: false };
      else if (f.dive > 0) pose = { kind: 'dive', t: f.dive, facing: f.goal.x > f.pos.x ? 1 : -1, back: false };
      else if (Math.hypot(f.pos.x - f.prev.x, f.pos.y - f.prev.y) > 0.05) pose = { kind: 'run', t: now, facing: f.goal.x >= f.pos.x ? 1 : -1, back: false };
      add(f.pos.x, f.pos.y, 0, f.charId, fUni, pose);
    });
    // runners
    for (const r of s.runners) {
      if (r.out || r.scored) continue;
      if (r.isBatter && r.d <= 0 && r.delay > 0) continue;
      const p = runnerPos(r);
      const moving = r.d > 0 && (r.target > r.base || r.returning);
      add(p.x, p.y, 0, r.charId, bUni, { kind: moving || s.phase === 'celebrate' ? 'run' : 'idle', t: now, facing: 1, back: false });
    }
    // batter (in the box until he runs)
    const batterRunning = s.runners.some((r) => r.isBatter && (r.d > 0 || r.delay <= 0)) || s.phase === 'celebrate';
    if (!batterRunning && s.phase !== 'handoff') {
      const sw = s.swing;
      let pose: Pose = { kind: 'stance', t: now, facing: hand === 1 ? 1 : -1, back: this.view === 'bat', power: s.power };
      if (sw) pose = { kind: 'swing', t: 0.42 + Math.max(0, rt - sw.t) / 0.2, facing: hand === 1 ? 1 : -1, back: this.view === 'bat', power: s.power };
      if (s.phase === 'dead' && s.banner?.text === 'STRIKEOUT') pose = { kind: 'slump', t: now, facing: hand === 1 ? 1 : -1, back: this.view === 'bat' };
      if (this.view === 'bat') {
        // Arcade cheat: the batter stands at the same depth as the zone, so true scale would cover the
        // pitcher. Draw at a reduced scale, nudged toward the screen edge.
        project(cam, hand === 1 ? -3.0 : 3.0, 0.3, 0, PJ);
        const k = TUNING.camera.batterScale;
        const px = PJ.x + (hand === 1 ? -1 : 1) * PJ.s * 0.6, py = PJ.y + PJ.s * 0.2, ps = PJ.s * k;
        items.push({ d: 0, draw: () => drawCharacter(ctx, px, py, ps, ROSTER_BY_ID[bid], bUni, pose, now) });
      } else add(hand === 1 ? -2.7 : 2.7, 0.3, 0, bid, bUni, pose);
    }
    items.sort((a, b) => b.d - a.d);
    for (const it of items) it.draw();
  }

  private drawBall(s: GameState, rt: number, ballPos: { x: number; y: number; z: number } | null): void {
    const ctx = this.ctx;
    const cam = this.cam;
    let pos: { x: number; y: number; z: number } | null = null;
    let tint: string = THEME.ball;
    let spinHz = 0;
    let seam: string = 'cross';
    const holdAtBat = this.view === 'bat' && s.play && s.pitch && !s.play.foul;
    if (holdAtBat && s.pitch && ballPos && Math.hypot(ballPos.x, ballPos.y) < 6) {
      pos = pitchPos(s.pitch, s.pitch.T);
      tint = THEME.ball;
    } else if (s.phase === 'pitch' && s.pitch && !(s.swing && s.swing.grade !== 'WHIFF')) {
      const t = Math.max(0, rt - s.releaseT);
      pos = pitchPos(s.pitch, Math.min(t, s.pitch.T + 0.25));
      tint = s.pitch.star ? THEME.pink : PITCH_TELL[s.pitch.type].tint;
      spinHz = PITCHES[s.pitch.type].spinHz;
      seam = PITCH_TELL[s.pitch.type].seam;
    } else if (ballPos) pos = ballPos;
    if (!pos) {
      this.ballScreen.visible = false;
      this.clearTrail();
      // mitt (bat view only): a squashed glove at the zone bottom
      return;
    }
    // shadow
    project(cam, pos.x, pos.y, 0, PJ);
    if (PJ.depth > 1) {
      const sr = Math.max(2.5, 0.22 * PJ.s) * (1 / (1 + pos.z * 0.04));
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = THEME.ink;
      ctx.beginPath();
      ctx.ellipse(PJ.x, PJ.y, sr, sr * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    project(cam, pos.x, pos.y, pos.z, PJ);
    if (PJ.depth < 1) return;
    const r = Math.max(3.5, 0.13 * PJ.s);
    const bx = PJ.x + this.fx.vibration(), by = PJ.y;
    // trail
    this.pushTrail(bx, by);
    if (this.trailN > 2) {
      ctx.lineCap = 'round';
      for (let i = 1; i < this.trailN; i++) {
        const a = (this.trailHead - this.trailN + i - 1 + TRAIL_N * 2) % TRAIL_N;
        const b2 = (a + 1) % TRAIL_N;
        const k = i / this.trailN;
        ctx.globalAlpha = k * 0.55;
        ctx.strokeStyle = tint;
        ctx.lineWidth = Math.max(1, r * 1.4 * k);
        ctx.beginPath();
        ctx.moveTo(this.trail[a * 2], this.trail[a * 2 + 1]);
        ctx.lineTo(this.trail[b2 * 2], this.trail[b2 * 2 + 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // squash/stretch: along screen velocity, area preserved
    const prevI = (this.trailHead - 2 + TRAIL_N) % TRAIL_N;
    const vx = bx - this.trail[prevI * 2], vy = by - this.trail[prevI * 2 + 1];
    const sp = Math.hypot(vx, vy);
    const contactAge = this.fx.now - this.contactT;
    let sx = 1, ang = Math.atan2(vy, vx);
    if (contactAge >= 0 && contactAge < 0.034) {
      sx = TUNING.squash.ballContact[0];
    } else if (sp > r * 1.2) sx = Math.min(TUNING.squash.stretchMax, 1 + sp / (r * 12));
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);
    ctx.scale(sx, 1 / sx);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = THEME.ball;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = THEME.ink;
    ctx.stroke();
    // seam tell, rotating at the pitch's spin rate
    if (r > 4 && seam !== 'none') {
      ctx.rotate(rt * spinHz * 0.6);
      ctx.strokeStyle = s.pitch?.star ? THEME.pink : '#D9473A';
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath();
      if (seam === 'cross') {
        ctx.moveTo(-r * 0.6, 0); ctx.lineTo(r * 0.6, 0); ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, r * 0.6);
      } else if (seam === 'ring') ctx.arc(0, 0, r * 0.55, 0, Math.PI * 1.4);
      else if (seam === 'dot') ctx.arc(r * 0.35, 0, r * 0.18, 0, Math.PI * 2);
      else { ctx.moveTo(-r * 0.6, -r * 0.3); ctx.lineTo(r * 0.6, -r * 0.3); ctx.moveTo(-r * 0.6, r * 0.3); ctx.lineTo(r * 0.6, r * 0.3); }
      ctx.stroke();
    }
    ctx.restore();
    this.ballScreen = { x: bx, y: by, r, visible: true };
  }
  contactT = -99;

  private drawHud(s: GameState, rt: number, avoid: Rect | null): void {
    const ctx = this.ctx;
    const l = this.layout;
    const fx = this.fx;
    const m = fx.misreg();
    const hb = humanBatter(s), hp = humanPitcher(s);
    if (s.phase === 'handoff') {
      drawHandoff(ctx, l, s.cfg.players[s.handoffTo]?.name ?? 'next player', rt - s.phaseT, m);
      this.buttons = [];
      return;
    }
    const inBat = this.view === 'bat';
    if (inBat && (s.phase === 'prePitch' || s.phase === 'windup' || s.phase === 'pitch' || s.phase === 'dead') && !s.play) {
      this.zoneRect = drawZone(ctx, l, s.phase === 'dead' ? 0.5 : 1);
      if (s.phase === 'pitch' && s.pitch && hb !== null && this.settings.showLocator && !s.cfg.hideLocator && (s.pitch.t / s.pitch.T >= TUNING.pitch.locatorAppearFrac)) {
        const c = crossing(s.pitch);
        drawLocator(ctx, l, c.x, c.z, s.pitch.star);
      }
      if (hb !== null && activeTier(s) === 'allstar') drawReticle(ctx, l, s.aim.x, s.aim.z, contactRadius(s.power));
      if (hp !== null && s.charging) drawCharge(ctx, l, s.pitchAim.x, s.pitchAim.z, (rt - s.chargeStartT) / TUNING.pitch.chargeFillS);
      else if (hp !== null && s.phase === 'prePitch') drawCharge(ctx, l, s.pitchAim.x, s.pitchAim.z, 0);
    } else this.zoneRect = null;
    drawScoreboard(ctx, l, s, m);
    if (inBat && s.phase !== 'gameOver') {
      drawNameplate(ctx, l.scoreboard.x, l.scoreboard.y + l.scoreboard.h + 8, s, currentBatterId(s), 'left');
      drawNameplate(ctx, l.scoreboard.x + l.scoreboard.w, l.scoreboard.y + l.scoreboard.h + 8, s, currentPitcherId(s), 'right');
    }
    // prompts (one at a time, most important first)
    const pulse = fx.now;
    const firstCue = s.cfg.firstEver && s.totalPitches <= 1 && hb !== null && !s.swing && (s.phase === 'pitch' || s.phase === 'windup' || s.phase === 'prePitch');
    if (s.phase === 'live' && hp !== null && s.play?.secured && !s.play.firstThrowDone && s.play.throwPromptUntil < Infinity) drawPrompt(ctx, l, 'THROW! TAP A BASE', pulse, THEME.sun);
    else if (firstCue) drawPrompt(ctx, l, 'TAP WHEN IT REACHES THE ZONE', pulse, THEME.sun);
    else if (s.starChance && (s.phase === 'prePitch' || s.phase === 'windup')) drawPrompt(ctx, l, hb !== null ? '★ STAR CHANCE — HIT = +2★' : '★ STAR CHANCE', pulse, THEME.sun);
    else if (hp !== null && s.phase === 'prePitch') drawPrompt(ctx, l, s.cfg.assistPitch ? 'TAP THE ZONE TO PITCH' : 'HOLD IN THE ZONE · RELEASE IN THE GOLD', pulse, THEME.teal);
    else if (hp !== null && s.phase === 'pitch' && s.pitch && s.pitch.t / s.pitch.T < TUNING.pitch.steerUntilS) drawPrompt(ctx, l, 'DRAG ◀ ▶ TO STEER', pulse, THEME.teal);
    drawLowerThird(ctx, l, s, m);
    const age = rt - s.last.swingT;
    if ((hb !== null || s.cfg.cage) && age >= 0 && age < TUNING.timing.timingBarShowS) drawTimingBar(ctx, l.timingBar, s, this.settings.showTimingMs || !!s.cfg.cage, age);
    drawBanner(ctx, l, s, m);
    drawPopups(ctx, this.pops, fx.now, m, avoid);
    if (fx.now < fx.stillUntil + 0.6 && fx.stillBanner) drawPrompt(ctx, l, fx.stillBanner, 0, THEME.sun);
    if (s.phase === 'celebrate' && this.replay.active) drawReplay(ctx, l, this.replay, fx.now, s.cfg.stadium);
    for (const k of Object.keys(this.pressed)) if (fx.now - this.pressed[k] > 0.3) delete this.pressed[k];
    const press: Record<string, number> = {};
    for (const k of Object.keys(this.pressed)) {
      const t = (fx.now - this.pressed[k]) * 1000;
      press[k] = t < TUNING.button.pressMs ? 1 - (1 - TUNING.button.pressScale) * (t / TUNING.button.pressMs) : TUNING.button.pressScale + (1 - TUNING.button.pressScale) * Math.min(1, (t - TUNING.button.pressMs) / TUNING.button.springMs);
    }
    this.buttons = drawChipsAndButtons(ctx, l, s, m, press);
  }

  /** Screen position of a world point under the current camera (for fx spawns). */
  toScreen(x: number, y: number, z: number): { x: number; y: number; s: number } {
    project(this.cam, x, y, z, PJ);
    return { x: PJ.x, y: PJ.y, s: PJ.s };
  }
}

function copyCam(dst: Camera, src: Camera): void {
  dst.pos = { ...src.pos };
  dst.look = { ...src.look };
  dst.focal = src.focal;
  dst.cx = src.cx;
  dst.cy = src.cy;
  dst.zoom = 1;
  dst.roll = 0;
  dst.ox = dst.oy = 0;
}
function blendCam(dst: Camera, a: Camera, b: Camera, t: number): void {
  const L = (x: number, y: number) => x + (y - x) * t;
  dst.pos = { x: L(a.pos.x, b.pos.x), y: L(a.pos.y, b.pos.y), z: L(a.pos.z, b.pos.z) };
  dst.look = { x: L(a.look.x, b.look.x), y: L(a.look.y, b.look.y), z: L(a.look.z, b.look.z) };
  dst.focal = L(a.focal, b.focal);
  dst.cx = L(a.cx, b.cx);
  dst.cy = L(a.cy, b.cy);
  dst.zoom = 1;
  dst.roll = 0;
  dst.ox = dst.oy = 0;
}
