# Handoff — current state

**Updated:** 2026-07-06 · Claude

## Context right now
**The lesson-quality pillar stack just landed** (full description in
`docs/ROADMAP.md` §Done → "Quality pillar stack"). Paradigm: *the model
composes, TypeScript directs.* In one pass:
- `lib/sceneScore.ts` judge + `npm run eval` golden-topic harness +
  `/debug/eval` viewer (routes' logic extracted to `lib/scriptBuilder.ts` /
  `lib/lessonBuilder.ts` so eval drives the real path).
- Audio-true timing: `/api/tts` ships word timings; steps carry `cue`; the
  player warps the timeline onto the actual audio (`lib/syncTimeline.ts`).
- 7/7 shot programs (`lib/shotPrograms.ts`) — deterministic choreography,
  model fills params, `fits=false` → freeform; `LUMEN_SHOT_PROGRAMS=0` kills.
- Best-of-2 freeform selection (`LUMEN_BEST_OF`), house-style polish pass,
  `place:{kind:"feature"}` math anchors, pinned temperatures.

**Eval numbers (3 golden topics, live DeepSeek):** baseline (pre-stack)
mean 83.5 / min 67.3, weakest = camera. Post-stack + program guards
(`eval-results/2026-07-06T00-48-51/`): **mean 84.7**, weakest is now
motionCoverage — and the judge got STRICTER in between (pacing lints
didn't exist at baseline). Zero failures/fallbacks in all runs. Program
beats score 90+ (e.g. graph_approach 94.4); best-of-2 makes real rescues
(picked 76 over 57.9). Guard history: an orbit beat misassigned
probability-bar-model scored 51 → specialized programs now need keyword
agreement + all program scenes must judge ≥ 60 (smoke-asserted).
Remaining floor (~51, warn-only): freeform "two-panel + many labels"
beats — overlay-density clutter, no severe issues. Next lever for that
tail: gold few-shot exemplars in the freeform brief, or a comparison-panel
program.

## Next up
- Real-browser check: run a live lesson, confirm cued steps land on the
  spoken words, program beats play their canonical choreography, and the
  buffering overlay still resolves (streaming path untouched but retimer is
  new in LessonPlayer).
- If post-stack eval mean/min ≥ baseline: consider raising `LUMEN_BEST_OF`
  or writing gold few-shot exemplars for the freeform tail.
- Deferred queue unchanged: model-decides interruption, persistence/history,
  phase-4 3D, retire `/api/tutor`.

## Verified (current tree)
Green: `npx tsc --noEmit`, `npm run lint`, `npm run build`,
`npm run test:visual` (now also covers retimer, polish idempotency, all 7
programs through the full gate, feature-anchor accuracy, pacing lints).
`npm run eval -- --offline` sanity-passes (offline lesson mean 80).

## Watch-outs
- Don't run `npm run dev` (hook-blocked; crashed the user's Mac). User runs it.
- `/api/tts` response changed shape: JSON `{ audio: base64, words }` — the
  only consumer is `lib/tts.ts`, but anything curling the route must adapt.
- lib/llm reads env at module load → scripts must set env BEFORE importing
  it (eval script uses dynamic imports for this; keep that pattern).
- Program scenes intentionally fade region text out before camera pushes —
  that's the choreography, not a bug; lintCamera is visibility-aware now.
- Repo: github.com/umar-mk/lumen, everything on `main` (user's call).
