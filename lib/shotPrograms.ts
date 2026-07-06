/**
 * Shot programs — deterministic, hand-choreographed scene templates.
 *
 * This is the area-model insight applied to WHOLE shots: instead of freehanding
 * ~40 objects + 60 timeline steps + coordinates + seconds, the model fills a
 * tiny typed param object (the math content + verbatim cue phrases) and a pure
 * TS program emits the full canonical SceneSpec with professional choreography
 * baked in — entry order, camera arc, emphasis moment, label hygiene. On a
 * program beat, overlap/dead-air/dangling-ref errors are impossible by
 * construction, output tokens drop ~10×, and the choreography ceiling is ours,
 * not the cheap model's.
 *
 * Every program:
 *  - has a zod param schema with a `fits` escape hatch (the model sets
 *    fits=false when the beat genuinely isn't this shot → freeform compose);
 *  - pre-validates its math (bad expr → null → freeform fallback);
 *  - emits an ordinary SceneSpec that still flows through layout → polish →
 *    QA → sanitize like any other scene (defense in depth, nothing bypassed);
 *  - copies cue phrases into step `cue` fields so the audio-true retimer
 *    (lib/syncTimeline.ts) lands each action on the spoken words.
 */

import { z } from "zod";

import { compileExpr } from "@/lib/mathEval";
import type { ShotPatternName } from "@/lib/shotPatterns";
import type { TeachingBeat } from "@/types/planning";
import type { AnimationStep, SceneObject, SceneSpec, View } from "@/types/scene";

const num = z.number().finite();
const cue = z.string().min(1).max(120);
const latex = z.string().min(1).max(300);
const expr = z.string().min(1).max(200);

const CURVE = "#4cc9d9"; // house blue (renderer default, stated for clarity)
const ACCENT = "#d6c24a"; // house yellow
const HELPER = "#e88a5a"; // secant/helper orange

// ---------------------------------------------------------------------------
// Shared math/view helpers

function sampleY(fnExpr: string, domain: [number, number]): { yMin: number; yMax: number } | null {
  const fn = compileExpr(fnExpr);
  if (!fn) return null;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i <= 160; i++) {
    const x = domain[0] + ((domain[1] - domain[0]) * i) / 160;
    const y = fn(x);
    if (Number.isFinite(y)) {
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
  }
  return yMin < yMax ? { yMin, yMax } : yMin === yMax ? { yMin: yMin - 1, yMax: yMax + 1 } : null;
}

/** 16:9 view around a data rect with margin (mirror of layout's fitting). */
function makeView(xMin: number, xMax: number, yMin: number, yMax: number): View {
  const mx = (xMax - xMin) * 0.14 + 0.5;
  const my = (yMax - yMin) * 0.14 + 0.5;
  let w = xMax - xMin + mx * 2;
  let h = yMax - yMin + my * 2;
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  if (w / h < 16 / 9) w = h * (16 / 9);
  else h = w / (16 / 9);
  return { xMin: cx - w / 2, xMax: cx + w / 2, yMin: cy - h / 2, yMax: cy + h / 2 };
}

/** Camera target: a gentle push toward a point (55% linear ≈ 30% area — safe above the blob clamp). */
function pushInView(view: View, focus: { x: number; y: number }, linear = 0.55): View {
  const w = (view.xMax - view.xMin) * linear;
  const h = (view.yMax - view.yMin) * linear;
  // Keep the target rect inside the base view so context never leaves frame.
  const cx = Math.max(view.xMin + w / 2, Math.min(view.xMax - w / 2, focus.x));
  const cy = Math.max(view.yMin + h / 2, Math.min(view.yMax - h / 2, focus.y));
  return { xMin: cx - w / 2, xMax: cx + w / 2, yMin: cy - h / 2, yMax: cy + h / 2 };
}

const evalAt = (fnExpr: string, x: number): number | null => {
  const fn = compileExpr(fnExpr);
  const y = fn?.(x);
  return Number.isFinite(y) ? (y as number) : null;
};

// ---------------------------------------------------------------------------
// Program: graph-approach — a marker travels along one curve toward a target
// point while the camera pushes in; the canonical "approach a value" shot.

const graphApproachParams = z.object({
  fits: z
    .boolean()
    .describe("true ONLY if this beat is 'a point/marker approaches a location on ONE plotted curve'. Otherwise false."),
  expr: expr.describe("The curve, as a safe expression in x (e.g. 'x^2', 'sin(x)')."),
  domain: z.tuple([num, num]).describe("x-domain to plot."),
  xStart: num.describe("Where the moving point starts (x, on the curve)."),
  xTarget: num.describe("Where it approaches (x, on the curve)."),
  approachLatex: latex.optional().describe("Optional short side label, e.g. 'x \\\\to 2'."),
  captionLatex: latex.optional().describe("Optional key-claim caption shown while the board builds."),
  xLabel: z.string().max(24).optional(),
  yLabel: z.string().max(24).optional(),
  cueDraw: cue.optional().describe("Verbatim narration phrase for when the curve is drawn."),
  cueApproach: cue.optional().describe("Verbatim phrase for when the point starts moving."),
  cueArrive: cue.optional().describe("Verbatim phrase for the arrival/emphasis moment."),
});
type GraphApproachParams = z.infer<typeof graphApproachParams>;

