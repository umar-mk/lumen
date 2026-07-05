import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EdgeTTS } from "node-edge-tts";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { WordTiming } from "@/lib/syncTimeline";

export const runtime = "nodejs";
export const maxDuration = 30;

const ttsRequestSchema = z.object({
  text: z.string().min(1).max(1800),
  voice: z.string().min(1).max(120).optional(),
});

const DEFAULT_VOICE = "en-US-AndrewMultilingualNeural";

/**
 * Returns JSON: { audio: <base64 mp3>, words: WordTiming[] | null }.
 * `words` are Edge's word-boundary timestamps (ms) for THIS exact audio —
 * the player uses them to retime the scene so visuals land on spoken words
 * (lib/syncTimeline.ts). Word timings are best-effort: if the subtitle file
 * is missing/unparsable the audio still ships with words: null.
 */
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
      saveSubtitles: true, // writes word boundaries to `${audioPath}.json`
      rate: "default",
      pitch: "default",
      volume: "default",
      timeout: 9000,
    });

    await tts.ttsPromise(parsed.data.text, audioPath);
    const audio = await readFile(audioPath);

    let words: WordTiming[] | null = null;
    try {
      const raw = JSON.parse(await readFile(`${audioPath}.json`, "utf8")) as unknown;
      if (Array.isArray(raw)) {
        const parsedWords = raw.filter(
          (w): w is WordTiming =>
            typeof w === "object" && w !== null &&
            typeof (w as WordTiming).part === "string" &&
            Number.isFinite((w as WordTiming).start) &&
            Number.isFinite((w as WordTiming).end),
        );
        if (parsedWords.length) words = parsedWords;
      }
    } catch {
      // Word timings are an enhancement; the audio alone is still a full result.
    }

    return NextResponse.json(
      { audio: audio.toString("base64"), words },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "TTS unavailable" }, { status: 502 });
  } finally {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
