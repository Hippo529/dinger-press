# DINGER PRESS — Spec

An original arcade/party baseball game for phones (portrait first) and desktop browsers.
Everything is drawn in Canvas 2D and every sound is synthesized. Look: **Overprint**, a night game
printed on a risograph.

---

## 1. Pillars

1. **Readable.** At 390 px wide the ball, zone and count are legible. The ball is always the
   highest-contrast thing on screen.
2. **Fair.** Swings are judged at their input timestamp. Nothing random overrides input, and every
   automated outcome is explained in text.
3. **Fast.** The first pitch is in the air about 5 s after tapping Play. Dead time between pitches
   is capped (§6) and any tap skips ceremony.
4. **Juicy, but tiered.** Each contact grade has its own feedback. Slow-mo, the flash, confetti and
   the replay belong to home runs only.

## 2. Names (original IP)

| Thing | Name |
|---|---|
| Game | **DINGER PRESS** |
| Difficulty slider (0–99) | **HEAT** |
| Quick Game vs CPU | **Short Run** |
| Derby | **Moonshot Mill** |
| Versus pass-and-play | **Pass the Proof** |
| Clutch Cards / Daily Card | **Clutch Cards** / **Today's Edition** |
| Practice | **The Cage** |
| Teams | Pressville Inkers (pink), Harbor Hagfish (teal), Gulch Gophers (sun yellow), Lumberton Loons (ink navy) |
| Stadiums | Pressville Yard (default), The Gutter (short porch with a 38-ft "Mailbox" wall; unlock), Lighthouse Point (deep center plus a sweeping beam hazard; stretch) |

## 3. Core at-bat loop

The loop is intro → prePitch → windup → pitch → (swing | take) → resolve → live (ball in play) →
dead (banner) → next.

### 3.1 Batting inputs
1. **Timing** (all tiers). The offset `o = swingSimTime − idealContactTime` (ms), where the ideal
   moment is when the ball crosses the contact plane at the front of the plate. Negative means early.
   Early pulls the ball; late goes to the opposite field.
2. **Aim** (depends on tier).
   - Rookie: none, vertical contact is auto-aligned.
   - Pro: the tap position in the swing pad. Upper third gives +9° launch angle (lift), the lower
     third −14° (grounder), and left/right adds ±12° of pull or opposite-field spray.
   - All-Star: a contact reticle. Its offset from the ball at contact sets the launch angle and can
     whiff.
3. **POWER**. Toggled before release and locked once the pitch is thrown. Timing windows ×0.65,
   contact radius ×0.7, exit velocity ×1.15. The batter switches to a wide, crouched stance with a
   pink "POWER" bat glow.

