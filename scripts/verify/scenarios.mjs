// Verify scenarios. Each: { name, viewports?, run(h) } — h from verify.mjs makeHelpers.
export const scenarios = [
  {
    name: 'boot',
    async run(h) {
      await h.page.goto(h.base + '?test=1');
      await h.page.waitForFunction(() => typeof window.render_game_to_text === 'function');
      const s = JSON.parse(await h.page.evaluate(() => window.render_game_to_text()));
      h.expect(s.state === 'title', 'boots to title');
      await h.shot('boot');
    },
  },
];
