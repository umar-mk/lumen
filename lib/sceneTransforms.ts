import { areaModelSize } from "@/lib/areaModel";
import { compileExpr } from "@/lib/mathEval";
import {
  pathPointAt,
  polygonPoints,
  pointOnPolyline,
  sampleParametricPoints,
  samplePathPoints,
} from "@/lib/scenePaths";
import type {
  AnimationStep,
  AreaModelObject,
  BoxObject,
  GroupObject,
  GroupTransform,
  InsetObject,
  PathSegment,
  PolygonObject,
  PolylineObject,
  SceneObject,
  SceneSpec,
  Vec2,
} from "@/types/scene";

interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const finite = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.y);

function pointBounds(points: Vec2[]): Bounds | null {
  const clean = points.filter(finite);
  if (!clean.length) return null;
  const xs = clean.map((p) => p.x);
  const ys = clean.map((p) => p.y);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

function center(b: Bounds): Vec2 {
  return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 };
}

function objectBounds(obj: SceneObject, scene: SceneSpec): Bounds | null {
  if (obj.type === "box" || obj.type === "inset") {
    return {
      xMin: obj.at.x - obj.width / 2,
      xMax: obj.at.x + obj.width / 2,
      yMin: obj.at.y - obj.height / 2,
      yMax: obj.at.y + obj.height / 2,
    };
  }
  if (obj.type === "area-model") {
    const { width, height, margin } = areaModelSize(obj);
    return { xMin: obj.at.x - margin, xMax: obj.at.x + width, yMin: obj.at.y - margin, yMax: obj.at.y + height };
  }
  if (obj.type === "arrow" || obj.type === "brace") return pointBounds([obj.from, obj.to]);
  if (obj.type === "axes") {
    return { xMin: Math.min(obj.xRange[0], obj.xRange[1]), xMax: Math.max(obj.xRange[0], obj.xRange[1]), yMin: Math.min(obj.yRange[0], obj.yRange[1]), yMax: Math.max(obj.yRange[0], obj.yRange[1]) };
  }
  if (obj.type === "function-plot") {
    const fn = compileExpr(obj.expr);
    if (!fn) return pointBounds([{ x: obj.domain[0], y: 0 }, { x: obj.domain[1], y: 0 }]);
    const points = Array.from({ length: 96 }, (_, i) => {
      const x = obj.domain[0] + ((obj.domain[1] - obj.domain[0]) * i) / 95;
      return { x, y: fn(x) };
    });
    return pointBounds(points);
  }
  if (obj.type === "parametric") return pointBounds(sampleParametricPoints(obj, 96));
  if (obj.type === "path") return pointBounds(samplePathPoints(obj, 18));
  if (obj.type === "polygon" || obj.type === "polyline") return pointBounds(polygonPoints(obj));
  if (obj.type === "secant-line") {
    const plot = scene.objects.find((o): o is Extract<SceneObject, { type: "function-plot" }> => o.type === "function-plot" && o.id === obj.plotId);
    const fn = plot ? compileExpr(plot.expr) : null;
    if (!fn) return null;
    return pointBounds([{ x: obj.x1, y: fn(obj.x1) }, { x: obj.x2, y: fn(obj.x2) }]);
  }
  if (obj.type === "group") {
    return pointBounds(obj.children.flatMap((child) => {
      const b = objectBounds(child, scene);
      return b ? [{ x: b.xMin, y: b.yMin }, { x: b.xMax, y: b.yMax }] : [];
    }));
  }
  if ("at" in obj) return { xMin: obj.at.x, xMax: obj.at.x, yMin: obj.at.y, yMax: obj.at.y };
  return null;
}

function objectAnchor(obj: SceneObject, scene: SceneSpec): Vec2 | null {
  const b = objectBounds(obj, scene);
  return b ? center(b) : null;
}

function pointOnObject(target: SceneObject, anchor: Extract<NonNullable<SceneObject["place"]>, { kind: "on" }>): Vec2 | null {
  if (target.type === "function-plot") {
    const fn = compileExpr(target.expr);
    const x = anchor.x ?? anchor.at ?? (target.domain[0] + target.domain[1]) / 2;
    if (!fn) return null;
    const y = fn(x);
    return Number.isFinite(y) ? { x, y } : null;
  }
  if (target.type === "parametric") {
    const t = anchor.t ?? anchor.at ?? (target.tRange[0] + target.tRange[1]) / 2;
    const p = sampleParametricPoints({ ...target, tRange: [t, t], samples: 2 }, 2)[0];
    return p && finite(p) ? p : null;
  }
  if (target.type === "path") return pathPointAt(target, anchor.t ?? anchor.at ?? 0.5);
  if (target.type === "polygon" || target.type === "polyline") {
    const points = polygonPoints(target);
    const closed = target.type === "polygon" ? [...points, points[0]].filter(Boolean) : points;
    return pointOnPolyline(closed, anchor.t ?? anchor.at ?? 0.5);
  }
  return objectAnchor(target, { version: 1, objects: [target], timeline: [] });
}

