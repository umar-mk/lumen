# Lumen architecture

How the live, interruptible loop actually works, and why it's built this way.

## The one idea

The model describes **what to show**; it never says **how to draw it**. Claude
emits a declarative `SceneSpec` (JSON); a pure TypeScript renderer turns that into
animated SVG + KaTeX. This separation is the whole design:

- **Crash-free** — the model can't emit code that throws in the browser. The worst
  it can do is emit a spec the validator rejects or the renderer ignores.
- **Instant** — no compilation, no video render, no GPU. Animating a small scene
  graph in the browser is effectively free.
- **Cheap** — each stage uses compact JSON (forced tool-use), and static prompts
  are cached.

If something seems to require the model to "write code," the answer is always:
**extend the `SceneSpec` vocabulary and teach the renderer one new thing.**

## Two layers: Lessons on top of Scenes

Lumen has two levels, and it matters which one you're working in:

- **Lesson layer** (the product): a topic first becomes diagnostic dropdowns, then
  a teacher-quality `LessonScript`, then a `VisualStoryboard` plus final `Lesson`.
  A `Lesson` is still an ordered list of `LessonSegment`s, each
  `{ narration, scene }`. `LessonPlayer` plays segments in sequence — speaking the
  narration (neural **Edge TTS**, `lib/tts.ts`, with retries + next-beat prefetch)
  while the scene animates — and handles pause / interrupt. Types live in
  `types/lesson.ts` and `types/planning.ts`;
  validation lives in `lib/lessonSchema.ts` and `lib/planningSchema.ts`.
- **Scene layer** (the engine, below): a single `SceneSpec` → an animated frame via
  `SceneRenderer`. This is the v1 engine, now reused as the per-segment visual.

Two latency regimes: building a tailored lesson is allowed to be slow; an
interruption must feel instant (it generates only one small segment). Narration is
TTS-read, so the model writes narration as spoken words (no LaTeX/symbols) while
the scene's `equation` objects carry the LaTeX — see `lib/prompt.ts`.

Interruption is **answer-then-resume** in the MVP: pause → generate one answer
segment → play it → replay the interrupted segment → continue. (`docs/ROADMAP.md`
tracks the deferred "model decides" and pipelined-start upgrades.)

## End-to-end data flow (lesson layer)

```
student enters topic
        │
        ▼
app/page.tsx ──POST {topic}──────────────▶ app/api/intake
        │                                      │
        │                         forced tool: DiagnosticIntake
        ◀──────────── {intake, usage} ─────────┘
        │
student chooses dropdown answers
        │
        ▼
app/page.tsx ──POST {topic, answers}─────▶ app/api/script
        │                                      │
        │                         forced tool: LessonScript
        ◀──────────── {script, usage} ─────────┘
        │
        ▼
app/page.tsx ──POST {script}─────────────▶ app/api/lesson
        │                                      │
        │                    per beat: compose SceneSpec → validate
        │                    → resolveLayout → QA lint → sanitize
        ◀────────────── {lesson, usage} ───────┘
        │
        ▼
LessonPlayer ──▶ SceneRenderer + neural Edge TTS
```

The important separation is: teacher script first, visual compiler second,
renderer last. The final playable lesson remains data-only and renderer-safe.

## Legacy scene flow

```
student types a question
        │
        ▼
app/page.tsx ──POST {question, currentScene?}──▶ app/api/tutor/route.ts
        │                                              │
        │                                  build messages (few-shot demo +
        │                                  cached system prompt + user turn)
        │                                              │
        │                                  Anthropic Messages API,
        │                                  tool_choice = render_scene (forced)
        │                                              │
        │                                  model returns tool_use.input  ◀── a SceneSpec
        │                                              │
        │                                  validateScene() (zod + CAPS)
        │                                              │
        ◀───────────────── { scene, usage } ──────────┘
        │
   setScene + bump sceneKey
        │
        ▼
components/SceneRenderer.tsx  ── pure ──▶ animated SVG + KaTeX overlay (60fps)
```

