Original prompt:

You are building a complete, polished arcade/party baseball game for the browser in this Claude Code cloud session, starting from an empty repo. Be ambitious. I want something that feels like a finished indie release: juicy, funny, readable, and deep enough to replay, not a prototype. Be conservative about abstraction, though. Don't build an engine inside the game, an ECS, or a plugin system. Read this whole brief before you start.

<context>
- Players are friends passing one phone around, plus solo score-chasers. Most play happens in iPhone Safari: touch, one thumb, portrait first. Desktop Mac browsers (Safari and Chrome, keyboard + mouse/trackpad) must also be first-class.
- Zero external art or audio files. Draw every visual in code (Canvas 2D primitives, gradients, procedurally generated textures). Synthesize every sound with Web Audio. You may use up to two Google Fonts, with a designed system-font fallback.
- Original IP only. Invent the game name, characters, teams, stadiums and mode names. Don't use real leagues, teams, players, logos, or characters from other games.
- You can see screenshots. You cannot hear audio, feel touch latency, or measure real frame rate here. So make everything you can't perceive either structurally testable (event logs, numbers) or isolated in a tuning file that a human will adjust on a real iPhone.
</context>

<game_design>
Write the full design into SPEC.md first (see <process_and_milestones>). The decisions below are settled. Flesh them out and don't relitigate them.

Core at-bat loop: windup → pitch in flight → swing or take → contact resolution → outcome banner → next pitch. Batting layers up to three inputs:
1. Timing (always on). Swing time relative to the ideal contact moment sets contact quality and spray direction. Early pulls the ball; late sends it to the opposite field.
2. Aim/direction (depends on tier; see <controls>). Sets launch angle and fine contact.
3. Power commitment. A POWER toggle the player sets before release; it locks once the pitch is thrown. It shrinks the timing windows and contact area and raises exit velocity. The batter's stance visibly changes so the room can see the gamble.

Contact grades. Every swing gets a grade, and each grade has its own label, sound layers, hit-stop length, particle burst and popup:
- PERFECT
- GOOD
- EARLY
- LATE
- JAMMED (inside, off the handle)
- TOPPED (grounder)
- UNDER (pop-up)
- FOUL
- WHIFF

On solid contact, show exit velocity and distance ("108 mph · 431 ft"). After every swing, show a timing bar: a centre notch, a marker at the actual swing time (left = early, right = late) and the grade word. Practice mode also shows the ms offset. The same grade must always produce the same feedback, so players learn quality by feel.

Difficulty ladder. All three tiers run the same underlying model with different inputs:
- Rookie: timing only. Vertical contact is auto-aligned, windows are big, and the pitch-location marker and timing bar are on.
- Pro: timing plus direction. Where you tap biases the trajectory.
- All-Star: timing plus zone aim. Place a contact reticle before the pitch arrives.

Each player also gets a continuous 0–99 difficulty slider. Name it yourself. It scales pitch speed, timing windows and CPU skill smoothly, with no rule changes between values, and higher values multiply leaderboard scores. Hiding the pitch locator is an expert option that earns a score bonus. It is never the default.

Pitching (when the player fields):
- Pick a pitch type. Each pitcher has 2–4 of: four-seam, sinker, curve, slider, changeup, splitter, screwball, knuckler.
- Aim a target in or around the zone.
- Make one skill input: a charge ring.
- Optionally steer in flight, within that pitch's break budget.

Stamina and per-pitch-type tiredness cut speed, break and accuracy, so spamming one pitch stops working. Show stamina on the HUD. Give each pitch type a readable visual tell (spin pattern, trail tint) so batters can learn to read pitches by watching.

Fielding and baserunning are automated, and they must look smart.
- The nearest fielder always chases, using a deterministic intercept to the projected landing or roll point. Cutoffs and base coverage follow real fundamentals.
- When the player's team fields: once the ball is secured, big base buttons (1B/2B/3B/HOME, or keys 1–4) offer a one-tap throw. If nothing is tapped within about 1.2 s, the assist throws to the correct base.
- Runners advance automatically by hit type and a Conservative/Aggressive setting. A one-tap SEND/HOLD prompt appears only on genuinely close calls.
- Explain automated outcomes in text so nothing reads as luck: "LINE DRIVE — no chance", "Diving catch!", "Beat the throw by a step".

