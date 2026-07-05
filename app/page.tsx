import Link from "next/link";

import Footer from "@/components/site/Footer";
import HeroDemo from "@/components/site/HeroDemo";
import Nav from "@/components/site/Nav";
import Reveal from "@/components/site/Reveal";

/* ------------------------------------------------------------------ */
/* Content                                                             */

const MARQUEE_TOPICS = [
  "Derivatives",
  "The unit circle",
  "Eigenvectors",
  "Bayes' theorem",
  "Fourier series",
  "The chain rule",
  "Taylor series",
  "Complex numbers",
  "Big-O notation",
  "Conditional probability",
  "Linear transformations",
  "Entropy",
];

const STATS = [
  { value: "60 fps", label: "In-browser rendering" },
  { value: "Any beat", label: "Interrupt mid-lesson" },
  { value: "0 files", label: "No video is ever rendered" },
  { value: "Your level", label: "Lessons tuned to you" },
];

const PROBLEMS = [
  {
    title: "Great explanations don't scale",
    body: "A 3Blue1Brown-quality animated lesson takes an expert weeks to script and animate. There is no such video for your exact question, at your exact level.",
  },
  {
    title: "Chat isn't teaching",
    body: "A wall of text isn't how the best teachers explain. They narrate while drawing, building intuition over time — and they respond the moment you're confused.",
  },
  {
    title: "Video generators are the wrong tool",
    body: "Slow, expensive, non-interactive — and they routinely render math and diagrams that are subtly, or badly, wrong. A lesson isn't a file. It's a conversation.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Ask anything",
    body: "Type a topic — “what is a derivative”, “why is the area of a circle πr²”. That one prompt is all Lumen needs.",
  },
  {
    n: "02",
    title: "Tune it to you",
    body: "A few quick diagnostic questions gauge your background and pace, so the lesson starts where you actually are.",
  },
  {
    n: "03",
    title: "Watch it teach",
    body: "A teacher voice narrates while an animated whiteboard builds the idea, beat by beat — like a lecture made just for you.",
  },
  {
    n: "04",
    title: "Interrupt it",
    body: "Confused? Stop it mid-sentence and ask. Lumen answers with a new narrated scene, then picks the lesson back up.",
  },
];

const ENGINE_POINTS = [
  {
    title: "Crash-free by construction",
    body: "The model can't emit code that throws or misbehaves. Worst case is a spec the validator repairs or rejects.",
  },
  {
    title: "Instant",
    body: "No video render, no GPU farm, no compile step. Animating a small scene graph in the browser is effectively free.",
  },
  {
    title: "Correct",
    body: "A deterministic engine owns geometry, layout and alignment — so visuals don't drift the way generated pixels do.",
  },
  {
    title: "Cheap",
    body: "Compact JSON via forced tool-use and aggressive caching. Cost is a first-class constraint, not an afterthought.",
  },
];

const SPEC_SNIPPET = `{
  "objects": [
    { "id": "curve",
      "type": "function-plot",
      "expr": "x^2" },
    { "id": "secant",
      "type": "line",
      "from": [1, 1], "to": [2, 4] }
  ],
  "timeline": [
    { "op": "draw", "target": "curve" },
    { "op": "move", "target": "secant",
      "toward": "tangent" }
  ]
}`;

const TIERS = [
  {
    name: "Learner",
    price: "$0",
    cadence: "forever",
    blurb: "For the curious. Enough lessons to fall in love with the format.",
    features: ["5 lessons per month", "Interruptions included", "Neural narration", "Sample library"],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Student",
    price: "$12",
    cadence: "per month",
    blurb: "For coursework. Unlimited lessons, tuned to your syllabus and level.",
    features: [
      "Unlimited lessons",
      "Unlimited interruptions",
      "Deeper diagnostic tuning",
      "Lesson history & replays",
      "Priority build queue",
    ],
    cta: "Get Student",
    featured: true,
  },
  {
    name: "Classroom",
    price: "Custom",
    cadence: "annual",
    blurb: "For schools and departments. Seats, oversight, and curriculum alignment.",
    features: ["Everything in Student", "Seat management", "Curriculum mapping", "Usage analytics"],
    cta: "Talk to us",
    featured: false,
  },
];