function resolvePlacement(obj: SceneObject, scene: SceneSpec): Vec2 | null {
  const place = obj.place;
  if (!place) return null;
  if (place.kind === "absolute") return place.at;

  const targetId = place.kind === "distribute" ? place.in : place.target;
  const target = scene.objects.find((o) => o.id === targetId);
  if (!target || target.id === obj.id) return null;

  let p: Vec2 | null = null;
  if (place.kind === "on") {
    p = pointOnObject(target, place);
  } else if (place.kind === "relativeTo") {
    const b = objectBounds(target, scene);
    if (b) {
      const gap = place.gap ?? 0.35;
      if (place.side === "left") p = { x: b.xMin - gap, y: (b.yMin + b.yMax) / 2 };
      else if (place.side === "right") p = { x: b.xMax + gap, y: (b.yMin + b.yMax) / 2 };
      else if (place.side === "above") p = { x: (b.xMin + b.xMax) / 2, y: b.yMax + gap };
      else if (place.side === "below") p = { x: (b.xMin + b.xMax) / 2, y: b.yMin - gap };
      else p = center(b);
    }
  } else if (place.kind === "distribute") {
    const b = objectBounds(target, scene);
    if (b) {
      const n = Math.max(1, place.count);
      const i = Math.max(0, Math.min(n - 1, place.index));
      const pad = place.gap ?? 0;
      const u = n === 1 ? 0.5 : i / (n - 1);
      p = place.axis === "x"
        ? { x: b.xMin + pad + (b.xMax - b.xMin - pad * 2) * u, y: (b.yMin + b.yMax) / 2 }
        : { x: (b.xMin + b.xMax) / 2, y: b.yMin + pad + (b.yMax - b.yMin - pad * 2) * u };
    }
  }
  return p && place.offset ? add(p, place.offset) : p;
}

function translatePathSegment(seg: PathSegment, delta: Vec2): PathSegment {
  if (seg.op === "M" || seg.op === "L") return { ...seg, to: add(seg.to, delta) };
  if (seg.op === "Q") return { ...seg, control: add(seg.control, delta), to: add(seg.to, delta) };
  if (seg.op === "C") return { ...seg, c1: add(seg.c1, delta), c2: add(seg.c2, delta), to: add(seg.to, delta) };
  return { ...seg, to: add(seg.to, delta) };
}

function moveObjectTo(obj: SceneObject, p: Vec2, scene: SceneSpec): SceneObject {
  const anchor = objectAnchor(obj, scene);
  const delta = anchor ? sub(p, anchor) : { x: 0, y: 0 };
  if ("at" in obj) return { ...obj, at: p };
  if (obj.type === "arrow" || obj.type === "brace") return { ...obj, from: add(obj.from, delta), to: add(obj.to, delta) };
  if (obj.type === "path") return { ...obj, segments: obj.segments.map((s) => translatePathSegment(s, delta)) };
  if (obj.type === "polygon" || obj.type === "polyline") return { ...obj, points: obj.points.map((q) => add(q, delta)) } as SceneObject;
  if (obj.type === "group") return { ...obj, at: p };
  return obj;
}

export function resolveObjectPlacements(scene: SceneSpec): SceneSpec {
  let objects = scene.objects;
  for (let pass = 0; pass < 4; pass++) {
    const working = { ...scene, objects };
    let changed = false;
    objects = objects.map((obj) => {
      if (!obj.place) return obj;
      const p = resolvePlacement(obj, working);
      if (!p || !finite(p)) return obj;
      const moved = moveObjectTo(obj, p, working);
      changed = changed || moved !== obj;
      return moved;
    });
    if (!changed) break;
  }
  return { ...scene, objects };
}

function scaleFor(transform?: GroupTransform): Vec2 {
  if (!transform?.scale) return { x: 1, y: 1 };
  if (typeof transform.scale === "number") return { x: transform.scale, y: transform.scale };
  return transform.scale;
}

function groupPoint(group: GroupObject, p: Vec2): Vec2 {
  const scale = scaleFor(group.transform);
  const rotate = ((group.transform?.rotate ?? 0) * Math.PI) / 180;
  const tx = group.transform?.translate?.x ?? 0;
  const ty = group.transform?.translate?.y ?? 0;
  const sx = p.x * scale.x;
  const sy = p.y * scale.y;
  const cos = Math.cos(rotate);
  const sin = Math.sin(rotate);
  return {
    x: (group.at?.x ?? 0) + tx + sx * cos - sy * sin,
    y: (group.at?.y ?? 0) + ty + sx * sin + sy * cos,
  };
}