function buildGraphApproach(p: GraphApproachParams, beat: TeachingBeat): SceneSpec | null {
  const range = sampleY(p.expr, p.domain);
  const yTarget = evalAt(p.expr, p.xTarget);
  if (!range || yTarget === null) return null;
  const D = beat.targetDurationSec;
  const view = makeView(Math.min(...p.domain), Math.max(...p.domain), range.yMin, range.yMax);

  const objects: SceneObject[] = [
    {
      type: "axes",
      id: "ax",
      xRange: [Math.min(...p.domain), Math.max(...p.domain)],
      yRange: [range.yMin, range.yMax],
      showGrid: true,
      xLabel: p.xLabel,
      yLabel: p.yLabel,
      emphasizeTicks: [{ axis: "x", value: p.xTarget, color: ACCENT }],
    },
    { type: "function-plot", id: "curve", expr: p.expr, domain: p.domain, color: CURVE, width: 4 },
    { type: "dot", id: "target", at: { x: p.xTarget, y: yTarget }, radius: 9, color: ACCENT, filled: false, place: { kind: "on", target: "curve", x: p.xTarget } },
    { type: "dot", id: "mover", at: { x: p.xStart, y: 0 }, radius: 8, color: ACCENT, place: { kind: "on", target: "curve", x: p.xStart } },
  ];
  if (p.approachLatex) objects.push({ type: "equation", id: "sideEq", latex: p.approachLatex, at: { x: 0, y: 0 }, region: "rail" });
  if (p.captionLatex) objects.push({ type: "equation", id: "caption", latex: p.captionLatex, at: { x: 0, y: 0 }, region: "caption" });

  const traceStart = D * 0.34;
  const traceDur = D * 0.4;
  const pushStart = D * 0.52;
  const timeline: AnimationStep[] = [
    { type: "draw", targetId: "ax", start: 0, duration: 0.9 },
    { type: "draw", targetId: "curve", start: 0.8, duration: 1.6, cue: p.cueDraw },
    { type: "draw", targetId: "target", start: D * 0.2, duration: 0.5 },
    { type: "draw", targetId: "mover", start: D * 0.26, duration: 0.4 },
    { type: "trace", targetId: "mover", plotId: "curve", fromX: p.xStart, toX: p.xTarget, start: traceStart, duration: traceDur, cue: p.cueApproach },
    { type: "emphasize", targetId: "mover", scaleTo: 1.5, start: traceStart + traceDur, duration: Math.max(0.8, D * 0.08), cue: p.cueArrive },
  ];
  if (p.approachLatex) {
    timeline.push({ type: "fadeIn", targetId: "sideEq", start: D * 0.18, duration: 0.5 });
    timeline.push({ type: "fadeOut", targetId: "sideEq", start: pushStart - 0.4, duration: 0.4 });
  }
  if (p.captionLatex) {
    timeline.push({ type: "fadeIn", targetId: "caption", start: D * 0.1, duration: 0.5 });
    timeline.push({ type: "fadeOut", targetId: "caption", start: pushStart - 0.4, duration: 0.4 });
  }

  return {
    version: 1,
    stage: "graph",
    shotPattern: "graph-approach",
    view,
    camera: [{ start: pushStart, duration: Math.max(1.5, D * 0.22), to: pushInView(view, { x: p.xTarget, y: yTarget }) }],
    objects,
    timeline,
    duration: D,
  };
}

// ---------------------------------------------------------------------------
// Program: secant-to-tangent — the canonical limit picture: a secant's moving
// endpoint slides into the fixed point and the chord becomes the tangent.

const secantToTangentParams = z.object({
  fits: z
    .boolean()
    .describe("true ONLY if this beat is 'a secant/chord through two points on a curve becomes the tangent as the points merge'."),
  expr: expr.describe("The curve, as a safe expression in x."),
  domain: z.tuple([num, num]),
  xFixed: num.describe("x of the fixed point (where the tangent lives)."),
  xMovingStart: num.describe("x where the moving second point starts."),
  slopeBeforeLatex: latex.optional().describe("Optional side equation before the slide, e.g. average rate."),
  slopeAfterLatex: latex.optional().describe("Optional equation it transforms into at arrival, e.g. the derivative."),
  cueDraw: cue.optional(),
  cueSecant: cue.optional().describe("Verbatim phrase for when the secant appears."),
  cueSlide: cue.optional().describe("Verbatim phrase for the slide toward the fixed point."),
  cueArrive: cue.optional().describe("Verbatim phrase for the tangent moment."),
});
type SecantToTangentParams = z.infer<typeof secantToTangentParams>;

