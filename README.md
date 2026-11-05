# DINGER PRESS

An arcade party baseball game printed on a risograph. One thumb, one phone, pass it around. Everything
is drawn with Canvas 2D and every sound is synthesized: there are no art or audio files.

## Play

- **PLAY → Short Run** is three innings against the CPU. The first pitch is in the air about five
  seconds after tapping Play.
- **Moonshot Mill**: a home-run derby for 1–8 players. You get 10 outs per player, and consecutive
  homers build a streak multiplier.
- **Pass the Proof**: two players on one phone, each batting their own half-inning.
- **Clutch Cards**: eight scenarios plus *Today's Edition*, a new card every day.
- **The Cage**: practice. Pick a pitch, see your timing to the millisecond.

### Batting
Swing as the ball reaches the zone. Early pulls the ball and late goes the other way. After every
swing the timing bar shows where you were.

| Tier | Touch | Keyboard / mouse |
|---|---|---|
| Rookie | tap anywhere | Space or click |
| Pro | tap: upper third lifts it, lower third keeps it on the ground, left/right sprays | hold W/A/S/D or arrows while pressing Space |
| All-Star | press and drag the reticle (it floats above your thumb), release to swing | the mouse is the reticle, click to swing |

- **POWER** (chip, or Shift) shrinks your timing window for more exit velocity. It locks once the
  pitch is thrown.
- **★ STAR** (chip, or E) spends a star: a huge timing window and max exit velocity.
- **HEAT 0–99** sets pitch speed, timing windows and CPU skill smoothly, and multiplies your scores.

### Pitching
Tap a pitch chip (or press 1–4). Press and hold in the zone to aim, and release while the ring is in the
gold band. Drag left or right (or A/D) to steer while the ball is in flight. Mix your pitches: a tired
arm gets hit. *Pitch assist* in Settings turns it into a single tap.

### Fielding and running
Fielding is automatic.
- When the ball is yours, tap **1B / 2B / 3B / HOME** (keys 1–4) to throw. Otherwise the assist throws
  after 1.2 s.
- On close plays you get **SEND / HOLD**.

**Other keys:** Esc/P pause · M mute · F fullscreen (desktop) · Enter skips ceremonies.

## Develop

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run check
```

```bash
npm run verify
```

- `npm run dev` starts the Vite dev server.
- `npm test` runs the unit and bot tests, which print the balance numbers.
- `npm run check` runs tsc, the file-size limit (450 lines) and the sim-purity rules.
- `npm run verify` builds both outputs, then runs Playwright on desktop and iPhone portrait/landscape,
  saving screenshots to `artifacts/screens/`.

## Build and deploy

```bash
npm run build
```

```bash
npm run build:single
```

- `npm run build` writes `dist/`, which uses `base: './'`. Upload the folder to any static host,
  including a sub-path such as GitHub Pages, Netlify drop, S3 or nginx. Use HTTPS so iOS will offer
  Add to Home Screen.
- `npm run build:single` writes `dist-single/index.html`: one self-contained file that plays straight
  from disk. Web fonts are optional and fall back to system fonts.

Icons are generated from canvas code with `npm run icons`, which writes `public/icons/*.png`.

## Tune the feel

Every game-feel number lives in **`src/config/tuning.ts`**, grouped and commented with units: timing
windows, flight times, hit-stop, shake, slow-mo, camera, particles, popups, audio variation and dead
time. The values are starting points; tune them on a real phone.

Add **`?debug=1`** to the URL for:
- a live tuning panel (sliders write straight into `TUNING`; changes apply on the next event)
- an overlay showing state, trauma and the last timing offset
- `window.__game` (getState, setState, step, act, log)

Other flags: `?seed=N` makes a game reproducible. `?test=1` freezes the clock so that only
`window.advanceTime(ms)` moves it, which tests use.

## What only a real iPhone can tell you
- audio unlock and the ringer switch
- haptics
- touch latency and 120 Hz feel
- safe areas and the toolbar
- Add to Home Screen
- whether it's fun

The code follows documented Safari behaviour, but none of this was verified on a device.