Star meter. Each team holds 0–5 stars, and play is the only way to earn them:
- PERFECT contact, strikeouts and extra-base hits each earn stars.
- "Star Chance" prompts appear in high-leverage moments (runners in scoring position, trailing late) as a soft comeback mechanic.
- Spend 1 star on a Star Swing (a generous window and max exit velocity on GOOD or better) or a Star Pitch (nasty break with a loud, unmistakable tell).

Nothing random ever overrides player input. No surprise meatballs, no hidden dice on contact, no unearned specials.

Modes. All are short, and the first pitch is in the air within about 5 s of tapping Play.
- Quick Game vs CPU: 3 innings. A team leading by more than 5 runs after the 1st or 2nd inning wins by mercy rule. From the 4th inning on, each half starts with a runner on 2nd. After the 6th, a three-swing sudden-death derby decides it.
- Derby: score-chase with 10 outs. Any swing that isn't a homer is an out, and so is a called strike; taking a ball costs nothing. Consecutive homers build a streak multiplier, and PERFECTs add a bonus. Pass-and-play supports 2–8 players with handoff screens, and 4+ players can play an elimination bracket.
- Versus pass-and-play (2 players, one phone): each player bats their own half-inning against CPU pitching tuned to their personal slider, so the phone changes hands only between halves. Show "Pass to Player 2 — tap when ready" screens that ignore stray touches for 400 ms. A shared-keyboard desktop duel (one batter, one pitcher) is a stretch goal.
- Clutch Cards: 60–90-second half-inning scenarios ("Down 2, bases loaded, two outs — walk it off", "Protect a one-run lead"). Include a Daily Card seeded from the date.
- Practice: no outs. Pick pitch type and speed, see a ms timing readout, and toggle every indicator.

Progression and replay (saved in localStorage):
- An original roster of about 12 characters. Give them silly names, strongly distinct silhouettes, contact/power/speed/pitching ratings, one or two signature traits (buddy-bonus pairs, a rivalry, streakiness) and a short catchphrase bank.
- Unlock about 4 more characters, 2–3 extra stadiums (odd fences or a playful hazard), bat skins, ball trails and a collectible card binder. Unlocks come through achievements only: no currency and no stat-upgrade economy.
- Local leaderboards: longest homer, best derby, highest exit velocity, longest PERFECT streak, Clutch Card wins.
- Show momentum where spectators can read it: a hot/cold icon on nameplates and a pressure bar on the scoreboard.

Flow guardrails. These come from reviewer complaints about shipped baseball games, so treat them as requirements:
- Dead time. After a take or whiff, the next windup starts within 0.8 s. After a routine play, the next pitch is ready within 1.2 s of the ball going dead. A home-run celebration lasts 3.5 s at most. Any tap skips ceremony.
- No menus mid-at-bat. Choosing a pitch is one tap or one key.
- Fielding never visibly blunders: no wrong fielder chasing, no throw to the wrong base, no runner standing still on a ball in the gap.
- No difficulty spikes. CPU strength follows the slider, with no hidden late-game boost.
- Teach through play. The first pitch is a slow, centred meatball with a pulsing "tap when it reaches the zone" cue, and the timing bar appears after the first swing. A new player's first three pitches get 1.5× windows. An in-context explainer of 30 seconds or less covers strikes, balls, outs and innings.
- The title screen runs an attract loop of CPU-vs-CPU at-bats behind the logo.
</game_design>

<controls>
Route all input through a layer that maps raw events to semantic actions (swing, aim, togglePower, useStar, selectPitch, throwTo, skip, pause), each carrying the event's timeStamp. Use Pointer Events and respond on pointerdown, never on click.

Touch (iPhone, one thumb):
- Rookie: tapping anywhere in the play area swings, on pointerdown.
- Pro: tapping swings. Where you tap in the swing pad biases the trajectory: upper third = lift, lower third = grounder, left/right = pull/opposite field. No drag is needed and no latency is added.
- All-Star: press and drag to move the contact reticle, then release to swing. The swing time is the pointerup timestamp. Draw the reticle offset above the thumb so the thumb doesn't hide it.
- POWER and STAR chips sit within thumb reach in a bottom corner. A left-handed setting mirrors them. Touch targets are at least 44 px.
- Pitching: tap a pitch chip (it defaults to the last pitch used). Then press and hold in the zone: your finger sets the target through an offset marker while a charge ring fills. Release in the sweet band for full velocity and accuracy. Releasing early gives a slower pitch; releasing late scatters it (wild or hanging). After release, a horizontal drag steers within the break budget. An assist setting replaces the charge with a single tap.

