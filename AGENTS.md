<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Lumen — shared agent guide

This file is the **shared contract for every coding agent** on this repo (Claude
Code and Codex both read `AGENTS.md`). Keep it durable and tight; put session
state in `HANDOFF.md` and depth in `docs/`.

> **First thing, every session: read [`HANDOFF.md`](HANDOFF.md)** — it's the live
> baton describing exactly where we are. Update it before you stop or hand off.

## What Lumen is

A **real-time, interruptible AI tutor**. One topic prompt → a **full narrated
lesson** that plays like a 3Blue1Brown video: a teacher narrating while an animated
whiteboard builds the idea, several beats long. The student can **interrupt**
mid-lesson and it adapts. **Not** a video generator — the differentiator is the
live, interruptible loop.

Two layers (see `docs/ARCHITECTURE.md`): a **Lesson** (`types/lesson.ts`) is an
ordered list of segments, each `{ narration, scene }`, played by `LessonPlayer`;
each **scene** is a `SceneSpec` rendered by `SceneRenderer` (the v1 engine, reused).
Latency splits: building a lesson may be slow; **interruptions must feel instant**.
MVP interruption = answer-then-resume; narration is browser TTS. Deferred upgrades
(model-decides interruption, pipelined start) are tracked in `docs/ROADMAP.md`.

## Core design principle (never violate)

**The model is the brain and emits ONLY a JSON `SceneSpec` — never rendering
code.** A pure TypeScript renderer maps that spec to animated SVG + KaTeX. The
model never touches drawing APIs, DOM, or canvas. This is what keeps it crash-free
and instant. If a feature seems to need the model to "write code," instead extend
the `SceneSpec` vocabulary and teach the renderer to draw it.

## Locked architecture (don't relitigate)

Next.js 16 (App Router, no `src/`) + TS + Tailwind v4, one process. Rendering =
Framer Motion + SVG + KaTeX at 60fps (no Manim/video/WebGL). No Redis/worker/DB.
Model via env `LUMEN_MODEL`, default `claude-sonnet-4-6` (`claude-haiku-4-5-20251001`
for cheapest tests) — cost is a priority. Interruptions = full scene regeneration
with the current scene as context (renderer cross-fades).

## Hard rules

1. **Never run `npm run dev` / `next dev`.** It crashed the user's Mac twice. The
   user runs the dev server. Verify with `npx tsc --noEmit` and `npm run build`
   (bounded, one-shot). *(Claude Code also has a hook that hard-blocks this.)*
2. **No arbitrary code from model output.** `function-plot` expressions go through
   `lib/mathEval.ts` (whitelist parser) — never `eval`/`new Function`. KaTeX runs
   with `trust:false`.
3. **Resource caps are load-bearing** (`CAPS` in `lib/sceneSchema.ts`): ≤40
   objects, ≤60 steps, ≤400 samples/plot, ≤60s, latex ≤2KB. Enforced server-side
   and clamped in the renderer so a bad response can't spike RAM/CPU.
4. **API key stays server-side** (`.env.local`, read only in the route).
5. **Animate transform/opacity only** (GPU-friendly). Scenes remount on a stable `key`.
6. `SceneSpec` type + zod validator + model tool schema are **one source of truth**:
   change `types/scene.ts` + `lib/sceneSchema.ts` together; the tool schema is
   derived from the zod schema via `z.toJSONSchema`.

## Where things are

_Lesson layer (the product):_
| Path | Role |
|---|---|
| `types/lesson.ts` | `Lesson` = ordered `LessonSegment[]` (each `{ narration, scene }`) |
| `lib/lessonSchema.ts` | zod validation + `LESSON_CAPS` for lessons & answer segments |
| `lib/prompt.ts` | shared system-prompt blocks (persona, scene/narration/lesson/program rules) |
| `lib/llm.ts` | shared provider plumbing (forced tool-use, caching, cost guard, per-call temperature) |
| `lib/scriptBuilder.ts` | teacher-script generation + review + normalize (used by route AND eval) |
| `lib/lessonBuilder.ts` | per-beat build loop: shot program → best-of-N freeform → layout/polish/QA/sanitize |
| `lib/shotPrograms.ts` | deterministic choreographed scene templates; model fills tiny params (`fits` escape) |
| `lib/sceneScore.ts` | 0–100 deterministic quality judge (eval harness + best-of-N selection) |
| `lib/scenePolish.ts` | house-style pass: entry order, stagger, min durations, font tiers, zoom clamps |
| `lib/syncTimeline.ts` | audio-true retimer: warps the timeline onto Edge TTS word timings via step `cue`s |
| `lib/tts.ts` | Edge TTS narration client (audio + word timings) + silent fallback |
| `components/LessonPlayer.tsx` | sequential narrated playback, pause/interrupt, retimes scenes to real audio |
| `lib/exampleLessons.ts` | hand-authored sample lesson (offline demo) |
| `app/api/lesson/route.ts` | NDJSON streaming wrapper around `lib/lessonBuilder` |
| `app/api/interrupt/route.ts` | one fast answer segment (answer-then-resume) |
| `scripts/eval-lessons.ts` | `npm run eval` — golden-topic regression gate scored by `sceneScore` |
| `app/debug/eval/page.tsx` | browse eval runs; beats replay through the real renderer with score breakdowns |
| `app/page.tsx` | topic input → `LessonPlayer` |

_Scene layer (the engine, reused per segment):_
| Path | Role |
|---|---|
| `types/scene.ts` | the `SceneSpec` contract (one shared world coord system, y-up) |
| `lib/sceneSchema.ts` | zod validation + `CAPS`; basis for the model's tool schema |
| `lib/mathEval.ts` | safe expression evaluator for `function-plot` (no `eval`) |
| `lib/coords.ts` | world ↔ pixel / overlay mapping |
| `lib/katex.ts` | KaTeX render (sanitized) |
| `components/SceneRenderer.tsx` | `SceneSpec` → animated SVG + KaTeX overlay |
| `lib/exampleScenes.ts` | hand-authored demo scene |
| `app/api/tutor/route.ts` | legacy v1 single-scene route (unused by the lesson UI) |

Conventions: path alias `@/*` → repo root. All scene positions are world coords
(math-style, y-up, origin centred) — never pixels. Renderer components are pure.
Keep new object/animation types additive (bump `SceneSpec.version` only on a break).

## Deep docs (read on demand, not every session)

- [`docs/OVERVIEW.md`](docs/OVERVIEW.md) — pitch-ready product + technology synthesis (what Lumen is, the moat, status, roadmap).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data flow, `SceneSpec` contract, rendering, layout/QA engine, safety model.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — done vs. next, open questions.
- [`docs/GENERALIZED_RENDERING.md`](docs/GENERALIZED_RENDERING.md) — composable-basis + constraint-solver engine so any topic renders without per-shape work.

## Handoff protocol (keep it cheap)

- **Start of session:** read `HANDOFF.md` (short by design).
- **Before you stop or switch agents:** update `HANDOFF.md` — current state, next
  action, watch-outs. Keep it under ~25 lines and stamp it with the date + which
  agent. Durable facts belong in this file or `docs/`, *not* in `HANDOFF.md`.
- Don't duplicate content across files; link instead. That keeps both agents'
  context loads small.