function buildSecantToTangent(p: SecantToTangentParams, beat: TeachingBeat): SceneSpec | null {
  const range = sampleY(p.expr, p.domain);
  const yFixed = evalAt(p.expr, p.xFixed);
  if (!range || yFixed === null || evalAt(p.expr, p.xMovingStart) === null) return null;
  const D = beat.targetDurationSec;
  const view = makeView(Math.min(...p.domain), Math.max(...p.domain), range.yMin, range.yMax);
  // Visually tangent, numerically still a chord (renderer needs two points).
  const xArrive = p.xFixed + (p.xMovingStart > p.xFixed ? 0.03 : -0.03);

  const objects: SceneObject[] = [
    {
      type: "axes",
      id: "ax",
      xRange: [Math.min(...p.domain), Math.max(...p.domain)],
      yRange: [range.yMin, range.yMax],
      showGrid: true,
      emphasizeTicks: [{ axis: "x", value: p.xFixed, color: ACCENT }],
    },
    { type: "function-plot", id: "curve", expr: p.expr, domain: p.domain, color: CURVE, width: 4 },
    { type: "dot", id: "fixed", at: { x: p.xFixed, y: yFixed }, radius: 9, color: ACCENT, place: { kind: "on", target: "curve", x: p.xFixed } },
    { type: "dot", id: "moving", at: { x: p.xMovingStart, y: 0 }, radius: 8, color: HELPER, place: { kind: "on", target: "curve", x: p.xMovingStart } },
    { type: "secant-line", id: "sec", plotId: "curve", x1: p.xFixed, x2: p.xMovingStart, extend: 1.2, color: HELPER, width: 3 },
  ];
  if (p.slopeBeforeLatex) objects.push({ type: "equation", id: "slopeEq", latex: p.slopeBeforeLatex, at: { x: 0, y: 0 }, region: "rail" });

  // Choreography: build → slide into tangency ON the cue → the equation
  // transforms at that instant and gets read → text fades → the camera push
  // on the tangent point is the closing button of the shot (region text and
  // whole-scene zooms never coexist — that's the clip failure).
  const slideStart = D * 0.38;
  const slideDur = D * 0.28;
  const arriveAt = slideStart + slideDur;
  const pushStart = D * 0.86;
  const timeline: AnimationStep[] = [
    { type: "draw", targetId: "ax", start: 0, duration: 0.9 },
    { type: "draw", targetId: "curve", start: 0.8, duration: 1.6, cue: p.cueDraw },
    { type: "draw", targetId: "fixed", start: D * 0.16, duration: 0.4 },
    { type: "draw", targetId: "moving", start: D * 0.2, duration: 0.4 },
    { type: "draw", targetId: "sec", start: D * 0.24, duration: 0.8, cue: p.cueSecant },
    { type: "slide", targetId: "sec", toX1: p.xFixed, toX2: xArrive, start: slideStart, duration: slideDur, cue: p.cueSlide },
    { type: "trace", targetId: "moving", plotId: "curve", fromX: p.xMovingStart, toX: xArrive, start: slideStart, duration: slideDur },
    { type: "emphasize", targetId: "sec", scaleTo: 1.15, color: ACCENT, start: arriveAt, duration: Math.max(0.8, D * 0.08), cue: p.cueArrive },
  ];
  if (p.slopeBeforeLatex) {
    timeline.push({ type: "fadeIn", targetId: "slopeEq", start: D * 0.28, duration: 0.5 });
    if (p.slopeAfterLatex) {
      timeline.push({ type: "transform", targetId: "slopeEq", toLatex: p.slopeAfterLatex, start: arriveAt, duration: 1.2, cue: p.cueArrive });
    }
    timeline.push({ type: "fadeOut", targetId: "slopeEq", start: pushStart - 0.5, duration: 0.45 });
  }

  return {
    version: 1,
    stage: "graph",
    shotPattern: "secant-to-tangent",
    view,
    camera: [{ start: pushStart, duration: Math.max(1.5, D * 0.13), to: pushInView(view, { x: p.xFixed, y: yFixed }, 0.6) }],
    objects,
    timeline,
    duration: D,
  };
}

// ---------------------------------------------------------------------------
// Program: equation-transform — a clean statement board where ONE equation
// evolves through 2–5 stages, each landing on its narration phrase.

const equationTransformParams = z.object({
  fits: z
    .boolean()
    .describe("true ONLY if this beat is 'one formula/equation evolving step by step on a clean board'."),
  steps: z
    .array(z.object({ latex, cue: cue.optional().describe("Verbatim narration phrase for when this form appears.") }))
    .min(2)
    .max(5)
    .describe("The equation's stages in order; each transforms into the next."),
  captionText: z.string().max(160).optional().describe("Optional one-line plain-text takeaway shown near the end."),
});
type EquationTransformParams = z.infer<typeof equationTransformParams>;

