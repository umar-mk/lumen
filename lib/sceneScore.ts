/**
 * Deterministic scene-quality score — the model-free "judge".
 *
 * Turns a laid-out SceneSpec into a 0–100 composite so quality can be measured
 * (eval harness), compared (best-of-N candidate selection), and regressed
 * against. Pure and cheap: geometry sampling + the existing QA linter, no model
 * calls. Higher is better. The parts are exposed so reports can explain WHY a
 * beat scored low.
 */

import { isAreaModelChild } from "@/lib/areaModel";
import { sceneDuration, visibleObjectRects, sampleTimes } from "@/lib/sceneGeometry";
import { lintScene, type SceneIssue } from "@/lib/sceneQA";
import type { SceneSpec } from "@/types/scene";

export interface SceneScoreParts {
  /** 1 − penalties for severe/warn lint issues. */
  lint: number;
  /** Fraction of the beat during which at least one timeline step is active. */
  motionCoverage: number;
  /** Steps spread across the beat (early start, active ending) vs. front-loaded. */
  pacing: number;
  /** Fraction of objects that are constructed on screen (draw/fadeIn entry). */
  build: number;
  /** Object count inside the readable sweet spot (a few things, not a wall). */
  economy: number;
  /** Max simultaneous text/equation overlays stays low. */
  overlayDensity: number;
  /** Camera is used, and used gently (no zoom past sane bounds). */
  camera: number;
  /** Change is shown as motion: morph/trace/slide/transform/… present. */
  variety: number;
}

export interface SceneScore {
  /** Weighted composite, 0–100. */
  total: number;
  parts: SceneScoreParts;
  /** Count of severe lint issues (0 on anything that shipped through the gate). */
  severeIssues: number;
  warnIssues: number;
}

