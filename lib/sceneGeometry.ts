import { worldToPx, type Px } from "@/lib/coords";
import { compileExpr } from "@/lib/mathEval";
import {
  polygonPoints,
  sampleParametricPoints,
  samplePathPoints,
} from "@/lib/scenePaths";
import {
  DEFAULT_VIEW,
  VIEW_H,
  VIEW_W,
  type AnimationStep,
  type AxesObject,
  type BoxObject,
  type BraceObject,
  type CounterObject,
  type DotObject,
  type EquationObject,
  type FunctionPlotObject,
  type IconObject,
  type InsetObject,
  type LabelObject,
  type ParametricObject,
  type PathObject,
  type PolygonObject,
  type PolylineObject,
  type SceneObject,
  type SceneSpec,
  type TextObject,
  type Vec2,
  type View,
} from "@/types/scene";

export interface Rect {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface ObjectRect {
  id: string;
  type: SceneObject["type"];
  rect: Rect;
  overlay: boolean;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const pad = (r: Rect, p: number): Rect => ({ xMin: r.xMin - p, yMin: r.yMin - p, xMax: r.xMax + p, yMax: r.yMax + p });

export function pxToWorld(view: View | undefined, p: Px): Vec2 {
  const v = view ?? DEFAULT_VIEW;
  const w = v.xMax - v.xMin || 1;
  const h = v.yMax - v.yMin || 1;
  return {
    x: v.xMin + (p.x / VIEW_W) * w,
    y: v.yMax - (p.y / VIEW_H) * h,
  };
}

export function rectsIntersect(a: Rect, b: Rect, padding = 0) {
  return !(a.xMax + padding < b.xMin || b.xMax + padding < a.xMin || a.yMax + padding < b.yMin || b.yMax + padding < a.yMin);
}

export function rectInside(inner: Rect, outer: Rect, margin = 0) {
  return (
    inner.xMin >= outer.xMin + margin &&
    inner.xMax <= outer.xMax - margin &&
    inner.yMin >= outer.yMin + margin &&
    inner.yMax <= outer.yMax - margin
  );
}

export function sceneRect(): Rect {
  return { xMin: 0, yMin: 0, xMax: VIEW_W, yMax: VIEW_H };
}

export function rectCenter(r: Rect): Px {
  return { x: (r.xMin + r.xMax) / 2, y: (r.yMin + r.yMax) / 2 };
}

export function objectAnchor(obj: SceneObject, scene: SceneSpec): Vec2 | null {
  if ("at" in obj && obj.at) return obj.at;
  if (obj.type === "arrow") return { x: (obj.from.x + obj.to.x) / 2, y: (obj.from.y + obj.to.y) / 2 };
  if (obj.type === "brace") return { x: (obj.from.x + obj.to.x) / 2, y: (obj.from.y + obj.to.y) / 2 };
  if (obj.type === "axes") {
    return {
      x: (obj.xRange[0] + obj.xRange[1]) / 2,
      y: (obj.yRange[0] + obj.yRange[1]) / 2,
    };
  }
  if (obj.type === "function-plot") {
    const x = (obj.domain[0] + obj.domain[1]) / 2;
    const fn = compileExpr(obj.expr);
    const y = fn?.(x);
    return Number.isFinite(y) ? { x, y: y as number } : { x, y: 0 };
  }
  if (obj.type === "parametric") {
    const points = sampleParametricPoints(obj, 80);
    return points[Math.floor(points.length / 2)] ?? null;
  }
  if (obj.type === "path") {
    const points = samplePathPoints(obj, 16);
    return points.length ? points[Math.floor(points.length / 2)] : null;
  }
  if (obj.type === "polygon" || obj.type === "polyline") {
    const points = polygonPoints(obj);
    if (!points.length) return null;
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };
  }
  if (obj.type === "group") {
    const anchors = obj.children.map((child) => objectAnchor(child, scene)).filter((p): p is Vec2 => Boolean(p));
    if (!anchors.length) return obj.at ?? null;
    return {
      x: anchors.reduce((sum, p) => sum + p.x, 0) / anchors.length,
      y: anchors.reduce((sum, p) => sum + p.y, 0) / anchors.length,
    };
  }
  if (obj.type === "secant-line") {
    const plot = scene.objects.find((o): o is FunctionPlotObject => o.type === "function-plot" && o.id === obj.plotId);
    const fn = plot ? compileExpr(plot.expr) : null;
    const x = (obj.x1 + obj.x2) / 2;
    const y = fn?.(x);
    return Number.isFinite(y) ? { x, y: y as number } : { x, y: 0 };
  }
  return null;
}

export const MIN_OVERLAY_FONT = 15;

export function textWidth(text: string, fontSize: number, kind: "text" | "equation") {
  const simplified = kind === "equation" ? text.replace(/\\[a-zA-Z]+|[{}]/g, "") : text;
  return Math.max(fontSize * 1.4, simplified.length * fontSize * (kind === "equation" ? 0.58 : 0.54));
}

export function textHeight(fontSize: number) {
  return fontSize * 1.25;
}

/**
 * Largest font (<= authored) at which `text` fits inside maxW x maxH, floored at
 * a readable minimum. Used by the layout engine so a region-placed label never
 * overflows its region (which would otherwise surface as a false out-of-frame).
 */
export function fitFontSize(text: string, kind: "text" | "equation", authored: number, maxW: number, maxH: number) {
  if (!text) return authored;
  const wAt1 = textWidth(text, 1, kind);
  const byW = maxW / Math.max(1e-3, wAt1);
  const byH = maxH / 1.25;
  return Math.max(MIN_OVERLAY_FONT, Math.min(authored, Math.floor(Math.min(byW, byH))));
}

function counterSample(obj: CounterObject) {
  const decimals = obj.decimals ?? 0;
  const a = obj.from.toFixed(decimals);
  const b = obj.to.toFixed(decimals);
  return `${obj.prefix ?? ""}${a.length >= b.length ? a : b}${obj.suffix ?? ""}`;
}

function overlayRect(view: View | undefined, obj: TextObject | LabelObject | EquationObject | CounterObject) {
  const p = worldToPx(view, obj.at);
  const kind = obj.type === "equation" ? "equation" : "text";
  const source = obj.type === "equation" ? obj.latex : obj.type === "counter" ? counterSample(obj) : obj.text;
  const fontSize = obj.type === "equation" ? obj.fontSize ?? 40 : obj.type === "text" || obj.type === "counter" ? obj.fontSize ?? 32 : obj.fontSize ?? 22;
  const padding = obj.background ? obj.padding ?? 6 : 0;
  const width = textWidth(source, fontSize, kind) + padding * 2.7;
  const height = fontSize * 1.25 + padding * 2;
  const anchor = obj.type === "text" || obj.type === "label" || obj.type === "equation" ? obj.anchor : undefined;
  if (anchor === "start") return { xMin: p.x, xMax: p.x + width, yMin: p.y - height / 2, yMax: p.y + height / 2 };
  if (anchor === "end") return { xMin: p.x - width, xMax: p.x, yMin: p.y - height / 2, yMax: p.y + height / 2 };
  return { xMin: p.x - width / 2, xMax: p.x + width / 2, yMin: p.y - height / 2, yMax: p.y + height / 2 };
}

function axesRect(view: View | undefined, obj: AxesObject): Rect {
  const a = worldToPx(view, { x: obj.xRange[0], y: obj.yRange[0] });
  const b = worldToPx(view, { x: obj.xRange[1], y: obj.yRange[1] });
  return pad({ xMin: Math.min(a.x, b.x), yMin: Math.min(a.y, b.y), xMax: Math.max(a.x, b.x), yMax: Math.max(a.y, b.y) }, 24);
}

export function sampleFunctionPoints(view: View | undefined, obj: FunctionPlotObject, samples = 96): Px[] {
  const fn = compileExpr(obj.expr);
  if (!fn) return [];
  const points: Px[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = obj.domain[0] + ((obj.domain[1] - obj.domain[0]) * i) / samples;
    const y = fn(x);
    if (Number.isFinite(y)) points.push(worldToPx(view, { x, y }));
  }
  return points;
}

export function sampleParametricPxPoints(view: View | undefined, obj: ParametricObject, samples = 96): Px[] {
  return sampleParametricPoints(obj, samples).map((p) => worldToPx(view, p));
}

function plotRect(view: View | undefined, obj: FunctionPlotObject): Rect | null {
  const points = sampleFunctionPoints(view, obj);
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return pad({ xMin: Math.min(...xs), yMin: Math.min(...ys), xMax: Math.max(...xs), yMax: Math.max(...ys) }, (obj.width ?? 3) + 6);
}

function pointCloudRect(points: Px[], padPx: number): Rect | null {
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return pad({ xMin: Math.min(...xs), yMin: Math.min(...ys), xMax: Math.max(...xs), yMax: Math.max(...ys) }, padPx);
}

function parametricRect(view: View | undefined, obj: ParametricObject): Rect | null {
  return pointCloudRect(sampleParametricPxPoints(view, obj), (obj.width ?? 3) + 6);
}

function pathLikeRect(view: View | undefined, obj: PathObject | PolygonObject | PolylineObject): Rect | null {
  const worldPoints = obj.type === "path" ? samplePathPoints(obj, 18) : polygonPoints(obj);
  return pointCloudRect(worldPoints.map((p) => worldToPx(view, p)), ("strokeWidth" in obj ? obj.strokeWidth ?? 3 : 3) + 6);
}

function boxRect(view: View | undefined, obj: BoxObject | InsetObject): Rect {
  const tl = worldToPx(view, { x: obj.at.x - obj.width / 2, y: obj.at.y + obj.height / 2 });
  const br = worldToPx(view, { x: obj.at.x + obj.width / 2, y: obj.at.y - obj.height / 2 });
  return { xMin: Math.min(tl.x, br.x), yMin: Math.min(tl.y, br.y), xMax: Math.max(tl.x, br.x), yMax: Math.max(tl.y, br.y) };
}

function dotRect(view: View | undefined, obj: DotObject): Rect {
  const p = worldToPx(view, obj.at);
  const r = obj.radius ?? 7;
  return { xMin: p.x - r, yMin: p.y - r, xMax: p.x + r, yMax: p.y + r };
}

function iconRect(view: View | undefined, obj: IconObject): Rect {
  const p = worldToPx(view, obj.at);
  const r = (obj.size ?? 96) / 2;
  return { xMin: p.x - r, yMin: p.y - r, xMax: p.x + r, yMax: p.y + r };
}

function arrowRect(view: View | undefined, obj: Extract<SceneObject, { type: "arrow" }>): Rect {
  const a = worldToPx(view, obj.from);
  const b = worldToPx(view, obj.to);
  return pad({ xMin: Math.min(a.x, b.x), yMin: Math.min(a.y, b.y), xMax: Math.max(a.x, b.x), yMax: Math.max(a.y, b.y) }, (obj.width ?? 3) + 10);
}

function braceRect(view: View | undefined, obj: BraceObject): Rect {
  const a = worldToPx(view, obj.from);
  const b = worldToPx(view, obj.to);
  return pad({ xMin: Math.min(a.x, b.x), yMin: Math.min(a.y, b.y), xMax: Math.max(a.x, b.x), yMax: Math.max(a.y, b.y) }, 70);
}

export function objectRect(scene: SceneSpec, obj: SceneObject, view: View | undefined = scene.view): ObjectRect | null {
  let rect: Rect | null = null;
  if (obj.type === "text" || obj.type === "label" || obj.type === "equation" || obj.type === "counter") rect = overlayRect(view, obj);
  else if (obj.type === "axes") rect = axesRect(view, obj);
  else if (obj.type === "function-plot") rect = plotRect(view, obj);
  else if (obj.type === "parametric") rect = parametricRect(view, obj);
  else if (obj.type === "path" || obj.type === "polygon" || obj.type === "polyline") rect = pathLikeRect(view, obj);
  else if (obj.type === "dot") rect = dotRect(view, obj);
  else if (obj.type === "arrow") rect = arrowRect(view, obj);
  else if (obj.type === "box" || obj.type === "inset") rect = boxRect(view, obj);
  else if (obj.type === "icon") rect = iconRect(view, obj);
  else if (obj.type === "brace") rect = braceRect(view, obj);
  else if (obj.type === "group") {
    const children = obj.children.map((child) => objectRect(scene, child, view)?.rect).filter((r): r is Rect => Boolean(r));
    rect = children.length
      ? {
          xMin: Math.min(...children.map((r) => r.xMin)),
          yMin: Math.min(...children.map((r) => r.yMin)),
          xMax: Math.max(...children.map((r) => r.xMax)),
          yMax: Math.max(...children.map((r) => r.yMax)),
        }
      : null;
  }
  else if (obj.type === "secant-line") {
    const plot = scene.objects.find((o): o is FunctionPlotObject => o.type === "function-plot" && o.id === obj.plotId);
    const fn = plot ? compileExpr(plot.expr) : null;
    if (fn) {
      const y1 = fn(obj.x1);
      const y2 = fn(obj.x2);
      if (Number.isFinite(y1) && Number.isFinite(y2)) {
        const a = worldToPx(view, { x: obj.x1, y: y1 });
        const b = worldToPx(view, { x: obj.x2, y: y2 });
        rect = pad({ xMin: Math.min(a.x, b.x), yMin: Math.min(a.y, b.y), xMax: Math.max(a.x, b.x), yMax: Math.max(a.y, b.y) }, (obj.width ?? 3) + 10);
      }
    }
  }
  if (!rect) return null;
  return { id: obj.id, type: obj.type, rect, overlay: obj.type === "text" || obj.type === "label" || obj.type === "equation" || obj.type === "counter" };
}

export function firstEntryTime(timeline: AnimationStep[], id: string): number | null {
  const entries = timeline.filter((s) => s.targetId === id && (s.type === "fadeIn" || s.type === "draw"));
  if (!entries.length) return null;
  return Math.min(...entries.map((s) => s.start));
}

export function isVisibleAt(scene: SceneSpec, obj: SceneObject, timeSec: number) {
  const first = firstEntryTime(scene.timeline, obj.id);
  const out = scene.timeline
    .filter((s) => s.targetId === obj.id && s.type === "fadeOut")
    .map((s) => s.start + s.duration);
  const goneAt = out.length ? Math.max(...out) : null;
  return (first === null || timeSec >= first) && (goneAt === null || timeSec <= goneAt);
}

export function visibleObjectRects(scene: SceneSpec, timeSec: number, view: View | undefined = scene.view): ObjectRect[] {
  return scene.objects
    .filter((obj) => isVisibleAt(scene, obj, timeSec))
    .map((obj) => objectRect(scene, obj, view))
    .filter((r): r is ObjectRect => Boolean(r));
}

/** Effective scene length: explicit duration, else the last step/camera end. */
export function sceneDuration(scene: SceneSpec): number {
  const ends = scene.timeline.map((s) => s.start + s.duration);
  const cameraEnds = (scene.camera ?? []).map((m) => m.start + m.duration);
  return scene.duration ?? Math.max(1, ...ends, ...cameraEnds);
}

export function sampleTimes(scene: SceneSpec): number[] {
  const duration = sceneDuration(scene);
  const times = new Set<number>([0, duration * 0.15, duration * 0.35, duration * 0.6, duration * 0.85, duration]);
  for (const step of scene.timeline) {
    times.add(step.start);
    times.add(step.start + step.duration);
  }
  for (const move of scene.camera ?? []) {
    times.add(move.start);
    times.add(move.start + move.duration);
  }
  return [...times].map((t) => clamp(t, 0, duration)).sort((a, b) => a - b);
}
