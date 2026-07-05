# The fully interactive live tutor — strategy & phased plan

**Status: TABLED (2026-07-05).** Written after a strategic review + market deep
dive; deliberately parked to focus on the current lesson experience. Revisit when
we're ready to invest in differentiation beyond the watchable lesson. Nothing here
is committed work.

## Why this exists

Today Lumen is a generated, narrated, interruptible lesson — real and working, but
still fundamentally a **watchable video with a pause button**. The founding goal is
an *almost live* experience. This doc captures the reviewed path to that: make the
whiteboard **bidirectional**, so the tutor reacts to what the student *does*, not
only what they *say*.

## Market read (as of July 2026)

| Segment | Players | Their weakness |
|---|---|---|
| Chat tutors | ChatGPT Study Mode, Claude Learning Mode, Gemini Guided Learning, Khanmigo (~1.4M users) | Text walls + static images; no narrated animated board; "explain X" is commoditizing fast |
| AI Manim/video generators | AnimG, TMA.live, various HN clones | Minutes-slow, non-interactive, code-gen = crashy/wrong math — Lumen already beats these architecturally |
| Voice + sketchpad tutors | **YoLearn.ai** (voice-first tutor drawing on a whiteboard; $500K pre-seed, NVIDIA Inception, India exam-prep) | Closest conceptual competitor — validates the category; sketch generality unclear; regional focus |
| Learn-by-doing | Brilliant, Math Academy | Gold-standard pedagogy (active > passive) but **hand-authored** content — can't cover *your* question at *your* level |

**The unoccupied gap:** generated 3b1b-quality visuals **+** Brilliant-style active
manipulation **+** a live tutor that reacts to student actions. Chat tutors can't
draw. Video generators can't react. Brilliant can't generate. Lumen's core bet —
model emits declarative JSON, deterministic engine renders — is the only
architecture where the student can touch the visual at 60fps with **zero tokens and
zero latency**: the scene graph and the safe math evaluator already run in the
browser.

Market sizing (external): AI tutors ~$2.11B (2025) → ~$17.7B (2033) projected
([Grand View Research](https://www.grandviewresearch.com/industry-analysis/ai-tutors-market-report)).

## Strategic thesis

> Stop making the lesson more watchable. Make the whiteboard **bidirectional**.
> Positioning: **"the first AI tutor whose whiteboard you can touch."**

Student actions on the canvas become both the learning mechanism (active recall
beats passive watching — the Brilliant argument) and a data moat no chat tutor can
copy (behavioral telemetry: where they dragged, what they predicted, what they got
wrong).

**Why this is NOT a pivot:** the stated differentiator is already "the live,
interruptible loop." Touch deepens that same loop. Zero change to the locked
architecture — the model still emits only a JSON `SceneSpec`; interactivity is a
vocabulary extension (exactly what `AGENTS.md` prescribes), and the `params` +
`mathEval` machinery it needs already exists (built for `parametric`). A lesson
with zero interactive beats plays exactly as today.

## The phases (each demo-able alone)

### Phase A — Touchable scenes (interactive primitives)
- **`slider` object** (`types/scene.ts` + `lib/sceneSchema.ts` together, hard rule
  6): a labeled world-coords slider bound to a named param; dragging re-evaluates
  every curve referencing that param at 60fps, purely client-side, no model call.
- **Draggable dot**: a `dot` with `place: {kind:"on", target}` gains
  `interactive: true` — student slides it along any curve (reuses the arc-length/`t`
  machinery from `trace`).
- Renderer work in `components/SceneRenderer.tsx` (pointer events → param state →
  re-derive; transform/opacity only, hard rule 5). QA lint for dangling param refs
  in `lib/sceneQA.ts`.
- Ship order: (1) hand-authored interactive demo in `lib/exampleScenes.ts`;
  (2) capability contract in `lib/prompt.ts` so the model emits "explore this
  yourself" beats.

### Phase B — Predict-then-reveal checkpoints (active learning in the lesson loop)
New segment kind in `types/lesson.ts` + `lib/lessonSchema.ts`: **`checkpoint`** —
lesson pauses, narration poses a task ("drag the dot to where the slope is zero"),
the student acts, grading is **deterministic** (the evaluator knows the truth — no
model call, instant). Pre-generate two reveal narrations (correct/incorrect) so the
reaction is immediate; append the student's actual action ("placed x=2.3, true max
x≈1.57") to the interrupt context so follow-ups reference what they *did*.
`LessonPlayer` grows a `checkpoint` phase alongside `buffering`.

### Phase C — Feels-alive layer
- **Deixis/pointer presence**: an animated tutor pointer indicating what the current
  narration sentence refers to (lightweight `point` timeline step; answers the
  roadmap's word-level-sync question at sentence granularity — cheap, big effect).
- **Voice interruption (STT)**: push-to-talk "raise your hand" (browser
  SpeechRecognition first) feeding the existing `/api/interrupt`.
- **Model-decides interruption** (already on the deferred list): answer vs. re-plan
  remaining beats, enriched with Phase A/B behavioral context.

### Phase D — Compounding moats
- **Learner memory**: persist lessons + checkpoint outcomes (localStorage first, no
  DB per locked architecture); `/api/intake` skips questions it can infer; a
  "review what you missed" spaced-recap lesson generator.
- **Eval harness** (deferred-list item): scripted topic set → schema-valid rate,
  QA-warning counts, fallback rate, cost per lesson. Guards every prompt/engine
  change above.

**Explicitly out:** video export, 3D (stays Phase-4 deferred), per-shape named
primitives (violates the generalized basis).

## Sources

- [Khanmigo case study 2026](https://www.buildmvpfast.com/blog/ai-tutoring-khanmigo-case-study-2026) · [EdTech AI stats](https://tutorbase.com/statistics/edtech-ai)
- [Google Guided Learning / $1B education push; OpenAI Study Mode](https://venturebeat.com/business/anthropic-takes-on-openai-and-google-with-new-claude-ai-features-designed-for-students-and-developers)
- [YoLearn.ai sketchpad tutor](https://www.yolearn.ai/blog/ai-tutors-with-sketchpad-classroom-style-learning) · [funding](https://ascendants.in/funding-feed/yolearn-ai-raises-500k-pre-seed/)
- [HN: AI 3b1b-style video generators](https://news.ycombinator.com/item?id=42590290) · [AnimG](https://animg.app/en/manim-for-youtube)
- [Brilliant learn-by-doing pedagogy](https://brilliant.org/help/why-brilliant/brilliant-vs-khan-academy/)
- [AI tutors market report](https://www.grandviewresearch.com/industry-analysis/ai-tutors-market-report)
