import { worldToPx, type Px } from "@/lib/coords";
import { compileExpr, type CompiledExpr } from "@/lib/mathEval";
import type {
  FunctionPlotObject,
  ParametricObject,
  PathObject,
  PathSegment,
  PolygonObject,
  PolylineObject,
  SceneObject,
  Vec2,
  View,
} from "@/types/scene";

const clampCoord = (n: number) => Math.max(-100000, Math.min(100000, n));

function exprVariables(params: Record<string, number> | undefined) {
  return Array.from(new Set(["t", "a", "b", "c", ...Object.keys(params ?? {})]));
}

function evalParam(fn: CompiledExpr, t: number, params: Record<string, number> | undefined) {
  return fn({ t, ...(params ?? {}) });
}

export function compileParametric(obj: ParametricObject): ((t: number) => Vec2) | null {
  const vars = exprVariables(obj.params);
  const xFn = compileExpr(obj.xExpr, vars);
  const yFn = compileExpr(obj.yExpr, vars);
  if (!xFn || !yFn) return null;
  return (t: number) => ({ x: evalParam(xFn, t, obj.params), y: evalParam(yFn, t, obj.params) });
}

export function sampleParametricPoints(obj: ParametricObject, samples = obj.samples ?? 160): Vec2[] {
  const fn = compileParametric(obj);
  if (!fn) return [];
  const n = Math.max(2, Math.min(400, samples));
  const points: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = obj.tRange[0] + ((obj.tRange[1] - obj.tRange[0]) * i) / n;
    const p = fn(t);
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) points.push(p);
  }
  return points;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function quad(a: Vec2, b: Vec2, c: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
  };
}

function cubic(a: Vec2, b: Vec2, c: Vec2, d: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

function sampleArc(start: Vec2, seg: Extract<PathSegment, { op: "A" }>, steps = 18): Vec2[] {
  const end = seg.to;
  const rx = Math.max(1e-6, Math.abs(seg.rx));
  const ry = Math.max(1e-6, Math.abs(seg.ry));
  const phi = ((seg.rotation ?? 0) * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const sign = (seg.largeArc ?? false) === (seg.sweep ?? false) ? -1 : 1;
  const coef = sign * Math.sqrt(Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / Math.max(1e-6, rx2 * y1p2 + ry2 * x1p2)));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2;
  const angle = (u: Vec2, v: Vec2) => {
    const dot = u.x * v.x + u.y * v.y;
    const len = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1;
    const a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    return u.x * v.y - u.y * v.x < 0 ? -a : a;
  };
  const v1 = { x: (x1p - cxp) / rx, y: (y1p - cyp) / ry };
  const v2 = { x: (-x1p - cxp) / rx, y: (-y1p - cyp) / ry };
  let theta1 = angle({ x: 1, y: 0 }, v1);
  let delta = angle(v1, v2);
  if (!seg.sweep && delta > 0) delta -= Math.PI * 2;
  if (seg.sweep && delta < 0) delta += Math.PI * 2;
  if (!Number.isFinite(theta1)) theta1 = 0;
  if (!Number.isFinite(delta)) delta = 0;
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps;
    const a = theta1 + delta * t;
    const x = cosPhi * rx * Math.cos(a) - sinPhi * ry * Math.sin(a) + cx;
    const y = sinPhi * rx * Math.cos(a) + cosPhi * ry * Math.sin(a) + cy;
    return { x, y };
  });
}

