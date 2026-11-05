// render_game_to_text(): everything needed to play blind, as concise JSON.
import { ROSTER_BY_ID, TEAMS } from '../config/roster';
import { TUNING } from '../config/tuning';
import { chargeOutcome, crossing, pitchPos, pitchVel } from '../sim/pitch';
import { leverage } from '../sim/stars';
import { activeTier, battingTeam, currentBatterId, currentPitcherId, humanBatter, humanPitcher, type GameState } from '../sim/state';
import { bakeStats } from '../render/bake';
import type { App } from './app';

const r1 = (v: number) => Math.round(v * 10) / 10;

export function gameText(app: App): string {
  const top = app.top();
  const sess = app.session ?? null;
  const s: GameState | null = top === 'title' ? app.attract?.sim.s ?? null : sess?.sim.s ?? null;
  const fx = app.fx;
  const rend = app.renderer;
  const domButtons = [...document.querySelectorAll<HTMLElement>('#ui [data-id]')].map((e) => {
    const r = e.getBoundingClientRect();
    return { id: 'ui:' + e.dataset.id, label: (e.textContent ?? '').trim().slice(0, 30), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter((b) => b.w > 0 && b.h > 0);
  const playing = top === 'play' && !!sess;
  const canvasButtons = playing ? rend.buttons.map((b) => ({ id: b.id, label: b.label, x: Math.round(b.rect.x), y: Math.round(b.rect.y), w: Math.round(b.rect.w), h: Math.round(b.rect.h) })) : [];
  const out: Record<string, unknown> = {
    coords: 'world ft: x→right field, y→centre field, z up, origin = home plate; zone coords (x,z) at the contact plane; screen rects in CSS px from top-left',
    screen: top,
    stack: app.stack.slice(),
    mode: s ? s.cfg.kind : 'none',
    buttons: [...canvasButtons, ...domButtons],
    settings: (() => {
      const st = app.save.data.settings;
      return { tier: st.tier, heat: st.heat, lefty: st.lefty, aggression: st.aggression, assistPitch: st.assistPitch, showLocator: st.showLocator, hideLocator: st.hideLocatorExpert, reduceMotion: app.fx.settings.reduceMotion, shakePct: fx.settings.shakePct, flashes: fx.settings.flashes, slowmo: fx.settings.slowmo, muted: st.muted, silentModeAudio: st.silentModeAudio, haptics: st.haptics };
    })(),
    fx: { timeScale: r1(fx.timeScale() * 100) / 100, hitstop: fx.hitstopLeft > 0, trauma: Math.round(fx.trauma * 100) / 100, shake: fx.shake(Math.min(rend.w, rend.h)), zoom: Math.round(fx.zoom() * 1000) / 1000, slowmo: fx.slowmoActive(), flashCount: fx.gov.count, contactFrames: fx.contactFrameRendered, slowCount: fx.slowCount },
    audio: { state: app.audio.ctx?.state ?? 'none', unlocked: app.audio.unlocked, logSize: app.audio.log.length },
    paused: app.hidden,
    caption: sess?.caption && sess.caption.until > fx.now ? sess.caption.text : null,
    ticker: sess?.ticker && sess.ticker.until > fx.now ? sess.ticker.text : null,
    bakeCount: bakeStats.count,
    frames: rend.frames,
    attractPitches: app.attract?.sim.s.totalPitches ?? 0,
  };
  if (!s) return JSON.stringify({ ...out, state: top });
  const bt = battingTeam(s);
  const ball = (() => {
    if (s.phase === 'pitch' && s.pitch) {
      const p = pitchPos(s.pitch, s.time - s.releaseT), v = pitchVel(s.pitch, s.time - s.releaseT);
      return { kind: 'pitch', pos: { x: r1(p.x), y: r1(p.y), z: r1(p.z) }, vel: { x: r1(v.x), y: r1(v.y), z: r1(v.z) }, type: s.pitch.type, mph: s.pitch.mph, flightT: s.pitch.T, t: r1(s.pitch.t * 100) / 100 };
    }
    if (s.ball) return { kind: 'batted', pos: { x: r1(s.ball.p.x), y: r1(s.ball.p.y), z: r1(s.ball.p.z) }, vel: { x: r1(s.ball.v.x), y: r1(s.ball.v.y), z: r1(s.ball.v.z) } };
    return null;
  })();
  const prompts: string[] = [];
  if (s.starChance) prompts.push('starChance');
  if (s.play?.closeCall && s.play.closeCall.send === null && humanBatter(s) !== null) prompts.push('sendHold');
  if (s.play?.secured && !s.play.firstThrowDone && s.play.throwPromptUntil < Infinity) prompts.push('throw');
  if (s.cfg.firstEver && s.totalPitches <= 1 && humanBatter(s) !== null && !s.swing) prompts.push('firstPitchCue');
  if (s.phase === 'handoff') prompts.push('handoff');
  Object.assign(out, {
    state: s.phase,
    phase: s.phase,
    time: r1(s.time * 1000) / 1000,
    inning: s.inning,
    half: s.half === 0 ? 'top' : 'bottom',
    outs: s.outs,
    count: { balls: s.balls, strikes: s.strikes },
    score: { away: s.teams[0].runs, home: s.teams[1].runs, awayTeam: TEAMS[s.teams[0].setup.teamId].abbr, homeTeam: TEAMS[s.teams[1].setup.teamId].abbr },
    battingTeam: bt,
    humanBatting: humanBatter(s) !== null,
    humanPitching: humanPitcher(s) !== null,
    tier: activeTier(s),
    batter: currentBatterId(s),
    pitcher: currentPitcherId(s),
    runners: s.runners.filter((r) => !r.out && !r.scored).map((r) => ({ base: r.base, target: r.target, d: r1(r.d), char: r.charId, batter: r.isBatter })),
    ball,
    locator: s.phase === 'pitch' && s.pitch && s.pitch.t / s.pitch.T >= TUNING.pitch.locatorAppearFrac && !s.cfg.hideLocator && app.save.data.settings.showLocator ? (() => { const c = crossing(s.pitch!); return { x: r1(c.x * 100) / 100, z: r1(c.z * 100) / 100 }; })() : null,
    last: { grade: s.last.grade, offsetMs: Math.round(s.last.offsetMs), ev: s.last.ev, la: r1(s.last.la), spray: r1(s.last.spray), dist: s.last.dist, call: s.last.call },
    timingBar: rend.timingBarDrawn && s.last.grade !== null ? { offsetMs: Math.round(s.last.offsetMs), grade: s.last.grade, ms: app.save.data.settings.showTimingMs || !!s.cfg.cage } : null,
    windows: s.win ? { perfect: r1(s.win.perfect), perfectLate: r1(s.win.perfectLate), good: r1(s.win.good), weak: r1(s.win.weak), scale: Math.round(s.win.scale * 1000) / 1000 } : null,
    stars: [s.teams[0].stars, s.teams[1].stars],
    power: s.power,
    starArmed: s.starArmed,
    pitchStarArmed: s.pitchStarArmed,
    aim: { x: r1(s.aim.x * 100) / 100, z: r1(s.aim.z * 100) / 100 },
    pitchSel: s.pitchSel,
    charging: s.charging,
    charge: { level: Math.round(s.chargeLevel * 100) / 100, quality: s.cfg.assistPitch ? 'assist' : chargeOutcome(s.chargeLevel).quality },
    stamina: Math.round(s.teams[1 - bt].arm.stamina),
    prompts,
    banner: s.banner && s.time - s.banner.t < 1.6 ? { text: s.banner.text, sub: s.banner.sub } : null,
    lowerThird: s.lowerThird && s.time - s.lowerThird.t < 2.2 ? { name: ROSTER_BY_ID[s.lowerThird.id]?.name, catchphrase: ROSTER_BY_ID[s.lowerThird.id]?.catchphrases[0] } : null,
    pressure: Math.round(leverage(s) * 100) / 100,
    handoffTo: s.phase === 'handoff' ? s.cfg.players[s.handoffTo]?.name : null,
    winner: s.winner,
    reason: s.overReason,
    walkoff: s.walkoff,
    mill: s.mill ? { player: s.mill.player, outs: s.mill.outs, scores: s.mill.scores.map(Math.round), streak: s.mill.streak } : null,
    tiebreak: s.tiebreak,
    clutch: s.cfg.clutch ? { id: s.cfg.clutch.id, result: s.clutchResult } : null,
    pitchesSeen: s.pitchesSeen,
    totalPitches: s.totalPitches,
    replay: { active: app.replay.active, frames: app.replay.playFrames, rect: rend.replayRect, bannerRect: rend.layout.banner },
  });
  return JSON.stringify(out);
}
