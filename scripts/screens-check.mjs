// Lists the 12 screenshots the brief names × 3 viewports for a milestone dir and fails if any is missing.
import { existsSync } from 'node:fs';
const dir = `artifacts/screens/${process.argv[2] || process.env.MILESTONE || 'latest'}`;
const NAMES = ['title-attract', 'first-pitch', 'perfect-freeze', 'homer-slowmo', 'throw-prompt', 'inning-transition', 'game-over', 'derby-results', 'handoff', 'settings', 'binder', 'clutch-intro'];
const VPS = ['desktop', 'iphone', 'iphone-land'];
let missing = 0;
for (const n of NAMES) {
  const row = VPS.map((v) => (existsSync(`${dir}/${n}-${v}.png`) ? '✓' : (missing++, '✗')));
  console.log(`${n.padEnd(18)} ${row.join('  ')}`);
}
console.log(`screens: ${NAMES.length * VPS.length - missing}/${NAMES.length * VPS.length} present in ${dir}`);
process.exit(missing ? 1 : 0);
