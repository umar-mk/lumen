# Lumen — product & technology overview

*Pitch-ready synthesis. Accurate as of 2026-06-11. Facts here are grounded in the
codebase; market-size / traction / funding numbers are intentionally NOT invented —
the founder supplies those.*

## One line

**Lumen is a real-time, interruptible AI tutor**: type any topic and it delivers a
full **narrated, animated lesson** that plays like a 3Blue1Brown video — and you can
**interrupt mid-lesson** to ask a question, and it adapts.

## The problem

- **Great explanations don't scale.** A 3Blue1Brown-quality animated lesson takes an
  expert weeks to script and animate. There's no such video for *your* exact question
  at *your* level.
- **Tutoring doesn't scale.** One-to-one human tutoring is the gold standard for
  learning but is expensive and unavailable on demand.
- **AI chat isn't teaching.** A wall of text (or even a static diagram) isn't how the
  best teachers explain — they *narrate while drawing*, building intuition over time,
  and they *respond when you're confused.*
- **AI video generators are the wrong tool.** They're slow, expensive, non-interactive,
  and routinely render math/diagrams that are subtly (or badly) wrong.

## What Lumen is

A topic prompt becomes: a few quick diagnostic questions to gauge your level → a
**teacher-quality lesson script** → a sequence of **narrated, animated whiteboard
scenes** that play in the browser at 60fps. A teacher voice narrates while the board
draws the idea, several beats long. At any point you can **interrupt and ask** — it
generates an answer, then resumes.

**The differentiator is the live, interruptible loop** — not "a video." It's the
feel of a brilliant tutor at a whiteboard who you can stop and question.

## The core insight (and the moat)

> **The model is the brain and emits ONLY a declarative JSON description of the scene
> — never rendering code. A deterministic TypeScript engine draws it.**

That one architectural decision is what makes Lumen possible *and* defensible:

- **Crash-free & safe.** The model can't emit code that throws, runs in your browser,
  or does anything unsafe. The worst case is a spec the validator repairs or rejects.
- **Instant.** No video render, no GPU, no compilation — animating a small scene graph
  in the browser is effectively free, which is what lets interruptions feel immediate.
- **Cheap.** Compact JSON via forced tool-use, aggressive prompt caching, and it runs
  on an inexpensive model — cost is a first-class constraint, not an afterthought.
- **Correct by construction.** Because a deterministic engine owns geometry, layout,
  and alignment, the visuals don't drift the way generative-pixel/video output does.

The hard, valuable part isn't calling an LLM — it's the **deterministic rendering &
reliability engine** underneath, which most teams underestimate.

## How it works (the pipeline)

```
topic ─▶ /api/intake  ─▶ diagnostic questions (gauge level)
      ─▶ /api/script  ─▶ teacher-quality lesson script (+ self-review)
      ─▶ /api/lesson  ─▶ per-beat: compose SceneSpec → validate → layout → QA → sanitize
      ─▶ LessonPlayer ─▶ narrated playback (neural TTS) + interrupt loop
```

- **SceneSpec** is the contract: one JSON object of `objects[]` + a `timeline[]`, in a
  single world coordinate system. A pure renderer (`SceneRenderer`) maps it to animated
  **SVG + KaTeX** with Framer Motion.
- **Interruptions** generate one fast answer scene, then resume (answer-then-resume).
- **Narration** is neural text-to-speech (Microsoft Edge voices — natural, free, no
  key), with retries + next-beat prefetch so playback is gap-free.

## The reliability & generalization engine (why it actually holds up)

This is the part that turns a demo into a product, and where most of the engineering is:

- **Composable rendering basis, not named shapes.** Rather than hand-adding a primitive
  per topic, the model composes a small basis — `function-plot`, **`parametric`**
  curves, **`path`** outlines, polygons, **`group`** transforms, plus an `area-model`
  for algebra tiles. Arbitrary curves/shapes for new topics need *no* code change.
  (See `docs/GENERALIZED_RENDERING.md`.)
- **Relational layout (a constraint solver).** Objects declare *relationships*
  (`place: on a curve / relativeTo another / distribute`) and a deterministic solver
  computes coordinates — so points sit exactly on curves and labels stay aligned,
  instead of the model guessing pixels.
- **Deterministic QA + self-healing.** Every scene is linted (overlaps, off-frame,
  text-on-curve, dangling references, invalid expressions) and a model-free
  `sanitize` pass repairs issues so a beat keeps real visuals instead of failing.
- **Tolerant model I/O.** A schema-coercion layer clamps out-of-range output and a
  JSON-recovery layer salvages truncated tool calls — so a cheap, occasionally-sloppy
  model still produces valid lessons.
- **Capability contract + graceful degradation.** The model is told the basis and
  instructed to teach within it; anything undrawable degrades to a correct simpler
  view rather than a broken frame.

## Status (what's real today)

- **Runs live end-to-end** on an inexpensive model (DeepSeek v4-flash by default;
  provider-swappable — Anthropic / Groq / Gemini / OpenRouter / local Ollama all wired).
- Generates **full multi-beat lessons** with diagnostics, neural narration, and working
  **mid-lesson interruption**.
- The **generalized rendering engine (phases 0–3)** is implemented and verified:
  composable basis, relational placement, group composition, capability degradation.
- Reliability stack (coercion, truncation recovery, QA, deterministic sanitize) is in
  place; bare-text fallbacks are rare and being driven toward zero.
- Verified by typecheck, lint, schema/visual smoke tests, and production build.

## What's next (see `docs/ROADMAP.md`)

- **Generalize the motion layer** so points/labels ride the new `parametric`/`path`
  curves (the unit-circle point should *orbit*; the sine/cosine "unroll" should animate).
- **100%-no-text guarantee** (minimal-scene regeneration before any text fallback).
- **Streaming start** — begin playback after the first beats while the rest generate.
- **"Model-decides" interruption**, richer voice, and (later) true 3D + live interactivity.

## Tech positioning (one slide's worth)

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4, one process. No
  Redis/worker/DB, no Manim/video/WebGL. Rendering is Framer Motion + SVG + KaTeX at 60fps.
- **Cost:** runs on a cheap LLM, no GPU, no video pipeline; prompt-cached; per-lesson
  cost is a priority, not an afterthought.
- **Defensibility:** the deterministic SceneSpec engine + reliability/generalization
  layers are the compounding asset — they improve every lesson at once and are far
  more than a prompt around an API.
