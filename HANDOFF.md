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
mean 83.5 / min 67.3. Post-stack: mean 84.1 — under a STRICTER judge (the
new pacing lints didn't exist at baseline). One beat hit 51.1: the script
misassigned probability-bar-model to an orbiting-point beat and the program
fired → two guards added (specialized programs need keyword agreement with
the beat text; built program scenes must score ≥ 60 or fall back to
freeform). Confirmation eval run after the guards: see
`eval-results/latest.json`. Best-of-2 telemetry showed real rescues
(picked 76 over 57.9, 81.6 over 72.3).

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
