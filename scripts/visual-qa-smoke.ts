import assert from "node:assert/strict";

import { resolveLayout } from "@/lib/layout";
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

console.log("visual QA smoke tests passed");