const WEIGHTS: Record<keyof SceneScoreParts, number> = {
  lint: 0.28,
  motionCoverage: 0.16,
  pacing: 0.12,
  build: 0.12,
  economy: 0.08,
  overlayDensity: 0.08,
  camera: 0.08,
  variety: 0.08,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Total length of the union of [start, end] step intervals, clipped to [0, duration]. */
function activeUnion(scene: SceneSpec, duration: number): number {
  const intervals = scene.timeline
    .map((s) => [Math.max(0, s.start), Math.min(duration, s.start + Math.max(0, s.duration))] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = 0;
  for (const [a, b] of intervals) {
    if (b <= cursor) continue;
    covered += b - Math.max(a, cursor);
    cursor = Math.max(cursor, b);
  }
  return covered;
}

/** The step types that read as "the idea changing", not just entrances. */
const CHANGE_STEPS = new Set(["morph", "trace", "slide", "transform", "reshape", "move", "count", "emphasize", "highlight"]);

function lintPart(issues: SceneIssue[]): { lint: number; severe: number; warn: number } {
  const severe = issues.filter((i) => i.severity === "error").length;
  const warn = issues.length - severe;
  return { lint: clamp01(1 - 0.5 * severe - 0.12 * warn), severe, warn };
}

function motionParts(scene: SceneSpec, duration: number): { motionCoverage: number; pacing: number } {
  if (!scene.timeline.length) return { motionCoverage: 0, pacing: 0 };
  const motionCoverage = clamp01(activeUnion(scene, duration) / duration);

  // Pacing: something should begin early, and activity should persist late.
  const starts = scene.timeline.map((s) => s.start);
  const ends = scene.timeline.map((s) => s.start + s.duration);
  const firstStart = Math.min(...starts);
  const lastEnd = Math.min(duration, Math.max(...ends));
  const startsEarly = clamp01(1 - firstStart / Math.max(1, duration * 0.25));
  const endsLate = clamp01(lastEnd / duration / 0.85);
  return { motionCoverage, pacing: (startsEarly + endsLate) / 2 };
}

function buildPart(scene: SceneSpec): number {
  const candidates = scene.objects.filter((o) => !isAreaModelChild(o.id) && o.type !== "arrow");
  if (!candidates.length) return 0;
  const withEntry = candidates.filter((o) =>
    scene.timeline.some((s) => s.targetId === o.id && (s.type === "fadeIn" || s.type === "draw")),
  );
  return clamp01(withEntry.length / candidates.length);
}

function economyPart(scene: SceneSpec): number {
  const count = scene.objects.filter((o) => !isAreaModelChild(o.id)).length;
  if (count === 0) return 0;
  if (count <= 12) return 1;
  // Taper: 13 → ~0.9 down to 0 at the 40-object cap.
  return clamp01(1 - (count - 12) / 28);
}

function overlayDensityPart(scene: SceneSpec, duration: number): number {
  let worst = 0;
  for (const t of sampleTimes(scene)) {
    if (t > duration) break;
    const overlays = visibleObjectRects(scene, t, scene.view).filter((r) => r.overlay && !isAreaModelChild(r.id));
    worst = Math.max(worst, overlays.length);
  }
  if (worst <= 3) return 1;
  if (worst <= 5) return 0.7;
  return clamp01(0.7 - (worst - 5) * 0.2);
}

function cameraPart(scene: SceneSpec): number {
  const moves = scene.camera ?? [];
  if (!moves.length) return 0.45; // a still frame is acceptable, not great
  const view = scene.view;
  if (!view) return 0.7;
  const baseArea = Math.max(1e-6, (view.xMax - view.xMin) * (view.yMax - view.yMin));
  let score = 1;
  for (const move of moves) {
    const area = Math.max(1e-6, (move.to.xMax - move.to.xMin) * (move.to.yMax - move.to.yMin));
    const ratio = area / baseArea;
    // Gentle push-in (25%–90% of the frame) or a pull-back reads well; a zoom
    // tighter than ~1/5 of the frame is the "point becomes a blob" failure.
    if (ratio < 0.2) score = Math.min(score, 0.3);
    else if (ratio < 0.25) score = Math.min(score, 0.7);
  }
  return score;
}

function varietyPart(scene: SceneSpec): number {
  const kinds = new Set(scene.timeline.filter((s) => CHANGE_STEPS.has(s.type)).map((s) => s.type));
  if (kinds.size >= 2) return 1;
  if (kinds.size === 1) return 0.7;
  return 0;
}

/**
 * Score one laid-out scene. Pass `issues` when the caller already ran
 * `lintScene` (the lesson builder does) to avoid double linting.
 */
export function scoreScene(scene: SceneSpec, opts?: { issues?: SceneIssue[] }): SceneScore {
  const issues = opts?.issues ?? lintScene(scene);
  const duration = sceneDuration(scene);
  const { lint, severe, warn } = lintPart(issues);
  const { motionCoverage, pacing } = motionParts(scene, duration);

  const parts: SceneScoreParts = {
    lint,
    motionCoverage,
    pacing,
    build: buildPart(scene),
    economy: economyPart(scene),
    overlayDensity: overlayDensityPart(scene, duration),
    camera: cameraPart(scene),
    variety: varietyPart(scene),
  };

  const total = (Object.keys(WEIGHTS) as (keyof SceneScoreParts)[]).reduce(
    (sum, key) => sum + WEIGHTS[key] * parts[key],
    0,
  );
  return { total: Math.round(total * 1000) / 10, parts, severeIssues: severe, warnIssues: warn };
}

export interface LessonScoreSummary {
  beats: { index: number; id: string; score: SceneScore }[];
  mean: number;
  min: number;
  /** The weakest part across the lesson, for "what to fix next" reports. */
  weakestPart: keyof SceneScoreParts;
}

export function summarizeLessonScores(segments: { id: string; scene: SceneSpec }[]): LessonScoreSummary {
  const beats = segments.map((segment, index) => ({ index, id: segment.id, score: scoreScene(segment.scene) }));
  const totals = beats.map((b) => b.score.total);
  const mean = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : 0;
  const min = totals.length ? Math.min(...totals) : 0;

  const partKeys = Object.keys(WEIGHTS) as (keyof SceneScoreParts)[];
  let weakestPart: keyof SceneScoreParts = "lint";
  let weakestMean = Infinity;
  for (const key of partKeys) {
    const m = beats.length ? beats.reduce((sum, b) => sum + b.score.parts[key], 0) / beats.length : 0;
    if (m < weakestMean) {
      weakestMean = m;
      weakestPart = key;
    }
  }
  return { beats, mean, min, weakestPart };
}
