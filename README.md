# Lumen — real-time, interruptible AI tutor

A lesson is generated live; the student can interrupt at any moment and the
explanation — with animated math visualizations (Manim / 3Blue1Brown style) —
adapts immediately. **Not** a video generator: the scene graph is animated live
in the browser at 60fps.

## How it works

- **Claude is the brain** and emits structured JSON only — diagnostics, teacher
  scripts, visual storyboards, and final `SceneSpec` scenes. It never emits
  rendering code. A TypeScript renderer maps specs to animated components.
- **Rendering** = Framer Motion + SVG + KaTeX (`components/SceneRenderer.tsx`),
  including clock-driven curve morphs and dots tracing along plots.
- **One process**, no GPU, no video, no worker/Redis/DB.

| Path | Role |
|---|---|
| `types/scene.ts` | the `SceneSpec` contract (one shared world coordinate system) |
| `types/planning.ts` | diagnostic intake, teacher script, and visual storyboard contracts |
| `lib/sceneSchema.ts` | zod validation + resource caps; also the model's tool JSON schema |
| `lib/planningSchema.ts` | zod validation for diagnostics, scripts, and storyboards |
| `lib/mathEval.ts` | safe expression evaluator for `function-plot` (no `eval`) |
| `lib/coords.ts` | world ↔ pixel mapping |
| `components/SceneRenderer.tsx` | `SceneSpec` → animated SVG + KaTeX overlay |
| `lib/exampleScenes.ts` | hand-authored f(x)=x² + tangent demo (the quality bar) |
| `app/api/intake/route.ts` | topic → diagnostic dropdown questions |
| `app/api/script/route.ts` | topic + answers → teacher-quality lesson script |
| `app/api/lesson/route.ts` | script → visual storyboard + playable lesson |
| `app/page.tsx` | topic intake → diagnostics → lesson playback UI |

## Run it

```bash
cp .env.local.example .env.local   # then add your ANTHROPIC_API_KEY
npm run build
npm run start                      # http://localhost:3000
```

The page shows the hand-authored demo immediately (no API call / no tokens on
load). Type a topic to generate diagnostic dropdowns, choose defaults or tailor
the lesson, then build the narrated visual lesson. During playback, the interrupt
box sends the current scene as context so the explanation adapts.

## Cost & safety notes

- **Cheap by design:** default model `claude-sonnet-4-6` (set `LUMEN_MODEL` to
  `claude-haiku-4-5-20251001` for the cheapest tests). The static system prompt +
  schema + example are **prompt-cached**, so repeat requests bill ~1/10th input.
  Forced tool-use means compact JSON out, and `max_tokens` is capped.
- **No arbitrary code from the model:** `function-plot` expressions go through a
  hand-written parser (whitelist of functions/constants, variable `x`) — never
  `eval`/`new Function`. KaTeX runs with `trust:false`.
- **Resource caps** (≤40 objects, ≤60 steps, ≤400 samples/plot, ≤60s, see
  `lib/sceneSchema.ts`) are enforced server-side and clamped in the renderer, so a
  malformed response can't spike RAM/CPU. Animations use transform/opacity only.
- **Key stays server-side** (`.env.local`, read only in the route). A small
  in-memory request guard limits accidental cost runaway.
