import { z } from "zod";
import type { SceneSpec } from "@/types/scene";

/**
 * Runtime validation for a SceneSpec, with hard resource caps so a malformed or
 * adversarial model response can never make the renderer allocate unbounded
 * work (which would spike RAM/CPU). This same schema is the single source of
 * truth for the Claude tool's JSON input schema (see app/api/tutor/route.ts).
 */

// Caps (also enforced defensively in the renderer).
export const CAPS = {
  objects: 40,
  steps: 60,
  samples: 400,
  duration: 60,
  latex: 2000,
  text: 500,
  id: 64,
} as const;

const num = z.number().finite();
const vec2 = z.object({ x: num, y: num });
const view = z.object({
  xMin: num,
  xMax: num,
  yMin: num,
  yMax: num,
});
const id = z.string().min(1).max(CAPS.id);
const color = z.string().max(32).optional();
const anchor = z.enum(["start", "middle", "end"]).optional();
const iconName = z.enum(["car", "speedometer", "camera", "stopwatch", "clock", "person", "pi-person"]);
const stageName = z.enum(["graph", "split", "statement", "plot-inset"]);
const regionName = z.enum(["main", "rail", "caption", "topStrip", "statement"]);

const placeAnchor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("absolute"), at: vec2 }),
  z.object({
    kind: z.literal("on"),
    target: id,
    x: num.optional(),
    t: num.optional(),
    at: num.optional(),
    offset: vec2.optional(),
  }),
  z.object({
    kind: z.literal("relativeTo"),
    target: id,
    side: z.enum(["left", "right", "above", "below", "center"]),
    gap: num.min(0).max(100).optional(),
    offset: vec2.optional(),
  }),
  z.object({
    kind: z.literal("distribute"),
    in: id,
    axis: z.enum(["x", "y"]),
    index: z.number().int().min(0).max(CAPS.objects - 1),
    count: z.number().int().min(1).max(CAPS.objects),
    gap: num.min(0).max(100).optional(),
    offset: vec2.optional(),
  }),
]);
const objectBase = { id, place: placeAnchor.optional() };

const calloutTarget = z.object({
  anchorTo: z.union([id, vec2]),
});

const layoutIntent = {
  region: regionName.optional(),
  callout: calloutTarget.optional(),
};

const textObject = z.object({
  type: z.literal("text"),
  ...objectBase,
  text: z.string().max(CAPS.text),
  at: vec2,
  fontSize: num.optional(),
  color,
  background: color,
  padding: num.min(0).max(40).optional(),
  anchor,
  weight: z.enum(["normal", "bold"]).optional(),
  ...layoutIntent,
});

const equationObject = z.object({
  type: z.literal("equation"),
  ...objectBase,
  latex: z.string().max(CAPS.latex),
  at: vec2,
  fontSize: num.optional(),
  color,
  background: color,
  padding: num.min(0).max(40).optional(),
  anchor,
  ...layoutIntent,
});

const labelObject = z.object({
  type: z.literal("label"),
  ...objectBase,
  text: z.string().max(CAPS.text),
  at: vec2,
  fontSize: num.optional(),
  color,
  background: color,
  padding: num.min(0).max(40).optional(),
  anchor,
  ...layoutIntent,
});

const counterObject = z.object({
  type: z.literal("counter"),
  ...objectBase,
  at: vec2,
  from: num,
  to: num,
  decimals: z.number().int().min(0).max(6).optional(),
  prefix: z.string().max(40).optional(),
  suffix: z.string().max(40).optional(),
  fontSize: num.optional(),
  color,
  background: color,
  padding: num.min(0).max(40).optional(),
  anchor,
  weight: z.enum(["normal", "bold"]).optional(),
  ...layoutIntent,
});

const braceObject = z.object({
  type: z.literal("brace"),
  ...objectBase,
  from: vec2,
  to: vec2,
  side: z.enum(["left", "right", "above", "below"]).optional(),
  color,
  width: num.positive().max(20).optional(),
  label: z.string().max(80).optional(),
  labelOffset: num.min(0).max(120).optional(),
  fontSize: num.positive().max(120).optional(),
});

const axisTickEmphasis = z.object({
  axis: z.enum(["x", "y"]),
  value: num,
  color,
  label: z.string().max(40).optional(),
});

const axesObject = z.object({
  type: z.literal("axes"),
  ...objectBase,
  xRange: z.tuple([num, num]),
  yRange: z.tuple([num, num]),
  step: num.positive().optional(),
  showGrid: z.boolean().optional(),
  xLabel: z.string().max(40).optional(),
  yLabel: z.string().max(40).optional(),
  color,
  emphasizeTicks: z.array(axisTickEmphasis).max(12).optional(),
});

