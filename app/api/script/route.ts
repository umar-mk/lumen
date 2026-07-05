import { NextResponse } from "next/server";
import { z } from "zod";

import { providerConfigured, rateGuard, runTool, type Usage } from "@/lib/llm";
import { offlineDerivativeScript, offlineUsage } from "@/lib/offlinePipeline";
import { diagnosticAnswerSchema, lessonScriptSchema, validateLessonScript } from "@/lib/planningSchema";
import { NARRATION_RULES, PERSONA, SCRIPT_REVIEW_RULES, SCRIPT_RULES } from "@/lib/prompt";
import { inferShotPattern, inferStageForPattern } from "@/lib/shotPatterns";
import type { DiagnosticAnswer, LessonScript } from "@/types/planning";

export const runtime = "nodejs";
export const maxDuration = 150;

const SYSTEM = `${PERSONA}\n\n${NARRATION_RULES}\n\n${SCRIPT_RULES}`;
const REVIEW_SYSTEM = `${PERSONA}\n\n${NARRATION_RULES}\n\n${SCRIPT_REVIEW_RULES}`;
const answersSchema = z.array(diagnosticAnswerSchema).min(1).max(4);

const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheCreate: a.cacheCreate + b.cacheCreate,
});

function scriptReviewBrief(topic: string, answers: DiagnosticAnswer[], script: LessonScript): string {
  const answerSummary = answers.map((a) => `- ${a.questionId}: ${a.label}`).join("\n");
  return `Review and repair this teacher script before visual generation.

Lesson topic: ${topic}

Student diagnostic answers:
${answerSummary}

Candidate script:
\`\`\`json
${JSON.stringify(script)}
\`\`\`

Return ONE corrected LessonScript.`;
}

// A production lead-in to strip from the FRONT of a sentence while keeping the
// real teaching content after it (so "In symbols, the limit exists iff ..." keeps
// the math, just losing the stage direction).
const LEAD_IN = /^(in symbols|as shown|as you can see|on screen|in the animation|here we see|notice on the (left|right)|on the (left|right) (here|of the screen))[,:]?\s*/i;
// A sentence that is PURELY a rendering instruction with no teaching content.
const PURE_DIRECTIVE = /^(we (now )?(draw|fade|show|highlight|animate|trace|slide|zoom)|fade in|the animation (now |then )?(shows|begins|plays))\b/i;
const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function cleanNarration(narration: string, priorSentences: string[]) {
  const prior = new Set(priorSentences.map(normalizeKey));
  const sentences = narration
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const raw of sentences) {
    const stripped = raw.replace(LEAD_IN, "").trim();
    if (!stripped) continue; // the sentence was only a lead-in
    if (PURE_DIRECTIVE.test(stripped)) continue; // pure production direction, no math
    const key = normalizeKey(stripped);
    if (key.length > 20 && prior.has(key)) continue; // verbatim repeat of an earlier beat
    kept.push(stripped.charAt(0).toUpperCase() + stripped.slice(1));
    prior.add(key);
  }
  return kept.join(" ") || narration;
}

function normalizeScript(script: LessonScript): LessonScript {
  const prior: string[] = [];
  const beats = script.beats.map((beat, index) => {
    const narration = cleanNarration(beat.narration, prior);
    prior.push(...narration.split(/(?<=[.!?])\s+/));
    const shotPattern = beat.shotPattern ?? inferShotPattern({ ...beat, narration });
    const stage = beat.stage ?? inferStageForPattern(shotPattern);
    const priorBeat = index > 0 ? script.beats[index - 1] : undefined;
    const continueFrom =
      beat.continueFrom ?? (priorBeat && stage !== "statement" && stage === (priorBeat.stage ?? inferStageForPattern(priorBeat.shotPattern ?? inferShotPattern(priorBeat))) ? "prev" : undefined);
    return { ...beat, narration, stage, shotPattern, continueFrom };
  });
  return { ...script, beats };
}

async function reviewScript(
  topic: string,
  answers: DiagnosticAnswer[],
  script: LessonScript,
): Promise<{ script: LessonScript; usage: Usage; warning?: string }> {
  try {
    const { input, usage } = await runTool({
      system: REVIEW_SYSTEM,
      toolName: "review_lesson_script",
      toolDescription:
        "Review and repair a LessonScript for 3Blue1Brown-style pedagogy, drawable visual intent, sync cues, and weak metaphor problems.",
      schema: lessonScriptSchema,
      maxTokens: 16000,
      messages: [{ role: "user", content: scriptReviewBrief(topic, answers, script) }],
    });

    const result = validateLessonScript(input);
    if (result.ok) return { script: normalizeScript(result.script), usage };
    return { script, usage, warning: `script review invalid: ${result.error}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { script, usage: emptyUsage(), warning: `script review threw: ${reason}` };
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { topic?: unknown; answers?: unknown };
    const topic = typeof body.topic === "string" ? body.topic.slice(0, 200).trim() : "";
    if (!topic) return NextResponse.json({ error: "Missing topic." }, { status: 400 });

    const answers = answersSchema.safeParse(body.answers);
    if (!answers.success) return NextResponse.json({ error: "Missing or invalid diagnostic answers." }, { status: 400 });

    if (!providerConfigured()) {
      return NextResponse.json({ script: normalizeScript(offlineDerivativeScript(topic, answers.data)), usage: offlineUsage, offline: true });
    }

    const limited = rateGuard();
    if (limited) return NextResponse.json({ error: limited }, { status: 429 });

    const answerSummary = answers.data.map((a) => `- ${a.questionId}: ${a.label}`).join("\n");
    const { input, usage } = await runTool({
      system: SYSTEM,
      toolName: "write_lesson_script",
      toolDescription: "Write a teacher-quality lesson script with goals, misconceptions, narration, visual intent, sync cues, and beat durations.",
      schema: lessonScriptSchema,
      maxTokens: 16000,
      messages: [
        {
          role: "user",
          content: `Lesson topic: ${topic}

Student diagnostic answers:
${answerSummary}

Write the full teacher script before any rendering happens.`,
        },
      ],
    });

    const result = validateLessonScript(input);
    if (!result.ok) {
      return NextResponse.json({ error: `Invalid lesson script: ${result.error}` }, { status: 502 });
    }

    const reviewed = await reviewScript(topic, answers.data, normalizeScript(result.script));
    return NextResponse.json({
      script: normalizeScript(reviewed.script),
      usage: addUsage(usage, reviewed.usage),
      scriptReviewWarning: reviewed.warning,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
