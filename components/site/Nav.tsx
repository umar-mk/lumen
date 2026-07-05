import Link from "next/link";

import Wordmark from "@/components/site/Wordmark";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/technology", label: "Technology" },
  { href: "/pricing", label: "Pricing" },
  { href: "/roadmap", label: "Roadmap" },
];

export default function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-hairline bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="Lumen home">
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/signin"
            className="hidden text-sm text-muted transition-colors hover:text-foreground sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/learn"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            Start learning
          </Link>
        </div>
      </nav>
    </header>
  );
}
