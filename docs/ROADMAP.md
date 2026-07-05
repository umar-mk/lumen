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

## ▶ Next up (ordered)

*(Queue cleared 2026-07-05 — promote from Deferred with the user. Candidates:
"model-decides" interruption, lesson persistence/history, eval harness.)*

## 💤 Deferred (chosen for later)

- **Fully interactive live tutor** — bidirectional/touchable whiteboard, checkpoint
  segments, behavioral context. Full strategy + market deep dive tabled 2026-07-05:
  see [`docs/INTERACTIVE_TUTOR_PLAN.md`](INTERACTIVE_TUTOR_PLAN.md).
- **"Model-decides" interruption** — model chooses to answer vs. also re-plan downstream
  beats (vs. the MVP's answer-then-resume).
- **Phase 4 — true 3D + live interactivity** — parametric surfaces + projection;
  student-driven parameter controls.
- **Voice interruption** (STT), incremental scene patches, lesson persistence/history,
  an eval harness for prompt regressions.
- Legacy `/api/tutor` (single-scene v1) is unused by the lesson UI; keep or retire.

## Open questions

- On interruption, how much lesson context to send to keep "model-decides" cheap?
- When does narration need word-level sync to the visual timeline (vs per-beat)?
