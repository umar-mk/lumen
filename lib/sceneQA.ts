import { isAreaModelChild } from "@/lib/areaModel";
import { compileExpr } from "@/lib/mathEval";
import { compileParametric, isTraceableCurve, polygonPoints, sampleParametricPoints, samplePathPoints } from "@/lib/scenePaths";
import { worldToPx } from "@/lib/coords";
import {
  objectRect,
  rectInside,
  rectsIntersect,
  sampleFunctionPoints,
  sampleTimes,
  sceneDuration,
  sceneRect,
  visibleObjectRects,
  type ObjectRect,
  type Rect,
} from "@/lib/sceneGeometry";
import { type AxesObject, type FunctionPlotObject, type SceneObject, type SceneSpec, type View } from "@/types/scene";

export type IssueSeverity = "error" | "warn";

export interface SceneIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  objectIds?: string[];
  timeSec?: number;
}

const overlayTypes = new Set<SceneObject["type"]>(["text", "label", "equation", "counter"]);
function issue(severity: IssueSeverity, code: string, message: string, objectIds?: string[], timeSec?: number): SceneIssue {
  return { severity, code, message, objectIds, timeSec };
}

function textOf(obj: SceneObject) {
  if (obj.type === "text" || obj.type === "label") return obj.text;
  if (obj.type === "equation") return obj.latex;
  if (obj.type === "counter") return `${obj.prefix ?? ""}${obj.to}${obj.suffix ?? ""}`;
  return "";
}

