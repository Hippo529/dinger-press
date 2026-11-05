import { readFileSync } from "node:fs";
import { describe, expect, it } from 'vitest';
// @ts-expect-error untyped mjs
import { audit } from '../scripts/audit.mjs';

describe('build audit', () => {
  it('no asset files besides icons, no frameworks, no worklets/workers/dynamic imports', () => {
    expect(audit('.')).toEqual([]);
  });
});

describe('add to home screen', () => {
  it('manifest is standalone with theme colours; icons are 180/192/512 PNGs; index has apple tags', () => {
    const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toMatch(/^#/);
    expect(m.background_color).toMatch(/^#/);
    const size = (f: string) => {
      const b = readFileSync(f);
      expect(b.subarray(1, 4).toString()).toBe('PNG');
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    expect(size('public/icons/apple-touch-icon-180.png')).toEqual([180, 180]);
    expect(size('public/icons/icon-192.png')).toEqual([192, 192]);
    expect(size('public/icons/icon-512.png')).toEqual([512, 512]);
    const html = readFileSync('index.html', 'utf8');
    for (const t of ['apple-mobile-web-app-capable', 'black-translucent', 'apple-touch-icon', 'viewport-fit=cover', 'manifest.webmanifest']) expect(html).toContain(t);
    const app = readFileSync('src/state/app.ts', 'utf8');
    expect(app).toMatch(/isStandalone\(\)\) requestPersist\(\)/);
  });
});
