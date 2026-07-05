# Reference lesson notes — 3b1b "Paradox of the derivative"

The hand-authored offline lesson (`lib/offlinePipeline.ts`) is our **reference / oracle**:
a SceneSpec that hits 3Blue1Brown teaching discipline, used to feed prompt exemplars,
budgets, and gate calibration. 3b1b is the bar; this is the executable target.

## 3b1b visual grammar (what to emulate)
- **Persistent stage.** One distance-vs-time graph held in a FIXED position for most
  of the video. Graph occupies the left ~70%; equations/labels live in the right third.
  → reuse the same axes + `s(t)` curve across beats with `continueFrom:"prev"` + stable ids.
- **One idea per beat**, lots of black space, restrained color: white/blue curve, a
  single yellow accent (the highlight bar / `dt`), teal velocity curve. Serif math (KaTeX).
- Recurring moves: sliding **yellow highlight bar**; **velocity bump v(t)** in the same
  axes; **ds/dt rise-run** braces; **corner inset zoom**; **secant→tangent slide** (climax);
  the **t³ difference-quotient** collapsing algebraically.
- Curve labels (`s(t)`, `v(t)`) sit at the curve's right end. Axis labels small.

## Primitive gap audit (3b1b move → SceneSpec)
Expressible today: distance/velocity curves (`function-plot`), car on a line
(`arrow`+`icon`+`move`+`counter`), highlight bar (`box` move/reshape), rise/run
(`brace`s), secant→tangent (`secant-line`+`slide`), corner zoom (`inset`),
equation algebra (`equation`+`transform`+`fadeOut`), tangent (collapsed secant),
speedometer/clock (`icon`).

Now expressible: dashed helper strokes via `dash` on arrows, plots, and secant
lines; intra-beat cleanup via `fadeOut`; curly measurement braces via `brace`;
animated quantities via `counter` + `count`. Use `fadeOut` for temporary helpers,
not for algebra history: calculation chains should remain visible unless a new
line clearly replaces the old one in the same visual role.

## Budgets measured from reference #1 (derivative, 13 beats; seed prompt/gate thresholds)
- **objects/beat:** min 3, max 11, avg **5.8** (statement beats lean ~5, graph beats ~7–11).
- **timeline steps/beat:** avg **6.4** (staggered entrances; nothing front-loaded).
- **duration/beat:** 22–30s, avg **25s**; total ~5.4 min for 13 beats.
- **persistent stage:** 3 beats reuse the prior graph via `continueFrom:"prev"`; the
  same `s(t)` curve + axes recur identically across beats 3,4,5,8,9.
- **inset vs camera:** the "look closer" beat (8) uses a registered `inset`, NOT a
  whole-scene camera zoom. (No camera moves used at all — insets + highlight band
  carry the "where to look".)
- one new idea per beat; ≤2 equations visible together; one yellow accent per beat.

Refine these once reference #2 (a non-graph shape: equation/number-line or geometry)
is authored, so budgets reflect reusable patterns, not derivative-specific habits.

## Additional short-form references
Sampled 2026-06-01 from the two vertical explainers in `~/Downloads`.

- **Polling explainer:** dark stage, one persistent app/server diagram, animated
  arcs between icons, colored keyword emphasis inside captions, large counters
  for scale, and quick cleanup/replacement of captions once the idea advances.
- **Clean-code explainer:** code/text objects on a dark canvas, one line or phrase
  highlighted at a time, comments fading into renamed/extracted code, and dense
  typography made readable by removing the old annotation before adding the next.

Transferable to Lumen: keep 3b1b as the math-board core, but use `fadeOut`,
`counter`, braces, colored word emphasis, and short-lived helper labels so the
board changes at the pace of speech instead of accumulating static captions.
Do not apply short-form cleanup to calculation history; students need to see the
previous algebraic steps while following the next one.
