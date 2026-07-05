/**
 * Deterministic house-style polish — the "cinematographer" pass.
 *
 * Runs after resolveLayout and before the QA lint on every scene (model or
 * program authored). It never adds/removes objects and never moves geometry;
 * it only normalizes presentation choices the model gets inconsistently right:
 * entry order, stagger rhythm, minimum step/camera durations, font-size tiers,
 * and camera zoom bounds. Idempotent and pure, so it can run on every pass of
 * the sanitize loop without drift.
 */

import { sceneDuration } from "@/lib/sceneGeometry";
import type { AnimationStep, CameraMove, SceneSpec, View } from "@/types/scene";

const FONT_TIERS = [20, 24, 28, 32, 36, 40, 48];
const ENTRY_TYPES = new Set(["fadeIn", "draw"]);
/** Steps whose motion reads wrong when it snaps by in a blink. */
const SLOW_TYPES = new Set(["move", "morph", "trace", "slide", "reshape", "count", "transform"]);
/** Tightest allowed camera target: fraction of the base view's area. */
const MIN_ZOOM_AREA_RATIO = 0.22;
const STAGGER_SEC = 0.35;

const snapFont = (size: number) => {
  const clamped = Math.max(18, Math.min(56, size));
  return FONT_TIERS.reduce((best, tier) => (Math.abs(tier - clamped) < Math.abs(best - clamped) ? tier : best), FONT_TIERS[0]);
};

function polishFonts(scene: SceneSpec): SceneSpec {
  const objects = scene.objects.map((obj) => {
    if ((obj.type === "text" || obj.type === "label" || obj.type === "equation" || obj.type === "counter") && obj.fontSize) {
      const snapped = snapFont(obj.fontSize);
      if (snapped !== obj.fontSize) return { ...obj, fontSize: snapped };
    }
    return obj;
  });
  return { ...scene, objects };
}

/** Axes must be on the board before anything is plotted on them. */
function polishEntryOrder(timeline: AnimationStep[], scene: SceneSpec): AnimationStep[] {
  const axesIds = new Set(scene.objects.filter((o) => o.type === "axes").map((o) => o.id));
  const curveIds = new Set(
    scene.objects.filter((o) => o.type === "function-plot" || o.type === "parametric").map((o) => o.id),
  );
  if (!axesIds.size || !curveIds.size) return timeline;

  const entryStart = (ids: Set<string>, reduce: (a: number, b: number) => number, init: number) =>
    timeline.filter((s) => ids.has(s.targetId) && ENTRY_TYPES.has(s.type)).reduce((acc, s) => reduce(acc, s.start), init);

  const firstCurveEntry = entryStart(curveIds, Math.min, Infinity);
  if (!Number.isFinite(firstCurveEntry)) return timeline;

  return timeline.map((step) => {
    if (axesIds.has(step.targetId) && ENTRY_TYPES.has(step.type) && step.start > firstCurveEntry) {
      return { ...step, start: Math.max(0, firstCurveEntry - 0.8) };
    }
    return step;
  });
}

/** Several things popping in on the same instant reads as a slide, not a build. */
function polishStagger(timeline: AnimationStep[], duration: number): AnimationStep[] {
  const out = timeline.map((s) => ({ ...s }));
  const entries = out
    .filter((s) => ENTRY_TYPES.has(s.type))
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const cur = entries[i];
    if (cur.targetId !== prev.targetId && cur.start - prev.start < 0.05) {
      cur.start = Math.min(duration - 0.2, prev.start + STAGGER_SEC);
    }
  }
  return out;
}

function polishStepDurations(timeline: AnimationStep[]): AnimationStep[] {
  return timeline.map((step) => {
    if (ENTRY_TYPES.has(step.type) && step.duration < 0.3) return { ...step, duration: 0.5 };
    if (SLOW_TYPES.has(step.type) && step.duration < 0.4) return { ...step, duration: 0.8 };
    return step;
  });
}

const viewArea = (v: View) => Math.max(1e-6, (v.xMax - v.xMin) * (v.yMax - v.yMin));

function expandAboutCenter(v: View, factor: number): View {
  const cx = (v.xMin + v.xMax) / 2;
  const cy = (v.yMin + v.yMax) / 2;
  const hw = ((v.xMax - v.xMin) / 2) * factor;
  const hh = ((v.yMax - v.yMin) / 2) * factor;
  return { xMin: cx - hw, xMax: cx + hw, yMin: cy - hh, yMax: cy + hh };
}

/** No blink-cuts, no blob-zooms, no moves that start after the scene ends. */
function polishCamera(camera: CameraMove[] | undefined, scene: SceneSpec, duration: number): CameraMove[] | undefined {
  if (!camera?.length || !scene.view) return camera;
  const baseArea = viewArea(scene.view);
  const polished = camera
    .filter((move) => move.start < duration - 0.2)
    .map((move) => {
      let to = move.to;
      const ratio = viewArea(to) / baseArea;
      if (ratio < MIN_ZOOM_AREA_RATIO) {
        to = expandAboutCenter(to, Math.sqrt(MIN_ZOOM_AREA_RATIO / ratio));
      }
      return { ...move, to, duration: Math.max(1.2, move.duration) };
    });
  return polished.length ? polished : undefined;
}

export function polishScene(scene: SceneSpec): SceneSpec {
  const duration = sceneDuration(scene);
  let timeline = polishEntryOrder(scene.timeline, scene);
  timeline = polishStagger(timeline, duration);
  timeline = polishStepDurations(timeline);
  const camera = polishCamera(scene.camera, scene, duration);
  return polishFonts({ ...scene, timeline, camera });
}
