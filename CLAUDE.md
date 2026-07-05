@AGENTS.md

# Claude-specific notes

The shared grounding lives in `AGENTS.md` (above) so both Claude Code and Codex
read the same thing. A few Claude-only points:

- A **PreToolUse hook** (`.claude/hooks/block-dev-server.sh`, wired in
  `.claude/settings.json`) hard-blocks `npm run dev` / `next dev` — your safety net
  for hard-rule #1. Don't try to work around it; ask the user to run the server.
- Persistent cross-session **memory** lives in `~/.claude/` (e.g. the dev-server
  note). `HANDOFF.md` is the project-local, agent-shared state — prefer it for
  anything Codex also needs to know.
- Verify changes with `npx tsc --noEmit` and `npm run build`. Test
  `lib/mathEval.ts` directly via `node --experimental-strip-types`.
