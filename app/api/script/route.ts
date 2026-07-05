import { NextResponse } from "next/server";
import { z } from "zod";

import { providerConfigured, rateGuard } from "@/lib/llm";
import { offlineDerivativeScript, offlineUsage } from "@/lib/offlinePipeline";
import { diagnosticAnswerSchema } from "@/lib/planningSchema";
import { generateLessonScript, normalizeScript } from "@/lib/scriptBuilder";

export const runtime = "nodejs";
export const maxDuration = 150;

const answersSchema = z.array(diagnosticAnswerSchema).min(1).max(4);

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

    const { script, usage, warning } = await generateLessonScript(topic, answers.data);
    return NextResponse.json({ script, usage, scriptReviewWarning: warning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.startsWith("Invalid lesson script:") ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