Keyboard/mouse (desktop):
- Space or mousedown swings. Pro direction: hold WASD or the arrow keys at swing time. All-Star: mouse position is the reticle, and a click swings. Shift toggles POWER and E uses a star.
- Pitching: 1–4 selects the pitch, the mouse aims, holding the mouse button or Space charges, and releasing throws. A/D or ←/→ steer in flight.
- Esc/P pauses and M mutes. F toggles fullscreen (desktop only). Every menu is keyboard-navigable.

Fairness. Resolve each swing at its exact input timestamp against the interpolated ball position, not at the next frame, so 60 Hz and 120 Hz players are judged identically. Buffer inputs that arrive during hit-stop or transitions.
</controls>

<game_feel>
Every feel number lives in src/config/tuning.ts, grouped and commented with units. The values below are starting defaults, drawn from fighting-game and camera-shake references plus inference. They are not ground truth. A human will tune them on a phone, so make them trivially editable and read them live. A ?debug=1 slider panel for the main ones is welcome.
- Timing windows, in ms from ideal contact, at the Rookie baseline before slider scaling:
  - PERFECT: accept ±40, but draw the notch at ±30 so success feels generous.
  - GOOD: ±100.
  - EARLY/LATE (weak contact or foul): out to ±160.
  - Beyond that: WHIFF.
  - PERFECT gets a fixed 8 ms late-side grace (−40 / +48 ms), independent of refresh rate. POWER multiplies windows by 0.65, contact radius by 0.7 and exit velocity by 1.15.
- Fastball flight time from release to plate: Rookie 0.85 s, Pro 0.65 s, All-Star 0.50 s. Off-speed pitches are 15–25% slower. The slider interpolates between these.
- Hit-stop sets the sim time-scale to 0 while UI, audio and input keep running:
  - Foul or weak: 40 ms. GOOD: 90 ms. PERFECT: 150 ms. Hard cap: 200 ms.
  - Strikeout mitt pop: 80 ms.
  - During the freeze, vibrate bat and ball ±3 px along the bat axis, decaying to 0.
  - Hit-stop begins after the contact frame has rendered, never before it.
- Screen shake uses the trauma model:
  - Events add trauma: mitt pop 0.1, GOOD 0.25, PERFECT 0.4, homer clearing the fence 0.6, walk-off 1.0.
  - Shake = trauma², driven by three smooth noise channels at speed 20.
  - Max translation is 2% of the short screen side and max roll is 2°. Trauma decays at 1.2 per second.
  - Shake only the world layer, never the HUD, and never between pitch release and contact.
- Slow-mo is for home runs and walk-offs only. Set the sim time-scale to 0.35 for 0.8 s of real time while the camera follows, then ease back to 1.0 over 0.3 s with easeOutCubic. A tap skips it.
- Camera:
  - Static behind-the-plate view from release to contact.
  - Zoom punch 1.0 → 1.07 during hit-stop, easing out over 200 ms.
  - Then an exponential follow (k ≈ 6/s) toward the projected landing point.
  - The ball always casts a ground shadow, which is what sells its height.
- Squash/stretch:
  - Ball: 0.7×/1.3× across the bat normal for 1–2 frames at contact, then stretched along its velocity while it's fast, preserving area.
  - Mitt: 0.85×/1.15× on the catch, recovering with easeOutBack over 120 ms.
  - Trail: the last 12 positions, with tapering width and alpha, thicker at higher speed.
- Popups pop in over 150 ms (easeOutBack), drift up 40 px (easeOutCubic), hold 500 ms and fade over 200 ms, under 1 s in total.
- Buttons scale to 0.94 in 60 ms on press and spring back over 180 ms with easeOutBack.
- Screen transitions take 250 ms with easeOutCubic. Stagger list items by 40 ms. A transition never exceeds 400 ms in total.
- Implement the standard easings.net formulas: easeOutBack (c1 = 1.70158, c3 = c1 + 1), easeOutElastic, easeOutCubic, and easeInBack for windup anticipation.
- Audio variation:
  - Random pitch shift of ±1.5 semitones on repeated SFX (rate = 2^(s/12)), and never the same variant twice in a row.
  - The strike sting rises +2 semitones per strike in the count. The streak chime rises +1 semitone per consecutive hit.
  - Duck the crowd 8 dB for 300 ms under the bat crack.