function buildEquationTransform(p: EquationTransformParams, beat: TeachingBeat): SceneSpec | null {
  const D = beat.targetDurationSec;
  const objects: SceneObject[] = [
    { type: "equation", id: "eq", latex: p.steps[0].latex, at: { x: 0, y: 0.6 }, fontSize: 48, region: "statement" },
  ];
  if (p.captionText) objects.push({ type: "label", id: "caption", text: p.captionText, at: { x: 0, y: 0 }, region: "caption" });

  const n = p.steps.length;
  // First form fades in early; each later form is a transform landing evenly
  // across the beat (the retimer snaps them to their cue phrases).
  const timeline: AnimationStep[] = [
    { type: "fadeIn", targetId: "eq", start: D * 0.06, duration: 0.8, cue: p.steps[0].cue },
  ];
  for (let i = 1; i < n; i++) {
    const start = D * (0.12 + (0.72 * i) / n);
    timeline.push({ type: "transform", targetId: "eq", toLatex: p.steps[i].latex, start, duration: 1.3, cue: p.steps[i].cue });
  }
  timeline.push({ type: "highlight", targetId: "eq", start: D * 0.88, duration: 1.0, color: ACCENT });
  if (p.captionText) timeline.push({ type: "fadeIn", targetId: "caption", start: D * 0.78, duration: 0.6 });

  return {
    version: 1,
    stage: "statement",
    shotPattern: "equation-transform",
    objects,
    timeline,
    duration: D,
  };
}

// ---------------------------------------------------------------------------
// Program: number-line-convergence — two markers squeeze onto a limit point
// from both sides of a number line; the canonical two-sided-limit picture.

const numberLineParams = z.object({
  fits: z
    .boolean()
    .describe("true ONLY if this beat is 'values approach one point from both sides on a number line'."),
  center: num.describe("The limit/target value L."),
  leftStart: num.describe("Where the left marker starts (must be < center)."),
  rightStart: num.describe("Where the right marker starts (must be > center)."),
  tickStep: num.positive().max(100).optional().describe("Tick spacing (default auto)."),
  centerLatex: latex.optional().describe("Optional label for the target, e.g. 'L = 2'."),
  cueLine: cue.optional(),
  cueSqueeze: cue.optional().describe("Verbatim phrase for when both markers move inward."),
  cueMeet: cue.optional().describe("Verbatim phrase for the meeting moment."),
});
type NumberLineParams = z.infer<typeof numberLineParams>;

function buildNumberLine(p: NumberLineParams, beat: TeachingBeat): SceneSpec | null {
  if (!(p.leftStart < p.center && p.center < p.rightStart)) return null;
  const D = beat.targetDurationSec;
  const span = p.rightStart - p.leftStart;
  const xMin = p.leftStart - span * 0.18;
  const xMax = p.rightStart + span * 0.18;
  const view = makeView(xMin, xMax, -span * 0.12, span * 0.12);
  const gap = span * 0.012; // visually "meets" without physically stacking

  const objects: SceneObject[] = [
    {
      type: "axes",
      id: "line",
      xRange: [xMin, xMax],
      yRange: [0, 0.001], // a pure number line: no vertical axis to speak of
      step: p.tickStep,
      showGrid: false,
      emphasizeTicks: [{ axis: "x", value: p.center, color: ACCENT }],
    },
    { type: "dot", id: "target", at: { x: p.center, y: 0 }, radius: 9, color: ACCENT, filled: false },
    { type: "dot", id: "left", at: { x: p.leftStart, y: 0 }, radius: 8, color: CURVE },
    { type: "dot", id: "right", at: { x: p.rightStart, y: 0 }, radius: 8, color: HELPER },
    { type: "arrow", id: "leftArrow", from: { x: p.leftStart, y: span * 0.07 }, to: { x: p.center - span * 0.06, y: span * 0.07 }, color: CURVE, width: 2, dash: [8, 7] },
    { type: "arrow", id: "rightArrow", from: { x: p.rightStart, y: span * 0.07 }, to: { x: p.center + span * 0.06, y: span * 0.07 }, color: HELPER, width: 2, dash: [8, 7] },
  ];
  if (p.centerLatex) objects.push({ type: "equation", id: "centerEq", latex: p.centerLatex, at: { x: 0, y: 0 }, region: "topStrip" });

  const squeezeStart = D * 0.36;
  const squeezeDur = D * 0.36;
  const meetAt = squeezeStart + squeezeDur;
  const pushStart = squeezeStart + squeezeDur * 0.35;
  const timeline: AnimationStep[] = [
    { type: "draw", targetId: "line", start: 0, duration: 0.9, cue: p.cueLine },
    { type: "draw", targetId: "target", start: D * 0.14, duration: 0.4 },
    { type: "draw", targetId: "left", start: D * 0.18, duration: 0.35 },
    { type: "draw", targetId: "right", start: D * 0.22, duration: 0.35 },
    { type: "draw", targetId: "leftArrow", start: D * 0.26, duration: 0.6 },
    { type: "draw", targetId: "rightArrow", start: D * 0.28, duration: 0.6 },
    { type: "move", targetId: "left", to: { x: p.center - gap, y: 0 }, start: squeezeStart, duration: squeezeDur, cue: p.cueSqueeze },
    { type: "move", targetId: "right", to: { x: p.center + gap, y: 0 }, start: squeezeStart + 0.2, duration: squeezeDur - 0.2 },
    { type: "fadeOut", targetId: "leftArrow", start: meetAt - 0.6, duration: 0.5 },
    { type: "fadeOut", targetId: "rightArrow", start: meetAt - 0.6, duration: 0.5 },
    { type: "emphasize", targetId: "target", scaleTo: 1.6, start: meetAt, duration: Math.max(0.8, D * 0.08), cue: p.cueMeet },
  ];
  if (p.centerLatex) {
    timeline.push({ type: "fadeIn", targetId: "centerEq", start: D * 0.1, duration: 0.5 });
    // Region text and whole-scene zooms never coexist (clip failure) — the
    // label has been read by squeeze time; the emphasized tick carries on.
    timeline.push({ type: "fadeOut", targetId: "centerEq", start: pushStart - 0.5, duration: 0.45 });
  }

  return {
    version: 1,
    stage: "split",
    shotPattern: "number-line-convergence",
    view,
    camera: [{ start: pushStart, duration: Math.max(1.5, D * 0.25), to: pushInView(view, { x: p.center, y: 0 }, 0.55) }],
    objects,
    timeline,
    duration: D,
  };
}

