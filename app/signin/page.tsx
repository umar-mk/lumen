import type { Metadata } from "next";
import Link from "next/link";

import AuthShell, { AuthField, GoogleButton } from "@/components/site/AuthShell";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Lumen.",
};

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      lede="Pick up where the last lesson left off."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-foreground transition-colors hover:text-accent">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton label="Continue with Google" />

      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-hairline" />
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-faint">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form action="/learn" className="space-y-4">
        <AuthField label="Email" type="email" name="email" placeholder="you@example.com" autoComplete="email" />
        <AuthField label="Password" type="password" name="password" placeholder="••••••••" autoComplete="current-password" />
        <div className="flex justify-end">
          <span className="cursor-pointer text-xs text-faint transition-colors hover:text-foreground">Forgot password?</span>
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-85"
        >
          Sign in
        </button>
      </form>
    </AuthShell>
  );
}
