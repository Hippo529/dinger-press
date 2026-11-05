// Procedural characters: outlined capsules + ellipses, one cel highlight, props, pose function.
import { THEME } from '../config/theme';
import type { Character } from '../config/roster';
import { easeInBack, easeOutCubic } from '../core/easing';
import { glowSprite } from './bake';

export type PoseKind = 'idle' | 'stance' | 'swing' | 'windup' | 'throw' | 'field' | 'run' | 'catcher' | 'celebrate' | 'slump' | 'dive';

export interface Pose {
  kind: PoseKind;
  t: number; // 0..1 progress (swing/windup/throw) or seconds (idle/run/celebrate)
  facing: 1 | -1;
  back: boolean; // seen from behind (batter)
  power?: boolean;
  bat?: string; // bat skin id
}

export const BAT_SKINS: Record<string, { body: string; stripe: string; bands: number }> = {
  wood: { body: '#C9955B', stripe: '#E8C08A', bands: 0 },
  gold: { body: '#FFC53D', stripe: '#FFF1B8', bands: 0 },
  zebra: { body: '#F2E8D5', stripe: '#1B2140', bands: 5 },
  riso: { body: '#FF4F7E', stripe: '#27B0AE', bands: 2 },
};

/** Limb angles (radians; 0 = straight down, + = toward facing). Exported for tests. */
export interface Limbs {
  legF: number;
  legB: number;
  armF: number;
  armB: number;
  lean: number;
  crouch: number; // 0..1 hip drop
  bat: number | null; // bat angle in screen radians (0 = toward facing, −π/2 = up)
  hop: number; // ft off the ground
}

export function poseLimbs(p: Pose): Limbs {
  const t = p.t;
  switch (p.kind) {
    case 'stance':
      return { legF: p.power ? 0.55 : 0.32, legB: p.power ? -0.55 : -0.32, armF: 2.0, armB: 2.3, lean: p.power ? 0.25 : 0.12, crouch: p.power ? 0.4 : 0.15, bat: -2.2 + Math.sin(t * 3) * 0.08, hop: 0 };
    case 'swing': {
      const k = easeOutCubic(Math.min(1, t));
      return { legF: p.power ? 0.6 : 0.4, legB: (p.power ? -0.6 : -0.45) + k * 0.3, armF: 2.0 - k * 1.1, armB: 2.3 - k * 1.3, lean: 0.12 - k * 0.3, crouch: p.power ? 0.35 : 0.15, bat: -2.2 + k * 5.0, hop: 0 };
    }
    case 'windup': {
      const k = easeInBack(Math.min(1, t));
      return { legF: 0.2 + k * 1.2, legB: -0.1, armF: 0.4 + k * 2.2, armB: 0.3 - k * 1.0, lean: -0.2 * k, crouch: 0, bat: null, hop: 0 };
    }
    case 'throw': {
      const k = easeOutCubic(Math.min(1, t));
      return { legF: 0.6 - k * 0.2, legB: -0.5, armF: 2.6 - k * 3.4, armB: -0.6 + k * 0.4, lean: 0.35 * k, crouch: 0.1, bat: null, hop: 0 };
    }
    case 'field':
      return { legF: 0.35, legB: -0.35, armF: 0.7, armB: -0.6, lean: 0.25, crouch: 0.3, bat: null, hop: 0 };
    case 'run': {
      const c = Math.sin(t * 14);
      return { legF: 0.7 * c, legB: -0.7 * c, armF: -0.9 * c, armB: 0.9 * c, lean: 0.25, crouch: 0.05, bat: null, hop: Math.abs(c) * 0.25 };
    }
    case 'catcher':
      return { legF: 0.9, legB: -0.9, armF: 1.2, armB: 0.5, lean: 0.05, crouch: 0.75, bat: null, hop: 0 };
    case 'celebrate': {
      const c = Math.abs(Math.sin(t * 7));
      return { legF: 0.2, legB: -0.2, armF: 2.9, armB: -2.9, lean: 0, crouch: 0, bat: null, hop: c * 0.9 };
    }
    case 'slump':
      return { legF: 0.08, legB: -0.08, armF: 0.1, armB: -0.1, lean: 0.35, crouch: 0.1, bat: null, hop: 0 };
    case 'dive': {
      const k = Math.min(1, t);
      return { legF: -1.2 * k, legB: -1.5 * k, armF: 2.8 * k, armB: 2.6 * k, lean: 1.3 * k, crouch: 0.2 * k, bat: null, hop: 0.6 * Math.sin(Math.PI * k) };
    }
    default: {
      const b = Math.sin(t * 2.2) * 0.06;
      return { legF: 0.1, legB: -0.1, armF: 0.22 + b, armB: -0.22 - b, lean: 0, crouch: 0, bat: null, hop: 0 };
    }
  }
}

