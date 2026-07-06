import assert from "node:assert/strict";

import { resolveLayout } from "@/lib/layout";
import { polishScene } from "@/lib/scenePolish";
import { SHOT_PROGRAMS, runProgram } from "@/lib/shotPrograms";
import { findCueTime, retimeScene } from "@/lib/syncTimeline";
import { offlineDerivativeLesson, offlineDerivativeScript } from "@/lib/offlinePipeline";
import { lintScene, severeIssues } from "@/lib/sceneQA";
import { validateScene } from "@/lib/sceneSchema";
import { applyShotPattern } from "@/lib/shotPatterns";
import type { SceneSpec } from "@/types/scene";
import type { TeachingBeat } from "@/types/planning";

const beat: TeachingBeat = {
  id: "qa-beat",
  teachingGoal: "Show a curve and one safe annotation.",
  narration: "Watch a point approach the value on the graph.",
  visualIntent: "Draw a graph with a rail annotation and a callout.",
  syncCues: [{ phrase: "point approach", visualAction: "Trace the point." }],
  targetDurationSec: 12,
  stage: "graph",
  shotPattern: "graph-approach",
};

const cleanGraph: SceneSpec = {
  version: 1,
  stage: "graph",
  shotPattern: "graph-approach",
  objects: [
    { type: "axes", id: "ax", xRange: [-1, 5], yRange: [-1, 8], showGrid: true },
    { type: "function-plot", id: "curve", expr: "x^2", domain: [-0.5, 3.2], color: "#5cc8ff", width: 4 },
    { type: "dot", id: "p", at: { x: 2, y: 4 }, color: "#ffd166", radius: 9 },
    { type: "label", id: "note", text: "approaching x = 2", at: { x: 0, y: 0 }, region: "rail", color: "#fde68a" },
    { type: "equation", id: "eq", latex: "\\lim_{x\\to 2} f(x)", at: { x: 0, y: 0 }, region: "caption" },
  ],
  timeline: [
    { type: "draw", targetId: "ax", start: 0, duration: 0.6 },
    { type: "draw", targetId: "curve", start: 0.5, duration: 1.2 },
    { type: "draw", targetId: "p", start: 1.8, duration: 0.3 },
    { type: "fadeIn", targetId: "note", start: 2.4, duration: 0.4 },
    { type: "fadeIn", targetId: "eq", start: 3.0, duration: 0.4 },
  ],
  duration: 12,
};

const badOverlap: SceneSpec = {
  version: 1,
  objects: [
    { type: "axes", id: "ax", xRange: [-2, 2], yRange: [-2, 2] },
    { type: "text", id: "a", text: "same place", at: { x: 0, y: 0 }, fontSize: 36 },
    { type: "text", id: "b", text: "same place", at: { x: 0, y: 0 }, fontSize: 36 },
  ],
  timeline: [],
  duration: 8,
};

const withInset: SceneSpec = {
  version: 1,
  stage: "plot-inset",
  objects: [
    { type: "axes", id: "ax", xRange: [-1, 4], yRange: [-1, 9], showGrid: true },
    { type: "function-plot", id: "curve", expr: "x^2", domain: [-0.5, 3.1] },
    { type: "inset", id: "zoom", at: { x: 0, y: 0 }, width: 3.2, height: 2.0, view: { xMin: 1.7, xMax: 2.3, yMin: 3.4, yMax: 4.8 }, shows: ["ax", "curve"], label: "local view" },
    { type: "text", id: "caption", text: "zoom without losing context", at: { x: 0, y: 0 }, region: "caption" },
  ],
  timeline: [
    { type: "draw", targetId: "ax", start: 0, duration: 0.6 },
    { type: "draw", targetId: "curve", start: 0.4, duration: 1.0 },
    { type: "draw", targetId: "zoom", start: 2.0, duration: 0.4 },
    { type: "fadeIn", targetId: "caption", start: 2.3, duration: 0.4 },
  ],
  duration: 10,
};

