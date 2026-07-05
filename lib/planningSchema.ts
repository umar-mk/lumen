import { z } from "zod";
import type {
  DiagnosticIntake,
  LessonScript,
  VisualLesson,
  VisualStoryboard,
} from "@/types/planning";
import { lessonSchema } from "@/lib/lessonSchema";

export const PLANNING_CAPS = {
  questions: 4,
  options: 5,
  goals: 8,
  misconceptions: 8,
  beats: 20,
  text: 1400,
  shortText: 240,
  id: 64,
  duration: 55,
} as const;

const id = z.string().min(1).max(PLANNING_CAPS.id);
const shortText = z.string().min(1).max(PLANNING_CAPS.shortText);
const text = z.string().min(1).max(PLANNING_CAPS.text);
const stageName = z.enum(["graph", "split", "statement", "plot-inset"]);

export const diagnosticOptionSchema = z.object({
  id,
  label: shortText,
  description: z.string().max(400).optional(),
});

export const diagnosticQuestionSchema = z
  .object({
    id,
    question: shortText,
    options: z.array(diagnosticOptionSchema).min(2).max(PLANNING_CAPS.options),
    defaultOptionId: id,
  })
  .refine((q) => q.options.some((o) => o.id === q.defaultOptionId), {
    message: "defaultOptionId must match one option id",
    path: ["defaultOptionId"],
  });

export const diagnosticIntakeSchema = z.object({
  version: z.literal(1),
  topic: shortText,
  questions: z.array(diagnosticQuestionSchema).min(2).max(PLANNING_CAPS.questions),
});

export const diagnosticAnswerSchema = z.object({
  questionId: id,
  optionId: id,
  label: shortText,
});

export const syncCueSchema = z.object({
  phrase: shortText,
  visualAction: text,
});

export const teachingBeatSchema = z.object({
  id,
  teachingGoal: text,
  narration: text,
  visualIntent: text,
  syncCues: z.array(syncCueSchema).min(1).max(6),
  targetDurationSec: z.number().finite().min(6).max(PLANNING_CAPS.duration),
  stage: stageName.optional(),
  shotPattern: z.string().max(80).optional(),
  continueFrom: z.literal("prev").optional(),
});

export const lessonScriptSchema = z.object({
  version: z.literal(1),
  scriptId: id.optional(),
  topic: shortText,
  title: shortText,
  studentProfile: text,
  learningGoals: z.array(shortText).min(1).max(PLANNING_CAPS.goals),
  misconceptionsToAvoid: z.array(shortText).min(1).max(PLANNING_CAPS.misconceptions),
  beats: z.array(teachingBeatSchema).min(4).max(PLANNING_CAPS.beats),
});

export const visualBeatSchema = z.object({
  beatId: id,
  visualGoal: text,
  scenePlan: text,
  syncCues: z.array(syncCueSchema).min(1).max(6),
  requiredAnimations: z
    .array(
      z.enum([
        "morph",
        "trace",
        "draw",
        "transform",
        "highlight",
        "move",
        "fadeIn",
        "fadeOut",
        "emphasize",
        "slide",
        "reshape",
        "count",
        "camera",
      ]),
    )
    .max(8)
    .optional(),
});

export const visualStoryboardSchema = z.object({
  version: z.literal(1),
  topic: shortText,
  title: shortText,
  beats: z.array(visualBeatSchema).min(1).max(PLANNING_CAPS.beats),
});

export const visualLessonSchema = z.object({
  version: z.literal(1),
  storyboard: visualStoryboardSchema,
  lesson: lessonSchema,
});

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

export type ValidateIntakeResult = { ok: true; intake: DiagnosticIntake } | { ok: false; error: string };
export function validateDiagnosticIntake(input: unknown): ValidateIntakeResult {
  const r = diagnosticIntakeSchema.safeParse(input);
  return r.success ? { ok: true, intake: r.data as DiagnosticIntake } : { ok: false, error: issues(r.error) };
}

export type ValidateScriptResult = { ok: true; script: LessonScript } | { ok: false; error: string };
export function validateLessonScript(input: unknown): ValidateScriptResult {
  const r = lessonScriptSchema.safeParse(input);
  return r.success ? { ok: true, script: r.data as LessonScript } : { ok: false, error: issues(r.error) };
}

export type ValidateStoryboardResult = { ok: true; storyboard: VisualStoryboard } | { ok: false; error: string };
export function validateStoryboard(input: unknown): ValidateStoryboardResult {
  const r = visualStoryboardSchema.safeParse(input);
  return r.success ? { ok: true, storyboard: r.data as VisualStoryboard } : { ok: false, error: issues(r.error) };
}

export type ValidateVisualLessonResult = { ok: true; visualLesson: VisualLesson } | { ok: false; error: string };
export function validateVisualLesson(input: unknown): ValidateVisualLessonResult {
  const r = visualLessonSchema.safeParse(input);
  return r.success ? { ok: true, visualLesson: r.data as VisualLesson } : { ok: false, error: issues(r.error) };
}
