import type { SceneSpec, StageName } from "@/types/scene";
import type { TeachingBeat } from "@/types/planning";

export const SHOT_PATTERNS = [
  "graph-approach",
  "secant-to-tangent",
  "equation-transform",
  "number-line-convergence",
  "area-accumulation",
  "vector-projection",
  "probability-bar-model",
] as const;

export type ShotPatternName = (typeof SHOT_PATTERNS)[number];

export function inferShotPattern(beat: Pick<TeachingBeat, "teachingGoal" | "visualIntent" | "narration">): ShotPatternName {
  const text = `${beat.teachingGoal} ${beat.visualIntent} ${beat.narration}`.toLowerCase();
  if (text.includes("secant") || text.includes("tangent")) return "secant-to-tangent";
  if (text.includes("area") || text.includes("riemann") || text.includes("under the curve")) return "area-accumulation";
  if (text.includes("vector") || text.includes("projection")) return "vector-projection";
  if (text.includes("probability") || text.includes("bar")) return "probability-bar-model";
  if (text.includes("number line") || text.includes("left") && text.includes("right") && text.includes("approach")) return "number-line-convergence";
  if (text.includes("equation") || text.includes("formula") || text.includes("notation") || text.includes("definition")) return "equation-transform";
  return "graph-approach";
}

export function inferStageForPattern(pattern: string): StageName {
  if (pattern === "equation-transform") return "statement";
  if (pattern === "number-line-convergence") return "split";
  if (pattern === "secant-to-tangent" || pattern === "graph-approach" || pattern === "area-accumulation") return "graph";
  return "statement";
}

// Stage is decided STRUCTURALLY first (what's actually on the board), so a
// conceptual / equation beat with no plotted curve is never misread as a graph
// and forced into the narrow rail. The shot pattern only breaks ties.
function inferStageFromObjects(scene: SceneSpec, shotPattern?: string): StageName {
  if (scene.objects.some((o) => o.type === "inset")) return "plot-inset";
  const hasGraph = scene.objects.some((o) => o.type === "axes" || o.type === "function-plot" || o.type === "secant-line");
  if (hasGraph) return shotPattern === "number-line-convergence" ? "split" : "graph";
  // No plotted curve on the board → a notation/definition/summary beat. Only the
  // number-line pattern wants the split stage; everything else is a statement.
  // (A defaulted "graph-approach" pattern must NOT force a graph stage here.)
  return shotPattern === "number-line-convergence" ? "split" : "statement";
}

/**
 * Deterministic skeleton defaults. The model still supplies the math objects;
 * the shot pattern only fixes the stage + continuity semantics. Region/callout
 * placement is decided later by the layout engine, which keeps clean authored
 * positions and relocates ONLY overlays that are actually broken — so a
 * well-composed scene is never degraded by forced placement.
 */
export function applyShotPattern(scene: SceneSpec, beat?: TeachingBeat): SceneSpec {
  const shotPattern = scene.shotPattern ?? beat?.shotPattern ?? (beat ? inferShotPattern(beat) : undefined);
  const stage = scene.stage ?? beat?.stage ?? inferStageFromObjects(scene, shotPattern);
  return {
    ...scene,
    stage,
    shotPattern,
    continueFrom: scene.continueFrom ?? beat?.continueFrom,
  };
}
