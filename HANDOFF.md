# Handoff — current state

**Updated:** 2026-07-05 · Claude

## Context right now
**Pipelined lesson start just landed** (after the earlier trace-generalization /
no-text-fallback / prompt-tightening batch — all in `docs/ROADMAP.md` §Done):
- `/api/lesson` now STREAMS NDJSON: one `meta` event (lesson header + total), a
  `segment` event per composed beat, then `done` (usage + warnings). Contract type
  `LessonStreamEvent` lives in `types/lesson.ts`. Pre-stream failures (bad script,
  429) are still plain JSON with status codes; mid-build failures become an
  `error` event; per-beat rescue/fallback behaviour is unchanged.
- `/learn` consumes the stream: player is revealed on the FIRST beat (stage
  "ready" while `building` stays true), segments keep appending during playback,
  the topic form stays locked until `done`, and a mid-stream error keeps any
  partial lesson playable.
- `LessonPlayer` new props `building` + `totalSegments`; new phase `"buffering"`
  ("Composing the next beat…" overlay) when playback catches up to generation —
  auto-resumes when the next beat arrives. Progress row shows pulsing
  placeholders for beats not yet arrived. Narrator onDone reads live refs
  (`segmentCountRef`/`buildingRef`), not stale closures.

## Next up
Deferred list remains: "model-decides" interruption, persistence/history, eval
harness, phase-4 3D, retire `/api/tutor`. Pick with the user. A strategic review
(market deep dive + interactive-whiteboard differentiation plan) was written and
**tabled** 2026-07-05 → `docs/INTERACTIVE_TUTOR_PLAN.md`; don't start it unprompted.

## Verified (current tree)
Green: `npx tsc --noEmit`, `npm run lint`, `npm run build` (unsandboxed). Stream
protocol exercised end-to-end against the real route handler (offline path) in a
scratch test: 11/11 checks. Earlier trace/fallback scratch tests: 18/18.

## Watch-outs
- Don't run `npm run dev` (hook-blocked; crashed the user's Mac). User runs it.
- Streaming needs a real-browser check: start a live lesson, confirm playback
  starts on beat 1 and the buffering overlay resolves itself.
- react-hooks lint is strict here: no ref writes in render, no sync setState in
  effects (LessonPlayer uses an effect-synced ref + setTimeout(0) pattern).
