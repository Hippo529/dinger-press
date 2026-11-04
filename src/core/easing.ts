// Standard easings (easings.net formulas).
const c1 = 1.70158;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

export const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);
export const easeInCubic = (x: number): number => x * x * x;
export const easeOutBack = (x: number): number => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
export const easeInBack = (x: number): number => c3 * x * x * x - c1 * x * x;
export const easeOutElastic = (x: number): number =>
  x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
export const easeInOutSine = (x: number): number => -(Math.cos(Math.PI * x) - 1) / 2;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
