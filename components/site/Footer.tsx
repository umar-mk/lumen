import Link from "next/link";

import Wordmark from "@/components/site/Wordmark";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Start a lesson", href: "/learn" },
      { label: "Watch the sample", href: "/offline" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    title: "Technology",
    links: [
      { label: "The rendering engine", href: "/technology" },
      { label: "Interruption model", href: "/#interrupt" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Sign in", href: "/signin" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <Wordmark />
            <p className="max-w-xs text-sm leading-6 text-faint">
              A real-time, interruptible tutor. Narrated, animated lessons for any topic —
              built live, in your browser.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <span className="eyebrow">{col.title}</span>
              {col.links.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="text-sm text-muted transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col justify-between gap-4 border-t border-hairline pt-6 text-xs text-faint sm:flex-row">
          <span>© {new Date().getFullYear()} Lumen. All rights reserved.</span>
          <span className="font-mono tracking-wide">Rendered live · no video files</span>
        </div>
      </div>
    </footer>
  );
}