export interface Uniform {
  main: string;
  trim: string;
}

const INK = THEME.ink;

function capsule(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color: string, ol: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + ol * 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, ol: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = ol;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function highlight(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = THEME.paper;
  ctx.lineWidth = Math.max(1, r * 0.25);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.65, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Draw a character standing at screen (x, y) (feet), `s` px per foot. Crew (null) is a plain team figure.
 */
export function drawCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ch: Character | null, uni: Uniform, pose: Pose, time: number): void {
  if (s < 0.6) return;
  const sc = (ch?.scale ?? 1) * s;
  const f = pose.facing;
  const L = poseLimbs(pose);
  const ol = Math.max(1, Math.min(3, sc * 0.09));
  const skin = ch ? (THEME as Record<string, string>)[ch.skin] ?? THEME.skinA : THEME.skinB;
  const torsoW = 1.25 * (ch?.torsoW ?? 1) * sc;
  const torsoH = 1.9 * (ch?.torsoH ?? 1) * sc;
  const headR = 0.55 * (ch?.headR ?? 1) * sc;
  const legLen = 2.5 * sc * (1 - L.crouch * 0.35);
  const armLen = 2.0 * sc;
  const limbW = Math.max(2, 0.42 * sc);
  const hop = L.hop * sc;
  const hipY = y - legLen - hop;
  const hipX = x;
  const isSheet = ch?.props.includes('sheet');
  const pants = '#E9DDC6';

  ctx.save();
  // ground shadow (halftone-ish ellipse)
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x, y, torsoW * 0.75, Math.max(1.5, torsoW * 0.18), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const lean = L.lean * f;
  const shX = hipX + Math.sin(lean) * torsoH;
  const shY = hipY - Math.cos(lean) * torsoH;
  const limbEnd = (ox: number, oy: number, ang: number, len: number) => [ox + Math.sin(ang * f) * len, oy + Math.cos(ang) * len] as const;

  if (!isSheet) {
    // back leg + back arm
    const [blx, bly] = limbEnd(hipX - torsoW * 0.18 * f, hipY, L.legB, legLen);
    capsule(ctx, hipX - torsoW * 0.18 * f, hipY, blx, bly, limbW * 1.15, pants, ol);
    const [bax, bay] = limbEnd(shX - torsoW * 0.35 * f, shY + 0.15 * sc, L.armB, armLen);
    capsule(ctx, shX - torsoW * 0.35 * f, shY + 0.15 * sc, bax, bay, limbW, uni.main, ol);
  }
  // torso
  if (isSheet) {
    ctx.beginPath();
    const top = shY - headR * 1.2;
    ctx.moveTo(x - torsoW * 0.6, y - hop);
    ctx.quadraticCurveTo(x - torsoW * 0.7, top, x, top - headR * 0.6);
    ctx.quadraticCurveTo(x + torsoW * 0.7, top, x + torsoW * 0.6, y - hop);
    for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(x + torsoW * (0.45 - i * 0.3), y - hop - 0.4 * sc * (i % 2 ? -1 : 1) + Math.sin(time * 6 + i) * 0.1 * sc, x + torsoW * (0.3 - i * 0.3), y - hop);
    ctx.closePath();
    ctx.fillStyle = THEME.paper;
    ctx.fill();
    ctx.lineWidth = ol;
    ctx.strokeStyle = INK;
    ctx.stroke();
  } else {
    capsule(ctx, hipX, hipY - torsoW * 0.25, shX, shY + torsoW * 0.25, torsoW, uni.main, ol);
    // jersey trim stripe
    ctx.strokeStyle = uni.trim;
    ctx.lineWidth = Math.max(1, sc * 0.12);
    ctx.beginPath();
    ctx.moveTo(hipX - torsoW * 0.4, hipY - torsoW * 0.1);
    ctx.lineTo(hipX + torsoW * 0.4, hipY - torsoW * 0.1);
    ctx.stroke();
    highlight(ctx, (hipX + shX) / 2 - torsoW * 0.15, (hipY + shY) / 2, torsoW * 0.5);
    if (ch?.props.includes('teapot')) {
      capsule(ctx, shX + torsoW * 0.5 * f, hipY - torsoH * 0.4, shX + torsoW * 0.95 * f, hipY - torsoH * 0.75, limbW * 0.8, uni.main, ol);
    }
    // front leg
    const [flx, fly] = limbEnd(hipX + torsoW * 0.18 * f, hipY, L.legF, legLen);
    capsule(ctx, hipX + torsoW * 0.18 * f, hipY, flx, fly, limbW * 1.15, pants, ol);
    if (ch?.props.includes('pockets')) {
      ctx.fillStyle = uni.trim;
      ctx.fillRect((hipX + flx) / 2 - limbW * 0.4, (hipY + fly) / 2 - limbW * 0.3, limbW * 0.8, limbW * 0.6);
    }
  }
  // head
  const hx = shX + Math.sin(lean) * headR * 0.9;
  const hy = shY - headR * 0.95;
  drawHead(ctx, hx, hy, headR, ch, uni, skin, pose, ol, time);
  // front arm + bat
  if (!isSheet) {
    const [fax, fay] = limbEnd(shX + torsoW * 0.3 * f, shY + 0.15 * sc, L.armF, armLen);
    capsule(ctx, shX + torsoW * 0.3 * f, shY + 0.15 * sc, fax, fay, limbW, uni.main, ol);
    ellipse(ctx, fax, fay, limbW * 0.55, limbW * 0.55, skin, ol * 0.8);
    if (L.bat !== null) {
      const ba = L.bat;
      const bl = 2.8 * sc;
      const bx = fax + Math.cos(ba) * bl * f, by = fay + Math.sin(ba) * bl;
      if (pose.power) {
        // POWER: a pink glow along the bat so the room can see the gamble
        const g = glowSprite(THEME.pink, 64);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.85;
        for (let i = 1; i <= 4; i++) {
          const k = i / 4, gs = 1.6 * sc;
          ctx.drawImage(g, fax + (bx - fax) * k - gs / 2, fay + (by - fay) * k - gs / 2, gs, gs);
        }
        ctx.restore();
      }
      const skin = BAT_SKINS[pose.bat ?? 'wood'] ?? BAT_SKINS.wood;
      capsule(ctx, fax, fay, bx, by, Math.max(2, 0.32 * sc), skin.body, ol);
      ctx.strokeStyle = skin.stripe;
      ctx.lineWidth = Math.max(1, (skin.bands ? 0.3 : 0.1) * sc);
      ctx.beginPath();
      if (skin.bands) {
        for (let i = 0; i < skin.bands; i++) {
          const k0 = 0.35 + (i / skin.bands) * 0.6, k1 = k0 + 0.3 / skin.bands;
          ctx.moveTo(fax + (bx - fax) * k0, fay + (by - fay) * k0);
          ctx.lineTo(fax + (bx - fax) * k1, fay + (by - fay) * k1);
        }
      } else {
        ctx.moveTo(fax + (bx - fax) * 0.5, fay + (by - fay) * 0.5);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHead(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ch: Character | null, uni: Uniform, skin: string, pose: Pose, ol: number, time: number): void {
  const props = ch?.props ?? ['cap'];
  const f = pose.facing;
  if (props.includes('sheet')) {
    if (!pose.back) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(x - r * 0.35, y, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
      ctx.ellipse(x + r * 0.35, y, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (props.includes('ponytail')) capsule(ctx, x - r * 0.6 * f, y - r * 0.3, x - r * 1.4 * f, y + r * 0.6, r * 0.35, '#5A3A2A', ol);
  if (props.includes('robot')) {
    ctx.fillStyle = skin;
    ctx.strokeStyle = INK;
    ctx.lineWidth = ol;
    ctx.beginPath();
    ctx.rect(x - r, y - r, r * 2, r * 1.8);
    ctx.fill();
    ctx.stroke();
    capsule(ctx, x, y - r, x, y - r * 1.7, r * 0.12, INK, 0);
    ellipse(ctx, x, y - r * 1.8, r * 0.18, r * 0.18, THEME.pink, ol * 0.6);
  } else if (props.includes('bottle')) {
    ellipse(ctx, x, y + r * 0.2, r * 0.75, r * 0.9, skin, ol);
    capsule(ctx, x, y - r * 0.6, x, y - r * 1.5, r * 0.4, THEME.sun, ol);
  } else {
    ellipse(ctx, x, y, r, r * 1.05, skin, ol);
    highlight(ctx, x, y, r);
  }
  if (props.includes('bun')) ellipse(ctx, x, y - r * 1.05, r * 0.45, r * 0.4, '#C8C2B8', ol);
  if (props.includes('flattop')) {
    ctx.fillStyle = '#2E2018';
    ctx.fillRect(x - r * 0.95, y - r * 1.25, r * 1.9, r * 0.6);
  }
  const capProp = props.find((p) => p === 'cap' || p === 'bigcap' || p === 'beanie' || p === 'tophat' || p === 'teapot');
  if (capProp === 'cap' || capProp === 'bigcap') {
    const k = capProp === 'bigcap' ? 1.35 : 1;
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.35, r * 1.02 * k, r * 0.75 * k, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = uni.main;
    ctx.fill();
    ctx.lineWidth = ol;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (!pose.back) capsule(ctx, x, y - r * 0.32, x + r * 1.05 * k * f, y - r * 0.25, r * 0.22, uni.main, ol * 0.8);
  } else if (capProp === 'beanie') {
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.3, r, r * 0.8, 0, Math.PI, 0);
    ctx.fillStyle = uni.main;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = ol;
    ctx.stroke();
    const sp = Math.sin(time * 18) * r * 0.9;
    capsule(ctx, x - sp, y - r * 1.2, x + sp, y - r * 1.2, r * 0.18, THEME.sun, ol * 0.6);
  } else if (capProp === 'tophat' || capProp === 'teapot') {
    ctx.fillStyle = capProp === 'teapot' ? uni.main : INK;
    ctx.fillRect(x - r * 0.6, y - r * 2.0, r * 1.2, r * 1.2);
    ctx.fillRect(x - r * 0.95, y - r * 0.9, r * 1.9, r * 0.22);
    ctx.strokeStyle = INK;
    ctx.lineWidth = ol;
    ctx.strokeRect(x - r * 0.6, y - r * 2.0, r * 1.2, r * 1.2);
  }
  if (!pose.back) {
    const ex = r * 0.32;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x - ex + f * r * 0.15, y + r * 0.05, Math.max(0.8, r * 0.11), 0, Math.PI * 2);
    ctx.arc(x + ex + f * r * 0.15, y + r * 0.05, Math.max(0.8, r * 0.11), 0, Math.PI * 2);
    ctx.fill();
    if (props.includes('goggles')) {
      ctx.strokeStyle = THEME.teal;
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.beginPath();
      ctx.arc(x - ex + f * r * 0.15, y + r * 0.05, r * 0.24, 0, Math.PI * 2);
      ctx.arc(x + ex + f * r * 0.15, y + r * 0.05, r * 0.24, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (props.includes('moustache')) capsule(ctx, x - r * 0.4 + f * r * 0.15, y + r * 0.45, x + r * 0.4 + f * r * 0.15, y + r * 0.45, r * 0.16, '#3A2618', 0);
  } else if (props.includes('goggles')) {
    ctx.strokeStyle = THEME.teal;
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.stroke();
  }
}
