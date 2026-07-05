import type { Metadata } from "next";
import Link from "next/link";

import PageShell from "@/components/site/PageShell";
import Reveal from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "From one topic prompt to a narrated, animated, interruptible lesson — the full Lumen pipeline, explained.",
};

const STAGES = [
  {
    n: "01",
    name: "Ask",
    title: "One prompt is the whole interface",
    body: "Type what you want to understand — “what is a derivative”, “why is the area of a circle πr²”, “explain eigenvectors”. No course catalog, no playlist hunting. The topic you typed is the syllabus.",
    detail: "Anything that benefits from being drawn works: calculus, linear algebra, trigonometry, geometry, physics intuition, probability, algorithms.",
  },
  {
    n: "02",
    name: "Tune",
    title: "A quick diagnostic, not a placement exam",
    body: "Before building anything, Lumen asks a few multiple-choice questions: what's your background, what do you want out of this, how fast should it go. Thirty seconds, defaults pre-selected.",
    detail: "The lesson script is then written against your answers — a gentle intuition-first pass for a first-timer, a brisker, notation-comfortable pass for someone reviewing.",
  },
  {
    n: "03",
    name: "Script",
    title: "A teacher writes before it draws",
    body: "Lumen first writes a complete teaching script — an ordered sequence of “beats”, each with a narration line and a visual intent, the way a great lecturer plans a board before class.",
    detail: "The script is self-reviewed for flow and correctness before a single scene is composed, so the lesson has an arc instead of being improvised frame by frame.",
  },
  {
    n: "04",
    name: "Compose",
    title: "Every beat becomes an animated scene",
    body: "Each beat is compiled into a scene description — objects, positions, and a timeline — then validated, laid out, quality-checked, and repaired deterministically before it's allowed on screen.",
    detail: "The model never draws pixels. It describes the scene as data, and a deterministic engine does the drawing. That's why diagrams are precise, every time.",
  },
  {
    n: "05",
    name: "Play",
    title: "Narrated playback, like a lecture built for you",
    body: "A natural neural voice narrates while the whiteboard animates in sync at 60fps in your browser. Audio for upcoming beats is prefetched, so playback never stutters between beats.",
    detail: "Pause, resume, and replay at any time. Captions mirror the narration throughout, so lessons work with the sound off too.",
  },
  {
    n: "06",
    name: "Interrupt",
    title: "Ask the moment you're confused",
    body: "Stop the teacher mid-sentence and type your question. Lumen generates a narrated answer scene that knows exactly what's on the board, plays it, then resumes the lesson where it left off.",
    detail: "Because scenes are data — not rendered video — an answer costs one fast model call, not a re-render. Interruptions feel immediate.",
  },
];

export default function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="How it works"
      title="From a question to a living lesson, in six moves."
      lede="Lumen isn't a video generator and isn't a chatbot. It's a pipeline that turns one topic prompt into a narrated, animated lesson you can stop and question — here's exactly what happens in between."
    >
      {/* Pipeline flow strip */}
      <Reveal className="overflow-x-auto rounded-2xl border border-hairline bg-panel px-6 py-5">
        <div className="flex min-w-max items-center gap-3 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-faint">
          <span className="text-foreground">Topic</span>
          <span className="text-accent">→</span>
          <span>Diagnostics</span>
          <span className="text-accent">→</span>
          <span>Teaching script</span>
          <span className="text-accent">→</span>
          <span>Scenes, beat by beat</span>
          <span className="text-accent">→</span>
          <span>Narrated playback</span>
          <span className="text-accent">⇄</span>
          <span className="text-foreground">Your interruptions</span>
        </div>
      </Reveal>

      {/* Stages */}
      <div className="mt-16 space-y-4">
        {STAGES.map((s, i) => (
          <Reveal key={s.n} delay={Math.min(i * 0.05, 0.2)}>
            <article className="grid gap-6 rounded-2xl border border-hairline bg-background p-8 transition-colors hover:bg-panel md:grid-cols-[8rem_1fr_1fr]">
              <div>
                <span className="font-mono text-xs text-accent">{s.n}</span>
                <h2 className="mt-2 text-lg font-medium tracking-tight">{s.name}</h2>
              </div>
              <div>
                <h3 className="text-base font-medium">{s.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{s.body}</p>
              </div>
              <p className="border-t border-hairline pt-4 text-sm leading-6 text-faint md:border-l md:border-t-0 md:pl-6 md:pt-0">
                {s.detail}
              </p>
            </article>
          </Reveal>
        ))}
      </div>

      {/* Latency framing */}
      <Reveal className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-2">
        <div className="bg-background p-8">
          <p className="eyebrow">Building a lesson</p>
          <p className="mt-3 text-2xl font-medium tracking-tight">A minute or two</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            A full multi-beat lesson is scripted, composed, and quality-checked scene by scene. You
            watch the progress live — script, scenes, narration — and it&apos;s worth the wait: the
            result is a lecture that exists for exactly one person.
          </p>
        </div>
        <div className="bg-background p-8">
          <p className="eyebrow">Answering an interruption</p>
          <p className="mt-3 text-2xl font-medium tracking-tight">Seconds</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Interruptions are the product, so they&apos;re built to feel instant: one fast model call
            produces one answer scene, drawn with full awareness of what&apos;s already on the board.
            Then the lesson resumes itself.
          </p>
        </div>
      </Reveal>

      {/* CTA */}
      <Reveal className="mt-16 flex flex-col items-center gap-4 rounded-2xl border border-hairline bg-panel px-8 py-14 text-center">
        <h2 className="text-2xl font-medium tracking-tight">See it happen</h2>
        <p className="max-w-md text-sm leading-6 text-muted">
          The fastest way to understand the pipeline is to watch it run on a question you actually have.
        </p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/learn"
            className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-all hover:-translate-y-0.5 hover:opacity-85"
          >
            Start a lesson
          </Link>
          <Link
            href="/technology"
            className="rounded-full border border-hairline-strong px-6 py-3 text-sm text-muted transition-all hover:-translate-y-0.5 hover:border-white/25 hover:text-foreground"
          >
            Read about the engine
          </Link>
        </div>
      </Reveal>
    </PageShell>
  );
}
