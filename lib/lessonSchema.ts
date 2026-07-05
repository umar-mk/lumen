import { z } from "zod";
import type { Lesson, LessonSegment } from "@/types/lesson";
import { sceneSpecSchema } from "@/lib/sceneSchema";

/**
 * Runtime validation for a Lesson and for a single interruption-answer segment.
 * Caps bound the cost/size of a generated lesson. The scene inside each segment
 * is validated by the same `sceneSpecSchema` the renderer trusts.
 */
export const LESSON_CAPS = { segments: 20, narration: 1800 } as const;

const segmentSchema = z.object({
  id: z.string().min(1).max(64),
  narration: z.string().min(1).max(LESSON_CAPS.narration),
  scene: sceneSpecSchema,
});

export const lessonSchema = z.object({
  version: z.literal(1),
  topic: z.string().min(1).max(200),
  title: z.string().min(1).max(160),
  scriptId: z.string().min(1).max(64).optional(),
  studentProfile: z.string().max(1400).optional(),
  sourceBeatIds: z.array(z.string().min(1).max(64)).max(LESSON_CAPS.segments).optional(),
  segments: z.array(segmentSchema).min(1).max(LESSON_CAPS.segments),
});

/** An interruption answer is just one segment (answer-then-resume MVP). */
export const answerSegmentSchema = segmentSchema;

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

export type ValidateLessonResult = { ok: true; lesson: Lesson } | { ok: false; error: string };
export function validateLesson(input: unknown): ValidateLessonResult {
  const r = lessonSchema.safeParse(input);
  return r.success ? { ok: true, lesson: r.data as Lesson } : { ok: false, error: issues(r.error) };
}

export type ValidateSegmentResult = { ok: true; segment: LessonSegment } | { ok: false; error: string };
export function validateSegment(input: unknown): ValidateSegmentResult {
  const r = answerSegmentSchema.safeParse(input);
  return r.success ? { ok: true, segment: r.data as LessonSegment } : { ok: false, error: issues(r.error) };
}