const generalizedBasis: SceneSpec = {
  version: 1,
  stage: "graph",
  objects: [
    { type: "axes", id: "ax", xRange: [-4, 6], yRange: [-3, 3], showGrid: true },
    {
      type: "parametric",
      id: "ellipse",
      xExpr: "a*cos(t)",
      yExpr: "b*sin(t)",
      params: { a: 2, b: 1 },
      tRange: [0, Math.PI * 2],
      color: "#5cc8ff",
      width: 4,
    },
    { type: "dot", id: "rider", at: { x: 0, y: 0 }, place: { kind: "on", target: "ellipse", t: 0 }, color: "#ffd166" },
    {
      type: "label",
      id: "ellipse-label",
      text: "parametric ellipse",
      at: { x: 0, y: 0 },
      place: { kind: "relativeTo", target: "ellipse", side: "above", gap: 0.7 },
      background: "#000000",
      padding: 6,
    },
    {
      type: "path",
      id: "cylinder-outline",
      segments: [
        { op: "M", to: { x: 3, y: -1 } },
        { op: "C", c1: { x: 4, y: -1.4 }, c2: { x: 5, y: -1.4 }, to: { x: 6, y: -1 } },
        { op: "L", to: { x: 6, y: 1 } },
        { op: "C", c1: { x: 5, y: 1.4 }, c2: { x: 4, y: 1.4 }, to: { x: 3, y: 1 } },
        { op: "L", to: { x: 3, y: -1 } },
      ],
      stroke: "#a78bfa",
      strokeWidth: 3,
    },
    {
      type: "group",
      id: "local-triangle",
      at: { x: -3, y: -1.2 },
      transform: { scale: 0.8, rotate: 8 },
      children: [
        {
          type: "polygon",
          id: "triangle-fill",
          points: [
            { x: 0, y: 0 },
            { x: 1.6, y: 0 },
            { x: 0.8, y: 1.2 },
          ],
          fill: "rgba(34,197,94,0.18)",
          stroke: "#86efac",
          strokeWidth: 2,
        },
        {
          type: "polyline",
          id: "triangle-median",
          points: [
            { x: 0.8, y: 1.2 },
            { x: 0.8, y: 0 },
          ],
          stroke: "#f8fafc",
          strokeWidth: 2,
          dash: [5, 5],
        },
      ],
    },
  ],
  timeline: [
    { type: "draw", targetId: "ax", start: 0, duration: 0.4 },
    { type: "draw", targetId: "ellipse", start: 0.3, duration: 0.8 },
    { type: "draw", targetId: "rider", start: 1.0, duration: 0.2 },
    { type: "fadeIn", targetId: "ellipse-label", start: 1.2, duration: 0.3 },
    { type: "draw", targetId: "cylinder-outline", start: 1.4, duration: 0.5 },
    { type: "fadeIn", targetId: "local-triangle", start: 1.7, duration: 0.4 },
  ],
  duration: 7,
};

const invalidCapability: SceneSpec = {
  version: 1,
  objects: [
    { type: "parametric", id: "bad-parametric", xExpr: "cos(t)", yExpr: "unsafe(t)", tRange: [0, 1] },
  ],
  timeline: [{ type: "draw", targetId: "missing", start: 0, duration: 0.4 }],
  duration: 4,
};

const laidOut = resolveLayout(applyShotPattern(cleanGraph, beat));
assert.equal(validateScene(laidOut).ok, true);
assert.deepEqual(severeIssues(lintScene(laidOut)), []);

const badIssues = severeIssues(lintScene(badOverlap));
assert.ok(badIssues.some((issue) => issue.code === "text-overlap"));

const insetLayout = resolveLayout(applyShotPattern(withInset, { ...beat, stage: "plot-inset" }));
assert.equal(validateScene(insetLayout).ok, true);
assert.deepEqual(severeIssues(lintScene(insetLayout)), []);

assert.equal(validateScene(generalizedBasis).ok, true);
const generalizedLayout = resolveLayout(generalizedBasis);
assert.equal(validateScene(generalizedLayout).ok, true);
assert.ok(!generalizedLayout.objects.some((obj) => obj.type === "group"), "groups should expand before rendering");
assert.deepEqual(severeIssues(lintScene(generalizedLayout)), []);

