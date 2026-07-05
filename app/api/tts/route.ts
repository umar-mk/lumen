import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EdgeTTS } from "node-edge-tts";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const ttsRequestSchema = z.object({
  text: z.string().min(1).max(1800),
  voice: z.string().min(1).max(120).optional(),
});

const DEFAULT_VOICE = "en-US-AndrewMultilingualNeural";

export async function POST(req: Request) {
  let dir: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = ttsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing or invalid TTS text." }, { status: 400 });
    }

    dir = await mkdtemp(join(tmpdir(), "lumen-tts-"));
    const audioPath = join(dir, "speech.mp3");
    const voice = parsed.data.voice ?? process.env.LUMEN_TTS_VOICE ?? DEFAULT_VOICE;
    const tts = new EdgeTTS({
      voice,
      lang: voice.split("-").slice(0, 2).join("-") || "en-US",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      rate: "default",
      pitch: "default",
      volume: "default",
      timeout: 9000,
    });

    await tts.ttsPromise(parsed.data.text, audioPath);
    const audio = await readFile(audioPath);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "TTS unavailable" }, { status: 502 });
  } finally {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
