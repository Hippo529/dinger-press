// M0 placeholder boot; replaced in M1.
const w = window as unknown as Record<string, unknown>;
w.render_game_to_text = () => JSON.stringify({ mode: 'boot', state: 'title' });
w.advanceTime = (_ms: number) => undefined;
