#!/usr/bin/env bash
# PreToolUse(Bash) hook — block long-running dev servers.
#
# Rationale: `npm run dev` / `next dev` crashed the user's Mac twice. The USER
# runs the dev server in their own terminal; agents verify with
# `npx tsc --noEmit` and `npm run build` (both bounded, one-shot). Exit code 2
# tells Claude Code to block the call and feeds this message back to the model.
set -uo pipefail

# Pull the command string out of the hook's stdin JSON payload.
cmd="$(node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.tool_input&&j.tool_input.command)||"")}catch{process.stdout.write("")}})')"

if printf '%s' "$cmd" | grep -Eiq '(^|[^[:alnum:]])(next[[:space:]]+dev|(npm|pnpm|yarn|bun)[[:space:]]+(run[[:space:]]+)?dev|vercel[[:space:]]+dev)([^[:alnum:]]|$)'; then
  echo "BLOCKED by project hook: do not start a dev server (matched: \"$cmd\"). It has crashed the user's Mac. Ask the user to run it themselves. Verify your changes instead with: npx tsc --noEmit && npm run build." >&2
  exit 2
fi
exit 0
