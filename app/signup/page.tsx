import type { Metadata } from "next";
import Link from "next/link";

import AuthShell, { AuthField, GoogleButton } from "@/components/site/AuthShell";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your Lumen account.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      lede="Lesson history, replays, and syncing — free to start."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/signin" className="text-foreground transition-colors hover:text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" />

      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-hairline" />
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-faint">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form action="/learn" className="space-y-4">
        <AuthField label="Name" type="text" name="name" placeholder="Ada Lovelace" autoComplete="name" />
        <AuthField label="Email" type="email" name="email" placeholder="you@example.com" autoComplete="email" />
        <AuthField label="Password" type="password" name="password" placeholder="At least 8 characters" autoComplete="new-password" />
        <button
          type="submit"
          className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-85"
        >
          Create account
        </button>
        <p className="text-center text-xs leading-5 text-faint">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline decoration-hairline-strong underline-offset-2 hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline decoration-hairline-strong underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
