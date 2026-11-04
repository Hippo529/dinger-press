// Structural checks: file size, sim purity, banned canvas APIs, then tsc --noEmit.
// Exports checkSources() so tests/check.test.ts can unit-test the rules on fixtures.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MAX_LINES = 450;
const SIM_FORBIDDEN_IMPORT = /from\s+['"](?:\.\.\/)+(render|fx|audio|ui|state|save|platform)\b/;
const SIM_FORBIDDEN_GLOBAL = /\b(window|document|localStorage|navigator|requestAnimationFrame)\s*[.[(]/;

/** Remove comments (approximate; good enough for our own sources). */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** @param {{path:string,text:string}[]} files  @returns {string[]} violations */
export function checkSources(files) {
  const out = [];
  for (const f of files) {
    const p = f.path.replace(/\\/g, '/');
    const lines = f.text.split('\n').length;
    if (lines > MAX_LINES) out.push(`${p}: ${lines} lines > ${MAX_LINES}`);
    const code = stripComments(f.text);
    if (/\bshadowBlur\b/.test(code)) out.push(`${p}: shadowBlur is banned (use pre-rendered glow sprites)`);
    if (/\bctx\w*\.filter\s*=/.test(code)) out.push(`${p}: ctx.filter is banned`);
    if (p.includes('src/sim/')) {
      if (SIM_FORBIDDEN_IMPORT.test(code)) out.push(`${p}: sim imports a forbidden layer`);
      if (SIM_FORBIDDEN_GLOBAL.test(code)) out.push(`${p}: sim touches a browser global`);
      if (/Math\.random\s*\(/.test(code)) out.push(`${p}: Math.random in sim (use rng)`);
    }
  }
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) acc.push(full);
  }
  return acc;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = process.cwd();
  const files = walk(join(root, 'src')).map((p) => ({ path: relative(root, p), text: readFileSync(p, 'utf8') }));
  const v = checkSources(files);
  for (const line of v) console.error('CHECK ✗ ' + line);
  console.log(`check: ${files.length} files scanned, ${v.length} violations`);
  const tsc = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { stdio: 'inherit' });
  if (tsc.status !== 0) console.error('CHECK ✗ tsc failed');
  process.exit(v.length || tsc.status ? 1 : 0);
}
