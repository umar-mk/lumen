import { NextResponse } from "next/server";

import { ACTIVE_PROVIDER, providerConfigured, rateGuard, runTool } from "@/lib/llm";
import { silentFallbackScene } from "@/lib/fallbackScene";
import { resolveLayout } from "@/lib/layout";
import { answerSegmentSchema, validateSegment } from "@/lib/lessonSchema";
import { PERSONA, SCENE_RULES, NARRATION_RULES, INTERRUPT_RULES } from "@/lib/prompt";
import { formatIssues, lintScene, severeIssues } from "@/lib/sceneQA";
import { sanitizeScene } from "@/lib/sceneSanitize";
import { applyShotPattern } from "@/lib/shotPatterns";
import type { TeachingBeat } from "@/types/planning";
import type { SceneSpec } from "@/types/scene";

export const runtime = "nodejs";
// Interruptions must feel instant — small, focused output.
export const maxDuration = 30;

const SYSTEM = `${PERSONA}\n\n${SCENE_RULES}\n\n${NARRATION_RULES}\n\n${INTERRUPT_RULES}`;

// Text-free last resort: the spoken answer still plays; the board stays neutral
// instead of showing filler text (see lib/fallbackScene.ts).
function fallbackScene(duration: number | undefined): SceneSpec {
  return resolveLayout(silentFallbackScene(duration));
}

export async function POST(req: Request) {
  if (!providerConfigured()) {
    return NextResponse.json(
      { error: `No model provider configured for "${ACTIVE_PROVIDER}". Set its key in .env.local and restart.` },
      { status: 503 },
    );
  }
  const limited = rateGuard();
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      topic?: unknown;
      question?: unknown;
      currentNarration?: unknown;
      currentScene?: unknown;
    };
    const question = typeof body.question === "string" ? body.question.slice(0, 1000).trim() : "";
    if (!question) return NextResponse.json({ error: "Missing question." }, { status: 400 });

    const topic = typeof body.topic === "string" ? body.topic.slice(0, 200) : "this topic";
    const currentNarration = typeof body.currentNarration === "string" ? body.currentNarration.slice(0, 1200) : "";
    const sceneCtx = body.currentScene ? JSON.stringify(body.currentScene).slice(0, 8000) : "";

    const userContent = `Lesson topic: ${topic}
The student was just hearing: "${currentNarration}"
${sceneCtx ? `Current scene on screen:\n\`\`\`json\n${sceneCtx}\n\`\`\`\n` : ""}
The student interrupts and asks: "${question}"

Answer with exactly one segment.`;

    const { input, usage } = await runTool({
      system: SYSTEM,
      toolName: "answer_segment",
      toolDescription: "Render one narrated scene that answers the student's interruption.",
      schema: answerSegmentSchema,
      // One narration + a full SceneSpec (objects + timeline) can exceed 4096
      // tokens and truncate mid-JSON; give it headroom while staying small enough
      // to feel instant. (Lesson route budgets 16000 for many segments.)
      maxTokens: 8192,
      messages: [{ role: "user", content: userContent }],
    });

    const result = validateSegment(input);
    if (!result.ok) {
      return NextResponse.json({ error: `Invalid answer: ${result.error}` }, { status: 502 });
    }
    const beat: TeachingBeat = {
      id: result.segment.id,
      teachingGoal: "Answer the student's interruption clearly.",
      narration: result.segment.narration,
      visualIntent: "One focused visual answer.",
      syncCues: [{ phrase: result.segment.narration.slice(0, 80), visualAction: "Show the key answer visually." }],
      targetDurationSec: result.segment.scene.duration ?? 16,
    };
    let scene = resolveLayout(applyShotPattern(result.segment.scene, beat));
    let issues = severeIssues(lintScene(scene));
    for (let pass = 0; pass < 3 && issues.length; pass++) {
      scene = resolveLayout(applyShotPattern(sanitizeScene(scene, issues), beat));
      issues = severeIssues(lintScene(scene));
    }
    if (issues.length) {
      return NextResponse.json({
        segment: { ...result.segment, scene: fallbackScene(result.segment.scene.duration) },
        usage,
        qaWarnings: formatIssues(issues),
      });
    }
    return NextResponse.json({ segment: { ...result.segment, scene }, usage });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
