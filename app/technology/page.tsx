import type { Metadata } from "next";
import Link from "next/link";

import PageShell from "@/components/site/PageShell";
import Reveal from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: "Technology",
  description:
    "Inside the Lumen engine: a declarative scene contract, a deterministic renderer, and a reliability stack that turns model output into precise animated lessons.",
};

const OBJECT_VOCAB = [
  { name: "axes", role: "Axis lines, ticks, grid, labels" },
  { name: "function-plot", role: "y = f(x) curves, safely parsed" },
  { name: "parametric", role: "Circles, spirals, ellipses — any x(t), y(t)" },
  { name: "path", role: "Arbitrary outlines and silhouettes" },
  { name: "polygon / polyline", role: "Filled shapes and open lines" },
  { name: "group", role: "Composed sub-scenes with transforms" },
  { name: "area-model", role: "Perfectly-tiled algebra rectangles" },
  { name: "secant-line", role: "Chords that slide into tangents" },
  { name: "dot / arrow / brace", role: "Points, vectors, measures" },
  { name: "inset", role: "Zoom-with-context mini views" },
  { name: "equation / label / counter", role: "Crisp KaTeX and animated numbers" },
  { name: "icon", role: "Small physical glyphs — car, stopwatch, person" },
];

const TIMELINE_VOCAB = [
  { name: "draw", role: "Stroke a curve or axis into existence" },
  { name: "fadeIn / fadeOut", role: "Bring in ideas, retire helpers" },
  { name: "move / slide", role: "Glide points and secants" },
  { name: "morph", role: "Continuously reshape one curve into another" },
  { name: "transform", role: "Evolve an equation step by step" },
  { name: "trace", role: "Ride a point along a curve" },
  { name: "highlight / emphasize", role: "Pull the eye exactly where the voice is" },
  { name: "count", role: "Animate a number toward its value" },
];

const RELIABILITY = [
  {
    title: "Relational placement",
    body: "Objects can declare relationships instead of coordinates — “on this curve at x = 1”, “just above that label”, “evenly spaced in this region”. A deterministic constraint solver computes the exact positions, so points sit precisely on curves and nothing drifts.",
  },
  {
    title: "Deterministic layout",
    body: "A layout pass resolves constraints, expands composed objects, fits the camera to the content, and snaps points onto curves. The model never sets a pixel — geometry is owned by code that can't be wrong twice.",
  },
  {
    title: "Scene QA lint",
    body: "Every scene is linted before it plays: overlapping labels, off-frame text, text sitting on a curve, dangling references, invalid expressions. Problems are caught while the scene is still data.",
  },
  {
    title: "Self-healing repair",
    body: "A model-free sanitize pass mechanically fixes what the lint finds — re-placing text, dropping duplicates, removing unresolvable objects — so a beat keeps its real visuals instead of failing.",
  },
  {
    title: "Tolerant model I/O",
    body: "Schema coercion clamps out-of-range output; a recovery layer salvages truncated responses. An inexpensive, occasionally-sloppy model still yields valid lessons — which is what keeps lessons cheap.",
  },
  {
    title: "Graceful degradation",
    body: "The model is told exactly what the engine can draw and taught to teach within it. Anything undrawable degrades to a correct, simpler view — never a broken frame.",
  },
];

const SAFETY = [
  {
    title: "No code execution, ever",
    body: "Model output is data, not code. The only evaluated strings are math expressions, parsed by a hand-written whitelist parser — no eval, no dynamic functions. A parse failure just means no curve.",
  },
  {
    title: "Hard resource caps",
    body: "Objects, animation steps, samples per plot, duration, and formula size are all capped server-side and clamped again in the renderer. A pathological response can't spike your CPU.",
  },
  {
    title: "Sandboxed math rendering",
    body: "Formulas render through KaTeX with trust disabled — no markup or script injection can reach the page.",
  },
  {
    title: "Keys stay server-side",
    body: "Model API keys are read only inside server routes. Nothing sensitive ships to the browser.",
  },
];

const STACK = [
  { k: "Rendering", v: "SVG + KaTeX + Framer Motion, 60fps, transform/opacity only" },
  { k: "Application", v: "Next.js App Router + TypeScript, a single process" },
  { k: "Video pipeline", v: "None. Nothing is rendered to a file, ever" },
  { k: "GPU requirement", v: "None. Any laptop, any browser" },
  { k: "Models", v: "Provider-agnostic — runs on inexpensive models by design" },
  { k: "State", v: "No database needed to play a lesson. Your lesson is yours" },
];

