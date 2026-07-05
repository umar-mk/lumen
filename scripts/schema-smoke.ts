import assert from "node:assert/strict";

import { validateLesson } from "@/lib/lessonSchema";
import { offlineDerivativeLesson, offlineDerivativeVisualLesson } from "@/lib/offlinePipeline";
import {
  validateDiagnosticIntake,
  validateLessonScript,
  validateVisualLesson,
} from "@/lib/planningSchema";

const diagnostic = {
  version: 1,
  topic: "What is a derivative?",
  questions: [
    {
      id: "background",
      question: "What do you already know?",
      defaultOptionId: "graphs",
      options: [
        { id: "algebra", label: "Algebra only" },
        { id: "graphs", label: "Functions and graphs" },
      ],
    },
    {
      id: "focus",
      question: "What should we focus on?",
      defaultOptionId: "intuition",
      options: [
        { id: "intuition", label: "Intuition" },
        { id: "formulas", label: "Formulas" },
      ],
    },
  ],
};

const script = {
  version: 1,
  topic: diagnostic.topic,
  title: "What a Derivative Measures",
  studentProfile: "The student knows functions and graphs and wants intuition.",
  learningGoals: ["Understand derivative as instantaneous rate of change"],
  misconceptionsToAvoid: ["A derivative is not just a memorized formula"],
  beats: [
    {
      id: "beat-1",
      teachingGoal: "Connect a changing quantity to a curve.",
      narration: "Start with a curve that shows how one quantity changes with another.",
      visualIntent: "Draw axes and a simple increasing curve.",
      syncCues: [{ phrase: "Start with a curve", visualAction: "Draw the curve." }],
      targetDurationSec: 8,
      stage: "graph",
      shotPattern: "graph-approach",
    },
    {
      id: "beat-2",
      teachingGoal: "Introduce average change.",
      narration: "Pick two points and compare how much the output changes.",
      visualIntent: "Show two points and a secant line.",
      syncCues: [{ phrase: "Pick two points", visualAction: "Fade in two points." }],
      targetDurationSec: 10,
      stage: "graph",
      shotPattern: "secant-to-tangent",
      continueFrom: "prev",
    },
    {
      id: "beat-3",
      teachingGoal: "Shrink the interval.",
      narration: "Move the second point closer and watch the secant settle.",
      visualIntent: "Trace one point along the curve toward the other.",
      syncCues: [{ phrase: "Move the second point closer", visualAction: "Trace the point." }],
      targetDurationSec: 12,
      stage: "graph",
      shotPattern: "secant-to-tangent",
      continueFrom: "prev",
    },
    {
      id: "beat-4",
      teachingGoal: "Name the tangent slope as the derivative.",
      narration: "The slope left behind at one point is the derivative there.",
      visualIntent: "Draw the tangent and label its slope.",
      syncCues: [{ phrase: "slope left behind", visualAction: "Draw the tangent." }],
      targetDurationSec: 9,
      stage: "statement",
      shotPattern: "equation-transform",
    },
  ],
};

const storyboard = {
  version: 1,
  topic: script.topic,
  title: script.title,
  beats: script.beats.map((beat) => ({
    beatId: beat.id,
    visualGoal: beat.teachingGoal,
    scenePlan: beat.visualIntent,
    syncCues: beat.syncCues,
    requiredAnimations: ["draw"],
  })),
};

assert.equal(validateDiagnosticIntake(diagnostic).ok, true);
assert.equal(
  validateDiagnosticIntake({
    ...diagnostic,
    questions: [{ ...diagnostic.questions[0], defaultOptionId: "missing" }, diagnostic.questions[1]],
  }).ok,
  false,
);
assert.equal(validateLessonScript(script).ok, true);
assert.equal(validateLesson(offlineDerivativeLesson).ok, true);
assert.equal(validateVisualLesson({ version: 1, storyboard, lesson: offlineDerivativeLesson }).ok, true);
assert.equal(validateVisualLesson(offlineDerivativeVisualLesson()).ok, true);

console.log("schema smoke tests passed");