const FAQS = [
  {
    q: "Is this just AI-generated video?",
    a: "No — and that's the point. Lumen never renders a video file. The model describes each scene as structured data, and a deterministic engine animates it live in your browser at 60fps. That's why you can interrupt it, and why the math is drawn precisely instead of hallucinated pixel by pixel.",
  },
  {
    q: "What happens when I interrupt?",
    a: "The lesson pauses, Lumen generates a narrated answer scene that's aware of exactly what was on the board, plays it, then resumes the lesson where it left off.",
  },
  {
    q: "What subjects does it cover?",
    a: "Anything that benefits from being drawn: calculus, linear algebra, trigonometry, geometry, physics intuition, algorithms. The rendering engine composes curves, shapes and notation generically, so new topics don't need new code.",
  },
  {
    q: "How is a lesson personalized?",
    a: "Before building anything, Lumen asks a few diagnostic questions — your background, what you want out of it, your pace. The teaching script is written against those answers, not a generic audience.",
  },
  {
    q: "Is it safe to run model output in my browser?",
    a: "The model never writes code. It emits a JSON scene description that is validated, capped, and sanitized server-side; a pure TypeScript renderer draws it. Nothing the model says can execute.",
  },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Nav />

      <main className="flex-1">
        {/* ---------------- Hero ---------------- */}
        <section className="relative overflow-hidden pt-36 pb-20">
          <div className="dotgrid pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="eyebrow rise">Real-time · Narrated · Interruptible</p>
              <h1 className="rise rise-1 mt-5 text-balance text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
                The tutor that draws while it talks.
              </h1>
              <p className="rise rise-2 mx-auto mt-6 max-w-xl text-pretty text-lg leading-8 text-muted">
                Type any topic. Lumen builds a narrated, animated lesson in front of you —
                and when you&apos;re confused, you interrupt it and it adapts. Live, in your browser.
              </p>
              <div className="rise rise-3 mt-9 flex items-center justify-center gap-3">
                <Link
                  href="/learn"
                  className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-all hover:-translate-y-0.5 hover:opacity-85"
                >
                  Start a lesson
                </Link>
                <Link
                  href="/offline"
                  className="rounded-full border border-hairline-strong px-6 py-3 text-sm text-muted transition-all hover:-translate-y-0.5 hover:border-white/25 hover:text-foreground"
                >
                  Watch the sample ↗
                </Link>
              </div>
            </div>

            <div className="relative mx-auto mt-16 max-w-4xl">
              {/* Drifting warm glow behind the live demo */}
              <div
                aria-hidden
                className="glow-drift pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[24rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-[0.07] blur-[110px]"
              />
              <div className="rise rise-4">
                <HeroDemo />
                <p className="mt-3 text-center font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">
                  Not a recording — the actual engine, drawing this page&apos;s pixels right now
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Topic marquee ---------------- */}
        <section
          aria-hidden
          className="overflow-hidden border-t border-hairline py-5 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
        >
          <div className="marquee-track flex w-max items-center gap-10 whitespace-nowrap">
            {[...MARQUEE_TOPICS, ...MARQUEE_TOPICS].map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="flex items-center gap-10 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-faint"
              >
                {t}
                <span className="h-1 w-1 rounded-full bg-accent/60" />
              </span>
            ))}
          </div>
        </section>

        {/* ---------------- Stat strip ---------------- */}
        <section className="border-y border-hairline">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-hairline md:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08} y={12} className="px-6 py-8 text-center">
                <div className="font-mono text-2xl tracking-tight text-foreground">{s.value}</div>
                <div className="mt-1.5 text-xs text-faint">{s.label}</div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------- Problem ---------------- */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <p className="eyebrow">Why Lumen exists</p>
            <h2 className="mt-4 max-w-2xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">
              The best way to learn is a brilliant teacher at a whiteboard. That has never scaled.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.1} className="bg-background p-8 transition-colors hover:bg-panel">
                <h3 className="text-base font-medium">{p.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------- How it works ---------------- */}
        <section id="how" className="scroll-mt-20 border-t border-hairline">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <p className="eyebrow">How it works</p>
              <h2 className="mt-4 max-w-2xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">
                One prompt in. A living lesson out.
              </h2>
            </Reveal>
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.1} className="group bg-background p-8 transition-colors hover:bg-panel">
                  <span className="font-mono text-xs text-accent">{s.n}</span>
                  <h3 className="mt-4 text-base font-medium">{s.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{s.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Engine / moat ---------------- */}
        <section id="engine" className="scroll-mt-20 border-t border-hairline bg-panel">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="grid items-start gap-14 lg:grid-cols-2">
              <Reveal>
                <p className="eyebrow">The engine</p>
                <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight sm:text-4xl">
                  The model never draws. It describes.
                </h2>
                <p className="mt-6 text-pretty leading-7 text-muted">
                  Every scene Lumen shows you is a small piece of structured data — objects and a
                  timeline — emitted by the model and drawn by a deterministic rendering engine.
                  No generated code ever runs. No pixels are ever guessed.
                </p>
                <div className="mt-10 grid gap-8 sm:grid-cols-2">
                  {ENGINE_POINTS.map((pt) => (
                    <div key={pt.title}>
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <span className="h-1 w-1 rounded-full bg-accent" aria-hidden />
                        {pt.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted">{pt.body}</p>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={0.15} className="rounded-2xl border border-hairline-strong bg-background p-1.5">
                <div className="flex items-center justify-between rounded-t-xl px-4 py-2.5">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">
                    scene.json → renderer
                  </span>
                  <span className="font-mono text-[0.65rem] text-faint">validated · capped · sanitized</span>
                </div>
                <pre className="overflow-x-auto rounded-xl bg-panel-raised p-6 font-mono text-[0.8rem] leading-6 text-muted">
                  <code>{SPEC_SNIPPET}</code>
                </pre>
                <div className="flex items-center justify-center gap-3 px-4 py-3 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">
                  <span>JSON spec</span>
                  <span className="text-accent">→</span>
                  <span>Deterministic renderer</span>
                  <span className="text-accent">→</span>
                  <span>60fps SVG + KaTeX</span>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------------- Interruption spotlight ---------------- */}
        <section id="interrupt" className="scroll-mt-20 border-t border-hairline">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="grid items-center gap-14 lg:grid-cols-2">
              <Reveal delay={0.1} className="order-2 lg:order-1">
                <div className="rounded-2xl border border-hairline-strong bg-panel p-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-6 w-6 shrink-0 rounded-full border border-hairline-strong text-center font-mono text-[0.6rem] leading-6 text-faint">
                        L
                      </span>
                      <p className="rounded-xl rounded-tl-sm bg-panel-raised px-4 py-3 text-sm leading-6 text-muted">
                        …so as the second point slides toward the first, the secant line tilts into
                        the tangent —
                      </p>
                    </div>
                    <div className="flex items-start justify-end gap-3">
                      <p className="rounded-xl rounded-tr-sm bg-accent-soft px-4 py-3 text-sm leading-6 text-foreground">
                        wait — why does it have to <em>touch</em> at exactly one point?
                      </p>
                      <span className="mt-1 h-6 w-6 shrink-0 rounded-full bg-foreground text-center font-mono text-[0.6rem] leading-6 text-background">
                        You
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-6 w-6 shrink-0 rounded-full border border-hairline-strong text-center font-mono text-[0.6rem] leading-6 text-faint">
                        L
                      </span>
                      <div className="flex-1 rounded-xl rounded-tl-sm bg-panel-raised px-4 py-3">
                        <p className="text-sm leading-6 text-muted">
                          Good question. Let me redraw it — watch what happens if the line crosses
                          instead of touches…
                        </p>
                        <p className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-accent">
                          ▸ New scene · then the lesson resumes
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>

              <Reveal className="order-1 lg:order-2">
                <p className="eyebrow">Interruption</p>
                <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight sm:text-4xl">
                  Confusion shouldn&apos;t wait for the end of the video.
                </h2>
                <p className="mt-6 text-pretty leading-7 text-muted">
                  Every other format makes you hold your question. Lumen is built around the
                  opposite: stop the teacher mid-beat, ask, get a narrated answer drawn on the same
                  board — with full awareness of what&apos;s on it — and continue exactly where you
                  left off.
                </p>
                <p className="mt-4 text-pretty leading-7 text-muted">
                  Because scenes are data, not video, an answer costs one fast model call. Not a
                  re-render.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------------- Pricing ---------------- */}
        <section id="pricing" className="scroll-mt-20 border-t border-hairline">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <p className="eyebrow">Pricing</p>
              <h2 className="mt-4 max-w-2xl text-balance text-3xl font-medium tracking-tight sm:text-4xl">
                A private tutor, at a fraction of the hourly rate.
              </h2>
            </Reveal>
            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {TIERS.map((t, i) => (
                <Reveal
                  key={t.name}
                  delay={i * 0.1}
                  className={`flex flex-col rounded-2xl border p-8 transition-transform hover:-translate-y-1 ${
                    t.featured
                      ? "border-accent/40 bg-panel shadow-[0_0_60px_-24px_rgba(217,164,65,0.35)]"
                      : "border-hairline bg-background"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{t.name}</h3>
                    {t.featured && (
                      <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-accent">
                        Most popular
                      </span>
                    )}
                  </div>
                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="text-4xl font-medium tracking-tight">{t.price}</span>
                    <span className="text-xs text-faint">{t.cadence}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">{t.blurb}</p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-muted">
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
                          <path
                            d="M2 6.2 5 9l5-6"
                            fill="none"
                            stroke="var(--accent)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/learn"
                    className={`mt-8 rounded-full px-5 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-85 ${
                      t.featured
                        ? "bg-foreground text-background"
                        : "border border-hairline-strong text-foreground"
                    }`}
                  >
                    {t.cta}
                  </Link>
                </Reveal>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-faint">
              Billing launches with the public release — every tier is free during the preview.
            </p>
          </div>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq" className="scroll-mt-20 border-t border-hairline">
          <div className="mx-auto max-w-3xl px-6 py-24">
            <Reveal>
              <p className="eyebrow text-center">FAQ</p>
              <h2 className="mt-4 text-center text-3xl font-medium tracking-tight sm:text-4xl">
                Questions, answered.
              </h2>
            </Reveal>
            <Reveal delay={0.1} className="mt-12 divide-y divide-hairline border-y border-hairline">
              {FAQS.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.95rem] font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span
                      aria-hidden
                      className="font-mono text-lg leading-none text-faint transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 pr-8 text-sm leading-7 text-muted">{f.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ---------------- Final CTA ---------------- */}
        <section className="relative overflow-hidden border-t border-hairline">
          <div
            aria-hidden
            className="glow-drift pointer-events-none absolute left-1/2 top-1/2 h-[20rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-[0.06] blur-[110px]"
          />
          <div className="relative mx-auto max-w-6xl px-6 py-28 text-center">
            <Reveal>
              <p className="eyebrow">Preview access</p>
              <h2 className="mx-auto mt-4 max-w-2xl text-balance text-4xl font-medium tracking-tight sm:text-5xl">
                Ask it something you&apos;ve always half-understood.
              </h2>
              <p className="mx-auto mt-5 max-w-md text-muted">
                A derivative. The unit circle. Why πr². Watch it get drawn for you.
              </p>
              <Link
                href="/learn"
                className="mt-9 inline-block rounded-full bg-foreground px-8 py-3.5 text-sm font-medium text-background transition-all hover:-translate-y-0.5 hover:opacity-85"
              >
                Start a lesson — it&apos;s free
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
