import type { SceneSpec } from "@/types/scene";

/**
 * A Lesson is the core product unit: one topic prompt expands into an ordered
 * sequence of narrated scenes that play back like a teacher at a whiteboard.
 * The student can interrupt mid-lesson; see app/api/interrupt for that path.
 */

/** One beat of a lesson: what the teacher says + the visual shown while saying it. */
export interface LessonSegment {
  id: string;
  /** Spoken narration for this beat (read aloud via the Web Speech API). */
  narration: string;
  /** The animated SceneSpec that plays while the narration is spoken. */
  scene: SceneSpec;
}

/** A full lesson generated from a single topic prompt. */
export interface Lesson {
  version: 1;
  topic: string;
  title: string;
  scriptId?: string;
  studentProfile?: string;
  sourceBeatIds?: string[];
  /** Ordered beats, played sequentially. */
  segments: LessonSegment[];
}

/** A per-beat warning reported alongside the lesson build. */
export interface LessonBuildWarning {
  beat: number;
  id: string;
  reason: string;
}

/**
 * The NDJSON events streamed by /api/lesson (one JSON object per line), in
 * order: one `meta`, then a `segment` per beat as it composes, then `done` —
 * or `error` if the whole build fails. Playback can start as soon as the first
 * `segment` arrives; that pipelining is the point of streaming.
 */
export type LessonStreamEvent =
  | { type: "meta"; total: number; lesson: Lesson }
  | { type: "segment"; index: number; segment: LessonSegment }
  | {
      type: "done";
      usage: { input: number; output: number; cacheRead: number; cacheCreate: number };
      offline?: boolean;
      warnings?: LessonBuildWarning[];
      reviewWarnings?: LessonBuildWarning[];
      qaWarnings?: LessonBuildWarning[];
    }
  | { type: "error"; message: string };
