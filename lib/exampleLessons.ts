import type { Lesson } from "@/types/lesson";

const view = { xMin: -4, xMax: 4, yMin: -1.5, yMax: 9 };
const axes = {
  type: "axes" as const,
  id: "ax",
  xRange: [-3.5, 3.5] as [number, number],
  yRange: [-1, 8.5] as [number, number],
  step: 1,
  showGrid: true,
  xLabel: "x",
  yLabel: "y",
};
const parabola = {
  type: "function-plot" as const,
  id: "parabola",
  expr: "x^2",
  domain: [-3, 3] as [number, number],
  color: "#5cc8ff",
  width: 4,
};
const morphingParabola = {
  ...parabola,
  expr: "0",
};

/**
 * A hand-authored 3-segment lesson so the player works with no API key (the
 * offline demo / visual-quality bar). Mirrors what /api/lesson should produce.
 */
export const derivativeLesson: Lesson = {
  version: 1,
  topic: "Introduction to derivatives",
  title: "What is a derivative?",
  segments: [
    {
      id: "seg-curve",
      narration:
        "Let's begin with a flat baseline, then let it bend into f of x equals x squared. Watch the middle stay pinned at zero while both sides sweep upward into a parabola.",
      scene: {
        version: 1,
        view,
        objects: [
          axes,
          morphingParabola,
          { type: "equation", id: "eq", latex: "y = 0", at: { x: -3.2, y: 7.8 }, fontSize: 44, anchor: "start" },
        ],
        timeline: [
          { type: "draw", targetId: "ax", start: 0, duration: 1.0 },
          { type: "draw", targetId: "parabola", start: 0.8, duration: 0.7 },
          { type: "fadeIn", targetId: "eq", start: 1.0, duration: 0.5 },
          { type: "morph", targetId: "parabola", start: 1.7, duration: 2.6, toExpr: "x^2" },
          { type: "transform", targetId: "eq", start: 1.8, duration: 1.0, toLatex: "f(x) = x^2" },
        ],
        duration: 4.6,
      },
    },
    {
      id: "seg-tangent",
      narration:
        "Now slide a point along the curve. Near the bottom, the motion is almost level; by the time it reaches x equals one, the curve is climbing. The tangent line captures that instant of climbing.",
      scene: {
        version: 1,
        view,
        objects: [
          axes,
          parabola,
          { type: "dot", id: "pt", at: { x: -2, y: 4 }, radius: 9, color: "#ffd166" },
          { type: "function-plot", id: "tangent", expr: "2*x - 1", domain: [-0.3, 2.6], color: "#86efac", width: 3 },
          { type: "label", id: "slope", text: "slope = 2", at: { x: 2.6, y: 3.4 }, color: "#86efac", fontSize: 26, anchor: "start" },
        ],
        timeline: [
          { type: "draw", targetId: "ax", start: 0, duration: 0.8 },
          { type: "draw", targetId: "parabola", start: 0.5, duration: 1.0 },
          { type: "draw", targetId: "pt", start: 1.4, duration: 0.4 },
          { type: "trace", targetId: "pt", start: 1.7, duration: 2.2, plotId: "parabola", fromX: -2, toX: 1 },
          { type: "draw", targetId: "tangent", start: 3.8, duration: 1.0 },
          { type: "fadeIn", targetId: "slope", start: 4.7, duration: 0.5 },
        ],
        duration: 5.4,
      },
    },
    {
      id: "seg-derivative",
      narration:
        "That tangent slope changes from point to point. If we collect those slopes into a new function, the curve f of x equals x squared turns into the derivative, two x.",
      scene: {
        version: 1,
        view: { xMin: -4, xMax: 4, yMin: -4.5, yMax: 8 },
        objects: [
          { ...axes, yRange: [-4, 7.5] as [number, number] },
          {
            type: "function-plot",
            id: "derivative",
            expr: "x^2",
            domain: [-3, 3] as [number, number],
            color: "#5cc8ff",
            width: 4,
          },
          { type: "equation", id: "eq", latex: "f(x) = x^2", at: { x: -3.2, y: 7.8 }, fontSize: 44, anchor: "start" },
          { type: "label", id: "note", text: "slope as a function", at: { x: -3.2, y: 6.4 }, color: "#9aa4b6", fontSize: 22, anchor: "start" },
        ],
        timeline: [
          { type: "draw", targetId: "ax", start: 0, duration: 0.6 },
          { type: "draw", targetId: "derivative", start: 0.4, duration: 0.8 },
          { type: "fadeIn", targetId: "eq", start: 1.0, duration: 0.5 },
          { type: "morph", targetId: "derivative", start: 1.8, duration: 2.4, toExpr: "2*x", toDomain: [-3, 3] },
          { type: "transform", targetId: "eq", start: 1.8, duration: 0.9, toLatex: "f'(x) = 2x" },
          { type: "fadeIn", targetId: "note", start: 2.4, duration: 0.5 },
        ],
        duration: 4.6,
      },
    },
  ],
};
