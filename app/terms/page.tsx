import type { Metadata } from "next";

import PageShell from "@/components/site/PageShell";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for the Lumen preview.",
};

const SECTIONS = [
  {
    h: "The deal",
    p: [
      "Lumen is offered as a free preview so you can learn with it and we can learn from how it holds up. Use it for learning and teaching; don't abuse it. Full commercial terms arrive with the public release.",
    ],
  },
  {
    h: "Acceptable use",
    p: [
      "Don't attempt to disrupt the service, probe or overload the APIs, or use automated scripts to mass-generate lessons. Don't use Lumen to produce content that's illegal or harmful. Be the student the teacher deserves.",
    ],
  },
  {
    h: "Lessons are generated",
    p: [
      "Lessons are produced by AI models with substantial engineering around correctness, and they're good — but they can still be wrong. Lumen is a learning aid, not a substitute for your course materials, your instructor, or your own judgment. Verify anything that matters before an exam.",
    ],
  },
  {
    h: "Availability",
    p: [
      "It's a preview: things change, occasionally break, and lessons are not persisted between sessions. We make no uptime commitments yet — that changes at public release.",
    ],
  },
  {
    h: "Your content",
    p: [
      "Topics and questions you submit remain yours. You're free to use the lessons Lumen builds for you in your own learning and teaching.",
    ],
  },
  {
    h: "Contact",
    p: ["Questions about these terms: hello@lumen.example."],
  },
];

export default function TermsPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Terms of use"
      lede="Effective during the Lumen preview. Short, because the product is young — not because we're hiding anything."
    >
      <div className="max-w-2xl space-y-12">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-medium tracking-tight">{s.h}</h2>
            {s.p.map((para) => (
              <p key={para.slice(0, 32)} className="mt-3 text-sm leading-7 text-muted">
                {para}
              </p>
            ))}
          </section>
        ))}
        <p className="border-t border-hairline pt-6 font-mono text-xs text-faint">Last updated: July 2026</p>
      </div>
    </PageShell>
  );
}
