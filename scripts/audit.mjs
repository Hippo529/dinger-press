// Build audit: no image/audio asset files in dist besides generated icons; no game/physics framework
// dependencies; no AudioWorklet / Worker / dynamic import() in src (single-file build constraints).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BANNED_DEPS = ['phaser', 'pixi.js', 'pixi', 'three', 'kaplay', 'kaboom', 'matter-js', 'planck', 'cannon', 'howler', 'tone', 'babylonjs'];
const ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|svg|mp3|ogg|wav|m4a|aac|flac|mp4|webm)$/i;

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

export function audit(root = '.') {
  const findings = [];
  for (const f of [...walk(join(root, 'dist')), ...walk(join(root, 'dist-single'))]) {
    const rel = f.replace(/\\/g, '/');
    if (ASSET_EXT.test(rel) && !/\/icons\/(apple-touch-icon-180|icon-192|icon-512)\.png$/.test(rel)) findings.push(`asset file in build: ${rel}`);
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const d of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) if (BANNED_DEPS.includes(d)) findings.push(`framework dependency: ${d}`);
  for (const f of walk(join(root, 'src')).filter((p) => /\.(ts|js|mjs)$/.test(p))) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    if (/\baudioWorklet\b|AudioWorkletNode/.test(src)) findings.push(`AudioWorklet in ${f}`);
    if (/new\s+(Shared)?Worker\s*\(/.test(src)) findings.push(`Worker in ${f}`);
    if (/\bimport\s*\(/.test(src)) findings.push(`dynamic import() in ${f}`);
    if (/serviceWorker\.register/.test(src)) findings.push(`service worker in ${f}`);
  }
  return findings;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const f = audit();
  for (const x of f) console.error('AUDIT ✗ ' + x);
  console.log(`audit: ${f.length} findings`);
  process.exit(f.length ? 1 : 0);
}
