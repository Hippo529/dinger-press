// Every game-feel number lives here. Units are in the comments. Values are STARTING DEFAULTS, to be
// tuned on a real iPhone. The object is mutable on purpose: the ?debug=1 panel edits it live, and
// code reads TUNING.x.y at use time (never cache these into module constants).

export const TUNING = {
  timing: {
    perfectMs: 40, // PERFECT accept window, ± ms from ideal contact (Rookie baseline, HEAT 0)
    perfectLateGraceMs: 8, // extra late-side PERFECT grace, ms (refresh-rate independent)
    perfectNotchMs: 30, // PERFECT notch drawn on the timing bar, ± ms (smaller than accept on purpose)
    goodMs: 100, // GOOD window, ± ms
    weakMs: 160, // EARLY/LATE/FOUL out to this, ± ms; beyond = WHIFF
    heatWindowMin: 0.6, // window multiplier at HEAT 99 (1.0 at HEAT 0)
    contactRatingSpread: 0.12, // contact rating 0..10 scales windows by 1 ± this
    powerWindow: 0.65, // POWER multiplies timing windows
    powerRadius: 0.7, // POWER multiplies contact radius
    powerEv: 1.15, // POWER multiplies exit velocity
    starWindow: 1.6, // Star Swing window multiplier
    newbieWindow: 1.5, // first N pitches ever
    newbiePitches: 3,
    contactRadiusFt: 0.42, // All-Star reticle contact radius, ft
    zoneMarginFt: 0.25, // pitch beyond zone edge by more than this => location override grades
    timingBarShowS: 1.6, // how long the timing bar stays up after a swing, s
  },
  pitch: {
    flightHeat0: 0.85, // fastball release→plate, s, HEAT 0
    flightHeat50: 0.65, // s, HEAT 50
    flightHeat99: 0.5, // s, HEAT 99
    firstPitchFlight: 1.2, // first-ever pitch meatball, s
    windupS: 0.55, // windup duration before release, s
    prePitchCpuS: 0.35, // CPU set time before windup, s
    chargeFillS: 0.9, // charge ring fill time, s
    sweetLo: 0.72, // charge sweet band start (0..1)
    sweetHi: 0.88, // charge sweet band end
    earlyVeloLoss: 0.2, // max velocity loss for early release (fraction)
    lateScatterFt: 1.6, // max scatter at full overcharge, ft
    assistScatterFt: 0.15, // single-tap assist scatter, ft
    steerFrac: 0.8, // steer budget as fraction of the pitch's break budget
    steerUntilS: 0.7, // steering allowed until this fraction of flight
    steerRateFtPerS: 3.0, // steer speed for keys, ft/s
    locatorAppearFrac: 0.4, // pitch locator appears at this fraction of flight
    starBreak: 1.8, // Star Pitch break multiplier
  },
  stamina: {
    perPitch: 2.2, // stamina points per pitch
    inningRecover: 15,
    tiredPerUse: 18, // per-type tiredness gained per use
    tiredDecay: 6, // per-type tiredness lost per other pitch
    staminaEffect: 0.25, // at 0 stamina, speed/break/accuracy lose this fraction
    tiredEffect: 0.004, // per tiredness point
  },
  hitstop: {
    weakMs: 40, // foul / weak contact freeze, ms
    goodMs: 90,
    perfectMs: 150,
    capMs: 200, // hard cap
    strikeoutMs: 80, // K mitt pop
    vibratePx: 3, // bat/ball vibration amplitude during freeze, px
  },
  shake: {
    mittPop: 0.1, // trauma added
    good: 0.25,
    perfect: 0.4,
    homer: 0.6,
    walkoff: 1.0,
    exponent: 2, // shake = trauma^exponent
    noiseSpeed: 20, // noise channel speed
    maxTransFrac: 0.02, // max translation as fraction of short screen side
    maxRollDeg: 2,
    decayPerS: 1.2,
  },
  slowmo: { scale: 0.35, holdS: 0.8, easeS: 0.3 }, // HR / walk-off only; hold is REAL seconds
  camera: { punchZoom: 1.07, punchOutMs: 200, followK: 6, fieldFovScale: 1.0, batterScale: 0.62 }, // batterScale: batting-view cheat scale
  squash: { ballContact: [0.7, 1.3], contactFrames: 2, mitt: [0.85, 1.15], mittRecoverMs: 120, stretchMax: 1.6 },
  trail: { points: 12, baseWidthPx: 5, speedWidthPx: 5 },
  popup: { inMs: 150, driftPx: 40, holdMs: 500, fadeMs: 200 },
  button: { pressScale: 0.94, pressMs: 60, springMs: 180 },
  transition: { ms: 250, staggerMs: 40, maxMs: 400 },
  audio: {
    variationSemis: 1.5, // random ± pitch shift on repeated SFX
    strikeStepSemis: 2, // strike sting rises per strike
    streakStepSemis: 1, // streak chime rises per consecutive hit
    crowdDuckDb: 8,
    crowdDuckMs: 300,
    master: 0.8,
  },
  particles: { max: 300, burstMin: 10, burstMax: 20, mittMin: 6, mittMax: 12, fireworksMax: 150 },
  flash: { maxPerSecond: 3, homerAlpha: 0.35, misregJoltPx: 6, misregJoltMs: 150 },
  flow: {
    introS: 0.9, // walk-up lower third before first pitch of a PA (skippable), s
    afterTakeS: 0.6, // take/whiff → next windup must start ≤ 0.8 s, s
    afterPlayS: 0.9, // ball dead → next pitch ready ≤ 1.2 s
    celebrateS: 2.4, // HR celebration sim time after fence (≤3.5 s real incl. slow-mo)
    halfEndS: 1.6, // inning transition banner, s
    handoffIgnoreMs: 400,
    assistThrowS: 1.2, // auto-throw if no base tapped
    sendHoldS: 1.4, // SEND/HOLD prompt timeout
    foulDeadS: 0.9, // foul ball flight shown before dead
    liveTimeoutS: 14, // safety cap on any live play
  },
  running: { baseSpeed: 23, perSpeed: 0.7, batterDelay: 0.25, conservative: 0.45, aggressive: 0.05, closeCall: 0.35, trotMult: 0.75 },
  fielding: {
    react: 0.22, // reaction delay, s
    speedBase: 21, // ft/s
    perSpeed: 0.6,
    catchHeight: 7.5, // ft
    divingSlack: 0.2, // s
    throwInfield: 120, // ft/s
    throwOutfield: 105,
    transfer: 0.25, // s
    tag: 0.15, // s extra for tag plays
    relayDist: 150, // ft
  },
  physics: {
    dt: 1 / 120,
    gravity: 32.17, // ft/s²
    drag: 0.0018, // 1/ft  (a = -k|v|v); calibrated: 100mph@28° ≈ 396 ft, 110@30 ≈ 451 ft
    magnus: 0.0008, // lift factor (a = k·spin·|v|²)
    restitution: 0.42,
    groundKeep: 0.62, // horizontal velocity kept on bounce
    rollFriction: 14, // ft/s² rolling deceleration
  },
  heat: { flightPiecewise: true, cpuSdMaxMs: 120, cpuSdMinMs: 35, scoreMult: 1.5, hiddenLocatorMult: 1.25 },
};

export type Tuning = typeof TUNING;
