import { NextResponse } from "next/server";

import { providerConfigured, rateGuard, runTool } from "@/lib/llm";
import { offlineDerivativeIntake, offlineUsage } from "@/lib/offlinePipeline";
import { diagnosticIntakeSchema, validateDiagnosticIntake } from "@/lib/planningSchema";
import { INTAKE_RULES, PERSONA } from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `${PERSONA}\n\n${INTAKE_RULES}`;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { topic?: unknown };
    const topic = typeof body.topic === "string" ? body.topic.slice(0, 200).trim() : "";
    if (!topic) return NextResponse.json({ error: "Missing topic." }, { status: 400 });

    if (!providerConfigured()) {
      return NextResponse.json({ intake: offlineDerivativeIntake(topic), usage: offlineUsage, offline: true });
    }

    const limited = rateGuard();
    if (limited) return NextResponse.json({ error: limited }, { status: 429 });

    const { input, usage } = await runTool({
      system: SYSTEM,
      toolName: "create_diagnostic_intake",
      toolDescription: "Create concise dropdown diagnostic questions before teaching a topic.",
      schema: diagnosticIntakeSchema,
      maxTokens: 2048,
      messages: [{ role: "user", content: `Create diagnostic intake questions for this lesson topic: ${topic}` }],
    });

    const result = validateDiagnosticIntake(input);
    if (!result.ok) {
      return NextResponse.json({ error: `Invalid diagnostic intake: ${result.error}` }, { status: 502 });
    }
    return NextResponse.json({ intake: result.intake, usage });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