const functionPlotObject = z.object({
  type: z.literal("function-plot"),
  ...objectBase,
  expr: z.string().min(1).max(200),
  domain: z.tuple([num, num]),
  samples: z.number().int().min(2).max(CAPS.samples).optional(),
  color,
  width: num.positive().max(20).optional(),
  dash: z.tuple([num.positive().max(80), num.positive().max(80)]).optional(),
});

const paramsObject = z.record(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).max(16), num).optional();

const parametricObject = z.object({
  type: z.literal("parametric"),
  ...objectBase,
  xExpr: z.string().min(1).max(200),
  yExpr: z.string().min(1).max(200),
  tRange: z.tuple([num, num]),
  params: paramsObject,
  samples: z.number().int().min(2).max(CAPS.samples).optional(),
  color,
  width: num.positive().max(20).optional(),
  dash: z.tuple([num.positive().max(80), num.positive().max(80)]).optional(),
  fill: color,
  close: z.boolean().optional(),
  opacity: num.min(0).max(1).optional(),
});

const pathSegment = z.discriminatedUnion("op", [
  z.object({ op: z.literal("M"), to: vec2 }),
  z.object({ op: z.literal("L"), to: vec2 }),
  z.object({ op: z.literal("Q"), control: vec2, to: vec2 }),
  z.object({ op: z.literal("C"), c1: vec2, c2: vec2, to: vec2 }),
  z.object({
    op: z.literal("A"),
    rx: num.positive().max(1000),
    ry: num.positive().max(1000),
    rotation: num.optional(),
    largeArc: z.boolean().optional(),
    sweep: z.boolean().optional(),
    to: vec2,
  }),
]);

const pathObject = z.object({
  type: z.literal("path"),
  ...objectBase,
  segments: z.array(pathSegment).min(1).max(80),
  close: z.boolean().optional(),
  fill: color,
  stroke: color,
  strokeWidth: num.positive().max(20).optional(),
  dash: z.tuple([num.positive().max(80), num.positive().max(80)]).optional(),
  opacity: num.min(0).max(1).optional(),
});

const polygonObject = z.object({
  type: z.literal("polygon"),
  ...objectBase,
  points: z.array(vec2).min(3).max(80),
  fill: color,
  stroke: color,
  strokeWidth: num.positive().max(20).optional(),
  dash: z.tuple([num.positive().max(80), num.positive().max(80)]).optional(),
  opacity: num.min(0).max(1).optional(),
});

const polylineObject = z.object({
  type: z.literal("polyline"),
  ...objectBase,
  points: z.array(vec2).min(2).max(80),
  stroke: color,
  strokeWidth: num.positive().max(20).optional(),
  dash: z.tuple([num.positive().max(80), num.positive().max(80)]).optional(),
  opacity: num.min(0).max(1).optional(),
});

const dotObject = z.object({
  type: z.literal("dot"),
  ...objectBase,
  at: vec2,
  radius: num.positive().max(60).optional(),
  color,
  filled: z.boolean().optional(),
});

const arrowObject = z.object({
  type: z.literal("arrow"),
  ...objectBase,
  from: vec2,
  to: vec2,
  color,
  width: num.positive().max(20).optional(),
  dash: z.tuple([num.positive().max(80), num.positive().max(80)]).optional(),
  head: z.boolean().optional(),
});

const boxObject = z.object({
  type: z.literal("box"),
  ...objectBase,
  at: vec2,
  width: num.positive().max(100),
  height: num.positive().max(100),
  radius: num.min(0).max(20).optional(),
  fill: color,
  stroke: color,
  strokeWidth: num.positive().max(20).optional(),
  opacity: num.min(0).max(1).optional(),
});

const iconObject = z.object({
  type: z.literal("icon"),
  ...objectBase,
  name: iconName,
  at: vec2,
  size: num.positive().max(260).optional(),
  color,
  secondaryColor: color,
});

const secantLineObject = z.object({
  type: z.literal("secant-line"),
  ...objectBase,
  plotId: id,
  x1: num,
  x2: num,
  extend: num.min(0).max(1000).optional(),
  color,
  width: num.positive().max(20).optional(),
  dash: z.tuple([num.positive().max(80), num.positive().max(80)]).optional(),
});

const insetObject = z.object({
  type: z.literal("inset"),
  ...objectBase,
  at: vec2,
  width: num.positive().max(100),
  height: num.positive().max(100),
  view,
  shows: z.array(id).min(1).max(12),
  fill: color,
  stroke: color,
  strokeWidth: num.positive().max(20).optional(),
  label: z.string().max(80).optional(),
});

const areaModelBand = z.object({
  size: num.positive().max(100),
  label: z.string().max(80).optional(),
});

const areaModelCell = z.object({
  row: z.number().int().min(0).max(7),
  col: z.number().int().min(0).max(7),
  label: z.string().max(CAPS.latex).optional(),
  fill: color,
});

