import { describe, it, expect } from 'vitest';
// @ts-expect-error untyped mjs
import { checkSources, MAX_LINES } from '../scripts/check.mjs';

describe('check script rules', () => {
  it('flags oversized files', () => {
    const v = checkSources([{ path: 'src/a.ts', text: 'x\n'.repeat(MAX_LINES + 5) }]);
    expect(v.join()).toMatch(/lines/);
  });
  it('flags forbidden sim imports, globals and Math.random', () => {
    const v: string[] = checkSources([
      { path: 'src/sim/a.ts', text: "import { r } from '../render/x';" },
      { path: 'src/sim/b.ts', text: 'const w = window.innerWidth;' },
      { path: 'src/sim/c.ts', text: 'const r = Math.random();' },
      { path: 'src/sim/d.ts', text: 'document.body;' },
    ]);
    expect(v.length).toBe(4);
  });
  it('ignores comments and allows the same code outside sim', () => {
    expect(checkSources([{ path: 'src/sim/e.ts', text: '// timing window.\n/* Math.random() */ const a = 1;' }])).toEqual([]);
    expect(checkSources([{ path: 'src/render/e.ts', text: 'const w = window.innerWidth;' }])).toEqual([]);
  });
  it('bans shadowBlur and ctx.filter anywhere', () => {
    const v: string[] = checkSources([{ path: 'src/render/x.ts', text: 'ctx.shadowBlur = 4; ctx.filter = "blur(2px)";' }]);
    expect(v.length).toBe(2);
  });
});