### 3.2 Grading (deterministic, no dice)
Windows in ms at HEAT 0 (Rookie baseline) are W_P = 40 (+8 late grace), W_G = 100 and W_W = 160.
They are multiplied by: the HEAT factor (lerp 1.0 → 0.6), the contact rating (±12%), POWER (0.65),
a Star Swing (1.6), new-player assist (1.5 for a player's first 3 pitches ever) and the streaky-hot
trait (1.05).

Order of evaluation:
1. `o < −W_W` or `o > W_W` → **WHIFF**.
2. All-Star: if the reticle-to-ball distance exceeds the contact radius → **WHIFF**.
3. Location overrides, for pitches clearly outside the zone (more than 0.25 ft beyond an edge):
   - inside → **JAMMED** (all tiers)
   - away → **EARLY** if `o ≤ 0`, else **LATE** (weak contact, all tiers)
   - high → **UNDER** and low → **TOPPED** (Pro only). Rookie is auto-aligned vertically, so a high
     or low pitch with PERFECT timing is still PERFECT.

   All-Star replaces the high/low rules with reticle error: bat above the ball by more than 0.45 ×
   radius → TOPPED, bat below → UNDER.
4. Timing:
   - `−W_P ≤ o ≤ W_P + 8` → **PERFECT**. The +8 ms late grace is fixed and is not scaled by any
     multiplier.
   - `|o| ≤ W_G` → **GOOD**
   - `|o|` in `(W_G, W_G + 0.5(W_W − W_G)]` → **EARLY**/**LATE**
   - beyond that, up to W_W → **FOUL**

Each grade maps to exit velocity (EV), launch angle (LA) and spray, interpolated deterministically
by the offset within its window:

| Grade | EV mph (power 5, POWER off) | LA | Spray |
|---|---|---|---|
| PERFECT | 104 → 98 as \|o\|/W_P grows | 27° (Pro/All-Star aim adds) | h·o/W_W·38° (see below) |
| GOOD | 96 → 86 | 18° | same |
| EARLY/LATE | 80 → 70 | 12° | same, pushed out to ±32° |
| JAMMED | 62 | 8° | toward the opposite field |
| TOPPED | 72 | −12° | same formula |
| UNDER | 74 | 58° | same |
| FOUL | 75 | 20° | 50–60° on the early/late side |

Spray is in field degrees, with + toward right field. `h = +1` for a right-handed batter and −1 for
a left-handed one, so early (`o < 0`) pulls toward the batter's pull side.

The power rating adds (power − 5) × 1.6 mph. POWER ×1.15. A Star Swing on GOOD or better sets EV to
the character maximum (power-based, up to 118).

### 3.3 Pitching
- Repertoire: 2–4 of four-seam, sinker, curve, slider, changeup, splitter, screwball, knuckler.
- Path: `s = t/T` from release to the contact plane. y is linear. Then
  `x(s) = x0 + (xt − x0 − B)·s + (B + steer)·s^p` and `z(s) = z0 + (zt − z0 − D)·s + D·s²`.
  The ball leaves "aimed" at a point B or D away and breaks onto its target. Each pitch type has
  `B, D, p`, a speed factor, a spin tell (seam pattern and rotation rate) and a trail tint. The
  knuckler adds a deterministic seeded wobble that is zero at both ends.
- Fastball flight time: 0.85 s at HEAT 0, 0.65 s at HEAT 50 and 0.50 s at HEAT 99 (piecewise
  linear). Off-speed pitches are 15–25% slower.
- Player pitching:
  1. Tap a pitch chip (the last one used is the default).
  2. Press and hold in the zone. The finger sets the target through a marker drawn 60 px above
     the thumb while the charge ring fills over 0.9 s.
  3. Release in the sweet band (0.72–0.88 of the ring) for full velocity and accuracy. Early
     release costs velocity (up to −20%) and a little accuracy; late release scatters (wild or
     hanging).
  4. After release, a horizontal drag steers within ±0.8 × the pitch's break budget, until
     s = 0.7.

  The assist setting replaces the charge with a single tap, a perfect charge with a fixed 0.15 ft
  scatter.
- Stamina: 100 per pitcher, clamped to 0–100, minus 2.2 per pitch, recovering +15 between
  innings. Per-type tiredness is clamped to 0–60; it rises 18 per use of that type and decays 6 per
  other pitch. Speed, break and accuracy are multiplied by
  `max(0.7, 1 − 0.25·(1 − stamina/100) − 0.004·tired)`, so switching pitch types restores
  effectiveness.
  The HUD shows a stamina bar plus small tiredness pips on each pitch chip.

### 3.4 Batted balls
Point-mass ballistics on a fixed 1/120 s step, in ft and s: gravity 32.17, quadratic drag
`k_d·|v|·v`, and Magnus lift `k_m·|v|·(ŝ × v)` from backspin (more backspin at higher LA). Ground
contact uses restitution 0.4, horizontal ×0.65, then rolling friction. The constants are calibrated
by unit tests:
- 100 mph @ 28° → 380–410 ft
- 110 mph @ 30° → 440–470 ft

Fences come from a per-stadium `fence(angle) → {dist, height}`, interpolated linearly between
these keys:
- **Pressville Yard**: lines (±45°) 330 ft, gaps (±22.5°) 375 ft, centre 400 ft; height 10 ft
  everywhere.
- **The Gutter**: LF line 335, LCF 380, CF 405, RCF 320, RF line 290. The "Mailbox" wall is 38 ft
  from +15° to +45°; 10 ft elsewhere.
- **Lighthouse Point**: lines 340, gaps 390, CF 430; height 12 ft.

 A ball crossing the fence radius
above its height is a HOME RUN. Below that height it rebounds. Foul if `|angle| > 45°` at first
ground contact or at the fence.

### 3.5 Fielding and running (automated, never blunders)
- Positions are standard. The ball's path is predicted with the same integrator. For each fielder,
  the earliest catchable point is the first sample where `reach(t) ≤ t`, with
  `reach = react + dist / speed`. Catchable means z < 7.5 ft on the descent, or on the ground.
  The fielder with the smallest intercept time chases. Ties go to the lower position index, which
  makes the result deterministic.
- A caught fly ball is an out, with the text "Diving catch!" if the slack is under 0.2 s. A ball
  that lands with nobody able to intercept before it lands produces "LINE DRIVE — no chance!" or
  "In the gap!".
- Coverage: 1B covers first. On a ground ball to the left side 2B covers second, otherwise SS. 3B
  covers third and C covers home. On balls fielded past 150 ft the SS or 2B moves to the relay spot
  on the line between ball and target base, and throws go through the cutoff.
- Throw decision (the CPU and the 1.2 s assist share one function): consider each base that has a
  runner approaching. Margin = runner ETA − ball ETA (throw at 120 ft/s from an infielder, 105 ft/s
  from an outfielder, +0.25 s transfer, +0.15 s tag for non-force plays). Choose the out with the
  largest margin, preferring the lead runner on ties. If no out is possible, throw to the base ahead
  of the lead runner. Throws are flat arcs.
- Double plays fall out of re-running the decision whenever a fielder secures the ball.
- Runners: speed 23 + 0.7·speed ft/s along the basepaths, and the batter leaves 0.25 s after
  contact. Advance logic runs at contact (force runners go, others hold on catchable flies) and
  again when the ball is secured: continue if margin > threshold (Conservative +0.45 s, Aggressive
  +0.05 s). When the player's team bats and |margin| < 0.35 s, a SEND/HOLD prompt appears. With no
  tap it defaults to the setting.
- Tag-ups: on a caught fly with fewer than 2 outs, a runner on third tags if the margin is above
  the threshold. Other runners return.
- Explanations come from a fixed text bank keyed by situation, such as "Beat the throw by a step",
  "Out by a mile", "Two! Turned the double play" and "Gap shot — runner scores".

### 3.6 Count and rules subset
- 4 balls is a walk and 3 strikes is a strikeout. A foul with two strikes doesn't add a strike, and
  a foul tip doesn't exist (always foul).
- No hit-by-pitch: pitches can't reach the batter box, because the steer clamps them.
- No steals, bunts, errors, balks or infield fly rule. Force and tag plays, sac flies and double
  plays are in.
- Short Run:
  - 3 innings. Mercy rule: a lead of more than 5 at the end of the 1st or 2nd.
  - The game ends after the top of the 3rd if the home team leads, and on a walk-off in the bottom.
  - Innings 4–6 start each half with a runner on second.
  - Tied after 6: a sudden-death derby of 3 swings each; most homers wins, and further ties go to
    1-swing rounds.

## 4. Difficulty

- **Tiers** change input only (§3.1). Default HEAT is 0 for Rookie, 50 for Pro and 99 for
  All-Star, so each tier's default reproduces the brief's baselines (flight 0.85 / 0.65 / 0.50 s).
  Each player then sets HEAT freely from 0 to 99 with a slider in setup. HEAT is stored per player
  profile (P1–P8 in pass-and-play).
- **HEAT** (0–99, per player) maps to `d = HEAT/99`, which feeds:
  - pitch flight time (§3.3) and the timing-window multiplier (1.0 → 0.6)
  - CPU batter timing sd (120 ms → 35 ms) and CPU swing discipline
  - CPU pitcher accuracy and edge-targeting

  There are no rule changes and no hidden late-game boost.
- Score multiplier: `1 + 1.5·d`. **Hide locator** (expert, off by default) ×1.25.
- Rookie shows the pitch locator (a predicted crossing marker that appears 40% of the way into
  flight) and the timing bar. They are toggles in Pro and All-Star; the default is on.

## 5. Stars, momentum, pressure

- Each team holds 0–5 stars. Earn +1 for PERFECT contact, a strikeout (pitching team) or an
  extra-base hit. Awards stack and are capped at 5.
- **Star Chance**: shown when the leverage index is high (RISP while trailing or tied in the last
  regulation inning, or bases loaded at any time). A hit, or a K for the pitching side, earns +2.
- **Star Swing** (E / STAR chip, before release): windows ×1.6, and max EV on GOOD or better.
- **Star Pitch**: break ×1.8, a pink comet trail, and a two-note siren sting played at release (a
  loud tell). The CPU uses one when it has 2 or more stars and the leverage is high, decided by the
  seeded RNG.
- Momentum: each batter's last 3 plate appearances give hot (2+ hits, flame mark) or cold (3 outs
  with at least 2 Ks, snowflake mark), shown on the nameplate. The only effect is the documented
  Streaky trait.
- Pressure bar: a leverage value from 0 to 1 (inning, score gap, runners, outs) drawn on the
  scoreboard. It also drives crowd tension.

## 6. Flow guardrails (asserted by tests)

- After a take or whiff, the next windup starts within 0.8 s. After a routine play, the next pitch
  is ready ≤ 1.2 s after the ball is dead.
- The home-run celebration (slow-mo, banner, fireworks, inset replay) is ≤ 3.5 s, and a tap skips
  it.
- Choosing a pitch is one tap or key. There are no menus mid-at-bat.
- First run:
  - The first pitch is a slow, centred meatball (T = 1.2 s) with a pulsing cue: "TAP WHEN IT
    REACHES THE ZONE".
  - The timing bar appears after the first swing.
  - The first 3 pitches get ×1.5 windows.
  - A ≤ 30 s explainer (four cards: strikes, balls, outs, innings) is offered on the first Short Run
    and is skippable.
- Title screen: an attract loop of CPU-vs-CPU at-bats behind the logo.

## 7. Modes

| Mode | Rules |
|---|---|
| Short Run | §3.6. A setup toggle "Bat first" defaults to ON: the player is the away team and bats in the top half, so the very first pitch a new player sees is a batting pitch (the meatball tutorial). With it off, the player is home and can walk it off. |
| Moonshot Mill | 10 outs. A non-homer swing is an out and a called strike is an out; a taken ball is free. Score per homer = distance × (1 + 0.25·streak), PERFECT +100, × HEAT multiplier. Pass-and-play for 2–8 players with handoff screens. Elimination bracket for 4+ (stretch). |
| Pass the Proof | 2 players, 3 innings. P1 bats the top halves and P2 the bottom halves, each against CPU pitching and fielding tuned to their own HEAT. Same rules as Short Run: mercy, walk-off, extras 4–6 with a runner on 2nd, then the 3-swing derby. A handoff screen ("Pass to P2 — tap when ready"; touches are ignored for 400 ms) sits between every two consecutive halves, so a game of h halves has h − 1 handoffs, plus 1 before the tiebreak derby if reached. |
| Clutch Cards | 8 authored cards plus Today's Edition (seeded from YYYYMMDD). One half-inning scenario with a win condition, 60–90 s long. |
| The Cage | No outs. Pick the pitch type and speed (HEAT), see the ms readout, and toggle every indicator. |

Clutch cards (one half-inning each; "batting" means the player bats against CPU pitching and fielding):

| # | Card | Side | Start state | Win check |
|---|---|---|---|---|
| 1 | Walk It Off | batting, bottom 3rd | down 2, bases loaded, 2 outs | score ≥ 3 before the 3rd out |
| 2 | Protect the One | pitching, top 3rd | up 1, empty, 0 outs | get 3 outs while allowing ≤ 0 runs |
| 3 | Squeeze It | batting, bottom 3rd | tied, runner on 3rd, 1 out | score ≥ 1 |
| 4 | Strand 'Em | pitching | up 2, bases loaded, 0 outs | 3 outs with ≤ 1 run allowed |
| 5 | Moonshot or Bust | batting | down 1, empty, 0 outs, count 0-0 | hit a home run within 3 swings (non-HR swings count down) |
| 6 | Ninth-Inning Nerves | batting, bottom 3rd | down 3, empty, 0 outs | score ≥ 3 |
| 7 | Close the Book | pitching | up 2, runners on 1st & 2nd, 1 out | 2 outs with ≤ 1 run allowed |
| 8 | Two-Strike Grind | batting | down 1, runner on 2nd, 2 outs, count 0-2 | score ≥ 1 |

**Today's Edition** is generated from a seed of YYYYMMDD: side (batting/pitching), run gap −3..+3
(the sign follows the side), base state (8 options), outs 0–2, and count. The win check is derived
from these: batting needs gap + 1 runs; pitching must finish the half allowing fewer than the lead.

## 8. Roster (12 + 4 unlockable)

Ratings run 0–10: Contact / Power / Speed / Pitching. Each character has a handedness, a silhouette
recipe, a repertoire, traits, catchphrases and a walk-up motif (a seed for the procedural melody).

| # | Name | Silhouette | C/P/S/Pi | Pitches | Traits |
|---|---|---|---|---|---|
| 1 | Moose Kaboodle | giant barrel, tiny head | 4/10/2/3 | 4S, CH | Moonshot (+3 EV on PERFECT); rival of Tilly |
| 2 | Tilly Twigg | tiny, enormous cap | 8/2/10/3 | 4S, CU | Pesky (+8% windows); rival of Moose |
| 3 | Gertie Bloom | grandma bun, cardigan | 7/3/3/8 | CU, KN, CH | Old Tricks (break +20%) |
| 4 | Velma Vroom | tall, goggles | 4/5/6/9 | 4S, SL, SP | Heat (+4 mph pitches) |
| 5 | Noodle Ramirez | lanky, long arms | 9/5/6/4 | 4S, CH | Buddy with Pip (+6% windows) |
| 6 | Pip Saltzman | kid, propeller beanie | 6/3/8/5 | CU, CH | Buddy with Noodle |
| 7 | Brick Hollander | square, flat-top | 5/9/3/4 | 4S, SI | Streaky |
| 8 | Sonny Dumplin | round, sunny | 6/8/2/6 | SI, CH, CU | Crowd Favorite (louder crowd) |
| 9 | Duke Plunkett | handlebar moustache | 5/5/4/8 | SC, SI, CU | Showboat (longer bat flip) |
| 10 | Ozzie Pockets | wide stance, cargo pants | 7/4/9/4 | 4S, SL | Burner (always Aggressive) |
| 11 | Clem Ashby | tall ponytail | 7/7/6/7 | 4S, SL, CH, CU | Clutch (+6% windows on Star Chance) |
| 12 | Reggie Fumbles | crooked goggles | 5/7/5/6 | KN, 4S | Streaky |
| 13 | Sir Relish (unlock: 10 career HR) | mustard-bottle mascot | 6/8/5/5 | 4S, SL, CH | Crowd Favorite |
| 14 | Bleep (unlock: 25 PERFECTs) | boxy retired robo-ump | 10/4/3/7 | 4S, SL, SP | Pesky |
| 15 | Spooky Ferguson (unlock: win a Clutch Card) | sheet ghost | 6/5/10/6 | KN, SP | Burner |
| 16 | Big Mama Kettle (unlock: Mill score ≥ 3000) | teapot body | 7/10/2/8 | SC, CU, SI, 4S | Moonshot |

- Lineup: 5 drafted characters bat in order. An auto-draft default keeps Play-to-first-pitch under
  5 s.
- Pitcher: the drafted character with the best Pitching rating, swappable in setup.
- The other 4 fielding spots are "press crew": generic team-coloured figures.

## 9. Progression (achievements only, no currency)

- About 14 achievements unlock 4 characters, The Gutter, Lighthouse Point (stretch), 4 bat skins
  (stretch), 4 ball trails and binder cards (stretch).
- Leaderboards (top 5 each): longest HR, best Mill score, highest EV, longest PERFECT streak,
  Clutch Card wins.
- The save is localStorage key `dingerpress.save`, `{v: 1, settings, stats, unlocks, boards,
  flags}`, with migrations by version. Every access is wrapped in try/catch with an in-memory
  fallback. The save code is base64(JSON) and can be copied, pasted or reset.

## 10. Controls (semantic actions)

Actions: `swing{x,y}`, `aim{x,y}`, `togglePower`, `useStar`, `selectPitch{i}`, `chargeStart`,
`chargeEnd`, `steer{dx}`, `throwTo{base}`, `sendHold{send}`, `skip`, `pause`, `ready` (handoff),
`mute`. Each carries the event `timeStamp`, which is mapped to sim time through the loop's clock
anchor.

| | Touch | Keyboard / mouse |
|---|---|---|
| Swing (Rookie) | pointerdown anywhere in the play area | Space or mousedown |
| Swing (Pro) | tap position in the swing pad sets direction | hold WASD/arrows at swing time |
| Swing (All-Star) | press-drag the reticle (drawn 56 px above the thumb), swing on pointerup | the mouse is the reticle; mousedown swings |
| POWER / STAR | chips in the bottom-right corner (bottom-left if left-handed), ≥ 44 px | Shift / E |
| Pitch | chip tap, then hold-to-charge in the zone, release, drag to steer | 1–4, mouse aim, hold mouse/Space, release, A/D or ←/→ |
| Throw | 1B/2B/3B/HOME buttons | 1–4 |
| Meta | | Esc/P pause, M mute, F fullscreen (desktop), arrows/Enter for menus |

## 11. Feel

Every number lives in `src/config/tuning.ts`; the starting values come from the brief's game_feel
section. Main points:
- Hit-stop sets the sim time-scale to 0 for 40 / 90 / 150 ms (weak / GOOD / PERFECT, capped at 200)
  and 80 ms on a K mitt pop. It starts the frame after contact renders.
- Trauma shake uses `trauma²`: max translation 2% of the short side, max roll 2°, decay 1.2/s,
  world layer only, and never between release and contact.
- Home-run and walk-off slow-mo: 0.35× for 0.8 s real time, then easeOutCubic back over 0.3 s.
- Camera: a static batting view, a zoom punch to 1.07 during hit-stop, then an exponential follow
  (k = 6) on the field view.
- Particles are pooled with 300 live at most. Popups last < 1 s.
- The flash governor allows ≤ 3 flashes per 1 s. The HR flash is ≤ 35% paper-white.
- Reduce Motion: no shake; still freezes plus a banner instead of zoom and slow-mo; no flashes.

## 12. Art bible — "Overprint"

Three directions considered:
1. **Overprint**: a night game printed on a risograph. Navy, teal and brick inks on cream paper,
   with halftone shadows and a misregistration that jolts on big hits. **Chosen.** It is ownable,
   the ink-on-paper palette makes the paper-white ball pop, and the print theme names the modes.
2. **Tin Toy Stadium**: lithographed wind-up tin toys with keys turning on their backs and spring
   bobbing. Charming, but the metallic detail fights ball readability at 390 px.
3. **Chalk Talk**: chalk X's and O's on a slate playbook that come alive. Distinctive, but a white
   chalk ball on chalk lines can't stay highest-contrast.

### Tokens (theme.ts)

| Token | Hex | Use |
|---|---|---|
| `paper` | #F2E8D5 | UI paper, menus |
| `ink` | #1B2140 | sky, stands, outlines, text |
| `grass` | #1E6B58 | field ink (with #237A64 stripes) |
| `dirt` | #9A3F2C | infield "brick" ink |
| `pink` | #FF4F7E | fluoro accent, home team, POWER |
| `sun` | #FFC53D | highlight, stars, PERFECT |
| `teal` | #27B0AE | away team, GOOD, UI secondary |
| `wall` | #2A3060 | outfield wall and padding |
| `ball` | #FFFAF0 | the ball only, always with a 2 px `ink` outline; fill ≥ 4.5:1 against sky/grass/stripe/dirt/stands/wall, unit-tested |

Uniforms: Inkers pink, Hagfish teal, Gophers sun, Loons ink. There are no paper-coloured
uniforms. The ball's ink outline is unit-tested at ≥ 4.5:1 against every uniform colour, so the
ball stays readable when it crosses a fielder.

### Type
- Display: **Bowlby One**. UI: **Chivo Mono**. Both from Google Fonts.
- Fallbacks: `"Arial Black", "Helvetica Neue", sans-serif` for display, and
  `ui-monospace, Menlo, Consolas, monospace` for UI. Display text is set tight and uppercase, so it
  reads as poster type on the fallback too.

### Shape and light
- Chunky capsules and ellipses with a 2.5 px ink outline.
- Flat ink fills, plus one cel highlight (paper at 35%) on the upper-left, and halftone-dot shadows
  (a baked pattern) instead of gradients.
- Each pink/teal accent layer is drawn with a 1.5 px misregistration offset, which widens to 6 px
  for 150 ms on big hits ("the press jolts").
- Lighting is four stadium light towers. Their glow is pre-rendered sprites composited with
  `lighter`.

### Characters
- Built from capsule torsos, ellipse heads, capsule limbs and per-character props (cap, beanie,
  goggles, bun, moustache, bottle, sheet).
- Silhouettes differ by scale (0.75–1.35) and torso shape.
- Animation is procedural:
  - idle bob and fidget (bat waggle, cap tug)
  - windup with an easeInBack leg kick
  - swing (bat arc over 120 ms), follow-through
  - celebration hop and bat flip, dejected slump

### Motion personality
Snappy, springy and slightly over-inked. easeOutBack on everything that appears, a bounce on
landing, and nothing floaty.

### Crowd and stadium
- Stands are tiers of ink-dot heads (baked), with halftone "crowd waves" that ripple at high
  tension.
- The scoreboard is a printed ticket stub with perforations and a stamped pressure gauge.
- Lower thirds are a printed ribbon with misregistered type.
- Chatter (40+ lines) comes from the PA announcer "Gus Ferrule".

## 13. Audio
All audio is synthesized.
- ZzFX `buildSamples` is vendored with its MIT header, minus its eager AudioContext, and plays
  through one lazily created context.
- Graphs:
  - bat crack: bandpassed noise plus a 110 Hz thock, brighter and louder with EV, layered by grade
  - mitt pop
  - crowd: a noise loop through a bandpass, with an LFO gain, a tension parameter, roar/groan
    envelopes, and an 8 dB duck under the crack
  - organ: drawbar sines (ratios 0.5, 1, 1.5, 2, 3, 4) with vibrato
  - PA chime
  - per-character walk-up motif (seeded pentatonic)
  - a generated-IR convolver reverb send
- Variation: ±1.5 semitones, never the same variant twice. The strike sting rises +2 st per strike
  and the streak chime +1 st per hit.
- Every trigger is appended to `audio.log` (name, sim time), which tests read.

## 14. Tech decisions (pinned)

| Package | Version | Notes |
|---|---|---|
| node | 22.23.4 | container |
| vite | 8.3.5 | Vite 8 needs Node ≥ 22.12 ✔ |
| typescript | 7.0.2 | native compiler, strict |
| vitest | 5.1.0 | |
| vite-plugin-singlefile | 2.3.4 | |
| playwright | 1.63.0 | devDependency matching the global install, browsers from /opt/pw-browsers |
| @types/node | 26.6.6 | |
| zzfx | 1.4.0 (vendored) | |

Rendering is Canvas 2D only, with no game framework. The sim runs on a fixed 1/120 s step with an
accumulator clamp of 250 ms, render interpolation and time-scale multipliers. RNG is mulberry32, and
Math.random is banned in `src/sim` (enforced by `npm run check`).

### Decisions
- **D1. Pitches are parametric, not integrated.** The flight time must be exactly controllable for
  fair timing windows, so pitches follow the §3.3 curve. Batted balls use the full ballistic model.
- **D2. ZzFX is vendored** because its npm module builds an AudioContext at import time, which
  breaks the "one lazy context" rule and iOS unlock.
- **D3. Menus are DOM; play-time HUD is canvas.**
  - DOM menus are keyboard-navigable and accessible, with large text.
  - The HUD is drawn on canvas and hit-tested by the input layer using one `layout.ts`, so the
    rects in `render_game_to_text` equal the hit rects.
- **D4. Lineups are 5 drafted characters plus 4 crew fielders.** This keeps 16 characters
  meaningful without 18 unique bodies per game.
- **D5. Clutch Cards and Short Run share one rules engine.** A mode is a config (inning count,
  start state, win check), not a subclass.
- **D6. The home-run replay draws from a fixed Float32Array ring** (3 s × 120 Hz × 64 floats),
  rendered as an inset print. It is not video.
- **D7. The pitch locator is an outcome marker.** It shows the predicted crossing point, not the
  release point.
- **D8. A foul with two strikes is never a strikeout**, and foul tips aren't modelled. Foul balls are
  never caught.
- **D9. On the first Short Run the player bats first** ("Bat first" defaults to on), so the
  tutorial meatball is a batting pitch.
- **D10. Bot timing is not human timing.** Clutch Card duration is measured in sim seconds by a bot
  that never hesitates, so its tested band is 45–110 s median, around the 60–90 s human target.

## 15. Out of scope
- Online play and accounts
- Real leagues, teams or players
- Steals, bunts, errors, balks, HBP, infield fly, pickoffs and substitutions mid-game
- Seasons and franchise mode
- Gamepad, beyond what the browser maps to keys (not tested)
- Localization (English only)
- Service worker and offline caching (the single-file build covers offline-from-disk)
