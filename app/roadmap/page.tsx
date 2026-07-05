import type { Metadata } from "next";
import Link from "next/link";

import PageShell from "@/components/site/PageShell";
import Reveal from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "What's live in Lumen today, what's being built right now, and where the interruptible lesson is going next.",
};

const LIVE = [
  { t: "Full lessons, end to end", b: "One prompt becomes a complete multi-beat narrated lesson — scripted, composed, and played without human touch." },
  { t: "Diagnostic tuning", b: "Quick background questions shape the script, so the same topic teaches differently to different people." },
  { t: "Mid-lesson interruption", b: "Ask any time; a context-aware answer scene plays, then the lesson resumes itself." },
  { t: "Neural narration", b: "A natural teaching voice with per-beat prefetch, so playback never stutters. Captions always mirror the audio." },
  { t: "Generalized geometry", b: "Curves, outlines, polygons, composed groups, algebra-tile models — arbitrary topics render without topic-specific code." },
  { t: "Relational placement", b: "A constraint solver puts points exactly on curves and keeps labels aligned. The model never guesses pixels." },
  { t: "Self-healing scenes", b: "Every scene is linted and mechanically repaired before it plays — overlaps, off-frame text, and invalid references get fixed, not shipped." },
  { t: "Runs on inexpensive models", b: "Provider-agnostic model layer with schema coercion and truncation recovery, so quality doesn't depend on an expensive frontier model." },
];

const NOW = [
  { t: "Motion on every curve", b: "Points that orbit a circle, values that unroll onto a graph — animating along any curve, not just function plots." },
  { t: "Zero-text guarantee", b: "Driving bare-text fallback frames to zero: if a scene fails, regenerate a minimal correct visual instead of showing prose." },
  { t: "Sharper visual grammar", b: "Tightening the contract between script and scene so every beat's visual matches its narration beat-for-beat." },
];

const NEXT = [
  { t: "Streaming start", b: "Playback begins after the first beats are ready while the rest of the lesson builds in the background." },
  { t: "Lesson history & replays", b: "Every lesson you build, saved and replayable — your personal library of explanations." },
  { t: "The model decides when to pause", b: "Interruption handling where the teacher chooses whether to answer inline, defer, or reshape the rest of the lesson." },
  { t: "Richer voices", b: "More natural pacing, emphasis synced to the board, and voice choices." },
];

const LATER = [
  { t: "True 3D scenes", b: "Surfaces, solids, and rotation for multivariable calculus and physics." },
  { t: "Live interactivity", b: "Drag the point yourself; the narration responds to what you do." },
  { t: "Classroom tools", b: "Assignments, shared lessons, and insight into where students actually get confused." },
];

function Column({
  label,
  tone,
  items,
  delay,
}: {
  label: string;
  tone: "live" | "now" | "next" | "later";
  items: { t: string; b: string }[];
  delay: number;
}) {
  const chip =
    tone === "live"
      ? "bg-accent-soft text-accent"
      : tone === "now"
        ? "border border-accent/40 text-accent"
        : "border border-hairline-strong text-faint";
  return (
    <Reveal delay={delay} className="flex flex-col">
      <span className={`w-max rounded-full px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] ${chip}`}>
        {label}
      </span>
      <div className="mt-5 flex-1 space-y-4">
        {items.map((i) => (
          <div key={i.t} className="rounded-2xl border border-hairline bg-background p-6 transition-colors hover:bg-panel">
            <h3 className="text-sm font-medium">{i.t}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{i.b}</p>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

export default function RoadmapPage() {
  return (
    <PageShell
      eyebrow="Roadmap"
      title="Where the interruptible lesson goes next."
      lede="Lumen is in preview and built in the open. Here's what already works, what's on the bench right now, and what the format grows into. No dates — just an honest ordering."
    >
      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
        <Column label="Live today" tone="live" items={LIVE} delay={0} />
        <Column label="Building now" tone="now" items={NOW} delay={0.08} />
        <Column label="Up next" tone="next" items={NEXT} delay={0.16} />
        <Column label="Further out" tone="later" items={LATER} delay={0.24} />
      </div>

      <Reveal className="mt-20 flex flex-col items-center gap-4 rounded-2xl border border-hairline bg-panel px-8 py-14 text-center">
        <h2 className="text-2xl font-medium tracking-tight">Try what&apos;s live</h2>
        <p className="max-w-md text-sm leading-6 text-muted">
          Everything in the first column ships in the preview you can use right now.
        </p>
        <Link
          href="/learn"
          className="mt-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-all hover:-translate-y-0.5 hover:opacity-85"
        >
          Start a lesson
        </Link>
      </Reveal>
    </PageShell>
  );
}
