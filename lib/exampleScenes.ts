import type { SceneSpec } from "@/types/scene";

/**
 * The visual-quality benchmark scene: bend a flat baseline into f(x) = x^2,
 * trace a point along the curve to x = 1, draw the tangent line there, and
 * transform the equation f(x)=x^2 -> f'(x)=2x. Hand-authored to set the bar
 * before Claude generates these live.
 */
export const derivativeDemo: SceneSpec = {
  version: 1,
  title: "Lumen — derivative of f(x) = x²",
  view: { xMin: -4, xMax: 4, yMin: -1.5, yMax: 9 },
  background: "#0b0e16",
  objects: [
    {
      type: "axes",
      id: "ax",
      xRange: [-3.5, 3.5],
      yRange: [-1, 8.5],
      step: 1,
      showGrid: true,
      xLabel: "x",
      yLabel: "y",
    },
    {
      type: "function-plot",
      id: "parabola",
      expr: "0",
      domain: [-3, 3],
      color: "#5cc8ff",
      width: 4,
    },
    {
      type: "function-plot",
      id: "tangent",
      expr: "2*x - 1",
      domain: [-0.3, 2.6],
      color: "#86efac",
      width: 3,
    },
    { type: "dot", id: "pt", at: { x: -2, y: 4 }, radius: 9, color: "#ffd166" },
    {
      type: "equation",
      id: "eq",
      latex: "f(x) = x^2",
      at: { x: -3.2, y: 7.8 },
      fontSize: 46,
      anchor: "start",
    },
    {
      type: "label",
      id: "slope",
      text: "slope = f′(1) = 2",
      at: { x: 2.7, y: 3.6 },
      color: "#86efac",
      fontSize: 26,
      anchor: "start",
    },
  ],
  timeline: [
    { type: "draw", targetId: "ax", start: 0, duration: 1.0 },
    { type: "draw", targetId: "parabola", start: 0.9, duration: 0.6 },
    { type: "morph", targetId: "parabola", start: 1.5, duration: 2.2, toExpr: "x^2" },
    { type: "fadeIn", targetId: "eq", start: 1.7, duration: 0.6 },
    { type: "draw", targetId: "pt", start: 3.5, duration: 0.4 },
    { type: "trace", targetId: "pt", start: 3.8, duration: 1.8, plotId: "parabola", fromX: -2, toX: 1 },
    { type: "draw", targetId: "tangent", start: 5.5, duration: 0.9 },
    { type: "fadeIn", targetId: "slope", start: 6.2, duration: 0.5 },
    { type: "transform", targetId: "eq", start: 6.8, duration: 0.8, toLatex: "f'(x) = 2x" },
    { type: "highlight", targetId: "pt", start: 6.8, duration: 0.6 },
  ],
  duration: 8,
};