// ---------------------------------------------------------------------------
// Program: area-accumulation — bars fill the region under a curve one by one;
// perfectly tiled Riemann rectangles, computed (never eyeballed).

const areaAccumulationParams = z.object({
  fits: z
    .boolean()
    .describe("true ONLY if this beat is 'accumulating area under one curve' (Riemann bars, integral intuition)."),
  expr: expr.describe("The curve, safe expression in x. Should stay one-signed on [xFrom, xTo] for a clean picture."),
  domain: z.tuple([num, num]).describe("x-domain to plot (wider than the shaded part is fine)."),
  xFrom: num.describe("Left edge of the accumulated region."),
  xTo: num.describe("Right edge of the accumulated region."),
  barCount: z.number().int().min(3).max(12).describe("How many bars to tile the region with."),
  areaLatex: latex.optional().describe("Optional caption equation, e.g. an integral."),
  cueDraw: cue.optional(),
  cueBars: cue.optional().describe("Verbatim phrase for when the bars start filling in."),
  cueTotal: cue.optional().describe("Verbatim phrase for the total-area moment."),
});
type AreaAccumulationParams = z.infer<typeof areaAccumulationParams>;

function buildAreaAccumulation(p: AreaAccumulationParams, beat: TeachingBeat): SceneSpec | null {
  const range = sampleY(p.expr, p.domain);
  const fn = compileExpr(p.expr);
  if (!range || !fn || !(p.xTo > p.xFrom)) return null;
  const D = beat.targetDurationSec;
  const view = makeView(Math.min(...p.domain), Math.max(...p.domain), Math.min(0, range.yMin), Math.max(0, range.yMax));

  const objects: SceneObject[] = [
    {
      type: "axes",
      id: "ax",
      xRange: [Math.min(...p.domain), Math.max(...p.domain)],
      yRange: [Math.min(0, range.yMin), Math.max(0, range.yMax)],
      showGrid: true,
      emphasizeTicks: [
        { axis: "x", value: p.xFrom, color: ACCENT },
        { axis: "x", value: p.xTo, color: ACCENT },
      ],
    },
    { type: "function-plot", id: "curve", expr: p.expr, domain: p.domain, color: CURVE, width: 4 },
  ];

  const dx = (p.xTo - p.xFrom) / p.barCount;
  const barIds: string[] = [];
  for (let i = 0; i < p.barCount; i++) {
    const xMid = p.xFrom + dx * (i + 0.5);
    const y = fn(xMid);
    if (!Number.isFinite(y) || Math.abs(y) < 1e-9) continue;
    const id = `bar${i}`;
    barIds.push(id);
    objects.push({
      type: "box",
      id,
      at: { x: xMid, y: y / 2 },
      width: dx * 0.94,
      height: Math.abs(y),
      radius: 0,
      fill: "rgba(76,201,217,0.28)",
      stroke: CURVE,
      strokeWidth: 1.5,
    });
  }
  if (!barIds.length) return null;
  if (p.areaLatex) objects.push({ type: "equation", id: "areaEq", latex: p.areaLatex, at: { x: 0, y: 0 }, region: "caption" });

  const barsStart = D * 0.3;
  const barsWindow = D * 0.42;
  const per = barsWindow / barIds.length;
  const timeline: AnimationStep[] = [
    { type: "draw", targetId: "ax", start: 0, duration: 0.9 },
    { type: "draw", targetId: "curve", start: 0.8, duration: 1.6, cue: p.cueDraw },
    ...barIds.map((id, i) => ({
      type: "fadeIn" as const,
      targetId: id,
      start: barsStart + per * i,
      duration: Math.max(0.35, per * 0.9),
      ...(i === 0 ? { cue: p.cueBars } : {}),
    })),
    { type: "highlight", targetId: "curve", start: barsStart + barsWindow, duration: 1.0, color: ACCENT, cue: p.cueTotal },
  ];
  if (p.areaLatex) timeline.push({ type: "fadeIn", targetId: "areaEq", start: barsStart + barsWindow * 0.7, duration: 0.6 });

  return {
    version: 1,
    stage: "graph",
    shotPattern: "area-accumulation",
    view,
    objects,
    timeline,
    duration: D,
  };
}