function normalizedText(obj: SceneObject) {
  return textOf(obj).toLowerCase().replace(/\\[a-z]+|[{}_\s:;,.!?'"`-]+/g, "");
}

function hasEmojiOrDecorative(text: string) {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
}

function anyPointInside(points: { x: number; y: number }[], rect: Rect, pad = 8) {
  return points.some(
    (p) => p.x >= rect.xMin - pad && p.x <= rect.xMax + pad && p.y >= rect.yMin - pad && p.y <= rect.yMax + pad,
  );
}

function axisStrokeHits(view: View | undefined, axes: AxesObject, rect: Rect) {
  const points = [
    ...Array.from({ length: 64 }, (_, i) => ({
      x: axes.xRange[0] + ((axes.xRange[1] - axes.xRange[0]) * i) / 63,
      y: 0,
    })),
    ...Array.from({ length: 64 }, (_, i) => ({
      x: 0,
      y: axes.yRange[0] + ((axes.yRange[1] - axes.yRange[0]) * i) / 63,
    })),
  ];
  return anyPointInside(points.map((p) => worldToPx(view, p)), rect, 10);
}

export function strokeHits(scene: SceneSpec, view: View | undefined, rect: Rect) {
  for (const obj of scene.objects) {
    if (obj.type === "function-plot") {
      if (anyPointInside(sampleFunctionPoints(view, obj, 140), rect, 12)) return obj.id;
    } else if (obj.type === "parametric") {
      if (anyPointInside(sampleParametricPoints(obj, 140).map((p) => worldToPx(view, p)), rect, 12)) return obj.id;
    } else if (obj.type === "path") {
      if (anyPointInside(samplePathPoints(obj, 18).map((p) => worldToPx(view, p)), rect, 12)) return obj.id;
    } else if (obj.type === "polygon" || obj.type === "polyline") {
      if (anyPointInside(polygonPoints(obj).map((p) => worldToPx(view, p)), rect, 12)) return obj.id;
    } else if (obj.type === "axes") {
      if (axisStrokeHits(view, obj, rect)) return obj.id;
    } else if (obj.type === "arrow") {
      const a = worldToPx(view, obj.from);
      const b = worldToPx(view, obj.to);
      const points = Array.from({ length: 32 }, (_, i) => {
        const t = i / 31;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      });
      if (anyPointInside(points, rect, 10)) return obj.id;
    } else if (obj.type === "secant-line") {
      const plot = scene.objects.find((o): o is FunctionPlotObject => o.type === "function-plot" && o.id === obj.plotId);
      const fn = plot ? compileExpr(plot.expr) : null;
      if (!fn) continue;
      const y1 = fn(obj.x1);
      const y2 = fn(obj.x2);
      if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;
      const a = worldToPx(view, { x: obj.x1, y: y1 });
      const b = worldToPx(view, { x: obj.x2, y: y2 });
      const points = Array.from({ length: 32 }, (_, i) => {
        const t = i / 31;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      });
      if (anyPointInside(points, rect, 10)) return obj.id;
    }
  }
  return null;
}

function duplicateCurveKey(obj: FunctionPlotObject) {
  return `${obj.expr.replace(/\s+/g, "")}:${obj.domain[0].toFixed(4)}:${obj.domain[1].toFixed(4)}`;
}

function allSceneObjects(objects: SceneObject[]): SceneObject[] {
  return objects.flatMap((obj) => (obj.type === "group" ? [obj, ...allSceneObjects(obj.children)] : [obj]));
}

function lintCapabilities(scene: SceneSpec, objects: SceneObject[], ids: Set<string>, issues: SceneIssue[]) {
  for (const obj of objects) {
    if (obj.place) {
      const target = obj.place.kind === "distribute" ? obj.place.in : obj.place.kind === "absolute" ? null : obj.place.target;
      if (target && !ids.has(target)) {
        issues.push(issue("error", "unresolved-reference", `${obj.id} has a placement target that does not exist: ${target}.`, [obj.id, target]));
      }
      if (target && target === obj.id) {
        issues.push(issue("error", "constraint-cycle", `${obj.id} places itself relative to itself.`, [obj.id]));
      }
    }

    if (obj.type === "function-plot" && !compileExpr(obj.expr)) {
      issues.push(issue("error", "invalid-expression", `${obj.id} has an invalid function expression.`, [obj.id]));
    }
    if (obj.type === "parametric") {
      if (!compileParametric(obj) || !sampleParametricPoints(obj, 8).length) {
        issues.push(issue("error", "invalid-expression", `${obj.id} has an invalid parametric expression.`, [obj.id]));
      }
    }
    if (obj.type === "secant-line" && !ids.has(obj.plotId)) {
      issues.push(issue("error", "unresolved-reference", `${obj.id} references missing plot ${obj.plotId}.`, [obj.id, obj.plotId]));
    }
    if (obj.type === "inset") {
      for (const shown of obj.shows) {
        if (!ids.has(shown)) issues.push(issue("error", "unresolved-reference", `${obj.id} mirrors missing object ${shown}.`, [obj.id, shown]));
      }
    }
  }

  for (const step of scene.timeline) {
    if (!ids.has(step.targetId)) {
      issues.push(issue("error", "unresolved-reference", `Timeline targets missing object ${step.targetId}.`, [step.targetId], step.start));
    }
    if (step.type === "trace" && step.plotId) {
      if (!ids.has(step.plotId)) {
        issues.push(issue("error", "unresolved-reference", `Trace step targets missing curve ${step.plotId}.`, [step.targetId, step.plotId], step.start));
      } else {
        const target = objects.find((o) => o.id === step.plotId);
        // Renderer falls back to a static dot, so this degrades rather than breaks.
        if (target && !isTraceableCurve(target)) {
          issues.push(issue("warn", "trace-target-not-curve", `Trace step rides ${step.plotId} (${target.type}), which is not a curve; the dot will not move.`, [step.targetId, step.plotId], step.start));
        }
      }
    }
  }
}

function visibleOverlays(rects: ObjectRect[]) {
  return rects.filter((r) => r.overlay);
}

function lintAtTime(scene: SceneSpec, timeSec: number, issues: SceneIssue[]) {
  const view = scene.view;
  const rects = visibleObjectRects(scene, timeSec, view);
  const overlays = visibleOverlays(rects);
  const safe = sceneRect();

  for (const rect of overlays) {
    if (!rectInside(rect.rect, safe, 12)) {
      issues.push(issue("error", "out-of-frame", `${rect.id} is outside the visible frame.`, [rect.id], timeSec));
    }
  }

  for (let i = 0; i < overlays.length; i++) {
    for (let j = i + 1; j < overlays.length; j++) {
      if (rectsIntersect(overlays[i].rect, overlays[j].rect, 8)) {
        issues.push(
          issue(
            "error",
            "text-overlap",
            `${overlays[i].id} overlaps ${overlays[j].id}.`,
            [overlays[i].id, overlays[j].id],
            timeSec,
          ),
        );
      }
    }
  }

  // A filled, opaque box or an inset behind text reads as a backplate too, so
  // panel-backed labels aren't false-flagged as sitting on a stroke.
  const panelRects = rects
    .filter((r) => {
      if (r.type !== "box" && r.type !== "inset") return false;
      const o = scene.objects.find((obj) => obj.id === r.id);
      if (!o) return false;
      if (o.type === "box") return (o.opacity ?? 1) >= 0.5 && o.fill !== "none";
      return true;
    })
    .map((r) => r.rect);

  for (const rect of overlays) {
    const obj = scene.objects.find((o) => o.id === rect.id);
    const hasBackplate =
      (obj && overlayTypes.has(obj.type) && "background" in obj && Boolean(obj.background)) ||
      panelRects.some((p) => rectInside(rect.rect, p, -6));
    if (!hasBackplate) {
      const hit = strokeHits(scene, view, rect.rect);
      if (hit) {
        issues.push(issue("error", "text-on-stroke", `${rect.id} sits on top of ${hit}.`, [rect.id, hit], timeSec));
      }
    }
  }

  if (overlays.length > 5) {
    // Busy, not broken: a count alone isn't a clipped/overlapping frame. Overlap
    // and out-of-frame are the hard errors; density is a quality smell we log.
    issues.push(issue("warn", "info-budget", `Too many simultaneous text/equation objects (${overlays.length}).`, overlays.map((r) => r.id), timeSec));
  }
}

/**
 * Pacing smells (warn, not error): the retimer (lib/syncTimeline.ts) auto-fixes
 * dead air at play time, but a scene that RELIES on that fix is a quality miss
 * worth surfacing in eval reports and qaWarnings. Warn-level on purpose — the
 * sanitize loop has no pacing fixes, so severe would dead-end in a fallback.
 */
function lintPacing(scene: SceneSpec, issues: SceneIssue[]) {
  const duration = sceneDuration(scene);
  if (!scene.timeline.length) {
    issues.push(issue("warn", "no-motion", "Scene has no timeline steps at all; the board is a static frame."));
    return;
  }
  const intervals = scene.timeline
    .map((s) => [Math.max(0, s.start), Math.min(duration, s.start + Math.max(0, s.duration))] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let frontier = 0;
  let worstGap = 0;
  let worstGapAt = 0;
  for (const [a, b] of intervals) {
    if (a - frontier > worstGap) {
      worstGap = a - frontier;
      worstGapAt = frontier;
    }
    frontier = Math.max(frontier, b);
  }
  if (duration - frontier > worstGap) {
    worstGap = duration - frontier;
    worstGapAt = frontier;
  }
  if (worstGap > 4.5) {
    issues.push(issue("warn", "dead-air", `Nothing animates for ${worstGap.toFixed(1)}s; spread the timeline across the beat.`, undefined, worstGapAt));
  }
  if (frontier < duration * 0.55) {
    issues.push(issue("warn", "front-loaded", `All motion ends by ${frontier.toFixed(1)}s of ${duration.toFixed(0)}s; the scene freezes for the rest of the narration.`, undefined, frontier));
  }
}

function lintCamera(scene: SceneSpec, issues: SceneIssue[]) {
  for (const move of scene.camera ?? []) {
    const activeRegionObjects = scene.objects.filter((obj) => overlayTypes.has(obj.type) && "region" in obj && obj.region);
    for (const obj of activeRegionObjects) {
      const rect = objectRect(scene, obj, move.to);
      if (rect && !rectInside(rect.rect, sceneRect(), 22)) {
        issues.push(
          issue(
            "error",
            "camera-clips-region",
            `Camera move clips still-visible region object ${obj.id}. Fade it out, widen the move, or use an inset.`,
            [obj.id],
            move.start,
          ),
        );
      }
    }
  }
}

export function lintScene(scene: SceneSpec): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const ids = new Set<string>();
  const objects = allSceneObjects(scene.objects);
  for (const obj of objects) {
    if (ids.has(obj.id)) issues.push(issue("error", "duplicate-id", `Duplicate object id ${obj.id}.`, [obj.id]));
    ids.add(obj.id);

    if (overlayTypes.has(obj.type)) {
      const text = textOf(obj).trim();
      if (!text) issues.push(issue("error", "empty-text", `${obj.id} has empty annotation text.`, [obj.id]));
      if (hasEmojiOrDecorative(text)) issues.push(issue("error", "emoji", `${obj.id} contains emoji/decorative glyphs.`, [obj.id]));
      if ("background" in obj && obj.background && !text) issues.push(issue("error", "empty-backplate", `${obj.id} has a backplate with no text.`, [obj.id]));
    }
  }
  lintCapabilities(scene, objects, ids, issues);

  if (scene.title) issues.push(issue("warn", "scene-title", "Scene title is ignored by the player and often duplicates visible text."));

  const labels = new Map<string, string>();
  for (const obj of objects.filter((o) => overlayTypes.has(o.type))) {
    // Area models deliberately repeat labels (a square has `x` on two edges; the
    // off-diagonal tiles share an area) — they're placed deterministically, so a
    // repeated label there is correct, not clutter.
    if (isAreaModelChild(obj.id)) continue;
    const key = normalizedText(obj);
    if (key.length < 3) continue;
    const prior = labels.get(key);
    if (prior) issues.push(issue("error", "duplicate-label", `${obj.id} duplicates ${prior}.`, [prior, obj.id]));
    else labels.set(key, obj.id);
  }

  const curves = new Map<string, string>();
  for (const obj of objects.filter((o): o is FunctionPlotObject => o.type === "function-plot")) {
    const key = duplicateCurveKey(obj);
    const prior = curves.get(key);
    if (prior) issues.push(issue("error", "duplicate-curve", `${obj.id} duplicates ${prior}.`, [prior, obj.id]));
    else curves.set(key, obj.id);
  }

  const firstFrameVisible = scene.objects.filter((obj) => {
    const hasEntry = scene.timeline.some((s) => s.targetId === obj.id && (s.type === "fadeIn" || s.type === "draw"));
    return !hasEntry && obj.type !== "arrow";
  });
  if (firstFrameVisible.length > 7) {
    issues.push(
      issue(
        "warn",
        "first-frame-clutter",
        `Too many objects are visible at frame 1 (${firstFrameVisible.length}); build the board over time.`,
        firstFrameVisible.map((o) => o.id),
        0,
      ),
    );
  }

  for (const t of sampleTimes(scene)) lintAtTime(scene, t, issues);
  lintCamera(scene, issues);
  lintPacing(scene, issues);

  return dedupeIssues(issues);
}

function dedupeIssues(issues: SceneIssue[]) {
  const seen = new Set<string>();
  const out: SceneIssue[] = [];
  for (const item of issues) {
    const key = `${item.code}:${item.objectIds?.join(",") ?? ""}:${Math.round((item.timeSec ?? -1) * 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function severeIssues(issues: SceneIssue[]) {
  return issues.filter((i) => i.severity === "error");
}

export function formatIssues(issues: SceneIssue[], limit = 16) {
  return issues
    .slice(0, limit)
    .map((i) => `- [${i.severity}] ${i.code}${i.objectIds?.length ? ` (${i.objectIds.join(", ")})` : ""}${i.timeSec !== undefined ? ` at ${i.timeSec.toFixed(1)}s` : ""}: ${i.message}`)
    .join("\n");
}