const capabilityIssues = severeIssues(lintScene(invalidCapability));
assert.ok(capabilityIssues.some((issue) => issue.code === "invalid-expression"));
assert.ok(capabilityIssues.some((issue) => issue.code === "unresolved-reference"));

// False-positive guard: reasonable, well-composed content must pass the gate
// untouched. The hand-authored offline lesson (15 beats) lints with ZERO severe
// issues, so the gate never nukes good content to a fallback.
const offlineScript = offlineDerivativeScript("derivative", [
  { questionId: "background", optionId: "graphs", label: "Functions and graphs" },
]);
let prevOffline: SceneSpec | undefined;
offlineDerivativeLesson.segments.forEach((seg, i) => {
  const laid = resolveLayout(applyShotPattern(seg.scene, offlineScript.beats[i]), { previousScene: prevOffline });
  const severe = severeIssues(lintScene(laid));
  assert.deepEqual(
    severe,
    [],
    `offline beat ${i + 1} (${seg.id}) must lint clean, got: ${severe.map((s) => s.code).join(", ")}`,
  );
  prevOffline = laid;
});

// ---------------------------------------------------------------------------
// Audio-true retimer (lib/syncTimeline.ts): cued steps land on their spoken
// phrase, duration becomes the audio length, warping stays monotonic.
{
  // "Watch a point approach the value on the graph." — ~9 words, one per 500ms.
  const words = "Watch a point approach the value on the graph".split(" ").map((part, i) => ({
    part,
    start: i * 500,
    end: i * 500 + 400,
  }));

  const cueHit = findCueTime(words, "point approach");
  assert.ok(cueHit && Math.abs(cueHit.seconds - 1.0) < 1e-6, "cue phrase should resolve to word start time");

  const cued: SceneSpec = {
    ...cleanGraph,
    timeline: cleanGraph.timeline.map((s) =>
      s.targetId === "p" ? { ...s, cue: "point approach" } : { ...s },
    ),
  };
  const audioSeconds = 4.5; // spoken length differs from the authored 12s
  const retimed = retimeScene(cued, words, audioSeconds);
  assert.equal(retimed.duration, audioSeconds, "scene duration must become the audio length");
  const dotStep = retimed.timeline.find((s) => s.targetId === "p")!;
  assert.ok(Math.abs(dotStep.start - 1.0) < 0.05, `cued step must land on the phrase (got ${dotStep.start})`);
  const sorted = [...retimed.timeline].sort((a, b) => a.start - b.start);
  for (const s of sorted) {
    assert.ok(s.start >= 0 && s.start <= audioSeconds + 1e-6, "warped starts stay inside the audio");
  }
  // No timings available → proportional warp only, still audio-length.
  const stretched = retimeScene(cleanGraph, null, 24);
  assert.equal(stretched.duration, 24);
  assert.ok(stretched.timeline.every((s) => s.start <= 24));
}

// ---------------------------------------------------------------------------
// Polish pass (lib/scenePolish.ts): deterministic, idempotent, and it never
// introduces severe lint issues on clean content.
{
  const once = polishScene(resolveLayout(applyShotPattern(cleanGraph, beat)));
  const twice = polishScene(once);
  assert.deepEqual(twice, once, "polish must be idempotent");
  assert.deepEqual(severeIssues(lintScene(once)), [], "polish must not create severe issues");

  // Blink-cut camera + blob zoom get clamped.
  const zoomy: SceneSpec = {
    ...cleanGraph,
    view: { xMin: -8, xMax: 8, yMin: -4.5, yMax: 4.5 },
    camera: [{ start: 1, duration: 0.3, to: { xMin: 1.9, xMax: 2.4, yMin: 3.8, yMax: 4.2 } }],
  };
  const polished = polishScene(zoomy);
  const move = polished.camera![0];
  assert.ok(move.duration >= 1.2, "camera moves must not blink-cut");
  const area = (move.to.xMax - move.to.xMin) * (move.to.yMax - move.to.yMin);
  assert.ok(area >= 0.2 * 16 * 9, `zoom must stay gentler than the blob threshold (got area ${area.toFixed(1)})`);
}

