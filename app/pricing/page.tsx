import type { Metadata } from "next";
import Link from "next/link";

import PageShell from "@/components/site/PageShell";
import Reveal from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple pricing for a private tutor: free to start, $12/month for unlimited lessons, custom plans for classrooms.",
};

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

const COMPARISON: { feature: string; learner: string; student: string; classroom: string }[] = [
  { feature: "Lessons per month", learner: "5", student: "Unlimited", classroom: "Unlimited" },
  { feature: "Mid-lesson interruptions", learner: "Included", student: "Unlimited", classroom: "Unlimited" },
  { feature: "Diagnostic tuning", learner: "Standard", student: "Deeper", classroom: "Deeper" },
  { feature: "Neural narration", learner: "✓", student: "✓", classroom: "✓" },
  { feature: "Lesson history & replays", learner: "—", student: "✓", classroom: "✓" },
  { feature: "Priority build queue", learner: "—", student: "✓", classroom: "✓" },
  { feature: "Seat management", learner: "—", student: "—", classroom: "✓" },
  { feature: "Curriculum mapping", learner: "—", student: "—", classroom: "✓" },
  { feature: "Usage analytics", learner: "—", student: "—", classroom: "✓" },
];

const PRICING_FAQS = [
  {
    q: "Why can Lumen be this cheap?",
    a: "Architecture. Lessons are described as compact structured data and drawn by your browser — there's no GPU farm, no video rendering pipeline, and no per-minute compute bill behind each lesson. Cost was designed in from the first line of code, not discounted in later.",
  },
  {
    q: "What counts as a lesson?",
    a: "One topic prompt, tuned by your diagnostics, built into a full multi-beat narrated lesson. Replays of a lesson you already built are free. Interruptions during a lesson don't count against anything.",
  },
  {
    q: "Is the preview really free?",
    a: "Yes — while Lumen is in preview, every tier is free and billing is switched off. Pricing shown here is what we intend to charge at public release, published early so there are no surprises.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Plans will be month-to-month with no lock-in. Lessons you've built stay replayable.",
  },
];

export default function PricingPage() {
  return (
    <PageShell
      eyebrow="Pricing"
      title="A private tutor, at a fraction of the hourly rate."
      lede="An hour with a human tutor runs $40–$100, once a week, if you can book one. Lumen is on demand, endlessly patient, and priced like software — because architecturally, that's what it is."
    >
      {/* Tiers */}
      <div className="grid gap-5 lg:grid-cols-3">
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
              <h2 className="text-sm font-medium">{t.name}</h2>
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
                    <path d="M2 6.2 5 9l5-6" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={t.name === "Classroom" ? "/contact" : "/learn"}
              className={`mt-8 rounded-full px-5 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-85 ${
                t.featured ? "bg-foreground text-background" : "border border-hairline-strong text-foreground"
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

      {/* Comparison table */}
      <section className="mt-24">
        <Reveal>
          <p className="eyebrow">Compare</p>
          <h2 className="mt-4 text-3xl font-medium tracking-tight">Everything, side by side.</h2>
        </Reveal>
        <Reveal delay={0.1} className="mt-10 overflow-x-auto rounded-2xl border border-hairline">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline bg-panel">
                <th className="px-6 py-4 text-xs font-medium text-faint">Feature</th>
                <th className="px-6 py-4 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">Learner</th>
                <th className="px-6 py-4 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-accent">Student</th>
                <th className="px-6 py-4 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">Classroom</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {COMPARISON.map((row) => (
                <tr key={row.feature} className="transition-colors hover:bg-panel">
                  <td className="px-6 py-3.5 text-sm text-foreground">{row.feature}</td>
                  <td className="px-6 py-3.5 text-sm text-muted">{row.learner}</td>
                  <td className="px-6 py-3.5 text-sm text-foreground">{row.student}</td>
                  <td className="px-6 py-3.5 text-sm text-muted">{row.classroom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      {/* Pricing FAQ */}
      <section className="mt-24 grid gap-14 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <p className="eyebrow">Billing questions</p>
          <h2 className="mt-4 text-3xl font-medium tracking-tight">Fair by design.</h2>
          <p className="mt-5 text-sm leading-7 text-muted">
            The pricing model follows the architecture: because lessons are cheap to build, we don&apos;t
            need to meter you anxiously. Learn as much as you want.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="divide-y divide-hairline border-y border-hairline">
          {PRICING_FAQS.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.95rem] font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="font-mono text-lg leading-none text-faint transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 pr-8 text-sm leading-7 text-muted">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </section>
    </PageShell>
  );
}
