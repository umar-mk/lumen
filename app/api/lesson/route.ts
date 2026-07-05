import { NextResponse } from "next/server";

import { providerConfigured, rateGuard } from "@/lib/llm";
import { buildLesson } from "@/lib/lessonBuilder";
import { lessonScriptSchema, validateLessonScript } from "@/lib/planningSchema";
import type { LessonStreamEvent } from "@/types/lesson";

export const runtime = "nodejs";
// The lesson is built one small scene per beat (sequential calls), so each
// call is cheap, but the whole loop can take a while on slower/free models.
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { script?: unknown };
  const scriptInput = lessonScriptSchema.safeParse(body.script);
  if (!scriptInput.success) return NextResponse.json({ error: "Missing or invalid lesson script." }, { status: 400 });

  const scriptResult = validateLessonScript(scriptInput.data);
  if (!scriptResult.ok) return NextResponse.json({ error: `Invalid lesson script: ${scriptResult.error}` }, { status: 400 });
  const script = scriptResult.script;

  if (providerConfigured()) {
    const limited = rateGuard();
    if (limited) return NextResponse.json({ error: limited }, { status: 429 });
  }

  // Pipelined start: stream NDJSON events (meta → segment per beat → done) so
  // the client can begin playback after the first beats while the rest compose.
  // Errors before this point stay plain JSON; errors mid-build become events.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: LessonStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await buildLesson(script, send);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
