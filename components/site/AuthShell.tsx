import Link from "next/link";
import type { ReactNode } from "react";

import Wordmark from "@/components/site/Wordmark";

/**
 * Minimal centered frame for the (visual-only) auth pages. Forms submit as a
 * plain GET to /learn — the preview is open, accounts land with the backend.
 */
export default function AuthShell({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="dotgrid pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Link href="/" aria-label="Back to the Lumen homepage">
            <Wordmark />
          </Link>
        </div>

        <div className="rise rounded-2xl border border-hairline-strong bg-panel p-8">
          <h1 className="text-xl font-medium tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm leading-6 text-muted">{lede}</p>

          <div className="mt-7">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-faint">{footer}</p>

        <p className="mt-8 rounded-xl border border-hairline bg-background/60 px-4 py-3 text-center text-xs leading-5 text-faint">
          Lumen is in open preview — no account needed yet.{" "}
          <Link href="/learn" className="text-accent transition-opacity hover:opacity-80">
            Jump straight into a lesson →
          </Link>
        </p>
      </div>
    </main>
  );
}

export function AuthField({
  label,
  type,
  name,
  placeholder,
  autoComplete,
}: {
  label: string;
  type: string;
  name: string;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-hairline-strong bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
      />
    </label>
  );
}

export function GoogleButton({ label }: { label: string }) {
  return (
    <Link
      href="/learn"
      className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-hairline-strong px-4 py-3 text-sm text-foreground transition-colors hover:bg-panel-raised"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 4.3-5.35 4.3a5.8 5.8 0 1 1 0-11.6c1.5 0 2.8.55 3.8 1.45l2.15-2.15A8.9 8.9 0 0 0 12 3.5a8.5 8.5 0 1 0 0 17c4.9 0 8.5-3.45 8.5-8.3 0-.38-.05-.75-.15-1.1Z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
      {label}
    </Link>
  );
}
