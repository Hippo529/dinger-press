// "Overprint" art bible tokens. CSS variables are generated from these (see ui/styles).
export const THEME = {
  paper: '#F2E8D5',
  ink: '#1B2140',
  grass: '#1E6B58',
  grassStripe: '#237A64',
  dirt: '#9A3F2C',
  pink: '#FF4F7E',
  sun: '#FFC53D',
  teal: '#27B0AE',
  wall: '#2A3060',
  ball: '#FFFAF0',
  sky: '#1B2140', // night sky = ink
  stands: '#232A52',
  chalk: '#F2E8D5',
  // skin inks (characters)
  skinA: '#F0B48C',
  skinB: '#C98B62',
  skinC: '#8E5B3F',
  skinD: '#E8C9A0',
  skinR: '#9BC53D', // relish green
  skinM: '#B9C2D0', // metal / porcelain
  skinG: '#F2E8D5', // ghost sheet (paper) — always ink-outlined
} as const;

export type ThemeKey = keyof typeof THEME;

export const FONTS = {
  display: '"Bowlby One", "Arial Black", "Helvetica Neue", sans-serif',
  ui: '"Chivo Mono", ui-monospace, Menlo, Consolas, monospace',
};

export const TEAM_INK: Record<'pink' | 'teal' | 'sun' | 'ink', { main: string; trim: string; text: string }> = {
  pink: { main: THEME.pink, trim: THEME.ink, text: THEME.ink },
  teal: { main: THEME.teal, trim: THEME.ink, text: THEME.ink },
  sun: { main: THEME.sun, trim: THEME.ink, text: THEME.ink },
  ink: { main: THEME.ink, trim: THEME.sun, text: THEME.paper },
};

/** Per-pitch trail tints (the visual tell) and seam pattern ids. */
export const PITCH_TELL: Record<string, { tint: string; seam: 'cross' | 'dot' | 'ring' | 'stripe' | 'none' }> = {
  FF: { tint: '#FFFAF0', seam: 'cross' },
  SI: { tint: '#9AE3D8', seam: 'stripe' },
  CU: { tint: '#FFC53D', seam: 'ring' },
  SL: { tint: '#7FD3FF', seam: 'dot' },
  CH: { tint: '#C7B8FF', seam: 'stripe' },
  SP: { tint: '#FF9E6B', seam: 'ring' },
  SC: { tint: '#B6F07A', seam: 'dot' },
  KN: { tint: '#F2E8D5', seam: 'none' },
};

/** WCAG relative luminance contrast ratio. */
export function contrast(a: string, b: string): number {
  const L = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function cssVars(): string {
  return Object.entries(THEME)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ') + ` --font-display: ${FONTS.display}; --font-ui: ${FONTS.ui};`;
}