- Leave headroom between effect tiers. Slow-mo, the full-screen flash, confetti and the replay belong to home runs only.
- Pool particles with no per-frame allocation and cap them at 300 live. Contact bursts are 10–20 particles, scaled by grade. The mitt dirt puff is 6–12. Homer fireworks go up to 150.
- Comfort and safety:
  - Reduce Motion defaults to on when prefers-reduced-motion is set. It zeroes shake, replaces zoom punches and slow-mo with a still freeze plus a banner, and disables full-screen flashes.
  - Separate settings: shake 0/50/100%, flashes on/off, slow-mo on/off.
  - A code-level flash governor allows no more than 3 flashes in any 1-second window (WCAG 2.3.1), with a unit test. The homer flash is at most 35% white and fires once. Never flash the full screen saturated red.
  - Never convey anything by colour alone. Timing, count and zone markers also differ by shape, position or text.
</game_feel>

<art_and_audio>
Visual direction: surprise me. In SPEC.md, sketch three genuinely different art directions in a line or two each. Pick the most distinctive one that still keeps the ball readable at phone size, and write a short art bible covering:
- the look's name
- 5–7 colour tokens
- one display font and one UI font
- shape language and lighting
- how characters are built
- motion personality
- the crowd and stadium

Then commit to it everywhere, including menus, scoreboard and results.

Avoid the defaults that read as AI-generated: purple-on-white gradients, Inter/Roboto/Arial, generic neon synthwave grids, clip-art flatness, emoji as art. If you go retro or broadcast-style, add a twist that makes it ownable.

Readability beats style:
- The ball is the highest-contrast object against everything it flies over. Unit-test a contrast ratio of at least 4.5:1 between the ball token and the background tokens.
- The zone and pitch marker are legible at 390 px wide.
- No particle, trail or popup ever covers the ball between release and contact.

Craft:
- Build characters from capsules and ellipses, with outlines and a cel highlight. Animate them procedurally: windup, swing, follow-through, celebrations, idle fidgets.
- Bake static layers into offscreen canvases once and redraw them only on resize: mow stripes, dirt speckle, stands, vignette, stadium-light gradients.
- Pre-render glow sprites instead of using shadowBlur or ctx.filter. Composite sparks with "lighter".
- Get 2.5D from a hand-written perspective projection of 3D ball and fielder positions, plus ground shadows.
- Before drawing canvas text, await document.fonts.ready with a 1.5 s timeout.

Personality: a situational chatter bank of 40+ lines that never repeats back-to-back, broadcast-style lower thirds, walk-up flourishes, catchphrases, and a scoreboard with attitude.

Audio, all synthesized. Use ZzFX for punchy one-shots, plus hand-built Web Audio graphs:
- Bat crack: a short bandpassed noise burst plus a low "thock", brighter and louder with exit velocity, layered by grade.
- Mitt pop.
- Crowd bed: a generated noise loop through a bandpass with a slow gain LFO. A tension parameter driven by game state controls it, with roar and groan envelopes.
- Organ stingers: summed sines at drawbar ratios with vibrato.
- A PA chime.
- A short procedural walk-up motif for each character.
- Reverb: a ConvolverNode with a generated impulse response.

Don't use AudioWorklet; it breaks the single-file build. Write every sound you trigger to a debug event log so tests can assert it fired.
</art_and_audio>

<tech_stack>
- Vite + TypeScript (strict) + Vitest. Render with plain Canvas 2D, using your own small loop, tweens, particles and scene code. Use DOM only where it's clearly better (settings forms, text-heavy menus), styled with CSS variables from the art bible.
- Use no game framework and no physics engine: no Phaser, PixiJS, three.js, Kaplay, Matter, or anything similar. The reasons:
  - A baseball scene is one camera and a few dozen shapes.
  - Canvas 2D renders reliably in this GPU-less headless container.
  - Your training data mixes Phaser 3 and Pixi v7 APIs that changed in the current Phaser 4.x and Pixi 8.x lines, which is a dependable source of subtle bugs.

  If you hit a concrete wall only a library can solve, write the case under Decisions in SPEC.md first. Then pin the library's exact version and read its current docs rather than relying on memory.