export default function TechnologyPage() {
  return (
    <PageShell
      eyebrow="Technology"
      title="The model never draws. It describes."
      lede="Every scene Lumen plays is a small piece of structured data — objects and a timeline — emitted by a language model and drawn by a deterministic TypeScript engine. That single decision is what makes Lumen instant, precise, safe, and cheap. This page is the tour."
    >
      {/* The one idea */}
      <Reveal className="grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-3">
        {[
          {
            t: "Generative video",
            s: "guesses pixels",
            b: "Slow, expensive, non-interactive — and the math is routinely wrong in ways you can't fix.",
            bad: true,
          },
          {
            t: "Generated code",
            s: "can crash and can't be trusted",
            b: "Letting a model write rendering code means letting it throw exceptions in your browser.",
            bad: true,
          },
          {
            t: "Declarative scenes",
            s: "drawn deterministically",
            b: "The model describes what to show. A pure engine decides how — correctly, at 60fps, every time.",
            bad: false,
          },
        ].map((c) => (
          <div key={c.t} className={`p-8 ${c.bad ? "bg-background" : "bg-panel"}`}>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em]">
              <span className={c.bad ? "text-faint" : "text-accent"}>{c.bad ? "✕" : "●"}</span>{" "}
              <span className="text-faint">{c.t}</span>
            </p>
            <h3 className="mt-3 text-base font-medium">{c.s}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{c.b}</p>
          </div>
        ))}
      </Reveal>

      {/* Scene contract */}
      <section className="mt-24">
        <Reveal>
          <p className="eyebrow">The scene contract</p>
          <h2 className="mt-4 max-w-2xl text-balance text-3xl font-medium tracking-tight">
            One world, one vocabulary.
          </h2>
          <p className="mt-5 max-w-2xl text-pretty leading-7 text-muted">
            A scene is a single JSON object: a list of objects and a timeline of animation steps, all
            in one shared math-style coordinate system — origin centred, y pointing up, mapped onto a
            16:9 canvas. No per-object coordinate spaces, no pixels. The model composes from a small,
            growing vocabulary, so new topics need new descriptions — not new code.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <Reveal className="rounded-2xl border border-hairline bg-panel p-8">
            <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-accent">Objects — what can exist</h3>
            <ul className="mt-6 space-y-3">
              {OBJECT_VOCAB.map((o) => (
                <li key={o.name} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0">
                  <code className="shrink-0 font-mono text-sm text-foreground">{o.name}</code>
                  <span className="text-right text-xs leading-5 text-faint">{o.role}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} className="rounded-2xl border border-hairline bg-panel p-8">
            <h3 className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-accent">Timeline — how it moves</h3>
            <ul className="mt-6 space-y-3">
              {TIMELINE_VOCAB.map((o) => (
                <li key={o.name} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0">
                  <code className="shrink-0 font-mono text-sm text-foreground">{o.name}</code>
                  <span className="text-right text-xs leading-5 text-faint">{o.role}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-hairline pt-4 text-xs leading-5 text-faint">
              Rendered as two perfectly-aligned layers: an SVG geometry layer for curves and shapes,
              and an HTML overlay for crisp text and KaTeX — scaled together so they can never drift apart.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Reliability engine */}
      <section className="mt-24">
        <Reveal>
          <p className="eyebrow">The reliability engine</p>
          <h2 className="mt-4 max-w-2xl text-balance text-3xl font-medium tracking-tight">
            What turns a demo into a product.
          </h2>
          <p className="mt-5 max-w-2xl text-pretty leading-7 text-muted">
            Calling a model is easy. Making occasionally-sloppy model output produce a clean,
            correct lesson every time is the actual engineering. Every scene passes through a
            deterministic pipeline before it&apos;s allowed on screen.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {RELIABILITY.map((r, i) => (
            <Reveal key={r.title} delay={Math.min(i * 0.06, 0.2)} className="bg-background p-8 transition-colors hover:bg-panel">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <span className="h-1 w-1 rounded-full bg-accent" aria-hidden />
                {r.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted">{r.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Safety */}
      <section className="mt-24">
        <Reveal>
          <p className="eyebrow">Safety model</p>
          <h2 className="mt-4 max-w-2xl text-balance text-3xl font-medium tracking-tight">
            Nothing the model says can execute.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {SAFETY.map((s, i) => (
            <Reveal key={s.title} delay={Math.min(i * 0.06, 0.2)} className="rounded-2xl border border-hairline bg-background p-8">
              <h3 className="text-sm font-medium">{s.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section className="mt-24">
        <Reveal>
          <p className="eyebrow">The stack</p>
          <h2 className="mt-4 max-w-2xl text-balance text-3xl font-medium tracking-tight">
            Deliberately boring. Deliberately cheap.
          </h2>
          <p className="mt-5 max-w-2xl text-pretty leading-7 text-muted">
            No GPU farm, no render queue, no video files, no heavyweight infra. The economics of a
            lesson are the economics of one model call and some SVG — which is why Lumen can afford
            to build every lesson from scratch, for one person.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-12 overflow-hidden rounded-2xl border border-hairline">
          <dl className="divide-y divide-hairline">
            {STACK.map((row) => (
              <div key={row.k} className="grid gap-2 bg-background px-8 py-5 transition-colors hover:bg-panel sm:grid-cols-[12rem_1fr]">
                <dt className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-faint">{row.k}</dt>
                <dd className="text-sm text-muted">{row.v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* CTA */}
      <Reveal className="mt-24 flex flex-col items-center gap-4 rounded-2xl border border-hairline bg-panel px-8 py-14 text-center">
        <h2 className="text-2xl font-medium tracking-tight">The proof is the product</h2>
        <p className="max-w-md text-sm leading-6 text-muted">
          Everything on this page is running in the live demo on the homepage — and in every lesson you start.
        </p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/learn"
            className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-all hover:-translate-y-0.5 hover:opacity-85"
          >
            Start a lesson
          </Link>
          <Link
            href="/roadmap"
            className="rounded-full border border-hairline-strong px-6 py-3 text-sm text-muted transition-all hover:-translate-y-0.5 hover:border-white/25 hover:text-foreground"
          >
            See the roadmap
          </Link>
        </div>
      </Reveal>
    </PageShell>
  );
}
