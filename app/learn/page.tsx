"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import LessonPlayer from "@/components/LessonPlayer";
import Wordmark from "@/components/site/Wordmark";
import { offlineDerivativeLesson } from "@/lib/offlinePipeline";
import type { Lesson, LessonSegment, LessonStreamEvent } from "@/types/lesson";
import type { DiagnosticAnswer, DiagnosticIntake, DiagnosticQuestion, LessonScript } from "@/types/planning";

const EXAMPLES = [
  "What is a derivative?",
  "Explain limits in Calculus 1",
  "How does the unit circle define sine and cosine?",
  "Why is the area of a circle pi r squared?",
];

type Stage = "sample" | "building-intake" | "intake" | "building-script" | "building-lesson" | "ready";

function defaultAnswers(intake: DiagnosticIntake): Record<string, string> {
  return Object.fromEntries(intake.questions.map((q) => [q.id, q.defaultOptionId]));
}

function selectedAnswers(intake: DiagnosticIntake, answers: Record<string, string>): DiagnosticAnswer[] {
  return intake.questions.map((q) => {
    const optionId = answers[q.id] ?? q.defaultOptionId;
    const option = q.options.find((o) => o.id === optionId) ?? q.options.find((o) => o.id === q.defaultOptionId) ?? q.options[0];
    return { questionId: q.id, optionId: option.id, label: option.label };
  });
}

type StepState = "done" | "active" | "pending";

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft">
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 6.2 5 9l5-6" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-5 w-5 items-center justify-center">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center">
      <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
    </span>
  );
}

/**
 * Live progress for the two slow phases. Mounts when a build starts, so the
 * elapsed clock always starts at zero for the phase the user is watching.
 */