// ---------------------------------------------------------------------------
// Program: vector-projection — v and w from the origin; the projection of v
// onto w drops in with its perpendicular helper. All geometry computed.

const vectorProjectionParams = z.object({
  fits: z
    .boolean()
    .describe("true ONLY if this beat is 'project one vector onto another' (shadow/component picture)."),
  vx: num,
  vy: num,
  wx: num,
  wy: num,
  vLatex: latex.optional().describe("Optional label for v, e.g. '\\\\vec v'."),
  wLatex: latex.optional().describe("Optional label for w."),
  projLatex: latex.optional().describe("Optional side equation for the projection formula."),
  cueVectors: cue.optional(),
  cueDrop: cue.optional().describe("Verbatim phrase for when the perpendicular drops."),
  cueProjection: cue.optional().describe("Verbatim phrase for the projection reveal."),
});
type VectorProjectionParams = z.infer<typeof vectorProjectionParams>;

function buildVectorProjection(p: VectorProjectionParams, beat: TeachingBeat): SceneSpec | null {
  const w2 = p.wx * p.wx + p.wy * p.wy;
  const v2 = p.vx * p.vx + p.vy * p.vy;
  if (w2 < 1e-9 || v2 < 1e-9) return null;
  const k = (p.vx * p.wx + p.vy * p.wy) / w2;
  const proj = { x: k * p.wx, y: k * p.wy };
  const D = beat.targetDurationSec;

  const xs = [0, p.vx, p.wx, proj.x];
  const ys = [0, p.vy, p.wy, proj.y];
  const view = makeView(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys));

  const objects: SceneObject[] = [
    {
      type: "axes",
      id: "ax",
      xRange: [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5],
      yRange: [Math.min(...ys) - 0.5, Math.max(...ys) + 0.5],
      showGrid: true,
    },
    { type: "arrow", id: "w", from: { x: 0, y: 0 }, to: { x: p.wx, y: p.wy }, color: CURVE, width: 4 },
    { type: "arrow", id: "v", from: { x: 0, y: 0 }, to: { x: p.vx, y: p.vy }, color: ACCENT, width: 4 },
    { type: "arrow", id: "drop", from: { x: p.vx, y: p.vy }, to: proj, color: "#9aa4b2", width: 2, dash: [7, 7], head: false },
    { type: "arrow", id: "proj", from: { x: 0, y: 0 }, to: proj, color: HELPER, width: 5 },
    { type: "dot", id: "foot", at: proj, radius: 6, color: HELPER },
  ];
  if (p.vLatex) objects.push({ type: "equation", id: "vLabel", latex: p.vLatex, at: { x: p.vx, y: p.vy }, callout: { anchorTo: "v" } });
  if (p.wLatex) objects.push({ type: "equation", id: "wLabel", latex: p.wLatex, at: { x: p.wx, y: p.wy }, callout: { anchorTo: "w" } });
  if (p.projLatex) objects.push({ type: "equation", id: "projEq", latex: p.projLatex, at: { x: 0, y: 0 }, region: "caption" });

  const dropAt = D * 0.42;
  const projAt = D * 0.58;
  const timeline: AnimationStep[] = [
    { type: "draw", targetId: "ax", start: 0, duration: 0.9 },
    { type: "draw", targetId: "w", start: D * 0.12, duration: 0.9, cue: p.cueVectors },
    { type: "draw", targetId: "v", start: D * 0.2, duration: 0.9 },
    { type: "draw", targetId: "drop", start: dropAt, duration: 1.0, cue: p.cueDrop },
    { type: "draw", targetId: "foot", start: dropAt + 0.9, duration: 0.35 },
    { type: "draw", targetId: "proj", start: projAt, duration: 1.1, cue: p.cueProjection },
    { type: "emphasize", targetId: "proj", scaleTo: 1.12, start: projAt + 1.3, duration: Math.max(0.8, D * 0.08) },
  ];
  if (p.vLatex) timeline.push({ type: "fadeIn", targetId: "vLabel", start: D * 0.3, duration: 0.4 });
  if (p.wLatex) timeline.push({ type: "fadeIn", targetId: "wLabel", start: D * 0.32, duration: 0.4 });
  if (p.projLatex) timeline.push({ type: "fadeIn", targetId: "projEq", start: projAt + 1.2, duration: 0.6 });

  return {
    version: 1,
    stage: "graph",
    shotPattern: "vector-projection",
    view,
    objects,
    timeline,
    duration: D,
  };
}

