"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import SceneRenderer from "@/components/SceneRenderer";
import { retimeScene, type WordTiming } from "@/lib/syncTimeline";
import { narrate, prefetchNarration, type Narrator } from "@/lib/tts";
import type { Lesson, LessonSegment } from "@/types/lesson";

type Phase = "idle" | "playing" | "paused" | "loading" | "buffering" | "done";

/**
 * Plays a Lesson like a teacher: for each segment it renders the scene and
 * speaks the narration, advancing when narration ends. The student can pause and
 * interrupt; an interruption generates one answer segment (answer-then-resume),
 * after which the interrupted segment replays and the planned lesson continues.
 *
 * Pipelined start: the lesson may still be BUILDING while it plays — `lesson.
 * segments` grows as beats stream in. Pass `building` while the stream is open
 * and `totalSegments` (expected beat count) for the progress row. If playback
 * catches up to generation, the player waits in a "buffering" phase and resumes
 * on its own when the next beat arrives.
 *
 * Parent should pass a stable `key` per lesson so a new lesson remounts fresh.
 */
export default function LessonPlayer({
  lesson,
  chrome = "full",
  building = false,
  totalSegments,
}: {
  lesson: Lesson;
  chrome?: "full" | "cinema";
  building?: boolean;
  totalSegments?: number;
}) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<LessonSegment | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [replayKey, setReplayKey] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [narrationTiming, setNarrationTiming] = useState<{ playId: string; seconds?: number; words?: WordTiming[] | null }>({ playId: "" });
  const [narrationStarted, setNarrationStarted] = useState<{ playId: string; started: boolean }>({ playId: "", started: false });
  const narratorRef = useRef<Narrator | null>(null);
  const narratorPlayIdRef = useRef<string | null>(null);
  // Live values for the narrator's onDone closure: segments keep streaming in
  // after the narrator is created, so the closure must not capture stale counts.
  const segmentCountRef = useRef(lesson.segments.length);
  const buildingRef = useRef(building);
  useEffect(() => {
    segmentCountRef.current = lesson.segments.length;
    buildingRef.current = building;
  }, [lesson.segments.length, building]);

  const activeSegment = answer ?? lesson.segments[index];
  const playId = `${answer ? `a-${answer.id}` : `s-${index}`}-${replayKey}`;
  const narrationSeconds = narrationTiming.playId === playId ? narrationTiming.seconds : undefined;
  const narrationWords = narrationTiming.playId === playId ? narrationTiming.words : undefined;
  const scenePlaying = phase === "playing" && narrationStarted.playId === playId && narrationStarted.started;
  const isCinema = chrome === "cinema";

  // Audio-true timing: once the real narration audio (and its word timings) are
  // known, warp the scene timeline onto it — cued steps land on their spoken
  // phrase, and the scene lasts exactly as long as the voice. Falls back to the
  // untimed scene until onReady fires (SceneRenderer holds pre-animation then).
  const timedScene = useMemo(() => {
    if (!activeSegment) return null;
    if (!narrationSeconds) return activeSegment.scene;
    return retimeScene(activeSegment.scene, narrationWords ?? null, narrationSeconds);
  }, [activeSegment, narrationSeconds, narrationWords]);

  // Start narration once per playId. Pause/resume must NOT recreate the narrator,
  // or audio restarts from the beginning while the animation resumes in place.
  useEffect(() => {
    if (phase !== "playing" || !activeSegment) return;
    if (narratorPlayIdRef.current === playId && narratorRef.current) return;

    const wasAnswer = answer !== null;
    const currentPlayId = playId;
    narratorRef.current?.cancel();
    narratorPlayIdRef.current = currentPlayId;

    const narrator = narrate(activeSegment.narration, {
      onReady: (sec, words) => {
        if (narratorPlayIdRef.current === currentPlayId) setNarrationTiming({ playId: currentPlayId, seconds: sec, words });
      },
      onStart: () => {
        if (narratorPlayIdRef.current === currentPlayId) setNarrationStarted({ playId: currentPlayId, started: true });
      },
      onDone: () => {
        if (narratorPlayIdRef.current !== currentPlayId) return;
        if (wasAnswer) {
          // Resume: drop the answer and replay the interrupted segment.
          setAnswer(null);
          setReplayKey((k) => k + 1);
        } else if (index < segmentCountRef.current - 1) {
          setIndex((i) => i + 1);
        } else if (buildingRef.current) {
          // Playback caught up to generation — wait for the next streamed beat.
          setPhase("buffering");
        } else {
          setPhase("done");
        }
      },
    });
    narratorRef.current = narrator;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playId]);

  useEffect(() => {
    if (phase === "playing") narratorRef.current?.resume();
    else narratorRef.current?.pause();
  }, [phase]);

  // Leave the buffering wait the moment the next streamed beat lands (or wrap
  // up if the stream closed with nothing more to play). Scheduled, not
  // synchronous, so the wait resolves without a cascading render.
  useEffect(() => {
    if (phase !== "buffering") return;
    const id = setTimeout(() => {
      if (index < segmentCountRef.current - 1) {
        setIndex((i) => i + 1);
        setPhase("playing");
      } else if (!buildingRef.current) {
        setPhase("done");
      }
    }, 0);
    return () => clearTimeout(id);
  }, [phase, lesson.segments.length, building, index]);

  // Pipeline narration: warm the current + next beat's audio so advancing has no
  // fetch gap (and the first beat is ready before Start is pressed). Skipped while
  // answering — the one-off answer segment isn't part of the planned lesson.
  useEffect(() => {
    if (answer) return;
    prefetchNarration(lesson.segments[index]?.narration ?? "");
    prefetchNarration(lesson.segments[index + 1]?.narration ?? "");
  }, [index, answer, lesson]);

  useEffect(() => {
    return () => narratorRef.current?.cancel();
  }, []);

  const start = useCallback(() => {
    setError(null);
    setPhase("playing");
  }, []);

  const restart = useCallback(() => {
    setAnswer(null);
    setIndex(0);
    setError(null);
    setReplayKey((k) => k + 1);
    setPhase("playing");
  }, []);

  const interrupt = useCallback(async () => {
    const q = input.trim();
    if (!q || phase === "loading" || !activeSegment) return;
    setError(null);
    setPhase("loading"); // pause current narration while the answer is generated
    try {
      const res = await fetch("/api/interrupt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: lesson.topic,
          question: q,
          currentNarration: activeSegment.narration,
          currentScene: activeSegment.scene,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setInput("");
      setAnswer(data.segment as LessonSegment);
      setReplayKey((k) => k + 1);
      setPhase("playing"); // effect plays the answer, then resumes
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("paused");
    }
  }, [input, phase, activeSegment, lesson.topic]);

  const answering = answer !== null;

  return (
    <div className={isCinema ? "flex h-screen w-screen items-center justify-center bg-black" : "flex flex-col gap-4"}>
      {!isCinema && (
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">{lesson.title}</h2>
          <p className="mt-0.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint">{lesson.topic}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(1.15rem,1fr))] gap-1.5">
          {Array.from({ length: Math.max(lesson.segments.length, totalSegments ?? 0) }, (_, i) => {
            const arrived = i < lesson.segments.length;
            return (
              <span
                key={lesson.segments[i]?.id ?? `pending-${i}`}
                className={`h-1 rounded-full transition ${
                  !answering && i === index
                    ? "bg-accent"
                    : i < index
                      ? "bg-white/30"
                      : arrived
                        ? "bg-white/10"
                        : "animate-pulse bg-white/5"
                }`}
              />
            );
          })}
        </div>
      </div>
      )}

      <div
        className={isCinema ? "relative" : "relative overflow-hidden rounded-2xl border border-hairline-strong bg-black"}
        style={isCinema ? { width: "min(100vw, 177.7778vh)" } : undefined}
      >
        {activeSegment && timedScene && (
          // Key on playId ONLY. narrationSeconds arrives ~1-2s after the voice
          // loads; keying on it would remount mid-beat and restart the animation
          // (the "plays a bit, reloads, plays again" bug). SceneRenderer instead
          // waits for the measured length, then starts the timeline once.
          <SceneRenderer
            key={playId}
            scene={timedScene}
            sceneKey={playId}
            narrationSeconds={narrationSeconds}
            playing={scenePlaying}
          />
        )}

        {phase === "idle" && (
          <button
            onClick={start}
            className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm transition hover:bg-black/45"
          >
            <span className="flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background shadow-lg">
              ▶ Start lesson
            </span>
          </button>
        )}
        {phase === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
              Answering your question…
            </div>
          </div>
        )}
        {phase === "buffering" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
              Composing the next beat…
            </div>
          </div>
        )}
        {!isCinema && answering && phase === "playing" && (
          <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-accent px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-background">
            Answering interruption
          </div>
        )}
        {phase === "done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
            <p className="text-foreground">Lesson complete.</p>
            <button onClick={restart} className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85">
              ↻ Replay lesson
            </button>
          </div>
        )}
      </div>

      {/* Narration caption (also the no-audio fallback) */}
      {!isCinema && activeSegment && (
        <p className="min-h-[3.5rem] rounded-xl border border-hairline bg-panel px-4 py-3 text-sm leading-6 text-muted">
          {activeSegment.narration}
        </p>
      )}

      {!isCinema && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {!isCinema && (
      <div className="flex items-center gap-2">
        {phase === "playing" && (
          <button onClick={() => setPhase("paused")} className="rounded-lg border border-hairline-strong bg-panel px-4 py-2 text-sm text-muted transition hover:bg-panel-raised hover:text-foreground">
            ❚❚ Pause
          </button>
        )}
        {(phase === "paused" || phase === "idle") && (
          <button onClick={start} className="rounded-lg border border-hairline-strong bg-panel px-4 py-2 text-sm text-muted transition hover:bg-panel-raised hover:text-foreground">
            ▶ {phase === "idle" ? "Start" : "Resume"}
          </button>
        )}
        <button onClick={restart} className="rounded-lg border border-hairline-strong bg-panel px-4 py-2 text-sm text-muted transition hover:bg-panel-raised hover:text-foreground">
          ↻ Restart
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void interrupt();
          }}
          className="ml-auto flex flex-1 gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Interrupt — ask the teacher a question…"
            disabled={phase === "loading" || phase === "idle"}
            className="min-w-0 flex-1 rounded-lg border border-hairline-strong bg-panel px-3 py-2 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-accent/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={phase === "loading" || phase === "idle" || !input.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      </div>
      )}
    </div>
  );
}