function groupSize(group: GroupObject, w: number, h: number) {
  const scale = scaleFor(group.transform);
  return { width: Math.abs(w * scale.x), height: Math.abs(h * scale.y) };
}

function transformPathSegment(group: GroupObject, seg: PathSegment): PathSegment {
  if (seg.op === "M" || seg.op === "L") return { ...seg, to: groupPoint(group, seg.to) };
  if (seg.op === "Q") return { ...seg, control: groupPoint(group, seg.control), to: groupPoint(group, seg.to) };
  if (seg.op === "C") return { ...seg, c1: groupPoint(group, seg.c1), c2: groupPoint(group, seg.c2), to: groupPoint(group, seg.to) };
  if (seg.op === "A") {
    const scale = scaleFor(group.transform);
    return { ...seg, rx: Math.abs(seg.rx * scale.x), ry: Math.abs(seg.ry * scale.y), to: groupPoint(group, seg.to) };
  }
  return seg;
}

function transformChild(group: GroupObject, child: SceneObject): SceneObject {
  if (child.type === "parametric") {
    const style = {
      stroke: child.color,
      strokeWidth: child.width,
      dash: child.dash,
      fill: child.fill,
      opacity: child.opacity,
    };
    const poly: PolylineObject | PolygonObject = child.close || child.fill
      ? { type: "polygon", id: child.id, points: sampleParametricPoints(child, child.samples ?? 160).map((p) => groupPoint(group, p)), ...style }
      : { type: "polyline", id: child.id, points: sampleParametricPoints(child, child.samples ?? 160).map((p) => groupPoint(group, p)), stroke: child.color, strokeWidth: child.width, dash: child.dash, opacity: child.opacity };
    return poly;
  }
  if (child.type === "path") return { ...child, segments: child.segments.map((s) => transformPathSegment(group, s)) };
  if (child.type === "polygon" || child.type === "polyline") return { ...child, points: child.points.map((p) => groupPoint(group, p)) } as SceneObject;
  if (child.type === "arrow" || child.type === "brace") return { ...child, from: groupPoint(group, child.from), to: groupPoint(group, child.to) };
  if ("at" in child && child.at) {
    const at = groupPoint(group, child.at);
    if (child.type === "box" || child.type === "inset") {
      const size = groupSize(group, child.width, child.height);
      return { ...child, at, width: size.width, height: size.height } as BoxObject | InsetObject;
    }
    if (child.type === "area-model") {
      const scale = scaleFor(group.transform);
      const columns = child.columns.map((col) => ({ ...col, size: Math.abs(col.size * scale.x) }));
      const rows = child.rows.map((row) => ({ ...row, size: Math.abs(row.size * scale.y) }));
      return { ...child, at, columns, rows } as AreaModelObject;
    }
    return { ...child, at } as SceneObject;
  }
  return child;
}

function moveStepForChild(step: AnimationStep, child: SceneObject, group: GroupObject, scene: SceneSpec): AnimationStep {
  if (step.type !== "move" || !step.to) return { ...step, targetId: child.id };
  const childAnchor = objectAnchor(child, scene);
  if (!childAnchor) return { ...step, targetId: child.id };
  const groupAnchor = group.at ?? { x: 0, y: 0 };
  const delta = sub(step.to, groupAnchor);
  return { ...step, targetId: child.id, to: add(childAnchor, delta) };
}

export function expandGroups(scene: SceneSpec): SceneSpec {
  if (!scene.objects.some((o) => o.type === "group")) return scene;
  const objects: SceneObject[] = [];
  const childrenByGroup = new Map<string, SceneObject[]>();

  for (const obj of scene.objects) {
    if (obj.type !== "group") {
      objects.push(obj);
      continue;
    }
    const transformed = obj.children.flatMap((child) => {
      const next = transformChild(obj, child);
      if (next.type === "group") return next.children;
      return [next];
    });
    childrenByGroup.set(obj.id, transformed);
    objects.push(...transformed);
  }

  const timeline: AnimationStep[] = [];
  for (const step of scene.timeline) {
    const children = childrenByGroup.get(step.targetId);
    if (!children) {
      timeline.push(step);
      continue;
    }
    const group = scene.objects.find((o): o is GroupObject => o.type === "group" && o.id === step.targetId);
    if (!group) continue;
    const working = { ...scene, objects: children };
    for (const child of children) timeline.push(moveStepForChild(step, child, group, working));
  }

  return { ...scene, objects, timeline };
}