- Physics: custom point-mass ballistics on a fixed 1/120 s timestep, with gravity, quadratic drag and Magnus lift from spin. Bat–ball collision is scripted: grade → exit velocity, launch angle, spray angle. Calibrate carry with unit tests: about 100 mph at about 28° should land roughly 380–410 ft, and about 110 mph at about 30° roughly 440–470 ft, with sensible grounders and liners. These are tunable arcade targets.
- Game loop: an accumulator with a 250 ms clamp, render interpolation with alpha = acc/dt, and time-scale multipliers for hit-stop and slow-mo. A seeded PRNG (mulberry32 or similar) drives all game randomness. Math.random is banned in sim code.
- Audio: zzfx from npm (or vendored with its MIT header) plus raw Web Audio.
- Builds:
  - `npm run build` → dist/, with base './' so it runs on any static host or subpath.
  - `npm run build:single` → one self-contained dist-single/index.html via vite-plugin-singlefile. That means no dynamic import(), no workers or worklets, and no service worker in this build.
- Versions: run node -v first. Install current releases with --save-exact and record the versions in SPEC.md. Don't upgrade mid-build. If the newest Vite needs a newer Node than the container has, use the newest compatible major.
</tech_stack>

<ios_safari>
You can't run current iPhone Safari here, so code defensively for it:
- Viewport meta with width=device-width, initial-scale=1, viewport-fit=cover. Use dvh units and handle visualViewport resize. Pad the HUD and buttons with env(safe-area-inset-*) and draw the field full-bleed.
- Put touch-action: none on the game root and overscroll-behavior: none on html and body. Make body position: fixed with overflow hidden. Set -webkit-user-select and -webkit-touch-callout to none and make the tap highlight transparent. Call preventDefault on touchmove, gesturestart and dblclick with passive: false, to stop scroll, pinch and double-tap zoom.
- Portrait is the primary layout, and landscape gets its own real layout (not a "rotate your phone" wall). iPhone has no orientation lock or element fullscreen, so don't depend on either.
- Size the canvas backing store at CSS size × min(devicePixelRatio, 2), far under Safari's ~16.7-megapixel canvas cap. Keep offscreen canvases few and small.
- Expect 60 Hz on iPhone by default and 120 Hz on ProMotion Macs. The fixed timestep keeps behaviour identical either way.
- Audio:
  - Create one AudioContext lazily. On the first pointerdown or keydown, call resume() and play a 1-sample silent buffer.
  - On visibilitychange → visible, and on pageshow, show a tap-to-resume overlay and resume again. Pause the sim and suspend audio while the page is hidden.
  - The ringer switch silences Web Audio by default. Add a "Play sound in silent mode" setting, off by default. Off sets navigator.audioSession.type = 'ambient' where the API exists. On sets 'playback', plus the silent-<audio>-element unlock as a fallback.
  - Feature-detect everything and wrap it in try/catch.