export function samplePathPoints(obj: PathObject, curveSteps = 16): Vec2[] {
  const points: Vec2[] = [];
  let cursor: Vec2 | null = null;
  for (const seg of obj.segments) {
    if (seg.op === "M") {
      cursor = seg.to;
      points.push(seg.to);
      continue;
    }
    if (!cursor) cursor = seg.to;
    if (seg.op === "L") {
      cursor = seg.to;
      points.push(seg.to);
    } else if (seg.op === "Q") {
      for (let i = 1; i <= curveSteps; i++) points.push(quad(cursor, seg.control, seg.to, i / curveSteps));
      cursor = seg.to;
    } else if (seg.op === "C") {
      for (let i = 1; i <= curveSteps; i++) points.push(cubic(cursor, seg.c1, seg.c2, seg.to, i / curveSteps));
      cursor = seg.to;
    } else if (seg.op === "A") {
      points.push(...sampleArc(cursor, seg, curveSteps));
      cursor = seg.to;
    }
  }
  return points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function pathPointAt(obj: PathObject, u: number): Vec2 | null {
  const points = samplePathPoints(obj, 20);
  if (!points.length) return null;
  const index = Math.max(0, Math.min(points.length - 1, Math.round(u * (points.length - 1))));
  return points[index];
}

function svgPoint(view: View | undefined, p: Vec2): Px {
  const q = worldToPx(view, p);
  return { x: clampCoord(q.x), y: clampCoord(q.y) };
}

export function pathToSvgD(view: View | undefined, obj: PathObject): string {
  const parts: string[] = [];
  for (const seg of obj.segments) {
    if (seg.op === "M" || seg.op === "L") {
      const p = svgPoint(view, seg.to);
      parts.push(`${seg.op} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    } else if (seg.op === "Q") {
      const c = svgPoint(view, seg.control);
      const p = svgPoint(view, seg.to);
      parts.push(`Q ${c.x.toFixed(2)} ${c.y.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    } else if (seg.op === "C") {
      const c1 = svgPoint(view, seg.c1);
      const c2 = svgPoint(view, seg.c2);
      const p = svgPoint(view, seg.to);
      parts.push(`C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    } else if (seg.op === "A") {
      const p = svgPoint(view, seg.to);
      const rpx = Math.abs(worldToPx(view, { x: seg.rx, y: 0 }).x - worldToPx(view, { x: 0, y: 0 }).x);
      const rpy = Math.abs(worldToPx(view, { x: 0, y: seg.ry }).y - worldToPx(view, { x: 0, y: 0 }).y);
      parts.push(`A ${rpx.toFixed(2)} ${rpy.toFixed(2)} ${seg.rotation ?? 0} ${seg.largeArc ? 1 : 0} ${seg.sweep ? 0 : 1} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    }
  }
  if (obj.close) parts.push("Z");
  return parts.join(" ");
}

export function pointsToSvgD(view: View | undefined, points: Vec2[], close: boolean): string {
  const parts = points.map((point, i) => {
    const p = svgPoint(view, point);
    return `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  });
  if (close && parts.length) parts.push("Z");
  return parts.join(" ");
}

export function polygonPoints(obj: PolygonObject | PolylineObject): Vec2[] {
  return obj.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** Any curve a `trace` step can ride (and a `place:on` anchor can sit on). */
export type TraceableCurve = FunctionPlotObject | ParametricObject | PathObject | PolygonObject | PolylineObject;

export function isTraceableCurve(obj: SceneObject): obj is TraceableCurve {
  return (
    obj.type === "function-plot" ||
    obj.type === "parametric" ||
    obj.type === "path" ||
    obj.type === "polygon" ||
    obj.type === "polyline"
  );
}

/**
 * The polyline a path-like curve's arc-fraction runs over (polygons include the
 * closing edge so u=1 returns to the start).
 */
export function traceCurvePoints(obj: PathObject | PolygonObject | PolylineObject): Vec2[] {
  if (obj.type === "path") {
    const points = samplePathPoints(obj, 20);
    return obj.close && points.length > 1 ? [...points, points[0]] : points;
  }
  const points = polygonPoints(obj);
  return obj.type === "polygon" && points.length > 1 ? [...points, points[0]] : points;
}

export function pointOnPolyline(points: Vec2[], u: number): Vec2 | null {
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  const target = Math.max(0, Math.min(1, u));
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    lengths[i] = lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const total = lengths[lengths.length - 1] || 1;
  const want = target * total;
  for (let i = 1; i < points.length; i++) {
    if (want <= lengths[i]) {
      const span = lengths[i] - lengths[i - 1] || 1;
      const t = (want - lengths[i - 1]) / span;
      return { x: lerp(points[i - 1].x, points[i].x, t), y: lerp(points[i - 1].y, points[i].y, t) };
    }
  }
  return points[points.length - 1];
}