// ---------------------------------------------------------------------------
// Program: probability-bar-model — one partitioned bar whose segment widths
// ARE the probabilities (area-model underneath: perfect tiling for free).

const probabilityBarParams = z.object({
  fits: z
    .boolean()
    .describe("true ONLY if this beat is 'split a whole into weighted parts' (probabilities, proportions, shares)."),
  segments: z
    .array(
      z.object({
        label: z.string().min(1).max(40).describe("Short segment label (plain text or simple LaTeX)."),
        weight: num.positive().max(1000).describe("Relative size; widths are weights normalized."),
        fill: z.string().max(32).optional(),
      }),
    )
    .min(2)
    .max(6),
  highlightIndex: z.number().int().min(0).max(5).optional().describe("Which segment the narration singles out."),
  highlightLatex: latex.optional().describe("Optional label for the highlighted amount, e.g. 'P(A) = 0.3'."),
  cueBar: cue.optional().describe("Verbatim phrase for when the bar appears."),
  cueHighlight: cue.optional().describe("Verbatim phrase for the singled-out segment."),
});
type ProbabilityBarParams = z.infer<typeof probabilityBarParams>;

const BAR_FILLS = ["rgba(76,201,217,0.35)", "rgba(214,194,74,0.35)", "rgba(232,138,90,0.35)", "rgba(154,164,178,0.30)", "rgba(120,190,140,0.32)", "rgba(190,140,200,0.32)"];

function buildProbabilityBar(p: ProbabilityBarParams, beat: TeachingBeat): SceneSpec | null {
  const D = beat.targetDurationSec;
  const totalW = p.segments.reduce((s, seg) => s + seg.weight, 0);
  if (!(totalW > 0)) return null;
  const BAR_W = 10; // world units; the view fits around it
  const BAR_H = 1.6;
  const x0 = -BAR_W / 2;

  const objects: SceneObject[] = [
    {
      type: "area-model",
      id: "bar",
      at: { x: x0, y: -BAR_H / 2 },
      columns: p.segments.map((seg) => ({ size: (seg.weight / totalW) * BAR_W, label: seg.label })),
      rows: [{ size: BAR_H }],
      cells: p.segments.map((seg, i) => ({ row: 0, col: i, fill: seg.fill ?? BAR_FILLS[i % BAR_FILLS.length] })),
      stroke: "#d8d8d8",
    },
  ];

  const timeline: AnimationStep[] = [
    { type: "fadeIn", targetId: "bar", start: D * 0.12, duration: 1.0, cue: p.cueBar },
  ];

  // Deterministic highlight: a brace measuring the singled-out segment.
  if (p.highlightIndex !== undefined && p.highlightIndex < p.segments.length) {
    let acc = 0;
    for (let i = 0; i < p.highlightIndex; i++) acc += p.segments[i].weight;
    const hx0 = x0 + (acc / totalW) * BAR_W;
    const hx1 = hx0 + (p.segments[p.highlightIndex].weight / totalW) * BAR_W;
    objects.push({
      type: "brace",
      id: "hl",
      from: { x: hx0, y: BAR_H / 2 + 0.25 },
      to: { x: hx1, y: BAR_H / 2 + 0.25 },
      side: "above",
      color: ACCENT,
      label: undefined,
    });
    timeline.push({ type: "draw", targetId: "hl", start: D * 0.48, duration: 0.8, cue: p.cueHighlight });
    if (p.highlightLatex) {
      objects.push({ type: "equation", id: "hlEq", latex: p.highlightLatex, at: { x: 0, y: 0 }, region: "topStrip" });
      timeline.push({ type: "fadeIn", targetId: "hlEq", start: D * 0.56, duration: 0.6 });
      timeline.push({ type: "highlight", targetId: "hlEq", start: D * 0.8, duration: 1.0, color: ACCENT });
    }
  }

  return {
    version: 1,
    stage: "split",
    shotPattern: "probability-bar-model",
    objects,
    timeline,
    duration: D,
  };
}

// ---------------------------------------------------------------------------
// Registry

export interface ShotProgram {
  id: string;
  pattern: ShotPatternName;
  description: string;
  /** Prompt block teaching this program's params (appended to PROGRAM_RULES). */
  rules: string;
  schema: z.ZodType<{ fits: boolean }>;
  build: (params: never, beat: TeachingBeat) => SceneSpec | null;
}

function program<P extends { fits: boolean }>(def: {
  id: string;
  pattern: ShotPatternName;
  description: string;
  rules: string;
  schema: z.ZodType<P>;
  build: (params: P, beat: TeachingBeat) => SceneSpec | null;
}): ShotProgram {
  return def as unknown as ShotProgram;
}