// Pacing lint: a front-loaded scene with a long frozen tail is flagged (warn).
{
  const frozen: SceneSpec = {
    ...cleanGraph,
    duration: 30,
    timeline: cleanGraph.timeline.map((s) => ({ ...s })), // all motion ends ~3.4s
  };
  const issues = lintScene(resolveLayout(applyShotPattern(frozen, beat)));
  assert.ok(issues.some((i) => i.code === "dead-air" || i.code === "front-loaded"), "frozen tail must be flagged");
  assert.ok(issues.every((i) => i.code !== "dead-air" || i.severity === "warn"), "pacing issues stay warn-level");
}

// ---------------------------------------------------------------------------
// Feature anchors: markers land on TRUE math features, never guessed coords.
{
  const featureScene: SceneSpec = {
    version: 1,
    stage: "graph",
    objects: [
      { type: "function-plot", id: "par", expr: "(x-1)^2 - 2", domain: [-2, 4] },
      { type: "function-plot", id: "line", expr: "x - 1", domain: [-2, 4], color: "#d6c24a" },
      { type: "dot", id: "atMin", at: { x: 0, y: 0 }, place: { kind: "feature", target: "par", feature: "min" } },
      { type: "dot", id: "atRoot", at: { x: 0, y: 0 }, place: { kind: "feature", target: "par", feature: "root", index: 1 } },
      { type: "dot", id: "atCross", at: { x: 0, y: 0 }, place: { kind: "feature", target: "par", feature: "intersection", with: "line" } },
    ],
    timeline: [
      { type: "draw", targetId: "par", start: 0, duration: 1 },
      { type: "draw", targetId: "line", start: 0.5, duration: 1 },
      { type: "draw", targetId: "atMin", start: 1.5, duration: 0.4 },
      { type: "draw", targetId: "atRoot", start: 1.8, duration: 0.4 },
      { type: "draw", targetId: "atCross", start: 2.1, duration: 0.4 },
    ],
    duration: 8,
  };
  const resolved = resolveLayout(featureScene);
  const dot = (id: string) => resolved.objects.find((o) => o.id === id) as Extract<SceneSpec["objects"][number], { type: "dot" }>;
  assert.ok(Math.abs(dot("atMin").at.x - 1) < 0.02 && Math.abs(dot("atMin").at.y - -2) < 0.02, "min lands at vertex (1,-2)");
  assert.ok(Math.abs(dot("atRoot").at.x - (1 + Math.sqrt(2))) < 0.02, "root index 1 lands at 1+sqrt(2)");
  // (x-1)^2 - 2 = x - 1 → x^2 - 3x = 0 → x = 0 or 3; index 0 → x = 0, y = -1.
  assert.ok(Math.abs(dot("atCross").at.x - 0) < 0.02 && Math.abs(dot("atCross").at.y - -1) < 0.05, "intersection lands at (0,-1)");
  assert.deepEqual(severeIssues(lintScene(resolved)), [], "feature-anchor scene lints clean");
}

