# Lumen — real-time, interruptible AI tutor

Give Lumen a topic and it builds a **full narrated lesson** — a teacher narrating
while an animated whiteboard draws the idea, several beats long, like a
3Blue1Brown video. The student can **interrupt at any point** and the lesson
adapts. It is **not** a video generator: nothing is ever rendered to a file —
the whole thing plays live in the browser at 60fps.

## How it works

Two layers:

- **Lesson layer** (the product) — a `Lesson` is an ordered list of segments,
  each `{ narration, scene }`, played sequentially by `LessonPlayer`. Lessons are
  built one beat at a time and **streamed** to the client (`/api/lesson` emits
  NDJSON: a `meta` event, then a `segment` event per beat, then `done`), so
  playback starts on the first beat instead of waiting for the whole lesson.
  Interruptions (`/api/interrupt`) are a single fast call that answers in-context
  and resumes.
- **Scene layer** (the engine) — each beat's visual is a `SceneSpec`, a strict
  JSON contract rendered by `SceneRenderer` into animated SVG + KaTeX. The model
  **never emits rendering code** — only structured JSON — which keeps rendering
  crash-free and fast. Deterministic layout + sanitization + linting pass on
  every scene before it reaches the client.

The app itself is a small marketing site (`/`, `/about`, `/pricing`, `/faq`,
etc.) plus the actual product at **`/learn`**.

| Path | Role |
|---|---|
| `types/lesson.ts` | `Lesson` = ordered `LessonSegment[]`; `LessonStreamEvent` (NDJSON contract) |
| `types/scene.ts` | the `SceneSpec` contract (one shared world coordinate system, y-up) |
| `types/planning.ts` | diagnostic intake, teacher script, and visual storyboard contracts |
| `lib/lessonSchema.ts` | zod validation + resource caps for lessons & answer segments |
| `lib/sceneSchema.ts` | zod validation + resource caps for scenes; also the model's tool JSON schema |
| `lib/planningSchema.ts` | zod validation for diagnostics, scripts, and storyboards |
| `lib/llm.ts` | provider-agnostic model plumbing (forced tool-use, caching, cost guard) |
| `lib/mathEval.ts` | safe expression evaluator for `function-plot` (no `eval`) |
| `lib/coords.ts` | world ↔ pixel mapping |
| `lib/layout.ts` | deterministic scene layout / QA pass |
| `lib/tts.ts` | narration (Edge TTS, with browser Web Speech fallback) |
| `components/LessonPlayer.tsx` | streamed, sequential narrated playback + interrupt |
| `components/SceneRenderer.tsx` | `SceneSpec` → animated SVG + KaTeX overlay |
| `app/learn/page.tsx` | the actual product UI: topic → diagnostics → streamed lesson |
| `app/api/intake/route.ts` | topic → diagnostic dropdown questions |
| `app/api/script/route.ts` | topic + answers → teacher-quality lesson script |
| `app/api/lesson/route.ts` | script → streamed visual lesson (NDJSON) |
| `app/api/interrupt/route.ts` | one fast answer segment (answer-then-resume) |
| `app/api/tutor/route.ts` | legacy single-scene v1 route (unused by `/learn`) |

## Run it

```bash
cp .env.local.example .env.local   # pick a provider and add its key
npm run build
npm run start                      # http://localhost:3000
```

Lumen supports several model providers via `LUMEN_PROVIDER` in `.env.local`
(see that file for details and free-tier caveats): `ollama` (local, no rate
limits — recommended default), `deepseek`, `groq`, `gemini`, `openrouter`, or
`anthropic`. The homepage's hero demo is a hand-authored example (no API call).
Go to `/learn` to run the real pipeline: pick a topic, answer the diagnostic
questions (or accept defaults), and the lesson streams in beat by beat while
narration plays. You can interrupt at any point mid-playback.

## Cost & safety notes

- **Cheap by design:** the lesson is built one small beat at a time so each
  model call is small; static system-prompt/schema content is prompt-cached
  where the provider supports it; forced tool-use keeps output compact JSON.
- **No arbitrary code from the model:** `function-plot` expressions go through
  a hand-written whitelist parser (`lib/mathEval.ts`) — never `eval`/`new
  Function`. KaTeX runs with `trust:false`.
- **Resource caps** (`CAPS`/`LESSON_CAPS` in `lib/sceneSchema.ts` /
  `lib/lessonSchema.ts`: ≤40 objects, ≤60 steps, ≤400 samples/plot, ≤60s,
  latex ≤2KB) are enforced server-side and clamped in the renderer, so a
  malformed response can't spike RAM/CPU. Animations use transform/opacity only.
- **Keys stay server-side** (`.env.local`, read only in API routes). A small
  in-memory request guard limits accidental cost runaway.

## Notes for contributors

See [`AGENTS.md`](AGENTS.md) for the full architecture contract (locked design
decisions, hard rules, file map) and [`HANDOFF.md`](HANDOFF.md) for what's
currently in progress.
