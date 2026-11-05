// Generates public/icons/*.png from canvas code (no art files): renders in headless Chromium.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const draw = (size) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 512;
  const ink = '#1B2140', paper = '#F2E8D5', pink = '#FF4F7E', teal = '#27B0AE', sun = '#FFC53D';
  g.fillStyle = ink;
  g.fillRect(0, 0, size, size);
  // halftone rays
  g.fillStyle = '#2B3468';
  for (let y = 8; y < size; y += 16 * s) for (let x = 8; x < size; x += 16 * s) {
    const d = Math.hypot(x - size / 2, y - size * 0.45) / size;
    g.beginPath();
    g.arc(x, y, Math.max(0.5, 5 * s * (1 - d)), 0, Math.PI * 2);
    g.fill();
  }
  // misregistered ball: pink + teal plates, then paper with ink outline
  const cx = size / 2, cy = size * 0.45, r = 150 * s;
  for (const [col, dx, dy] of [[pink, -10 * s, 7 * s], [teal, 10 * s, -6 * s]]) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = paper;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 14 * s;
  g.strokeStyle = ink;
  g.stroke();
  g.strokeStyle = '#D9473A';
  g.lineWidth = 9 * s;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(cx + side * r * 1.25, cy, r * 0.85, Math.PI - 0.9, Math.PI + 0.9, false);
    if (side < 0) { g.beginPath(); g.arc(cx - r * 1.25, cy, r * 0.85, -0.9, 0.9); }
    g.stroke();
  }
  // wordmark
  g.font = `${110 * s}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 16 * s;
  g.strokeStyle = ink;
  g.strokeText('DP', cx, size * 0.84);
  g.fillStyle = sun;
  g.fillText('DP', cx, size * 0.84);
  return c.toDataURL('image/png');
};

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['apple-touch-icon-180', 180], ['icon-192', 192], ['icon-512', 512]]) {
  const url = await page.evaluate(draw, size);
  writeFileSync(`public/icons/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`icons: public/icons/${name}.png (${size}×${size})`);
}
await browser.close();
