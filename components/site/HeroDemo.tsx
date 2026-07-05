"use client";

import { useEffect, useMemo, useState } from "react";

import SceneRenderer from "@/components/SceneRenderer";
import { offlineDerivativeLesson } from "@/lib/offlinePipeline";

/** Seconds each beat plays in the silent hero loop. */
const BEAT_SECONDS = 9;
/** How many beats of the sample lesson the loop shows before wrapping. */
const BEAT_COUNT = 6;

/**
 * The landing-page hero: the REAL rendering engine silently playing the first
 * beats of the hand-authored sample lesson on a loop. No video file — this is
 * the actual product drawing live, which is the whole pitch.
 */
export default function HeroDemo() {
  const segments = useMemo(() => offlineDerivativeLesson.segments.slice(0, BEAT_COUNT), []);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setBeat((b) => (b + 1) % segments.length), BEAT_SECONDS * 1000);
    return () => clearInterval(t);
  }, [segments.length]);

  const segment = segments[beat];

  return (
    <figure className="overflow-hidden rounded-2xl border border-hairline-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
      {/* Player chrome */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">
          {offlineDerivativeLesson.title}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-accent">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          Live render
        </span>
      </div>

      {/* The engine itself — remounted per beat via key */}
      <SceneRenderer
        key={`hero-${beat}`}
        scene={segment.scene}
        sceneKey={`hero-${beat}`}
        narrationSeconds={BEAT_SECONDS}
        playing
      />

      {/* Caption + beat progress */}
      <figcaption className="flex flex-col gap-3 border-t border-hairline px-5 py-4">
        <p className="min-h-10 text-sm leading-6 text-muted">{segment.narration}</p>
        <div className="flex items-center gap-1.5">
          {segments.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setBeat(i)}
              aria-label={`Play beat ${i + 1}`}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i === beat ? "bg-accent" : i < beat ? "bg-white/25" : "bg-white/10"
              }`}
            />
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
