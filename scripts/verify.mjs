// Playwright verification against the built preview. Usage: npm run verify [-- --only=name,name] [MILESTONE=M1]
// Prints: VERIFY: <passed>/<total> scenarios, <n> page errors, <n> console errors, screenshots: <dir>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';
import { scenarios } from './verify/scenarios.mjs';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const milestone = process.env.MILESTONE || 'latest';
const shotDir = `artifacts/screens/${milestone}`;
mkdirSync(shotDir, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const onlyVp = (process.argv.find((a) => a.startsWith('--vp=')) || '').slice(5).split(',').filter(Boolean);

const landscape = devices['iPhone 17 Pro landscape'] || {
  ...devices['iPhone 17 Pro'],
  viewport: { width: devices['iPhone 17 Pro'].viewport.height, height: devices['iPhone 17 Pro'].viewport.width },
};
const VIEWPORTS = [
  { name: 'desktop', opts: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
  { name: 'iphone', opts: { ...devices['iPhone 17 Pro'] } },
  { name: 'iphone-land', opts: { ...landscape } },
].filter((v) => !onlyVp.length || onlyVp.includes(v.name));

function startServer() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview server timeout')), 20000);
    proc.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); resolve(proc); } });
    proc.on('exit', (c) => reject(new Error('preview exited ' + c)));
  });
}

const IGNORED = [/GPU stall due to ReadPixels/i, /fonts\.(googleapis|gstatic)\.com/i];

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  let passed = 0, total = 0, pageErrors = 0, consoleErrors = 0;
  const failures = [];
  try {
    for (const vp of VIEWPORTS) {
      for (const sc of scenarios) {
        if (only.length && !only.includes(sc.name)) continue;
        if (sc.viewports && !sc.viewports.includes(vp.name)) continue;
        total++;
        const context = await browser.newContext({ ...vp.opts, ...(sc.contextOpts || {}) });
        const page = await context.newPage();
        const errs = [];
        page.on('pageerror', (e) => { pageErrors++; errs.push('pageerror: ' + e.message); });
        page.on('console', (m) => {
          if (m.type() !== 'error') return;
          const text = m.text();
          if (IGNORED.some((r) => r.test(text)) || (sc.ignoreConsole && sc.ignoreConsole.test(text))) return;
          consoleErrors++; errs.push('console.error: ' + text);
        });
        const helpers = makeHelpers(page, vp, sc.name);
        const t0 = Date.now();
        try {
          await sc.run(helpers);
          if (errs.length) throw new Error(errs.join(' | '));
          passed++;
          console.log(`  ✓ ${sc.name} [${vp.name}] ${Date.now() - t0}ms`);
        } catch (e) {
          failures.push(`${sc.name} [${vp.name}]: ${e.message}`);
          console.log(`  ✗ ${sc.name} [${vp.name}] ${e.message.slice(0, 400)}`);
          try { await page.screenshot({ path: `${shotDir}/FAIL-${sc.name}-${vp.name}.png` }); } catch {}
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  if (failures.length) console.log('Failures:\n' + failures.map((f) => ' - ' + f).join('\n'));
  console.log(`VERIFY: ${passed}/${total} scenarios, ${pageErrors} page errors, ${consoleErrors} console errors, screenshots: ${shotDir}`);
  process.exit(passed === total && !pageErrors && !consoleErrors ? 0 : 1);
}

function makeHelpers(page, vp, scenarioName) {
  const h = {
    page, vp: vp.name, base: BASE,
    async open(query = 'test=1&seed=1', { fresh = true } = {}) {
      await page.goto(BASE + '?' + query);
      if (fresh) await page.evaluate(() => { try { localStorage.clear(); } catch {} });
      await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && window.__ready === true, null, { timeout: 15000 });
    },
    async state() { return JSON.parse(await page.evaluate(() => window.render_game_to_text())); },
    async advance(ms) { await page.evaluate((m) => window.advanceTime(m), ms); },
    async act(action) { return page.evaluate((a) => window.__game.act(a), action); },
    async game(fn, arg) { return page.evaluate(fn, arg); },
    async shot(name) { await page.screenshot({ path: `${shotDir}/${name}-${vp.name}.png` }); },
    async until(pred, { step = 50, max = 20000, label = 'condition' } = {}) {
      for (let t = 0; t <= max; t += step) {
        const s = await h.state();
        if (pred(s)) return s;
        await h.advance(step);
      }
      const s = await h.state();
      throw new Error(`timeout waiting for ${label}; state=${s.state} phase=${s.phase}`);
    },
    async tapRect(r) { await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); },
    async clickRect(r) { await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); },
    async press(rOrSel) {
      if (rOrSel && typeof rOrSel === 'object' && String(rOrSel.id || '').startsWith('ui:')) {
        // DOM menu control: let Playwright scroll it into view like a user would, then tap/click.
        const loc = page.locator(`[data-id="${rOrSel.id.slice(3)}"]`).first();
        if (vp.name === 'desktop') await loc.click(); else await loc.tap();
        return;
      }
      if (typeof rOrSel === 'string') {
        if (vp.name === 'desktop') await page.click(rOrSel); else await page.tap(rOrSel);
      } else if (vp.name === 'desktop') await h.clickRect(rOrSel); else await h.tapRect(rOrSel);
    },
    expect(cond, msg) { if (!cond) throw new Error(`[${scenarioName}] ${msg}`); },
  };
  return h;
}

main().catch((e) => { console.error(e); console.log('VERIFY: 0/0 scenarios, 1 page errors, 0 console errors, screenshots: none'); process.exit(1); });
