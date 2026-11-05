// Shared verify helpers.
export const helpers = {
  /** Title → PLAY → Short Run using the reported button rects (real taps/clicks). */
  async startShort(h) {
    let s = await h.state();
    const play = s.buttons.find((b) => b.id === 'ui:play');
    if (!play) throw new Error('no PLAY button');
    await h.press(play);
    await h.advance(20);
    s = await h.state();
    const short = s.buttons.find((b) => b.id === 'ui:mode-short');
    if (!short) throw new Error('no Short Run card; screen=' + s.screen);
    await h.press(short);
    await h.advance(20);
  },
  /** Advance until the human-facing pitch is `msBefore` ms from ideal contact. */
  async toContactMoment(h, msBefore = 0) {
    const s = await h.until((x) => x.phase === 'pitch' && x.humanBatting, { label: 'human batting pitch', max: 60000 });
    const g = await h.game(() => {
      const st = window.__game.getState();
      return { rel: st.releaseT, T: st.pitch.T, now: st.time };
    });
    const target = g.rel + g.T - msBefore / 1000;
    const dt = Math.max(0, target - g.now);
    // step exactly to the contact moment (advanceTime rounds to 1/120 s)
    if (dt > 0) await h.advance(dt * 1000);
    return s;
  },
  async toNextPitch(h) {
    await h.until((x) => x.phase === 'prePitch' || x.phase === 'gameOver', { label: 'next pitch', max: 30000 });
  },
};
