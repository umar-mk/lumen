import type { ReactNode } from "react";

import Footer from "@/components/site/Footer";
import Nav from "@/components/site/Nav";

/** Standard interior-page frame: nav, rise-in page header, content, footer. */
export default function PageShell({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Nav />
      <main className="flex-1 pt-36 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <header className="max-w-3xl">
            <p className="eyebrow rise">{eyebrow}</p>
            <h1 className="rise rise-1 mt-4 text-balance text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
              {title}
            </h1>
            {lede && <p className="rise rise-2 mt-5 text-pretty text-lg leading-8 text-muted">{lede}</p>}
          </header>
          <div className="mt-16">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
