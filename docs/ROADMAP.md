# Lumen roadmap

Honest status + phasing. Shared memory of where we are and what's next.
Last reconciled: 2026-07-05.

## The product (reaffirmed)

One topic prompt → a **full narrated lesson** that plays like a 3Blue1Brown video:
a teacher narrating while an animated whiteboard builds the idea, several beats
long. The student can **interrupt** mid-lesson; the lesson adapts. Two latency
regimes: **initial lesson build may be slow**; **interruptions must feel instant.**

## ✅ Done

**Scene engine (v1, now the per-beat visual):** `SceneSpec` contract + zod validation
+ `CAPS`; safe math evaluator (`lib/mathEval.ts`, no `eval`); `SceneRenderer` (SVG +
scaled KaTeX overlay, Framer Motion timeline, curve morphs, dot tracing).

**Adaptive lesson loop:** `/api/intake` (diagnostics) → `/api/script` (teacher script
+ self-review) → `/api/lesson` (per-beat scene compose) → `LessonPlayer` (sequential
narrated playback, pause/restart, **answer-then-resume interruption** via `/api/interrupt`).
**Runs live end-to-end.**

**Provider layer:** `lib/llm.ts` — provider-agnostic forced tool-use. Default
**DeepSeek v4-flash** (thinking off; cheap, auto prompt-cache); also wired for
Anthropic / Groq / Gemini / OpenRouter / local Ollama. Cost guard + rate handling.

**Narration:** neural **Edge TTS** (`en-US-AndrewMultilingualNeural`, free, no key) with
up-to-4 retries, text-keyed caching, and **next-beat prefetch** (gap-free playback);
silent timed fallback, never the robotic browser voice.

**Reliability stack (in `lib/llm.ts` + QA):**
- `coerceToSchema` — clamps/snaps out-of-range model output before validation.
- `recoverTruncatedJson` — salvages truncated/malformed tool-call JSON.
- Deterministic QA (`lib/sceneQA.ts`) + model-free `sanitize` (`lib/sceneSanitize.ts`)
  → broken scenes keep real visuals instead of falling back to text.

**Generalized rendering engine — phases 0–3** (`docs/GENERALIZED_RENDERING.md`):
- **P0 basis:** generalized `mathEval` bound vars; added `parametric`, `path`,
  `polygon`, `polyline`.
- **P1 placement:** optional `place` anchors (`absolute`/`on`/`relativeTo`/`distribute`)
  + deterministic resolver in `resolveLayout`; dot→curve snap rides `place:on`.
- **P2 composition:** `group` with local coords + transform; `area-model` is now a
  grouped macro.
- **P3 degradation:** prompt capability contract; QA lints invalid expressions, dangling
  refs, bad constraints, missing targets; interrupt route sanitizes before fallback.

**Motion layer generalized to the basis (2026-07-05):** `trace` now rides ANY curve —
`function-plot` by x, `parametric` by t (`fromT`/`toT`, default tRange), `path`/
`polyline`/`polygon` by arc-length fraction (`fromT`/`toT` in 0..1; polygons close the
loop). The unit-circle point orbits. Renderer degrades a trace on a non-curve to a
static dot; QA flags it as a `trace-target-not-curve` **warn** (not severe).

**100%-no-text guarantee (2026-07-05):** `fallbackScene` no longer renders
`teachingGoal` (or any text): both routes share `lib/fallbackScene.ts` —
`silentFallbackScene`, a neutral text-free curve + traced dot. Before that fallback,
the lesson route does ONE constrained "minimal valid scene" regeneration
(`SCENE_MINIMAL_RULES` + `rescueMinimalScene`) to salvage INVALID/threw beats into a
real simple visual.

**Prompt contract tightened (2026-07-05):** region/callout (text) vs `place`
(geometry) division of labour stated explicitly; imperative `parametric`/`path`
triggers ("MANDATORY for circles/orbits/loops", trigger-words → primitives table in
the capability contract); generalized `trace` semantics documented.

**Streaming / pipelined start (2026-07-05):** `/api/lesson` streams NDJSON events
(`meta` → one `segment` per composed beat → `done`; `LessonStreamEvent` in
`types/lesson.ts`). `/learn` reveals the player on the FIRST beat and keeps
appending while it plays; `LessonPlayer` grew a `buffering` phase ("Composing the
next beat…") for when playback catches up to generation, with pending-beat
placeholders in the progress row. Pre-stream errors stay plain JSON (400/429);
mid-build failures become `error` events; a partial lesson stays playable.

**Quality pillar stack — "the model composes, TypeScript directs" (2026-07-06):**
- **Deterministic judge + eval harness:** `lib/sceneScore.ts` (0–100 composite:
  lint, motion coverage, pacing, build progression, economy, overlay density,
  camera, variety) + `npm run eval` (`scripts/eval-lessons.ts`, golden topics,
  results in `eval-results/`) + `/debug/eval` viewer. Route logic extracted to
  `lib/scriptBuilder.ts` / `lib/lessonBuilder.ts` so eval drives the REAL path.
  Live DeepSeek baseline (3 topics, pre-changes): mean 83.5 / min 67.3, weakest
  part = camera.
- **Audio-true timing:** `/api/tts` returns Edge word-boundary timings with the
  mp3; timeline steps carry optional `cue` (verbatim narration phrase); the
  player warps the whole timeline onto the spoken audio (`lib/syncTimeline.ts`)
  — cued actions land on their words, scene duration = real audio length, dead
  air is auto-filled. Pacing lints (dead-air / front-loaded / no-motion, warn).
- **Shot programs (7/7 patterns):** `lib/shotPrograms.ts` — hand-choreographed
  deterministic templates (graph-approach, secant-to-tangent, equation-transform,
  number-line-convergence, area-accumulation, vector-projection,
  probability-bar-model). Model fills a tiny param object (fits=false → freeform
  fallback); program scenes still pass the full layout/polish/QA gate.
  `LUMEN_SHOT_PROGRAMS=0` disables.
- **Best-of-N freeform:** parallel compose candidates scored by the judge,
  winner kept (`LUMEN_BEST_OF`, default 2). Replaces the disabled LLM review.
- **House-style polish:** `lib/scenePolish.ts` (entry order, stagger, min
  durations, font tiers, camera zoom/duration clamps) on every scene.
- **Semantic feature anchors:** `place:{kind:"feature"}` computes
  min/max/root/inflection/intersection by sampling — markers land on true math.
- Per-call temperature pinning in `lib/llm.ts`.

## ▶ Next up (ordered)

*(Queue cleared 2026-07-05 — promote from Deferred with the user. Candidates:
"model-decides" interruption, lesson persistence/history.)*

## 💤 Deferred (chosen for later)

- **Fully interactive live tutor** — bidirectional/touchable whiteboard, checkpoint
  segments, behavioral context. Full strategy + market deep dive tabled 2026-07-05:
  see [`docs/INTERACTIVE_TUTOR_PLAN.md`](INTERACTIVE_TUTOR_PLAN.md).
- **"Model-decides" interruption** — model chooses to answer vs. also re-plan downstream
  beats (vs. the MVP's answer-then-resume).
- **Phase 4 — true 3D + live interactivity** — parametric surfaces + projection;
  student-driven parameter controls.
- **Voice interruption** (STT), incremental scene patches, lesson persistence/history.
- Legacy `/api/tutor` (single-scene v1) is unused by the lesson UI; keep or retire.

## Open questions

- On interruption, how much lesson context to send to keep "model-decides" cheap?
- When does narration need word-level sync to the visual timeline (vs per-beat)?