// Grid kept small so expansion (tiles + labels) stays within object/perf caps.
const areaModelObject = z.object({
  type: z.literal("area-model"),
  ...objectBase,
  at: vec2,
  columns: z.array(areaModelBand).min(1).max(4),
  rows: z.array(areaModelBand).min(1).max(4),
  cells: z.array(areaModelCell).max(16).optional(),
  fill: color,
  stroke: color,
  showEdgeLabels: z.boolean().optional(),
  fontSize: num.positive().max(120).optional(),
});

const groupTransform = z.object({
  translate: vec2.optional(),
  rotate: num.optional(),
  scale: z.union([num.positive().max(100), vec2]).optional(),
});

const groupChildObject = z.discriminatedUnion("type", [
  textObject,
  equationObject,
  labelObject,
  counterObject,
  axesObject,
  functionPlotObject,
  parametricObject,
  pathObject,
  polygonObject,
  polylineObject,
  dotObject,
  arrowObject,
  boxObject,
  iconObject,
  secantLineObject,
  insetObject,
  braceObject,
  areaModelObject,
]);

const groupObject = z.object({
  type: z.literal("group"),
  ...objectBase,
  at: vec2.optional(),
  transform: groupTransform.optional(),
  children: z.array(groupChildObject).min(1).max(CAPS.objects),
  opacity: num.min(0).max(1).optional(),
});

const sceneObject = z.discriminatedUnion("type", [
  textObject,
  equationObject,
  labelObject,
  counterObject,
  axesObject,
  functionPlotObject,
  parametricObject,
  pathObject,
  polygonObject,
  polylineObject,
  dotObject,
  arrowObject,
  boxObject,
  iconObject,
  secantLineObject,
  insetObject,
  braceObject,
  areaModelObject,
  groupObject,
]);

const animationStep = z.object({
  type: z.enum([
    "fadeIn",
    "fadeOut",
    "draw",
    "move",
    "transform",
    "highlight",
    "morph",
    "trace",
    "emphasize",
    "slide",
    "reshape",
    "count",
  ]),
  targetId: id,
  start: num.min(0).max(CAPS.duration),
  duration: num.min(0).max(CAPS.duration),
  // Narration cue phrase this step should land on; the player retimes the step
  // to the moment the phrase is actually spoken (word-level TTS timings).
  cue: z.string().min(1).max(120).optional(),
  to: vec2.optional(),
  toLatex: z.string().max(CAPS.latex).optional(),
  fromValue: num.optional(),
  toValue: num.optional(),
  color,
  // morph (function-plot)
  toExpr: z.string().min(1).max(200).optional(),
  toDomain: z.tuple([num, num]).optional(),
  // trace (dot follows a named curve: function-plot by x, parametric by t,
  // path/polyline/polygon by arc-length fraction 0..1)
  plotId: id.optional(),
  fromX: num.optional(),
  toX: num.optional(),
  fromT: num.optional(),
  toT: num.optional(),
  // emphasize (grow + hold)
  scaleTo: num.positive().max(8).optional(),
  // slide (secant-line endpoints)
  toX1: num.optional(),
  toX2: num.optional(),
  // reshape (box)
  toAt: vec2.optional(),
  toWidth: num.positive().max(100).optional(),
  toHeight: num.positive().max(100).optional(),
  toRadius: num.min(0).max(50).optional(),
});

const cameraMove = z.object({
  start: num.min(0).max(CAPS.duration),
  duration: num.min(0).max(CAPS.duration),
  to: view,
});

const baseSceneSpecSchema = z.object({
  version: z.literal(1),
  title: z.string().max(120).optional(),
  stage: stageName.optional(),
  continueFrom: z.literal("prev").optional(),
  shotPattern: z.string().max(80).optional(),
  view: view.optional(),
  camera: z.array(cameraMove).max(CAPS.steps).optional(),
  background: color,
  objects: z.array(sceneObject).max(CAPS.objects),
  timeline: z.array(animationStep).max(CAPS.steps),
  duration: num.min(0).max(CAPS.duration).optional(),
});

function countObjects(objects: Array<{ type: string; children?: unknown[] }>): number {
  let total = 0;
  for (const obj of objects) {
    total++;
    if (obj.type === "group" && Array.isArray(obj.children)) {
      total += countObjects(obj.children as Array<{ type: string; children?: unknown[] }>);
    }
  }
  return total;
}

export const sceneSpecSchema = baseSceneSpecSchema.superRefine((scene, ctx) => {
  const total = countObjects(scene.objects);
  if (total > CAPS.objects) {
    ctx.addIssue({
      code: "custom",
      path: ["objects"],
      message: `Scene has ${total} total objects including group children; max ${CAPS.objects}.`,
    });
  }
});

export type ValidatedScene = z.infer<typeof sceneSpecSchema>;

export type ValidateResult =
  | { ok: true; scene: SceneSpec }
  | { ok: false; error: string };

export function validateScene(input: unknown): ValidateResult {
  const parsed = sceneSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, scene: parsed.data as SceneSpec };
}
