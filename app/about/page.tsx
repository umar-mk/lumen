import type { Metadata } from "next";
import Link from "next/link";

import PageShell from "@/components/site/PageShell";
import Reveal from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: "About",
  description: "Why Lumen exists: the best explanations ever made shouldn't be rare. We're making them buildable on demand, for one person at a time.",
};

const PRINCIPLES = [
  {
    t: "Determinism over generation",
    b: "Wherever correctness matters — geometry, layout, alignment, safety — code decides, not a model. The model supplies intent; the engine supplies precision.",
  },
  {
    t: "Interruptibility is the product",
    b: "A lesson you can't question is just television. Every architectural choice is subordinate to one test: can the student stop it and ask, and does it feel instant?",
  },
  {
    t: "Cost is a design constraint",
    b: "Tutoring only matters if everyone can afford it. Lumen is engineered to run on inexpensive models with no GPUs and no render farms — cheapness is load-bearing, not incidental.",
  },
  {
    t: "Show, then say, then check",
    b: "Great teaching narrates while it draws and pauses when you're lost. The format is the pedagogy: synchronized voice and board, tuned to your level, open to your questions.",
  },
];

export default function AboutPage() {
  return (
    <PageShell
      eyebrow="About"
      title="The best explanations ever made shouldn't be rare."
      lede="A handful of educators — think of the finest animated math explainers on the internet — have shown what an explanation can be. Each one takes an expert weeks. Lumen exists to make that quality of explanation buildable in minutes, for an audience of one."
    >
      {/* Story */}
      <div className="grid gap-14 lg:grid-cols-[1.4fr_1fr]">
        <Reveal>
          <div className="space-y-6 text-pretty leading-8 text-muted">
            <p>
              Everyone has felt the difference between reading about an idea and{" "}
              <em className="text-foreground not-italic">watching it get drawn</em> — the curve traced
              slowly, the point sliding, the voice saying &ldquo;now watch what happens&rdquo; at
              exactly the right moment. That experience used to require either a world-class teacher
              in the room or weeks of hand animation.
            </p>
            <p>
              The obvious shortcut — asking an AI to generate a teaching video — turns out to be the
              wrong tool. It&apos;s slow, it&apos;s expensive, you can&apos;t interrupt it, and the
              math it draws is confidently, decoratively wrong.
            </p>
            <p>
              Lumen took a different bet: <span className="text-foreground">let the model teach, never let it draw.</span>{" "}
              The model plans the lesson and describes each scene as structured data; a deterministic
              engine renders it precisely, live, in your browser. That one decision makes lessons
              instant enough to interrupt, cheap enough to build per-person, and correct enough to
              trust.
            </p>
            <p>
              What we&apos;re really building is the feel of the best tutoring session you&apos;ve
              ever had: a brilliant teacher at a whiteboard, endless patience, and permission to say
              &ldquo;wait — go back.&rdquo;
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.12} className="h-max rounded-2xl border border-hairline bg-panel p-8">
          <p className="eyebrow">At a glance</p>
          <dl className="mt-6 space-y-5">
            {[
              { k: "What", v: "A real-time, interruptible AI tutor" },
              { k: "Format", v: "Narrated, animated whiteboard lessons" },
              { k: "Runs", v: "Live in the browser, 60fps, no GPU" },
              { k: "Status", v: "Free preview — building in the open" },
            ].map((r) => (
              <div key={r.k} className="border-b border-hairline pb-4 last:border-0 last:pb-0">
                <dt className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">{r.k}</dt>
                <dd className="mt-1 text-sm text-foreground">{r.v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>

      {/* Principles */}
      <section className="mt-24">
        <Reveal>
          <p className="eyebrow">Principles</p>
          <h2 className="mt-4 max-w-2xl text-balance text-3xl font-medium tracking-tight">
            Four rules we don&apos;t break.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.t} delay={Math.min(i * 0.08, 0.24)} className="bg-background p-8 transition-colors hover:bg-panel">
              <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-base font-medium">{p.t}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{p.b}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <Reveal className="mt-24 flex flex-col items-center gap-4 rounded-2xl border border-hairline bg-panel px-8 py-14 text-center">
        <h2 className="text-2xl font-medium tracking-tight">Talk to us</h2>
        <p className="max-w-md text-sm leading-6 text-muted">
          Teaching something hard? Running a classroom? Just curious how it works? We answer everything.
        </p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/contact"
            className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-all hover:-translate-y-0.5 hover:opacity-85"
          >
            Get in touch
          </Link>
          <Link
            href="/learn"
            className="rounded-full border border-hairline-strong px-6 py-3 text-sm text-muted transition-all hover:-translate-y-0.5 hover:border-white/25 hover:text-foreground"
          >
            Try a lesson first
          </Link>
        </div>
      </Reveal>
    </PageShell>
  );
}
