# Generalized rendering engine — design

**Status:** proposed (2026-06-11). Supersedes the "add a primitive per shape"
approach. Goal: any student, any topic, renders correctly with **no per-shape
maintenance**, while keeping Lumen's locked guarantees (model emits JSON only;
deterministic renderer; no model code; instant; capped).

## The problem

A fixed, *named* vocabulary (`box`, `axes`, `area-model`, …) has an expressiveness
ceiling: anything not named can't be drawn, so coverage grows only when a human
adds a primitive. That doesn't scale to open-ended student topics.

The escape is not "let the model write code" (kills determinism/safety) and not
"name every shape" (kills maintainability). It's **composability**: a small
orthogonal basis the model *combines*, plus a deterministic solver that guarantees
correctness for whatever it builds.

## Two problems, kept separate

- **Coverage** — *can* it be drawn (cylinder, spiral, arbitrary diagram)? → Pillar 1.
- **Correctness** — does what's drawn look right (alignment, on-curve, no overlap)?
  → Pillar 2.
- **The novel tail** — things the basis genuinely can't do → Pillar 3 (degrade, never break).

`area-model` (today) accidentally addressed slices of both; generalized, they split.

## Pillar 1 — Composable geometry basis (coverage)

Stop adding named shapes. Add ~5 **general** primitives that compose into the long
tail. New `SceneObject` members (additive to `types/scene.ts` + `lib/sceneSchema.ts`):

- **`path`** — segments `[{op:"M"|"L"|"C"|"Q"|"A", …pts}]` in world coords, optional
  `close`, fill/stroke/dash. Any polygon, outline, diagram, stylized solid (a
  cylinder = two ellipse arcs + two lines).
- **`parametric`** — `xExpr`, `yExpr` over `t ∈ [t0,t1]`, samples. Arbitrary curves
  (spiral, Lissajous, circle, ellipse, polar). **Reuses the existing safe evaluator**
  — see "Enabler" below.
- **`polygon` / `polyline`** — convenience sugar over `path`.
- **`group` / `transform`** — bundle children and apply translate/rotate/scale as a
  unit; animatable via the existing timeline.

Existing primitives (`axes`, `function-plot`, `dot`, `secant-line`, `box`, …) stay
as a "standard library"; several can later be re-expressed as macros over the basis,
but nothing is removed (backward compatible).

**Enabler (highest leverage, lowest risk):** generalize `lib/mathEval.ts`
`compileExpr(expr): (x)=>number` from the single bound variable `x` to a small bound
set (`t`, and params `a,b,c`). The whitelist parser already exists; we only
parameterize which identifiers bind. This one change unlocks `parametric` curves and
surfaces safely and deterministically, with zero new evaluation risk.

**3D is a separate pillar (out of v1).** A 2D "cylinder" is just a `path`. True
rotating solids need parametric *surfaces* + a projection/camera and are deferred to
Pillar 4.

## Pillar 2 — Relational constraint layer (correctness)

The model is bad at absolute coordinates and can't see the result. So objects declare
**relationships**, and one deterministic solver computes positions. New optional
`place?: Anchor` on positioned objects (augments, doesn't replace, today's `at`):

- `{ kind: "absolute", at }` — today's behavior.
- `{ kind: "on", target, at: t|x }` — ride a curve/path. **Generalizes dot-snap and
  secant endpoints.**
- `{ kind: "relativeTo", target, side: left|right|above|below|center, gap }` —
  adjacency. **Generalizes area-model tiling and callouts.**
- `{ kind: "distribute", in: groupId, axis, index, count }` — grids/rows/stacks.

A resolution stage runs at the **front** of `resolveLayout` (`lib/layout.ts`):
topologically order objects by reference, resolve to absolute coords, detect cycles
→ fall back to absolute. The existing view-fit, region/callout/overlay placement, QA
lint (`lib/sceneQA.ts`), and sanitize (`lib/sceneSanitize.ts`) then run unchanged.

Result: `dot-snap` and `area-model` become *instances* of one solver, not bespoke
code — and every future object gets alignment for free.

## Pillar 3 — Capability contract + graceful degradation (the tail)

Reliability can't depend on covering everything. Instead, the system **knows its
limits and degrades to a correct, simpler visual** — never a broken frame.

- **Prompt contract** (`lib/prompt.ts`): declare the basis precisely; instruct the
  model to express ideas within it, and if something isn't drawable, teach it with
  the best representable approach (cross-section, diagram, graph, equation). This
  generalizes the existing "if the vocab can't show it, use a graph/table" rule.
- **Capability lint** (new pass, `lib/sceneQA.ts`): every referenced id / curve /
  constraint resolves and every expression compiles. Unresolved → sanitize repairs
  or the beat degrades to a simpler representable scene.
- Net: novelty degrades to "taught a slightly different but still correct way."

## How it folds into the existing pipeline

| Layer | Change |
|---|---|
| `lib/mathEval.ts` | parameterize bound variable(s); add `t`, params |
| `types/scene.ts` + `lib/sceneSchema.ts` | add `path`/`parametric`/`polygon`/`group`; add optional `place: Anchor` |
| `lib/layout.ts` | new constraint-resolution stage at front of `resolveLayout`; re-express dot-snap/area-model on it; `dataBounds` cases for new primitives |
| `components/SceneRenderer.tsx` | render cases for `path`/`parametric`/`group` (parametric reuses function-plot sampling/draw) |
| `lib/sceneQA.ts` | capability-resolution lint |
| `lib/areaModel.ts` | becomes a thin macro over basis + constraints |

Everything is **additive**; existing scenes keep rendering identically.

## Phasing (incremental, demo-safe)

- **Phase 0 — Parametric basis.** Parameterize `mathEval` (`t`); add `parametric` +
  `path` (schema + renderer + `dataBounds`). Biggest coverage win, additive, low risk.
- **Phase 1 — Constraint solver.** `place: on|relativeTo|absolute` + resolver in
  `resolveLayout`; re-express dot-snap on it.
- **Phase 2 — Composition.** `group`/`transform`; re-express `area-model` as a macro.
- **Phase 3 — Capability contract.** Prompt contract + capability lint + degrade path.
- **Phase 4 — (later) True 3D + interactivity.** Parametric surfaces + projection;
  live parameter controls.

## Risks & mitigations

- *Still bounded by the basis* → composability + Pillar 3 fallback cover the tail.
- *Solver cycles/complexity* → topological order, cycle detection, absolute fallback,
  depth cap.
- *Tokens/latency* → basis is terse; keep `CAPS`.
- *3D expectations* → explicitly deferred; 2D stylized solids via `path` meanwhile.

## Success criteria

- A new topic needing a novel **static** shape renders correctly with **no code change**.
- Points/labels/tiles always align (one solver).
- **No beat ever shows a broken/empty visual** (capability degrade).
