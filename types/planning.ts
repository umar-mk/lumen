import type { Lesson } from "@/types/lesson";
import type { StageName } from "@/types/scene";

export interface DiagnosticOption {
  id: string;
  label: string;
  description?: string;
}

export interface DiagnosticQuestion {
  id: string;
  question: string;
  options: DiagnosticOption[];
  defaultOptionId: string;
}

export interface DiagnosticIntake {
  version: 1;
  topic: string;
  questions: DiagnosticQuestion[];
}

export interface DiagnosticAnswer {
  questionId: string;
  optionId: string;
  label: string;
}

export interface SyncCue {
  phrase: string;
  visualAction: string;
}

export interface TeachingBeat {
  id: string;
  teachingGoal: string;
  narration: string;
  visualIntent: string;
  syncCues: SyncCue[];
  targetDurationSec: number;
  /** Composition preset chosen with the pedagogy, before scene generation. */
  stage?: StageName;
  /** Reusable semantic motion idiom, e.g. graph-approach or equation-transform. */
  shotPattern?: string;
  /** Keep the previous beat's stable stage/view/main positions. */
  continueFrom?: "prev";
}

export interface LessonScript {
  version: 1;
  scriptId?: string;
  topic: string;
  title: string;
  studentProfile: string;
  learningGoals: string[];
  misconceptionsToAvoid: string[];
  beats: TeachingBeat[];
}

export interface VisualBeat {
  beatId: string;
  visualGoal: string;
  scenePlan: string;
  syncCues: SyncCue[];
  requiredAnimations?: Array<
    | "morph"
    | "trace"
    | "draw"
    | "transform"
    | "highlight"
    | "move"
    | "fadeIn"
    | "fadeOut"
    | "emphasize"
    | "slide"
    | "reshape"
    | "count"
    | "camera"
  >;
}

export interface VisualStoryboard {
  version: 1;
  topic: string;
  title: string;
  beats: VisualBeat[];
}

export interface VisualLesson {
  version: 1;
  storyboard: VisualStoryboard;
  lesson: Lesson;
}