function BuildProgress({ stage, beats }: { stage: Stage; beats: number | null }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const clock = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

  const isIntake = stage === "building-intake";
  const steps: { label: string; detail: string; state: StepState }[] = isIntake
    ? [{ label: "Preparing a few diagnostic questions", detail: "So the lesson starts at your level", state: "active" }]
    : [
        {
          label: "Writing the teacher script",
          detail: beats ? `Script ready — ${beats} teaching beats` : "Tailored to your answers",
          state: stage === "building-script" ? "active" : "done",
        },
        {
          label: "Composing the animated scenes",
          detail: "Each beat is drawn, validated and laid out",
          state: stage === "building-lesson" ? "active" : "pending",
        },
        {
          label: "Narrating and starting playback",
          detail: "Neural voice, prefetched beat by beat",
          state: "pending",
        },
      ];

  return (
    <section className="rounded-2xl border border-hairline bg-panel p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{isIntake ? "Setting up" : "Building your lesson"}</p>
        <span className="font-mono text-xs tabular-nums text-faint">{clock}</span>
      </div>

      <ul className="mt-4 space-y-3.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-start gap-3">
            <span className="mt-0.5"><StepIcon state={s.state} /></span>
            <div className={s.state === "pending" ? "opacity-45" : undefined}>
              <p className="text-sm font-medium leading-5">{s.label}</p>
              <p className="mt-0.5 text-xs text-faint">{s.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="shimmer-bar h-full w-1/3 rounded-full bg-accent/70" />
      </div>
      {!isIntake && (
        <p className="mt-3 text-xs text-faint">
          A full lesson usually takes a minute or two — every scene is composed just for you.
        </p>
      )}
    </section>
  );
}

export default function LearnPage() {
  const [lesson, setLesson] = useState<Lesson>(offlineDerivativeLesson);
  const [lessonKey, setLessonKey] = useState(0);
  const [topic, setTopic] = useState("");
  const [activeTopic, setActiveTopic] = useState("");
  const [stage, setStage] = useState<Stage>("sample");
  const [intake, setIntake] = useState<DiagnosticIntake | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [script, setScript] = useState<LessonScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pipelined build: beats stream in and playback can start before the last one.
  const [building, setBuilding] = useState(false);
  const [totalBeats, setTotalBeats] = useState<number | null>(null);

  // `building` keeps the form locked while beats still stream in, even though
  // the player is already live ("ready").
  const busy = stage === "building-intake" || stage === "building-script" || stage === "building-lesson" || building;
  const selected = useMemo(() => (intake ? selectedAnswers(intake, answers) : []), [intake, answers]);

  const requestIntake = useCallback(
    async (rawTopic: string) => {
      const q = rawTopic.trim();
      if (!q || busy) return;
      setError(null);
      setScript(null);
      setActiveTopic(q);
      setStage("building-intake");
      try {
        const res = await fetch("/api/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: q }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        const nextIntake = data.intake as DiagnosticIntake;
        setIntake(nextIntake);
        setAnswers(defaultAnswers(nextIntake));
        setStage("intake");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setStage("sample");
      }
    },
    [busy],
  );

  const buildLesson = useCallback(async () => {
    if (!intake || busy) return;
    setError(null);
    setStage("building-script");
    try {
      const scriptRes = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: activeTopic || intake.topic, answers: selected }),
      });
      const scriptData = await scriptRes.json();
      if (!scriptRes.ok) throw new Error(scriptData.error || `Script request failed (${scriptRes.status})`);
      const nextScript = scriptData.script as LessonScript;
      setScript(nextScript);

      setStage("building-lesson");
      const lessonRes = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: nextScript }),
      });
      if (!lessonRes.ok) {
        const data = await lessonRes.json().catch(() => ({}));
        throw new Error(data.error || `Lesson request failed (${lessonRes.status})`);
      }
      if (!lessonRes.body) throw new Error("Lesson stream unavailable.");

      // NDJSON stream: meta → segment per beat → done. Reveal the player on the
      // FIRST beat and keep appending while it plays (pipelined start).
      setBuilding(true);
      setTotalBeats(nextScript.beats.length);
      let header: Lesson | null = null;
      const segments: LessonSegment[] = [];
      let sawDone = false;
      try {
        const reader = lessonRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          buffer += done ? "" : decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = done ? "" : lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const event = JSON.parse(trimmed) as LessonStreamEvent;
            if (event.type === "meta") {
              header = event.lesson;
              setTotalBeats(event.total);
            } else if (event.type === "segment") {
              segments.push(event.segment);
              const base = header ?? { version: 1 as const, topic: nextScript.topic, title: nextScript.title, segments: [] };
              setLesson({ ...base, segments: [...segments] });
              if (segments.length === 1) {
                setLessonKey((k) => k + 1);
                setStage("ready");
                setTopic("");
              }
            } else if (event.type === "error") {
              throw new Error(event.message);
            } else if (event.type === "done") {
              sawDone = true;
            }
          }
          if (done) break;
        }
        if (!sawDone) throw new Error("The lesson stream ended early.");
      } finally {
        setBuilding(false);
      }
      if (segments.length === 0) throw new Error("The lesson build produced no beats.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      // A mid-stream failure after beats arrived keeps the partial lesson
      // playable; only a failure before the first beat returns to the intake.
      setStage((s) => (s === "ready" ? "ready" : "intake"));
    }
  }, [activeTopic, busy, intake, selected]);

  const resetToSample = useCallback(() => {
    setStage("sample");
    setIntake(null);
    setAnswers({});
    setScript(null);
    setError(null);
    setTotalBeats(null);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* App chrome */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" aria-label="Back to the Lumen homepage">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden font-mono text-[0.65rem] uppercase tracking-[0.14em] text-faint sm:block">
              Live session
            </span>
            <Link
              href="/offline"
              className="rounded-full border border-hairline-strong px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-white/25 hover:text-foreground"
            >
              Cinema sample
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        {/* Prompt */}
        <section>
          <h1 className="text-2xl font-medium tracking-tight">What should the teacher explain?</h1>
          <p className="mt-1.5 text-sm text-muted">
            One topic in — a narrated, animated lesson out. Tune it to your background first.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void requestIntake(topic);
            }}
            className="mt-6 flex gap-2"
          >
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. “what is a derivative”"
              disabled={busy}
              className="flex-1 rounded-xl border border-hairline-strong bg-panel px-4 py-3 text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !topic.trim()}
              className="rounded-xl bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Working…" : "Start"}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => void requestIntake(ex)}
                disabled={busy}
                className="rounded-full border border-hairline px-3 py-1.5 text-xs text-faint transition-colors hover:border-hairline-strong hover:text-foreground disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</div>
        )}

        {busy && stage !== "ready" && (
          <BuildProgress stage={stage} beats={stage === "building-lesson" ? script?.beats.length ?? null : null} />
        )}

        {intake && stage === "intake" && (
          <section className="rounded-2xl border border-hairline bg-panel p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Tune the lesson</p>
                <h2 className="mt-1.5 text-base font-medium">{intake.topic}</h2>
              </div>
              <button
                onClick={resetToSample}
                className="rounded-full border border-hairline px-3.5 py-1.5 text-xs text-faint transition-colors hover:border-hairline-strong hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {intake.questions.map((q: DiagnosticQuestion) => {
                const selectedOption = q.options.find((o) => o.id === answers[q.id]);
                return (
                  <label key={q.id} className="flex flex-col gap-2.5 rounded-xl border border-hairline bg-background p-4">
                    <span className="text-sm font-medium">{q.question}</span>
                    <select
                      value={answers[q.id] ?? q.defaultOptionId}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      className="rounded-lg border border-hairline-strong bg-panel-raised px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/50"
                    >
                      {q.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {selectedOption?.description && (
                      <span className="text-xs leading-5 text-faint">{selectedOption.description}</span>
                    )}
                  </label>
                );
              })}
            </div>

            <button
              onClick={() => void buildLesson()}
              className="mt-5 rounded-xl bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
              Build tailored lesson
            </button>
          </section>
        )}

        <LessonPlayer key={lessonKey} lesson={lesson} building={building} totalSegments={totalBeats ?? undefined} />
      </div>
    </main>
  );
}