// ---------------------------------------------------------------------------
// Shot programs: canonical params must build scenes that fly through the whole
// deterministic gate (layout → polish → lint) with ZERO severe issues.
{
  const programBeat = (pattern: string, dur = 22): TeachingBeat => ({
    id: `prog-${pattern}`,
    teachingGoal: "Program smoke beat.",
    narration: "Watch as the point slides closer and closer until the two ideas meet at last.",
    visualIntent: "Program-rendered canonical shot.",
    syncCues: [{ phrase: "closer and closer", visualAction: "slide" }],
    targetDurationSec: dur,
    shotPattern: pattern,
  });

  const cases: { id: string; params: Record<string, unknown> }[] = [
    {
      id: "graph_approach",
      params: {
        fits: true,
        expr: "x^2",
        domain: [-0.5, 3],
        xStart: 2.8,
        xTarget: 1,
        approachLatex: "x \\to 1",
        captionLatex: "f(x) = x^2",
        cueDraw: "watch as",
        cueApproach: "closer and closer",
        cueArrive: "meet at last",
      },
    },
    {
      id: "secant_to_tangent",
      params: {
        fits: true,
        expr: "x^2",
        domain: [-0.5, 3.2],
        xFixed: 1,
        xMovingStart: 2.8,
        slopeBeforeLatex: "\\frac{\\Delta f}{\\Delta x}",
        slopeAfterLatex: "\\frac{df}{dx} = 2x",
        cueSlide: "closer and closer",
        cueArrive: "meet at last",
      },
    },
    {
      id: "equation_transform",
      params: {
        fits: true,
        steps: [
          { latex: "(x+3)^2 = x^2 + 6x + 9", cue: "watch as" },
          { latex: "x^2 + 6x = (x+3)^2 - 9", cue: "closer and closer" },
          { latex: "x^2 + 6x + 5 = (x+3)^2 - 4", cue: "meet at last" },
        ],
        captionText: "Completing the square rewrites the same quantity.",
      },
    },
    {
      id: "number_line_convergence",
      params: {
        fits: true,
        center: 2,
        leftStart: 0.4,
        rightStart: 3.6,
        centerLatex: "L = 2",
        cueSqueeze: "closer and closer",
        cueMeet: "meet at last",
      },
    },
    {
      id: "area_accumulation",
      params: {
        fits: true,
        expr: "0.5*x^2 + 1",
        domain: [0, 4],
        xFrom: 0.5,
        xTo: 3.5,
        barCount: 6,
        areaLatex: "\\int_{0.5}^{3.5} f(x)\\,dx",
        cueBars: "closer and closer",
        cueTotal: "meet at last",
      },
    },
    {
      id: "vector_projection",
      params: {
        fits: true,
        vx: 2,
        vy: 3,
        wx: 4,
        wy: 1,
        vLatex: "\\vec v",
        wLatex: "\\vec w",
        projLatex: "\\text{proj}_{\\vec w}\\vec v",
        cueDrop: "closer and closer",
        cueProjection: "meet at last",
      },
    },
    {
      id: "probability_bar",
      params: {
        fits: true,
        segments: [
          { label: "A", weight: 3 },
          { label: "B", weight: 5 },
          { label: "C", weight: 2 },
        ],
        highlightIndex: 0,
        highlightLatex: "P(A) = 0.3",
        cueBar: "watch as",
        cueHighlight: "closer and closer",
      },
    },
  ];

  for (const { id, params } of cases) {
    const prog = SHOT_PROGRAMS.find((p) => p.id === id)!;
    const patternBeat = programBeat(prog.pattern);
    const built = runProgram(prog, params, patternBeat);
    assert.ok(built, `${id} must build from canonical params`);
    const gated = polishScene(resolveLayout(applyShotPattern(built!, patternBeat)));
    const severe = severeIssues(lintScene(gated));
    assert.deepEqual(severe, [], `${id} program scene must lint clean, got: ${severe.map((s) => `${s.code}(${s.objectIds?.join("/")})`).join(", ")}`);
    assert.ok(built!.timeline.some((s) => s.cue), `${id} must carry cue phrases for the retimer`);
    // fits=false → freeform fallback.
    assert.equal(runProgram(prog, { ...params, fits: false }, patternBeat), null, `${id} must respect fits=false`);
  }
  // Bad math → null → freeform fallback, never a broken scene.
  const ga = SHOT_PROGRAMS.find((p) => p.id === "graph_approach")!;
  assert.equal(
    runProgram(ga, { fits: true, expr: "x^^2!!", domain: [0, 2], xStart: 0, xTarget: 1 }, programBeat("graph-approach")),
    null,
    "invalid expr must fall back to freeform",
  );
}

console.log("visual QA smoke tests passed");
