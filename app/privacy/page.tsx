import type { Metadata } from "next";

import PageShell from "@/components/site/PageShell";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Lumen handles your data during the preview.",
};

const SECTIONS = [
  {
    h: "The short version",
    p: [
      "Lumen is in preview. We collect the minimum needed to build your lessons, we don't sell data, and we don't run third-party advertising or tracking. When accounts and billing launch, this policy will be replaced by a complete one — and we'll say so loudly.",
    ],
  },
  {
    h: "What we process",
    p: [
      "Lesson topics, diagnostic answers, and interruption questions are sent to our servers to generate your lesson — that's the product working, not analytics.",
      "To generate scenes and narration, lesson content is passed to the model and text-to-speech providers we run on. It is not used to build advertising profiles.",
      "During the preview, generated lessons are not persisted server-side: when you close the tab, the lesson is gone.",
    ],
  },
  {
    h: "What we don't do",
    p: [
      "No selling or renting of personal data. No advertising trackers. No requirement to create an account to use the preview.",
    ],
  },
  {
    h: "Voice and audio",
    p: [
      "Narration is synthesized from lesson text. Lumen does not record from your microphone — interruptions are typed.",
    ],
  },
  {
    h: "Contact",
    p: ["Questions about this policy: hello@lumen.example. We answer directly."],
  },
];

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Privacy"
      lede="Effective during the Lumen preview. Plain language on purpose."
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
