import type { SceneSpec } from "@/types/scene";

/**
 * The absolute-last-resort scene when a beat's visual could not be generated or
 * salvaged. It is deliberately TEXT-FREE: the narration still plays, so the
 * board shows a calm, neutral motif (a curve drawing in, a point gliding along
 * it) instead of leaking authoring metadata (teaching goals, stage directions)
 * or apologetic filler text on-screen. Deterministic and always QA-clean.
 */
export function silentFallbackScene(durationSec?: number): SceneSpec {
  const d = Math.max(6, Math.min(60, durationSec ?? 12));
  const drawFor = Math.min(3, d * 0.25);
  return {
    version: 1,
    stage: "graph",
    objects: [
      { type: "function-plot", id: "fallback-curve", expr: "2*sin(x/2)", domain: [-6.5, 6.5], color: "#d9a441", width: 3 },
      { type: "dot", id: "fallback-dot", at: { x: -6.5, y: 2 * Math.sin(-3.25) }, radius: 8 },
    ],
    timeline: [
      { type: "draw", targetId: "fallback-curve", start: 0, duration: drawFor },
      { type: "fadeIn", targetId: "fallback-dot", start: Math.max(0, drawFor - 0.6), duration: 0.6 },
      { type: "trace", targetId: "fallback-dot", plotId: "fallback-curve", start: drawFor, duration: Math.max(1, d - drawFor - 0.5) },
    ],
    duration: d,
  };
}
