# DINGER PRESS — working notes

Commands (run from repo root):
- `npm run dev` — Vite dev server (0.0.0.0:5173)
- `npm test` — Vitest unit + bot tests (prints bot balance numbers)
- `npm run check` — tsc --noEmit + file-size (≤450 lines in src) + layering rules
- `npm run verify` — builds dist/ then Playwright (global 1.63, /opt/pw-browsers) on desktop, iPhone 17 Pro portrait/landscape; screenshots in artifacts/screens/<milestone>/ (set MILESTONE=Mx)
- `npm run build` / `npm run build:single` — dist/ and dist-single/index.html
- `npm run icons` — regenerate public/icons/*.png from canvas code

Rules:
- `src/sim` is pure: never imports render/fx/audio/ui/state/save/platform, never touches window/document, never uses Math.random (use the seeded rng).
- `src/render` reads state, never mutates it. fx/audio/ui react to sim events.
- Every feel number lives in src/config/tuning.ts.
- features.json: only flip `passes`, only with test/verify evidence in the transcript.
- Never run `playwright install`.
