/**
 * Lesson-quality eval harness — run with:
 *   npm run eval                 # all golden topics (live provider)
 *   npm run eval -- --topics 3   # first N topics only
 *   npm run eval -- --offline    # offline pipeline only (harness sanity check)
 *
 * Drives the REAL pipeline (lib/scriptBuilder + lib/lessonBuilder — the same
 * code the routes run) over a fixed golden-topic set, scores every beat with
 * the deterministic judge (lib/sceneScore), and writes JSON results to
 * eval-results/<timestamp>/ plus a console summary. The /debug/eval page
 * renders the saved lessons through the real SceneRenderer.
 *
 * This is the regression gate: run before and after any prompt / program /
 * layout change. Scores must not go down.
 *
 * NOTE: lib/llm.ts reads env at module load, so .env.local is parsed here
 * FIRST and all lib imports are dynamic (inside main), never top-level.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { Usage } from "../lib/llm";
import type { LessonScoreSummary } from "../lib/sceneScore";
import type { LessonScript, DiagnosticAnswer } from "../types/planning";
import type { Lesson, LessonSegment, LessonStreamEvent } from "../types/lesson";

// ---------------------------------------------------------------------------
// Env: Next loads .env.local automatically; plain node/tsx does not. This must
// run before lib/llm is imported (it snapshots env at module load).
function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------------------------------------------------------------------------
// Golden set: diverse subjects, fixed student profile → comparable runs.
const STANDARD_ANSWERS: DiagnosticAnswer[] = [
  { questionId: "background", optionId: "new", label: "New to this topic, comfortable with the prerequisites" },
  { questionId: "focus", optionId: "intuition", label: "Build deep intuition for why it works" },
  { questionId: "pace", optionId: "standard", label: "Standard pace" },
];

const GOLDEN_TOPICS: { topic: string; answers: DiagnosticAnswer[] }[] = [
  { topic: "What is a derivative, really?", answers: STANDARD_ANSWERS },
  { topic: "Why does the area under a curve give distance from velocity?", answers: STANDARD_ANSWERS },
  { topic: "The unit circle and why sine and cosine are waves", answers: STANDARD_ANSWERS },
  { topic: "What do matrix transformations do to space?", answers: STANDARD_ANSWERS },
  { topic: "Bayes' theorem: updating beliefs with evidence", answers: STANDARD_ANSWERS },
  { topic: "Why completing the square works", answers: STANDARD_ANSWERS },
  { topic: "Simple harmonic motion: why springs make sine waves", answers: STANDARD_ANSWERS },
  { topic: "Compound interest and the number e", answers: STANDARD_ANSWERS },
];

interface TopicResult {
  topic: string;
  title: string;
  beats: number;
  scores: LessonScoreSummary;
  warnings: { failures: number; qa: number };
  usage?: Usage;
  buildMs: number;
}

interface EvalIndex {
  createdAt: string;
  provider: string;
  model: string;
  offline: boolean;
  results: TopicResult[];
  meanOfMeans: number;
  minOfMins: number;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const topicsFlag = args.indexOf("--topics");
  return {
    offline: args.includes("--offline"),
    topics: topicsFlag >= 0 ? Number(args[topicsFlag + 1]) || GOLDEN_TOPICS.length : GOLDEN_TOPICS.length,
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const pad = (s: string | number, n: number) => String(s).padEnd(n);

async function main() {
  const { offline, topics } = parseArgs();
  if (offline) {
    // Offline mode exercises the harness itself against the hand-authored
    // lesson: strip provider config so providerConfigured() is false.
    delete process.env.LUMEN_PROVIDER;
    for (const key of Object.keys(process.env)) {
      if (key.endsWith("_API_KEY")) delete process.env[key];
    }
  } else {
    loadEnvLocal();
  }

  // Import AFTER env is settled — lib/llm snapshots provider config at load.
  const { providerConfigured } = await import("../lib/llm");
  const { buildLesson } = await import("../lib/lessonBuilder");
  const { summarizeLessonScores } = await import("../lib/sceneScore");

  if (!offline && !providerConfigured()) {
    console.error("No provider configured (.env.local) — use --offline for a harness sanity check.");
    process.exit(1);
  }

  /** Collect the events buildLesson emits into a full Lesson. */
  async function collectLesson(script: LessonScript) {
    let header: Lesson | null = null;
    const segments: LessonSegment[] = [];
    let usage: Usage | undefined;
    let failures = 0;
    let qa = 0;
    await buildLesson(script, (event: LessonStreamEvent) => {
      if (event.type === "meta") header = event.lesson;
      else if (event.type === "segment") segments[event.index] = event.segment;
      else if (event.type === "done") {
        usage = event.usage;
        failures = event.warnings?.length ?? 0;
        qa = event.qaWarnings?.length ?? 0;
      } else if (event.type === "error") throw new Error(event.message);
    });
    if (!header) throw new Error("buildLesson emitted no meta event");
    const lesson: Lesson = { ...(header as Lesson), segments: segments.filter(Boolean) };
    return { lesson, segments: lesson.segments, usage, failures, qa };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join("eval-results", stamp);
  mkdirSync(outDir, { recursive: true });

  const selected = GOLDEN_TOPICS.slice(0, offline ? 1 : topics);
  const results: TopicResult[] = [];

  for (const [i, { topic, answers }] of selected.entries()) {
    console.log(`\n[${i + 1}/${selected.length}] ${topic}`);
    const t0 = Date.now();
    try {
      let script: LessonScript;
      if (offline) {
        const { offlineDerivativeScript } = await import("../lib/offlinePipeline");
        const { normalizeScript } = await import("../lib/scriptBuilder");
        script = normalizeScript(offlineDerivativeScript(topic, answers));
      } else {
        const { generateLessonScript } = await import("../lib/scriptBuilder");
        const generated = await generateLessonScript(topic, answers);
        script = generated.script;
        if (generated.warning) console.warn(`  script warning: ${generated.warning}`);
      }
      console.log(`  script: ${script.beats.length} beats — "${script.title}"`);

      const { lesson, segments, usage, failures, qa } = await collectLesson(script);
      const scores = summarizeLessonScores(segments);
      const result: TopicResult = {
        topic,
        title: lesson.title,
        beats: segments.length,
        scores,
        warnings: { failures, qa },
        usage,
        buildMs: Date.now() - t0,
      };
      results.push(result);
      writeFileSync(join(outDir, `${slug(topic)}.json`), JSON.stringify({ topic, script, lesson, scores }, null, 1));
      console.log(`  score: mean ${scores.mean} min ${scores.min} weakest ${scores.weakestPart} (${failures} failures, ${qa} qa warnings, ${Math.round(result.buildMs / 1000)}s)`);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  const index: EvalIndex = {
    createdAt: new Date().toISOString(),
    provider: process.env.LUMEN_PROVIDER ?? "(none)",
    model: process.env.LUMEN_MODEL ?? "(default)",
    offline,
    results,
    meanOfMeans: results.length ? Math.round((results.reduce((s, r) => s + r.scores.mean, 0) / results.length) * 10) / 10 : 0,
    minOfMins: results.length ? Math.min(...results.map((r) => r.scores.min)) : 0,
  };
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 1));
  writeFileSync(join("eval-results", "latest.json"), JSON.stringify({ dir: stamp, ...index }, null, 1));

  console.log(`\n${"topic".padEnd(52)} ${pad("beats", 6)} ${pad("mean", 6)} ${pad("min", 6)} weakest`);
  for (const r of results) {
    console.log(`${pad(r.topic.slice(0, 50), 52)} ${pad(r.beats, 6)} ${pad(r.scores.mean, 6)} ${pad(r.scores.min, 6)} ${r.scores.weakestPart}`);
  }
  console.log(`\nOVERALL mean ${index.meanOfMeans}  min ${index.minOfMins}  → ${outDir}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