`currentScene` is included only for **follow-up interruptions**, so the model
returns a full new spec that adapts the explanation. The renderer remounts on a
new `sceneKey`, which cross-fades old → new and resets all animation state.

## The `SceneSpec` contract (`types/scene.ts`)

One JSON object: `{ version, title?, view?, background?, objects[], timeline[], duration? }`.

### Coordinate system

There is **one shared world coordinate system** for the whole scene — math-style:
origin in the centre, **y points up**. Every position in the spec (`at`, arrow
`from`/`to`, axes ranges, plot `domain`, dot positions) is in these world coords.
There is deliberately **no per-object coordinate space** — that removes a whole
class of mapping bugs and matches how the model already reasons about graphs.

`view = {xMin,xMax,yMin,yMax}` (default `{-8,8,-4.5,4.5}`) is the visible window.
The renderer maps it onto a fixed **1600×900** viewBox with independent x/y scale,
so the chosen view always fills the 16:9 canvas. (Dots use pixel radii so they
stay round regardless of view aspect.)

### Objects (discriminated union on `type`, each with a unique `id`)

| type | draws | notes |
|---|---|---|
| `axes` | axis lines, ticks, optional grid, labels | `xRange`/`yRange` in world coords |
| `function-plot` | y = f(x) curve | `expr` parsed by `lib/mathEval.ts`; `domain`, `samples`≤400 |
| `parametric` | x(t), y(t) curve | arbitrary curves (circle, spiral, ellipse); reuses the safe evaluator |
| `path` | arbitrary outline | M/L/Q/C/A segments in world coords; any silhouette/diagram |
| `polygon` / `polyline` | filled polygon / open line | `points[]` in world coords |
| `group` | composed sub-scene | child objects in local coords + `transform`; expanded deterministically |
| `area-model` | partitioned rectangle (algebra tiles) | declares column/row bands; expands to perfectly-tiled boxes + labels |
| `secant-line` | chord/tangent on a plot | endpoints ride a `function-plot`; `slide` to a tangent |
| `dot` | filled/open circle | `radius` in px; `filled:false` for an open point |
| `arrow` / `brace` | line+head / measure brace | `from`/`to` |
| `box` / `inset` | panel / zoom-with-context | `inset` mirrors selected objects in a clipped mini-view |
| `icon` | small physical glyph | car, stopwatch, person, … |
| `text` / `label` / `equation` / `counter` | overlay text / KaTeX / animated number | rendered in the HTML overlay |

**Placement (`place`, optional on positioned objects).** Instead of absolute
coordinates the model may declare a *relationship* — `{kind:"on", target, t|x}`,
`{kind:"relativeTo", target, side, gap}`, `{kind:"distribute", in, axis, index, count}`,
or `{kind:"absolute", at}` — and a deterministic resolver (`lib/sceneTransforms.ts`,
run at the front of `resolveLayout`) computes exact coordinates. This is what keeps
points on curves and labels aligned without the model guessing pixels.

### Timeline (animation steps, times in **seconds**)

| type | effect | applies to |
|---|---|---|
| `fadeIn` | opacity 0→1 | anything (esp. text/equations) |
| `fadeOut` | opacity 1→0 | temporary helpers/labels |
| `draw` | stroke-on via `pathLength` (pop-in for dots) | axes, plots, arrows |
| `move` | slide to `to` {x,y} | single-anchor objects (dot/text/equation) |
| `transform` | cross-fade an equation's `latex` → `toLatex` | equations |
| `highlight` | brief scale/pulse, optional `color` | anything |
| `morph` | continuously reshape `expr` → `toExpr` | function plots |
| `trace` | move a dot along a named plot | dots (⚠ `function-plot` only — see below) |
| `slide` | move secant endpoints (secant→tangent) | secant-lines |
| `reshape` | animate a box's size/position | boxes |
| `emphasize` | grow + hold to draw the eye | anything |
| `count` | animate a counter value | counters |

