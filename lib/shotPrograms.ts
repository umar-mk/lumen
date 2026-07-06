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