- Haptics: Safari has no navigator.vibrate, so don't build on it. Add an optional "Haptics (experimental)" setting, off by default, that uses the hidden <input type="checkbox" switch> toggle trick. Fire it synchronously inside a real touch handler. Call navigator.vibrate only where it exists.
- Add to Home Screen:
  - Ship manifest.webmanifest with display standalone and theme colours, plus apple-mobile-web-app-capable and the black-translucent status bar.
  - Generate the apple-touch-icon PNGs with a build script from your own canvas drawing (for example, rendered with Playwright's Chromium), so the icons are code, not art files.
  - Request navigator.storage.persist() when running standalone.
- Saves:
  - Use a versioned localStorage schema with migrations.
  - Wrap every access in try/catch and fall back to memory.
  - Settings offer "copy save code" / "paste save code" (base64 JSON) and a reset.
</ios_safari>

<architecture>
Layout (adapt the names, keep the boundaries):
- src/main.ts
- src/core/: loop, rng, input, events, debug hooks
- src/config/: tuning.ts, theme.ts
- src/sim/: pure game logic, covering rules, count/outs/innings, pitch and batted-ball physics, contact grading, fielding AI, CPU batter and pitcher AI, modes and progression
- src/state/: a state machine with enter/exit and a pushdown stack, so pause and settings sit over gameplay
- src/render/: Canvas drawing only. It reads state and never mutates it.
- src/fx/: hit-stop, trauma, particles, popups and camera, all driven by sim events
- src/audio/
- src/ui/
- src/save/
- tests/
- scripts/

Rules:
- Sim never imports render, fx, audio or ui, and never touches window or document.
- Sim emits typed events (pitchReleased, contact{grade, ev, la, spray}, caught, homeRun, out, run, inningEnd, starEarned, …) that the other layers consume.
- No src file exceeds 450 lines (aim for under 400).
- `npm run check` enforces both rules with a small script that fails on oversized files or forbidden imports, and also runs tsc --noEmit.
- The home-run replay re-renders a ring buffer of the last ~3 s of sim snapshots. It does not record video.

Keep CLAUDE.md short: the exact dev, test, check, verify and build commands, the sim/render rule, and anything you've had to correct twice.
</architecture>

<testability>
- window.render_game_to_text() is always defined. It returns concise JSON with everything needed to play blind:
  - mode and state-machine state
  - inning, half, outs, count, score and runners
  - ball position and velocity
  - the last grade, exit velocity, launch angle and distance
  - stars
  - active prompts and buttons with their screen rects
  - play-affecting settings
  - a one-line note on coordinate systems
- window.advanceTime(ms) is always defined. It steps the sim in fixed increments, then renders once. With ?test=1 the rAF loop doesn't advance the sim, so advanceTime is the only clock. Don't also use Playwright's page.clock in the same test.
- ?seed=N seeds the RNG.
- ?debug=1 adds an overlay (state, trauma, last timing offset) and the tuning panel. It also exposes window.__game with getState, setState(partial), step(n), pause(), act(action) and the sound/event log.
- Unit test: the same seed and the same input log produce an identical final state hash.
- A bot built on the debug API plays a full Quick Game, a full Derby, a Versus game with handoffs, and a Clutch Card, end to end. Print its numbers and assert these sanity bands:
  - A perfect-timing bot on Rookie homers often, but not on every swing.
  - A random-timing bot rarely reaches base.
  - A 3-inning game ends in a plausible number of pitches.
  - Measured dead time between pitches stays inside the <game_design> limits.
</testability>

<verification_loop>
`npm run verify` runs scripts/verify.mjs (Playwright library API, headless Chromium) against the preview build.
- Check the environment first. Playwright should be preinstalled globally (expect 1.63.x), with browsers under $PLAYWRIGHT_BROWSERS_PATH (expect /opt/pw-browsers). Don't run playwright install or npx playwright install, because browser downloads are likely blocked. Pin a playwright devDependency to exactly the installed version, or import the global install.
- Run three contexts: desktop 1280×720, devices['iPhone 17 Pro'] in portrait, and devices['iPhone 17 Pro landscape'] (if your Playwright lacks that descriptor, swap the viewport). Drive touch with page.touchscreen.tap and real pointer events, and keys with page.keyboard. Use debug actions when timing must be exact.
- Each scenario asserts state transitions via render_game_to_text:
  - title → play
  - a swing input actually changes state (the classic failure is a build where nothing responds to input)
  - PERFECT, EARLY, LATE and WHIFF are each reachable
  - a homer triggers slow-mo and the celebration
  - the throw prompt works by tap and by key
  - inning change
  - mercy rule
  - game over → restart
  - derby streak
  - the handoff screen ignores stray touches
  - the game pauses on visibility change
  - settings persist across reload
  - Reduce Motion zeroes shake
- Save screenshots to artifacts/screens/<milestone>/<scenario>-<viewport>.png at these states: title/attract, first pitch in flight, PERFECT freeze, homer slow-mo, throw prompt, inning transition, game over, derby results, handoff, settings, binder, Clutch Card intro.
- Fail the run on any pageerror or console.error. Warnings don't fail it; ignore any WebGL "GPU stall due to ReadPixels" noise.
- Finish with one line: VERIFY: <passed>/<total> scenarios, <n> page errors, <n> console errors, screenshots: <dir>.

After each run, open the screenshots yourself and write one or two honest sentences per image into progress.md, saying what looks off as well as what works. The screenshots are the truth: if a feature isn't visible there, it isn't built. Frame rates in this container mean nothing (software rendering, few CPUs). Judge performance by code discipline instead: pooling, cached layers, the DPR cap, no per-frame allocation.
</verification_loop>

<process_and_milestones>
1. M0, spec and scaffold:
   - Write SPEC.md: design, rules subset, controls, modes, art bible, tuning defaults, tech decisions with pinned versions, and an out-of-scope list.
   - Write features.json with 80–150 entries shaped like {"id","tier","category","description","steps":[...],"passes":false}, where tier is "core" | "polish" | "stretch" and file order is priority order. Cover gameplay, controls, feel, audio, art, modes, progression, iOS hardening, accessibility and testability. Stretch tier: the desktop keyboard duel, the elimination bracket, the card binder, bat skins, and stadiums beyond the first extra one. Everything else is core or polish. Each entry's steps must be concrete enough that passing them proves the SPEC requirement, not just that something exists. Only ever change the passes field. Never delete or weaken an entry; if one is wrong, say so in progress.md.
   - Create .claude/agents/reviewer.md now (read-only tools: Read, Grep, Glob; see Review below) and run it on SPEC.md and features.json alone. It flags entries that are vague, too easy to pass, or missing for a SPEC requirement. Fix those before M1.
   - Start progress.md with "Original prompt:" followed by this brief verbatim, then keep a running log below it.
   - Scaffold Vite/TS, CLAUDE.md and the npm scripts (dev, build, build:single, test, check, verify) with a trivial verify scenario, then commit.
2. M1: one playable at-bat end to end (pitch, swing by touch and by key, contact, outcome), with the debug hooks in place and verify green on all three viewports.
3. M2: full rules and Quick Game: counts, outs, innings, runners, auto-fielding with throw prompts, CPU AI, mercy rule, extras, game over and restart.
4. M3: feel and audio: the tuning file, hit-stop, shake, slow-mo, camera, particles, popups, grade feedback, and synthesized audio with its event log.
5. M4: the art direction applied everywhere: characters, stadiums, menus, attract mode, onboarding.
6. M5: modes and progression: Derby, Versus, Clutch Cards with the Daily Card, Practice, the star meter, unlocks, binder, leaderboards, save code.
7. M6: iOS hardening, accessibility, settings, both builds, icons and manifest, and a bot balance pass.
8. M7: independent review and fixes (see below).

Working rules:
- Work on one feature at a time.
- Flip passes to true only after the relevant test or verify scenario has run in this session and its output is in the transcript.
- Commit at least once per milestone, with a message naming the features finished, and before any risky refactor.
- Every milestone ends with npm test, npm run check and npm run verify green, plus a progress.md entry covering what was done, evidence paths, known issues and next steps.
- If you resume after compaction or a restart: run pwd, read progress.md, features.json and git log, run verify, then pick the first failing entry in file order (core before polish before stretch).
- Your context compacts automatically as it fills, so don't wrap up early to save tokens. Just don't leave significant work uncommitted.

Review. When every core and polish entry passes, run the reviewer again in a fresh context against SPEC.md, features.json, the code and the latest screenshots. Tell it to be skeptical and to assume you over-graded your own work. It should check that every SPEC requirement is truly implemented, not stubbed. It reports only gaps that affect correctness, feel, readability or iPhone usability, and skips style. Fix the confirmed gaps and re-run verify. Don't turn every nitpick into a new abstraction layer.

Make decisions and keep moving. Record judgement calls under Decisions in SPEC.md rather than stopping to ask. If a test looks wrong, say so in progress.md instead of bending the code to it, and never special-case code just to pass a test.
</process_and_milestones>

<environment>
- Linux cloud container with Node, npm and git.
- Headless Chromium + Playwright 1.63 preinstalled.
- No GPU: WebGL, if you ever touch it, is software-rendered. 2–4 CPUs.
- The network reaches package registries, GitHub and Google Fonts. Assume everything else is blocked, including Playwright browser downloads.
- Bash commands time out after about 2 minutes by default. Run the dev or preview server in the background and keep verify runs short.
- There is no WebKit here. "iPhone" means Chromium emulating the iPhone's viewport, DPR and touch, not real Safari.
</environment>

<definition_of_done>
- Every core and polish entry in features.json has passes:true, with evidence in the transcript. Attempt stretch entries only after that, and list any left unfinished.
- npm test, npm run check, npm run build and npm run build:single all exit 0.
- npm run verify prints a VERIFY line showing every scenario passed, with 0 page errors and 0 console errors, on desktop, iPhone portrait and iPhone landscape.
- dist-single/index.html plays when opened from disk, with no network needed beyond optional fonts.
- The reviewer's confirmed gaps are fixed or listed as known issues.
- A short README covers how to play, the controls, deploying dist/ to any static host, and tuning feel through tuning.ts and the ?debug=1 panel.
- Your final message to me includes:
  - what you built
  - the screenshots worth opening
  - the bot balance numbers
  - an explicit list of what you couldn't verify here and I must check on a real iPhone: audio unlock and mute-switch behaviour, haptics, touch latency, 120 Hz, safe areas and toolbar behaviour, Add to Home Screen, and whether it is actually fun
</definition_of_done>

---

# Progress log

## M0 — spec and scaffold (2026-11-04)
- Env: node 22.23.4; Playwright 1.63.0 global + pinned devDep; browsers /opt/pw-browsers; `iPhone 17 Pro` and `iPhone 17 Pro landscape` descriptors exist; 4 CPUs.
- Pinned: vite 8.3.5, typescript 7.0.2, vitest 5.1.0, vite-plugin-singlefile 2.3.4, @types/node 26.6.6; zzfx 1.4.0 vendored (D2).
- SPEC.md written; features.json 125 → 133 entries after the M0 reviewer pass.
- Reviewer (M0) findings applied: player bats first on the first Short Run (D9); Rookie exempt from high/low overrides; tier default HEAT 0/50/99 so tier baselines match the brief; fence dimensions and wall/uniform tokens specified; Clutch Card table and Today's Edition generator specified; Pass the Proof handoff/tie rules; stamina clamped; spray handedness; 8 new entries (HEAT sweep, tiers, multiplier/hide-locator, locator, aggression, tag-ups, traits, build audit); ~40 steps tightened.
- Disagreement noted: the reviewer asked for a 60–90 s median Clutch duration in the bot test. Bot sim time excludes human hesitation, so the test band is 45–110 s (D10) around the 60–90 s human target.
- Scaffold: npm scripts dev/build/build:single/test/check/verify; check.mjs (+4 unit tests) and trivial verify green: `VERIFY: 3/3 scenarios, 0 page errors, 0 console errors`.
- Next: M1, one playable at-bat end to end.

## M1 — one playable at-bat end to end
Done:
- Pure sim (src/sim): parametric pitches (D1), calibrated ballistics (drag 0.0018, Magnus 0.0008 → 100 mph@28° = 396 ft, 110@30° = 451 ft), deterministic grading, live play with intercept fielding and running, flow and modes. CPU-vs-CPU games run to completion (mercy, walk-off and final all observed).
- Front end: fixed loop with wall→sim clock mapping, input layer (Pointer Events + keys → semantic actions with timeStamps), renderer (baked batting view, 2.5D field view, procedural characters, ball/trail/shadow/seam tells), HUD, fx, audio engine/director (vendored ZzFX buildSamples), DOM menus, save store, iOS platform glue, debug hooks.
- Evidence: `npm test` 27/27 (core, contact, sim, check); `npm run check` 0 violations; `VERIFY: 13/13 scenarios, 0 page errors, 0 console errors, screenshots: artifacts/screens/M1`.
- Fixes found along the way: (1) the batter at true scale covered the pitcher; it is now drawn at a 0.62 cheat scale near the edge (tuning.camera.batterScale). (2) The clock mapping clamped input times to "now", which shifted 60 Hz swings by up to a frame; the fairness test caught it, and past timestamps are now allowed (±250 ms bound). (3) The freeze frame showed the field camera; the batting view now holds through hit-stop. (4) Disabled chips were translucent over field lines.
- Test that looked wrong: my own checklist step for the Gutter said "100 mph 25° pulled to RF hits wall below 38 ft". The physics puts that ball ~55 ft high at the wall, a clear HR. The test uses 20° (~31 ft at the wall → rebound) and also asserts 25° is a HR. The step's wording is off by one launch angle, not the code.
Screenshots (M1):
- title-attract-*: logo over a live CPU at-bat in the riso crowd; reads well. The attract HUD was hidden after the first look.
- first-pitch-*: meatball cue, lower third and nameplates no longer overlap; the zone is ~120 px wide on iPhone portrait. Landscape: the lower third covers the batter's torso, which is acceptable, but the prompt pulses over the pitcher.
- perfect-freeze-*: ball at the plate with sparks and "107 mph · 424 ft". The bat was still raised in the first take; fixed by starting the swing at the contact pose.
Known issues / next: M2 rule/fielding/running tests and scenarios, throw prompt, inning change, mercy, game over → restart.