export const SHOT_PROGRAMS: ShotProgram[] = [
  program({
    id: "graph_approach",
    pattern: "graph-approach",
    description:
      "Fill the parameters of the pre-choreographed 'graph approach' shot: one curve, a marker traveling to a target point, camera push, emphasized arrival.",
    rules: `THIS SHOT renders (in order): axes draw on → the curve draws while narration introduces it → an open target ring and a solid moving dot appear ON the curve → the dot traces along the curve to the target exactly when the narration says so → the camera pushes toward the meeting point → the dot pops (emphasize) at arrival. Optional side equation (approachLatex) and caption fade out before the push so nothing clips.`,
    schema: graphApproachParams,
    build: buildGraphApproach,
  }),
  program({
    id: "secant_to_tangent",
    pattern: "secant-to-tangent",
    description:
      "Fill the parameters of the pre-choreographed 'secant becomes tangent' shot: fixed point, sliding second point, secant line easing into the tangent, camera push, equation transform.",
    rules: `THIS SHOT renders (in order): axes → curve → a fixed (yellow) point and a moving (orange) point on the curve → the secant through them → the moving point and the secant's endpoint slide into the fixed point exactly on the cue phrase while the camera pushes in → the line is emphasized as the tangent → the optional side equation transforms from slopeBeforeLatex to slopeAfterLatex at that same moment.`,
    schema: secantToTangentParams,
    build: buildSecantToTangent,
  }),
  program({
    id: "equation_transform",
    pattern: "equation-transform",
    description:
      "Fill the parameters of the pre-choreographed 'equation evolves' shot: one equation on a clean statement board morphing through 2–5 forms on cue.",
    rules: `THIS SHOT renders: a clean black statement board; the first equation form fades in; it TRANSFORMS through each later form exactly when its cue phrase is spoken; the final form gets a brief highlight; an optional one-line caption appears near the end. Use it for derivations, notation reveals, and formal statements. steps[].latex must be valid KaTeX.`,
    schema: equationTransformParams,
    build: buildEquationTransform,
  }),
  program({
    id: "number_line_convergence",
    pattern: "number-line-convergence",
    description:
      "Fill the parameters of the pre-choreographed 'two-sided squeeze' shot: markers approach one point from both sides of a number line, camera pushes on the meeting.",
    rules: `THIS SHOT renders: a horizontal number line with the target tick emphasized → an open target ring plus a left (blue) and right (orange) marker with inward dashed arrows → both markers slide inward exactly on the squeeze cue while the camera pushes on the target → arrows fade, the target pops on the meet cue. leftStart < center < rightStart is required.`,
    schema: numberLineParams,
    build: buildNumberLine,
  }),
  program({
    id: "area_accumulation",
    pattern: "area-accumulation",
    description:
      "Fill the parameters of the pre-choreographed 'area fills in' shot: perfectly tiled bars appear one by one under a curve between two bounds.",
    rules: `THIS SHOT renders: axes with both bounds' ticks emphasized → the curve draws → barCount perfectly computed rectangles fill the region ONE BY ONE starting on the bars cue → the curve flashes on the total cue and the optional integral caption appears. The bars are computed from the expression — they always tile exactly.`,
    schema: areaAccumulationParams,
    build: buildAreaAccumulation,
  }),
  program({
    id: "vector_projection",
    pattern: "vector-projection",
    description:
      "Fill the parameters of the pre-choreographed 'projection' shot: v and w from the origin, the perpendicular drops, the projection vector lands emphasized.",
    rules: `THIS SHOT renders: axes → w (blue) then v (yellow) draw from the origin → a dashed perpendicular drops from v's tip onto w's line on the drop cue → the orange projection vector draws along w on the projection cue and is emphasized → optional labels via callouts and a caption formula. All geometry (foot of perpendicular) is computed exactly.`,
    schema: vectorProjectionParams,
    build: buildVectorProjection,
  }),
  program({
    id: "probability_bar",
    pattern: "probability-bar-model",
    description:
      "Fill the parameters of the pre-choreographed 'weighted bar' shot: one bar partitioned by weights (probabilities/proportions), one segment singled out with a brace.",
    rules: `THIS SHOT renders: one horizontal bar whose segment widths ARE the normalized weights, each labeled inside its segment — the tiling is computed, always exact → the bar fades in on its cue → a yellow brace measures the singled-out segment on the highlight cue, with an optional equation above. Weights need not sum to 1; they are normalized.`,
    schema: probabilityBarParams,
    build: buildProbabilityBar,
  }),
];

export function programForPattern(pattern?: string): ShotProgram | null {
  if (process.env.LUMEN_SHOT_PROGRAMS === "0") return null;
  return SHOT_PROGRAMS.find((p) => p.pattern === pattern) ?? null;
}

/** Run a program on validated params; null → caller falls back to freeform. */
export function runProgram(prog: ShotProgram, params: unknown, beat: TeachingBeat): SceneSpec | null {
  const parsed = prog.schema.safeParse(params);
  if (!parsed.success || !parsed.data.fits) return null;
  try {
    return prog.build(parsed.data as never, beat);
  } catch {
    return null;
  }
}
