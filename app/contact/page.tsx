import type { Metadata } from "next";
import Link from "next/link";

import ContactForm from "@/components/site/ContactForm";
import PageShell from "@/components/site/PageShell";
import Reveal from "@/components/site/Reveal";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Lumen team — classroom plans, press, feedback, or anything else.",
};

export default function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="We read everything."
      lede="Questions, classroom plans, feedback on a lesson that missed, ideas for one it should nail — send it over."
    >
      <div className="grid gap-14 lg:grid-cols-[1fr_1.3fr]">
        <Reveal className="space-y-8">
          <div className="rounded-2xl border border-hairline bg-panel p-8">
            <p className="eyebrow">Email</p>
            <a href="mailto:hello@lumen.example" className="mt-2 block text-lg font-medium tracking-tight transition-colors hover:text-accent">
              hello@lumen.example
            </a>
            <p className="mt-2 text-sm leading-6 text-faint">
              Direct to the team building it. Expect a reply from a human, usually within a day.
            </p>
          </div>

          <div className="rounded-2xl border border-hairline bg-background p-8">
            <p className="eyebrow">Classrooms & schools</p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Piloting Lumen with a class? Mention your subject, level, and cohort size — we
              prioritize educator conversations during the preview.
            </p>
            <Link href="/pricing" className="mt-4 inline-block text-sm text-accent transition-opacity hover:opacity-80">
              See Classroom plans →
            </Link>
          </div>

          <div className="rounded-2xl border border-hairline bg-background p-8">
            <p className="eyebrow">Found a bad lesson?</p>
            <p className="mt-3 text-sm leading-6 text-muted">
              The most valuable message you can send: the topic you asked for, roughly what went
              wrong, and what you expected. Failures directly shape the roadmap.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="rounded-2xl border border-hairline bg-background p-8">
          <ContactForm />
        </Reveal>
      </div>
    </PageShell>
  );
}