An object with no timeline step is simply visible from t=0.

> **Known gap (queued, see `docs/ROADMAP.md`):** the motion steps (`trace`/`move`)
> only ride a `function-plot`; nothing yet animates a dot along a `parametric`/`path`.
> So a point on a `parametric` unit circle is static. Generalizing motion to the basis
> is the top next-up item.

## Rendering (`components/SceneRenderer.tsx`)

Two layers stacked in a `relative aspect-video` container:

1. **SVG geometry layer** (`viewBox="0 0 1600 900"`) — axes, function plots, dots,
   arrows. Driven by Framer Motion (`pathLength` for draws, transforms for moves).
2. **HTML overlay layer** for crisp text + KaTeX. It's a `1600×900` box
   `transform: scale(containerWidth/1600)` (measured via `ResizeObserver`), so its
   pixel coordinates line up exactly with the SVG viewBox and scale identically.

The timeline is turned into per-object Framer Motion props (`planFor`): each step
becomes an `initial`/`animate` target plus a per-property `transition` with
`delay` = step start. All animation is transform/opacity only.

## Layout, QA & self-healing (the reliability engine)

Every generated scene passes through a deterministic pipeline before it plays —
this is what turns occasionally-sloppy model output into a clean lesson:

- **`resolveLayout` (`lib/layout.ts`)** — resolves `place` constraints, expands
  `group`/`area-model` macros, fits the `view` to the content, places region/callout
  annotations, and snaps dots onto curves. Deterministic; the model never sets pixels.
- **QA lint (`lib/sceneQA.ts`)** — flags overlaps, off-frame text, text-on-curve,
  duplicate/empty labels, plus *capability* errors (invalid expressions, dangling
  references, bad constraints).
- **`sanitize` (`lib/sceneSanitize.ts`)** — a model-free repair pass that mechanically
  resolves those issues (strip emoji, backplate text, drop duplicates/clipping cameras,
  remove unresolvable objects) so a beat keeps its real visuals. Bare-text fallback is
  a last resort, being driven toward zero.

## Model I/O robustness (`lib/llm.ts`)

- **Provider-agnostic forced tool-use.** `runTool` takes a zod schema and returns
  validated JSON. `LUMEN_PROVIDER` selects the backend — default **DeepSeek v4-flash**
  (cheap, thinking disabled so it can force tool calls, auto prompt-cache); also wired
  for Anthropic / Groq / Gemini / OpenRouter / local Ollama. The tool `input_schema` is
  derived from each zod schema via `z.toJSONSchema`.
- **`coerceToSchema`** clamps out-of-range / lightly-wrong output to the schema before
  validation; **`recoverTruncatedJson`** salvages truncated or malformed tool calls.
  Together they let a cheap model still produce valid lessons.
- **Routes:** `/api/intake` → `DiagnosticIntake`; `/api/script` → `LessonScript` (+
  self-review); `/api/lesson` → builds the lesson **one beat at a time** (compose →
  validate → layout → QA → sanitize); `/api/interrupt` → one answer segment; legacy
  `/api/tutor` → a single `SceneSpec` (unused by the lesson UI).
- **Prompt caching** on the static system prompt; **cost guard** (min-gap +
  max-in-flight) so an accidental loop can't run up the bill. The API key is read
  server-side only, per the active provider's env var.

## Safety model (why it can't crash the Mac or run code)

- Model output is **data, not code**. The only model-controlled strings that get
  "evaluated" are math expressions (`function-plot` `expr`, `parametric` `xExpr`/
  `yExpr`), and those go through a hand-written whitelist parser (`lib/mathEval.ts`) —
  no `eval`/`Function`, prototype-safe lookups, parse failures render as "no curve."
- KaTeX renders with `trust:false` (no markup/script injection).
- `CAPS` bound every list/loop the renderer touches, so work is always finite.
- Animations use compositor-friendly properties; no layout thrash, no busy loops.
