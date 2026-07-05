"use client";

/**
 * Renders one eval-harness lesson (eval-results/<run>/<topic>.json) through the
 * REAL SceneRenderer, beat by beat, with the deterministic score breakdown next
 * to it — so a low-scoring beat can be eyeballed immediately. Dev-only tooling;
 * reached from /debug/eval.
 */

import { useState } from "react";

import SceneRenderer from "@/components/SceneRenderer";
import type { Lesson } from "@/types/lesson";
import type { LessonScoreSummary, SceneScoreParts } from "@/lib/sceneScore";

const PART_LABELS: Record<keyof SceneScoreParts, string> = {
  lint: "lint",
  motionCoverage: "motion",
  pacing: "pacing",
  build: "build",
  economy: "economy",
  overlayDensity: "overlays",
  camera: "camera",
  variety: "variety",
};

export default function EvalLessonViewer({ lesson, scores }: { lesson: Lesson; scores: LessonScoreSummary }) {
  const [index, setIndex] = useState(0);
  const [playId, setPlayId] = useState(0);
  const segment = lesson.segments[index];
  const beatScore = scores.beats[index]?.score;

  if (!segment) return <p className="text-sm opacity-70">No beats in this lesson.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {lesson.segments.map((s, i) => {
          const t = scores.beats[i]?.score.total ?? 0;
          const tone = t >= 75 ? "bg-emerald-600" : t >= 55 ? "bg-amber-600" : "bg-red-700";
          return (
            <button
              key={s.id}
              onClick={() => {
                setIndex(i);
                setPlayId((p) => p + 1);
              }}
              className={`rounded px-2 py-1 text-xs text-white ${tone} ${i === index ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`}
              title={s.narration.slice(0, 120)}
            >
              {i + 1} · {t}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/15 bg-black">
        <SceneRenderer key={`${index}-${playId}`} scene={segment.scene} sceneKey={`${index}-${playId}`} playing />
      </div>

      <div className="flex flex-wrap items-start gap-6 text-sm">
        <button onClick={() => setPlayId((p) => p + 1)} className="rounded bg-white/10 px-3 py-1 hover:bg-white/20">
          Replay beat
        </button>
        {beatScore && (
          <div className="flex flex-wrap gap-3">
            <span className="font-semibold">total {beatScore.total}</span>
            {(Object.keys(PART_LABELS) as (keyof SceneScoreParts)[]).map((key) => (
              <span key={key} className={beatScore.parts[key] < 0.6 ? "text-red-400" : "opacity-70"}>
                {PART_LABELS[key]} {Math.round(beatScore.parts[key] * 100)}
              </span>
            ))}
            <span className="opacity-70">
              {beatScore.severeIssues} severe / {beatScore.warnIssues} warn
            </span>
          </div>
        )}
      </div>

      <p className="max-w-3xl text-sm leading-relaxed opacity-80">{segment.narration}</p>
    </div>
  );
}
