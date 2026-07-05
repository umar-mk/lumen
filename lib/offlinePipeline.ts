import type { Lesson } from "@/types/lesson";
import type { SceneSpec } from "@/types/scene";
import type {
  DiagnosticAnswer,
  DiagnosticIntake,
  LessonScript,
  SyncCue,
  VisualLesson,
  VisualStoryboard,
} from "@/types/planning";

const usage = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };

export const offlineUsage = usage;

export function offlineDerivativeIntake(topic: string): DiagnosticIntake {
  return {
    version: 1,
    topic: topic || "What is a derivative?",
    questions: [
      {
        id: "background",
        question: "What do you already know?",
        defaultOptionId: "graphs",
        options: [
          { id: "algebra", label: "Algebra only", description: "Start from coordinates, slope, and functions." },
          { id: "graphs", label: "Functions and graphs", description: "Assume graphs are familiar, but build the derivative idea slowly." },
          { id: "limits", label: "Some limits", description: "Use limits earlier and connect them to the visual intuition." },
          { id: "seen-before", label: "Seen derivatives before", description: "Treat this as a conceptual cleanup rather than a first exposure." },
        ],
      },
      {
        id: "focus",
        question: "What should this lesson emphasize?",
        defaultOptionId: "intuition",
        options: [
          { id: "intuition", label: "Intuition", description: "Prioritize what the derivative means before formulas." },
          { id: "graphs", label: "Graph behavior", description: "Focus on slopes, tangent lines, and reading derivative graphs." },
          { id: "formulas", label: "Formula connection", description: "Spend more time connecting the picture to symbolic notation." },
        ],
      },
      {
        id: "pace",
        question: "How should the teacher pace it?",
        defaultOptionId: "gentle",
        options: [
          { id: "gentle", label: "Gentle", description: "Use a full video-like arc with more beats and fewer jumps." },
          { id: "standard", label: "Standard", description: "A balanced introduction for someone ready for calculus." },
          { id: "review", label: "Fast review", description: "Move quickly and focus on the core mental model." },
        ],
      },
    ],
  };
}

function answerLabel(answers: DiagnosticAnswer[], id: string, fallback: string) {
  return answers.find((a) => a.questionId === id)?.label ?? fallback;
}

// ---------------------------------------------------------------------------
// 3Blue1Brown-style reference lesson. The defining discipline: ONE persistent
// distance-vs-time graph held in a fixed frame for most of the lesson (graph on
// the left ~70%, annotations on the right), one idea per beat, generous black
// space, a single yellow accent, the secant->tangent slide as the climax, and a
// t^3 worked example that collapses algebraically. This is the executable target
// the generative pipeline should strive toward (see docs/REFERENCE_NOTES.md).
// ---------------------------------------------------------------------------

const tuple = (a: number, b: number): [number, number] => [a, b];

// Persistent "stage": the distance graph lives here, identical across beats, so
// the board feels continuous (3b1b keeps it on screen for half the video).
const graphView = { xMin: -0.9, xMax: 12.1, yMin: -10, yMax: 115 }; // 3b1b-style distance axis: 0..100 meters
const stmtView = { xMin: -8, xMax: 8, yMin: -4.5, yMax: 4.5 };

const C = {
  s: "#4cc9d9", // 3b1b cyan distance curve
  v: "#7aa65a", // muted green velocity curve
  dot: "#d6c24a",
  tangent: "#f2f2f2",
  highlight: "#d6c24a",
  warm: "#d6c24a",
  red: "#d85c5c",
};

const distAxes = {
  type: "axes" as const,
  id: "axes",
  xRange: tuple(0, 10),
  yRange: tuple(0, 100),
  step: 1,
  showGrid: false,
  xLabel: "Time (seconds)",
  yLabel: "Distance traveled (meters)",
};
const sCurve = {
  type: "function-plot" as const,
  id: "s",
  expr: "50+49*tanh(0.75*(x-5))",
  domain: tuple(0, 10),
  color: C.s,
  width: 3,
};
const vCurve = {
  type: "function-plot" as const,
  id: "v",
  expr: "8+24*(1-tanh(0.7*(x-5))^2)",
  domain: tuple(0, 10),
  color: C.v,
  width: 2.5,
};

interface OfflineBeat {
  id: string;
  teachingGoal: string;
  narration: string;
  visualIntent: string;
  syncCues: SyncCue[];
  targetDurationSec: number;
  scene: SceneSpec;
}

const beats: OfflineBeat[] = [
  {
    id: "beat-01-oxymoron",
    teachingGoal: "Expose the paradox hidden in 'instantaneous rate of change'.",
    narration:
      "Let's explain what a derivative is. People love to say it measures an instantaneous rate of change. But when you really listen to that phrase, it is almost a contradiction. Change happens between two moments, while an instant is a single frozen moment, with no room for change at all.",
    visualIntent:
      "Show the phrase, then split it into its two warring halves: one frozen instant versus a comparison between two moments.",
    syncCues: [
      { phrase: "instantaneous rate of change", visualAction: "Reveal the phrase centered." },
      { phrase: "single frozen moment", visualAction: "Reveal the one-instant clock on the left." },
      { phrase: "between two moments", visualAction: "Reveal the two-moments clock on the right." },
    ],
    targetDurationSec: 24,
    scene: {
      version: 1,
      stage: "statement",
      shotPattern: "equation-transform",
      view: stmtView,
      objects: [
        { type: "text", id: "phrase", text: "instantaneous rate of change", at: { x: 0, y: 3.1 }, fontSize: 46, weight: "bold" },
        { type: "icon", id: "clock1", name: "clock", at: { x: -4.6, y: 0.4 }, size: 118, color: "#d8d8d8", secondaryColor: C.s },
        { type: "icon", id: "pi1", name: "pi-person", at: { x: -2.6, y: 0.45 }, size: 118, color: C.s, secondaryColor: "#f2f2f2" },
        { type: "icon", id: "clock2", name: "clock", at: { x: 2.4, y: 0.4 }, size: 118, color: "#d8d8d8", secondaryColor: C.warm },
        { type: "icon", id: "clock3", name: "clock", at: { x: 4.0, y: 0.4 }, size: 118, color: "#d8d8d8", secondaryColor: C.warm },
        { type: "icon", id: "pi2", name: "pi-person", at: { x: 5.8, y: 0.45 }, size: 118, color: "#8b817a", secondaryColor: "#f2f2f2" },
        { type: "label", id: "left", text: "one frozen instant", at: { x: -3.6, y: -1.6 }, fontSize: 26, color: C.s },
        { type: "label", id: "right", text: "change needs two moments", at: { x: 3.6, y: -1.6 }, fontSize: 26, color: C.warm },
        { type: "text", id: "ask", text: "How can both be true?", at: { x: 0, y: -3.3 }, fontSize: 30, color: "#e2e8f0" },
      ],
      timeline: [
        { type: "fadeIn", targetId: "phrase", start: 0, duration: 0.8 },
        { type: "highlight", targetId: "phrase", start: 1.0, duration: 1.0, color: C.warm },
        { type: "draw", targetId: "clock1", start: 6, duration: 0.5 },
        { type: "draw", targetId: "pi1", start: 6.2, duration: 0.5 },
        { type: "fadeIn", targetId: "left", start: 6.7, duration: 0.5 },
        { type: "highlight", targetId: "left", start: 7.2, duration: 0.8, color: C.s },
        { type: "draw", targetId: "clock2", start: 11, duration: 0.5 },
        { type: "draw", targetId: "clock3", start: 11.4, duration: 0.5 },
        { type: "draw", targetId: "pi2", start: 11.8, duration: 0.5 },
        { type: "fadeIn", targetId: "right", start: 12.2, duration: 0.5 },
        { type: "highlight", targetId: "right", start: 12.8, duration: 0.9, color: C.warm },
        { type: "fadeIn", targetId: "ask", start: 16, duration: 0.7 },
        { type: "highlight", targetId: "ask", start: 16.7, duration: 0.9, color: "#f2f2f2" },
      ],
      duration: 24,
    },
  },
  {
    id: "beat-02-car",
    teachingGoal: "Ground the idea in one concrete trip before any graph.",
    narration:
      "Picture a single car. It starts at a point A, speeds up, then eases to a stop at a point B, one hundred meters away. The whole trip takes ten seconds. That simple journey is all we need.",
    visualIntent: "A road with A and B, a car driving from A to B, and a ten-second trip label.",
    syncCues: [
      { phrase: "point A", visualAction: "Mark A at the left of the road." },
      { phrase: "point B", visualAction: "Mark B at the right." },
      { phrase: "ten seconds", visualAction: "Drive the car across and show the time." },
    ],
    targetDurationSec: 22,
    scene: {
      version: 1,
      stage: "statement",
      shotPattern: "equation-transform",
      view: stmtView,
      objects: [
        { type: "arrow", id: "road", from: { x: -6, y: -0.6 }, to: { x: 6, y: -0.6 }, color: "#64748b", width: 6, head: false },
        { type: "label", id: "a", text: "A", at: { x: -6, y: -1.5 }, fontSize: 30, color: C.s },
        { type: "label", id: "b", text: "B", at: { x: 6, y: -1.5 }, fontSize: 30, color: C.warm },
        { type: "icon", id: "car", name: "car", at: { x: -5.6, y: -0.2 }, size: 120, color: C.s, secondaryColor: "#e0f2fe" },
        { type: "text", id: "trip", text: "100 meters in 10 seconds", at: { x: 0, y: 2.4 }, fontSize: 34, weight: "bold" },
        { type: "counter", id: "seconds", from: 0, to: 10, suffix: " s", at: { x: -1.25, y: 1.55 }, fontSize: 34, color: C.warm, weight: "bold" },
        { type: "counter", id: "meters", from: 0, to: 100, suffix: " m", at: { x: 1.35, y: 1.55 }, fontSize: 34, color: C.s, weight: "bold" },
      ],
      timeline: [
        { type: "draw", targetId: "road", start: 0, duration: 1 },
        { type: "fadeIn", targetId: "a", start: 1, duration: 0.4 },
        { type: "highlight", targetId: "a", start: 1.45, duration: 0.8, color: C.s },
        { type: "fadeIn", targetId: "b", start: 1.4, duration: 0.4 },
        { type: "highlight", targetId: "b", start: 1.9, duration: 0.8, color: C.warm },
        { type: "draw", targetId: "car", start: 2, duration: 0.4 },
        { type: "fadeIn", targetId: "trip", start: 3.4, duration: 0.6 },
        { type: "fadeIn", targetId: "seconds", start: 4.4, duration: 0.4 },
        { type: "fadeIn", targetId: "meters", start: 4.4, duration: 0.4 },
        { type: "move", targetId: "car", start: 5, duration: 6.5, to: { x: 5.6, y: -0.2 } },
        { type: "count", targetId: "seconds", start: 5, duration: 6.5 },
        { type: "count", targetId: "meters", start: 5, duration: 6.5 },
        { type: "highlight", targetId: "car", start: 6.0, duration: 1.1, color: C.s },
        { type: "highlight", targetId: "trip", start: 10.8, duration: 1.0, color: C.warm },
        { type: "highlight", targetId: "meters", start: 11.4, duration: 0.9, color: C.s },
      ],
      duration: 22,
    },
  },
  {
    id: "beat-03-graph",
    teachingGoal: "Translate the trip into the persistent distance-vs-time graph.",
    narration:
      "Now let's graph that trip. Time runs along the bottom, and the height shows the total distance traveled so far. We'll call this distance function s of t.",
    visualIntent: "Draw the axes, then the S-shaped distance curve, labeled s of t at its end.",
    syncCues: [
      { phrase: "Time runs along the bottom", visualAction: "Draw the axes." },
      { phrase: "total distance traveled", visualAction: "Draw the curve rising." },
      { phrase: "s of t", visualAction: "Label the curve." },
    ],
    targetDurationSec: 22,
    scene: {
      version: 1,
      stage: "graph",
      shotPattern: "graph-approach",
      view: graphView,
      objects: [
        distAxes,
        sCurve,
        { type: "equation", id: "slabel", latex: "s(t)", at: { x: 10.25, y: 100 }, fontSize: 34, color: C.s, anchor: "start" },
        { type: "label", id: "cap", text: "height = distance so far", at: { x: 1.0, y: 72 }, fontSize: 24, color: "#d8d8d8", anchor: "start" },
      ],
      timeline: [
        { type: "draw", targetId: "axes", start: 0, duration: 1.2 },
        { type: "draw", targetId: "s", start: 1.6, duration: 3.2 },
        { type: "highlight", targetId: "s", start: 4.2, duration: 1.0, color: C.s },
        { type: "fadeIn", targetId: "slabel", start: 4.6, duration: 0.6 },
        { type: "highlight", targetId: "slabel", start: 5.2, duration: 0.8, color: C.s },
        { type: "fadeIn", targetId: "cap", start: 6.5, duration: 0.6 },
        { type: "highlight", targetId: "cap", start: 7.1, duration: 0.9, color: C.warm },
      ],
      duration: 22,
    },
  },
  {
    id: "beat-04-steepness",
    teachingGoal: "Read speed as steepness by sweeping across the same curve.",
    narration:
      "Watch the shape. Early on it is shallow, because the car is slow. Through the middle it steepens, the car is eating up distance. Near the end it flattens again as the car stops. Steeper means faster.",
    visualIntent: "Reuse the same graph; slide a highlight band across while a dot rides the curve.",
    syncCues: [
      { phrase: "shallow", visualAction: "Highlight the flat early part." },
      { phrase: "steepens", visualAction: "Slide the highlight into the steep middle." },
      { phrase: "flattens again", visualAction: "Slide it to the flat end." },
    ],
    targetDurationSec: 24,
    scene: {
      version: 1,
      stage: "graph",
      shotPattern: "graph-approach",
      view: graphView,
      continueFrom: "prev",
      objects: [
        distAxes,
        sCurve,
        { type: "equation", id: "slabel", latex: "s(t)", at: { x: 10.25, y: 100 }, fontSize: 34, color: C.s, anchor: "start" },
        { type: "box", id: "band", at: { x: 1.5, y: 50 }, width: 0.7, height: 100, radius: 0.05, fill: C.highlight, stroke: C.highlight, strokeWidth: 1, opacity: 0.18 },
        { type: "dot", id: "rider", at: { x: 1.5, y: 5 }, radius: 8, color: C.dot },
        { type: "label", id: "cap", text: "steeper means faster", at: { x: 6.6, y: 22 }, fontSize: 26, color: C.warm, anchor: "start" },
      ],
      timeline: [
        { type: "draw", targetId: "axes", start: 0, duration: 0.01 },
        { type: "draw", targetId: "s", start: 0, duration: 0.01 },
        { type: "fadeIn", targetId: "slabel", start: 0, duration: 0.4 },
        { type: "highlight", targetId: "s", start: 0.9, duration: 1.1, color: C.s },
        { type: "fadeIn", targetId: "band", start: 0.6, duration: 0.5 },
        { type: "highlight", targetId: "band", start: 2.0, duration: 1.0, color: C.warm },
        { type: "draw", targetId: "rider", start: 0.8, duration: 0.3 },
        { type: "highlight", targetId: "rider", start: 5.2, duration: 1.0, color: C.dot },
        { type: "trace", targetId: "rider", start: 2, duration: 9, plotId: "s", fromX: 1.5, toX: 8.5 },
        { type: "move", targetId: "band", start: 2, duration: 9, to: { x: 8.5, y: 50 } },
        { type: "fadeIn", targetId: "cap", start: 6, duration: 0.6 },
        { type: "highlight", targetId: "cap", start: 11.0, duration: 1.0, color: C.warm },
      ],
      duration: 24,
    },
  },
  {
    id: "beat-05-velocity",
    teachingGoal: "Introduce the velocity curve as the partner of the distance curve.",
    narration:
      "If we also plot the car's speed over time, it makes this lower bump. Slow at first, fastest in the middle, back to zero at the end. The two curves are tied together. The whole question is exactly how.",
    visualIntent: "Keep the distance curve; draw the velocity bump beneath it, labeled v of t.",
    syncCues: [
      { phrase: "lower bump", visualAction: "Draw the velocity curve." },
      { phrase: "fastest in the middle", visualAction: "Mark its peak." },
      { phrase: "tied together", visualAction: "Show both curves at once." },
    ],
    targetDurationSec: 24,
    scene: {
      version: 1,
      stage: "graph",
      shotPattern: "graph-approach",
      view: graphView,
      continueFrom: "prev",
      objects: [
        distAxes,
        sCurve,
        vCurve,
        { type: "equation", id: "slabel", latex: "s(t)", at: { x: 10.25, y: 100 }, fontSize: 34, color: C.s, anchor: "start" },
        { type: "equation", id: "vlabel", latex: "v(t)", at: { x: 10.25, y: 32 }, fontSize: 34, color: C.v, anchor: "start" },
        { type: "dot", id: "peak", at: { x: 5, y: 32 }, radius: 8, color: C.v },
      ],
      timeline: [
        { type: "draw", targetId: "axes", start: 0, duration: 0.01 },
        { type: "draw", targetId: "s", start: 0, duration: 0.01 },
        { type: "fadeIn", targetId: "slabel", start: 0, duration: 0.4 },
        { type: "draw", targetId: "v", start: 1, duration: 3 },
        { type: "highlight", targetId: "v", start: 4.0, duration: 1.1, color: C.v },
        { type: "fadeIn", targetId: "vlabel", start: 3.6, duration: 0.5 },
        { type: "highlight", targetId: "vlabel", start: 4.8, duration: 0.8, color: C.v },
        { type: "draw", targetId: "peak", start: 6, duration: 0.3 },
        { type: "highlight", targetId: "peak", start: 6.6, duration: 0.8 },
        { type: "highlight", targetId: "s", start: 10.0, duration: 1.0, color: C.s },
      ],
      duration: 24,
    },
  },
  {
    id: "beat-06-twopoints",
    teachingGoal: "Sharpen the paradox: speed at one instant seems impossible.",
    narration:
      "But here is the catch. A single snapshot of the car cannot tell you its speed. To get speed you always need two moments, a change in distance divided by a change in time. So how could speed ever belong to a single instant?",
    visualIntent: "One frozen car with an unanswerable question, beside the two-point definition of speed.",
    syncCues: [
      { phrase: "single snapshot", visualAction: "Show one frozen car." },
      { phrase: "cannot tell you its speed", visualAction: "Reveal the question mark." },
      { phrase: "change in distance divided by a change in time", visualAction: "Reveal the speed definition." },
    ],
    targetDurationSec: 24,
    scene: {
      version: 1,
      stage: "statement",
      shotPattern: "equation-transform",
      view: stmtView,
      objects: [
        { type: "icon", id: "car", name: "car", at: { x: -4.2, y: 1.4 }, size: 130, color: C.s, secondaryColor: "#e0f2fe" },
        { type: "text", id: "q", text: "how fast?  unknown", at: { x: -4.2, y: -0.4 }, fontSize: 28, color: C.red },
        { type: "equation", id: "speed", latex: "\\text{speed} = \\frac{\\text{change in distance}}{\\text{change in time}}", at: { x: 3.0, y: 1.2 }, fontSize: 32, anchor: "middle" },
        { type: "text", id: "need", text: "needs two moments, not one", at: { x: 3.0, y: -1.4 }, fontSize: 26, color: C.warm },
      ],
      timeline: [
        { type: "draw", targetId: "car", start: 0, duration: 0.5 },
        { type: "highlight", targetId: "car", start: 1.0, duration: 0.9, color: C.s },
        { type: "fadeIn", targetId: "q", start: 2.5, duration: 0.6 },
        { type: "highlight", targetId: "q", start: 3.1, duration: 0.9, color: C.red },
        { type: "fadeIn", targetId: "speed", start: 6, duration: 0.8 },
        { type: "highlight", targetId: "speed", start: 7.0, duration: 1.0, color: C.warm },
        { type: "fadeIn", targetId: "need", start: 11, duration: 0.6 },
        { type: "highlight", targetId: "need", start: 11.8, duration: 1.0, color: C.warm },
      ],
      duration: 24,
    },
  },
  {
    id: "beat-07-speedometer",
    teachingGoal: "Show the real-world side-step: measure over a tiny interval.",
    narration:
      "Here is what a real speedometer does. Around three seconds, it quietly looks at a tiny stretch of time, say from three seconds to three point oh one. It measures the small distance covered, and divides by that small time.",
    visualIntent: "Two car snapshots a hundredth of a second apart, with their distances, forming the ratio.",
    syncCues: [
      { phrase: "three seconds", visualAction: "Show the first car snapshot and distance." },
      { phrase: "three point oh one", visualAction: "Show the second snapshot just after." },
      { phrase: "divides by that small time", visualAction: "Reveal the small ratio." },
    ],
    targetDurationSec: 26,
    scene: {
      version: 1,
      stage: "statement",
      shotPattern: "equation-transform",
      view: stmtView,
      objects: [
        { type: "icon", id: "meter", name: "speedometer", at: { x: -5.2, y: 2.5 }, size: 120, color: "#e2e8f0", secondaryColor: C.warm },
        { type: "icon", id: "car1", name: "car", at: { x: -3.4, y: 1.1 }, size: 96, color: C.s, secondaryColor: "#e0f2fe" },
        { type: "label", id: "t1", text: "t = 3 s,  20.00 m", at: { x: -3.4, y: -0.1 }, fontSize: 24, color: "#cbd5e1" },
        { type: "icon", id: "car2", name: "car", at: { x: -3.1, y: -1.6 }, size: 96, color: C.s, secondaryColor: "#e0f2fe" },
        { type: "label", id: "t2", text: "t = 3.01 s,  20.21 m", at: { x: -3.1, y: -2.8 }, fontSize: 24, color: "#cbd5e1" },
        { type: "equation", id: "ratio", latex: "\\frac{20.21 - 20.00}{3.01 - 3.00}", at: { x: 4.0, y: 0.4 }, fontSize: 44, color: C.warm },
        { type: "text", id: "tiny", text: "a tiny distance over a tiny time", at: { x: 4.0, y: 2.7 }, fontSize: 24, color: "#cbd5e1" },
      ],
      timeline: [
        { type: "draw", targetId: "meter", start: 0, duration: 0.5 },
        { type: "highlight", targetId: "meter", start: 0.8, duration: 0.9, color: C.warm },
        { type: "draw", targetId: "car1", start: 2, duration: 0.4 },
        { type: "highlight", targetId: "car1", start: 2.5, duration: 0.8, color: C.s },
        { type: "fadeIn", targetId: "t1", start: 2.6, duration: 0.5 },
        { type: "draw", targetId: "car2", start: 6, duration: 0.4 },
        { type: "highlight", targetId: "car2", start: 6.5, duration: 0.8, color: C.s },
        { type: "fadeIn", targetId: "t2", start: 6.6, duration: 0.5 },
        { type: "fadeIn", targetId: "tiny", start: 9.5, duration: 0.6 },
        { type: "highlight", targetId: "tiny", start: 10.1, duration: 0.9, color: C.warm },
        { type: "fadeIn", targetId: "ratio", start: 11, duration: 0.8 },
        { type: "highlight", targetId: "ratio", start: 12.0, duration: 1.0, color: C.warm },
      ],
      duration: 26,
    },
  },
  {
    id: "beat-08-riseoverrun",
    teachingGoal: "See ds over dt as rise over run between two nearby points.",
    narration:
      "Call that tiny time d t, and the resulting tiny distance d s. The speed is d s divided by d t. On the graph it is a small step to the right and the rise it causes, the slope of a line through two nearby points. Zoom in and that piece of curve looks almost straight.",
    visualIntent: "On the persistent graph, mark dt and ds at a point, with a corner inset zooming in.",
    syncCues: [
      { phrase: "small step to the right", visualAction: "Draw the dt arrow." },
      { phrase: "the rise it causes", visualAction: "Draw the ds arrow." },
      { phrase: "Zoom in", visualAction: "Reveal the corner inset." },
    ],
    targetDurationSec: 28,
    scene: {
      version: 1,
      stage: "plot-inset",
      shotPattern: "secant-to-tangent",
      view: graphView,
      objects: [
        distAxes,
        sCurve,
        { type: "equation", id: "slabel", latex: "s(t)", at: { x: 10.25, y: 100 }, fontSize: 32, color: C.s, anchor: "start" },
        { type: "dot", id: "p1", at: { x: 6, y: 81.11 }, radius: 8, color: C.dot },
        { type: "dot", id: "p2", at: { x: 7.4, y: 96.39 }, radius: 8, color: C.dot },
        { type: "secant-line", id: "sec", plotId: "s", x1: 6, x2: 7.4, extend: 0.8, color: C.tangent, width: 2.5 },
        { type: "brace", id: "dt", from: { x: 6, y: 70 }, to: { x: 7.4, y: 70 }, side: "below", color: C.warm, width: 3, label: "dt", fontSize: 27 },
        { type: "brace", id: "ds", from: { x: 7.85, y: 81.11 }, to: { x: 7.85, y: 96.39 }, side: "right", color: C.s, width: 3, label: "ds", fontSize: 27 },
        { type: "inset", id: "zoom", at: { x: 10.75, y: 89 }, width: 2.45, height: 42, view: { xMin: 5.55, xMax: 7.85, yMin: 75, yMax: 101 }, shows: ["axes", "s"], label: "zoom" },
      ],
      timeline: [
        { type: "draw", targetId: "axes", start: 0, duration: 0.01 },
        { type: "draw", targetId: "s", start: 0, duration: 0.01 },
        { type: "fadeIn", targetId: "slabel", start: 0, duration: 0.4 },
        { type: "draw", targetId: "p1", start: 1, duration: 0.3 },
        { type: "draw", targetId: "p2", start: 1.4, duration: 0.3 },
        { type: "highlight", targetId: "p2", start: 1.8, duration: 0.8, color: C.dot },
        { type: "draw", targetId: "dt", start: 3, duration: 0.6 },
        { type: "highlight", targetId: "dt", start: 3.6, duration: 0.9, color: C.warm },
        { type: "draw", targetId: "ds", start: 5, duration: 0.6 },
        { type: "highlight", targetId: "ds", start: 5.6, duration: 0.9, color: C.s },
        { type: "fadeIn", targetId: "sec", start: 7.5, duration: 0.8 },
        { type: "highlight", targetId: "sec", start: 8.3, duration: 1.0, color: C.tangent },
        { type: "fadeIn", targetId: "zoom", start: 10, duration: 0.8 },
        { type: "highlight", targetId: "zoom", start: 10.8, duration: 1.0, color: C.warm },
      ],
      duration: 28,
    },
  },
  {
    id: "beat-09-tangent",
    teachingGoal: "The key move: let dt shrink so the secant becomes the tangent.",
    narration:
      "Now the crucial move. Let that time step shrink toward zero. As the two points slide together, the line through them settles onto the line that just kisses the curve, the tangent. Its slope is the derivative.",
    visualIntent: "On the same graph, slide the second point into the first so the secant becomes the tangent.",
    syncCues: [
      { phrase: "shrink toward zero", visualAction: "Slide the points together." },
      { phrase: "just kisses the curve", visualAction: "The secant becomes the tangent." },
      { phrase: "the derivative", visualAction: "Emphasize the tangent." },
    ],
    targetDurationSec: 26,
    scene: {
      version: 1,
      stage: "graph",
      shotPattern: "secant-to-tangent",
      view: graphView,
      continueFrom: "prev",
      objects: [
        distAxes,
        sCurve,
        { type: "equation", id: "slabel", latex: "s(t)", at: { x: 10.25, y: 100 }, fontSize: 32, color: C.s, anchor: "start" },
        { type: "dot", id: "fixed", at: { x: 6, y: 81.11 }, radius: 9, color: C.dot },
        { type: "dot", id: "moving", at: { x: 7.4, y: 96.39 }, radius: 8, color: C.tangent },
        { type: "secant-line", id: "sec", plotId: "s", x1: 6, x2: 7.4, extend: 2.2, color: C.tangent, width: 2.5 },
        { type: "label", id: "cap", text: "tangent slope = derivative", at: { x: 0.8, y: 104 }, fontSize: 26, color: C.tangent, anchor: "start" },
      ],
      timeline: [
        { type: "draw", targetId: "axes", start: 0, duration: 0.01 },
        { type: "draw", targetId: "s", start: 0, duration: 0.01 },
        { type: "fadeIn", targetId: "slabel", start: 0, duration: 0.4 },
        { type: "draw", targetId: "fixed", start: 0.5, duration: 0.3 },
        { type: "draw", targetId: "moving", start: 0.8, duration: 0.3 },
        { type: "highlight", targetId: "moving", start: 1.2, duration: 0.9, color: C.tangent },
        { type: "fadeIn", targetId: "sec", start: 1.4, duration: 0.6 },
        { type: "trace", targetId: "moving", start: 3, duration: 8, plotId: "s", fromX: 7.4, toX: 6.04 },
        { type: "slide", targetId: "sec", start: 3, duration: 8, toX2: 6.04 },
        { type: "fadeIn", targetId: "cap", start: 9, duration: 0.6 },
        { type: "highlight", targetId: "cap", start: 11.2, duration: 1.0, color: C.tangent },
        { type: "emphasize", targetId: "sec", start: 9.8, duration: 1.4, color: C.tangent },
        { type: "fadeOut", targetId: "moving", start: 11.6, duration: 0.7 },
      ],
      duration: 26,
    },
  },
  {
    id: "beat-10-approach",
    teachingGoal: "Name the clever idea: a limit, never dividing by zero.",
    narration:
      "Notice the trick. We never set the time step to zero, and we never divide by zero. We only ask what the ratio approaches as the step gets smaller and smaller. That is what the symbol d s over d t really means.",
    visualIntent: "Transform the average-rate ratio into the derivative as the step approaches zero, with a clear warning.",
    syncCues: [
      { phrase: "what the ratio approaches", visualAction: "Reveal the limit arrow." },
      { phrase: "never divide by zero", visualAction: "Show the warning." },
      { phrase: "d s over d t", visualAction: "Land on the derivative symbol." },
    ],
    targetDurationSec: 24,
    scene: {
      version: 1,
      stage: "statement",
      shotPattern: "equation-transform",
      view: stmtView,
      objects: [
        { type: "equation", id: "avg", latex: "\\frac{\\Delta s}{\\Delta t}", at: { x: -4.2, y: 0.6 }, fontSize: 58 },
        { type: "arrow", id: "arrow", from: { x: -2.4, y: 0.4 }, to: { x: 1.4, y: 0.4 }, color: C.warm, width: 4 },
        { type: "label", id: "asdt", text: "as  dt -> 0", at: { x: -0.5, y: 1.5 }, fontSize: 26, color: C.warm },
        { type: "equation", id: "der", latex: "\\frac{ds}{dt}", at: { x: 3.6, y: 0.6 }, fontSize: 64, color: C.s },
        { type: "text", id: "warn", text: "approach zero, never divide by zero", at: { x: 0, y: -2.6 }, fontSize: 28, color: C.red },
      ],
      timeline: [
        { type: "fadeIn", targetId: "avg", start: 0, duration: 0.7 },
        { type: "highlight", targetId: "avg", start: 0.8, duration: 0.9, color: C.warm },
        { type: "draw", targetId: "arrow", start: 4, duration: 0.8 },
        { type: "highlight", targetId: "arrow", start: 4.8, duration: 0.9, color: C.warm },
        { type: "fadeIn", targetId: "asdt", start: 4.5, duration: 0.5 },
        { type: "highlight", targetId: "asdt", start: 5.1, duration: 0.9, color: C.warm },
        { type: "transform", targetId: "avg", start: 5.8, duration: 1.0, toLatex: "\\lim_{\\Delta t\\to 0}\\frac{\\Delta s}{\\Delta t}" },
        { type: "fadeIn", targetId: "der", start: 8.0, duration: 0.8 },
        { type: "highlight", targetId: "der", start: 8.9, duration: 1.0, color: C.s },
        { type: "fadeIn", targetId: "warn", start: 11, duration: 0.7 },
        { type: "highlight", targetId: "warn", start: 11.8, duration: 1.0, color: C.red },
      ],
      duration: 24,
    },
  },
  {
    id: "beat-11-cube-setup",
    teachingGoal: "Make it concrete with s(t) = t cubed at t = 2.",
    narration:
      "Let's make it concrete. Suppose the distance is t cubed. To find the speed at t equals two, compare the distance at two plus d t with the distance at two, and divide by d t.",
    visualIntent: "State the cubic and write the difference quotient at t equals two.",
    syncCues: [
      { phrase: "t cubed", visualAction: "Show the cubic formula." },
      { phrase: "compare the distance", visualAction: "Build the numerator." },
      { phrase: "divide by d t", visualAction: "Complete the difference quotient." },
    ],
    targetDurationSec: 24,
    scene: {
      version: 1,
      stage: "statement",
      shotPattern: "equation-transform",
      view: stmtView,
      objects: [
        { type: "equation", id: "fn", latex: "s(t) = t^3", at: { x: 0, y: 2.6 }, fontSize: 50 },
        { type: "equation", id: "dq", latex: "\\frac{(2 + dt)^3 - 2^3}{dt}", at: { x: 0, y: -0.6 }, fontSize: 52 },
        { type: "text", id: "cap", text: "speed at t = 2", at: { x: 0, y: -3.1 }, fontSize: 28, color: C.warm },
      ],
      timeline: [
        { type: "fadeIn", targetId: "fn", start: 0, duration: 0.7 },
        { type: "highlight", targetId: "fn", start: 0.8, duration: 0.9, color: C.s },
        { type: "fadeIn", targetId: "dq", start: 5, duration: 0.8 },
        { type: "highlight", targetId: "dq", start: 5.9, duration: 1.0, color: C.warm },
        { type: "fadeIn", targetId: "cap", start: 9, duration: 0.6 },
        { type: "highlight", targetId: "cap", start: 9.8, duration: 0.9, color: C.warm },
      ],
      duration: 24,
    },
  },
  {
    id: "beat-12-cube-collapse",
    teachingGoal: "Watch the messy algebra collapse to twelve as dt vanishes.",
    narration:
      "Expand the top, and the eight cancels the eight. Every term that is left still carries a d t, so dividing leaves twelve plus terms that each have a d t. As d t approaches zero, those vanish, and the speed is exactly twelve.",
    visualIntent: "Transform the quotient through expansion and cancellation down to twelve.",
    syncCues: [
      { phrase: "eight cancels the eight", visualAction: "Show the expanded numerator." },
      { phrase: "dividing leaves twelve", visualAction: "Show the simplified expression." },
      { phrase: "exactly twelve", visualAction: "Land on twelve." },
    ],
    targetDurationSec: 28,
    scene: {
      version: 1,
      stage: "statement",
      shotPattern: "equation-transform",
      view: stmtView,
      objects: [
        { type: "equation", id: "l1", latex: "\\frac{8 + 12\\,dt + 6\\,dt^2 + dt^3 - 8}{dt}", at: { x: 0, y: 2.4 }, fontSize: 42 },
        { type: "equation", id: "l2", latex: "12 + 6\\,dt + dt^2", at: { x: 0, y: -0.2 }, fontSize: 50 },
        { type: "equation", id: "l3", latex: "\\frac{ds}{dt}\\Big|_{t=2} = 12", at: { x: 0, y: -2.8 }, fontSize: 48, color: C.warm },
      ],
      timeline: [
        { type: "fadeIn", targetId: "l1", start: 0, duration: 0.8 },
        { type: "highlight", targetId: "l1", start: 1.0, duration: 1.0, color: C.warm },
        { type: "fadeIn", targetId: "l2", start: 7, duration: 0.8 },
        { type: "highlight", targetId: "l2", start: 9, duration: 0.9 },
        { type: "fadeIn", targetId: "l3", start: 13, duration: 0.9 },
        { type: "highlight", targetId: "l3", start: 14.0, duration: 1.1, color: C.warm },
      ],
      duration: 28,
    },
  },
  {
    id: "beat-13-resolve",
    teachingGoal: "Generalize to 3 t squared and resolve the original paradox.",
    narration:
      "In general the derivative of t cubed is three t squared. And here is the payoff. At t equals zero that derivative is zero, so the tangent is flat. The car is not frozen forever. It simply means the best constant guess for its speed right there is zero. Read instantaneous rate of change as shorthand for that best constant approximation.",
    visualIntent: "Show the cubic with a flat tangent at the origin and the formula, landing on the mental model.",
    syncCues: [
      { phrase: "three t squared", visualAction: "Reveal the derivative formula." },
      { phrase: "the tangent is flat", visualAction: "Draw the flat tangent at the origin." },
      { phrase: "best constant approximation", visualAction: "Reveal the takeaway." },
    ],
    targetDurationSec: 30,
    scene: {
      version: 1,
      stage: "graph",
      shotPattern: "graph-approach",
      view: { xMin: -3.4, xMax: 12.9, yMin: -4.6, yMax: 4.6 },
      objects: [
        { type: "axes", id: "axes", xRange: tuple(-2, 2), yRange: tuple(-3.5, 3.5), step: 1, showGrid: false, xLabel: "t", yLabel: "s" },
        { type: "function-plot", id: "cubic", expr: "x^3", domain: tuple(-1.5, 1.5), color: C.s, width: 4 },
        { type: "function-plot", id: "flat", expr: "0", domain: tuple(-1.2, 1.2), color: C.tangent, width: 3 },
        { type: "dot", id: "origin", at: { x: 0, y: 0 }, radius: 9, color: C.dot },
        { type: "equation", id: "der", latex: "\\frac{d}{dt}\\,t^3 = 3t^2", at: { x: 3.0, y: 2.6 }, fontSize: 38, color: C.s, anchor: "start" },
        { type: "label", id: "zero", text: "slope here is zero", at: { x: 3.0, y: 0.6 }, fontSize: 26, color: C.tangent, anchor: "start" },
        { type: "text", id: "model", text: "best constant approximation, not frozen forever", at: { x: 3.0, y: -2.4 }, fontSize: 25, color: C.warm, anchor: "start" },
      ],
      timeline: [
        { type: "draw", targetId: "axes", start: 0, duration: 1 },
        { type: "draw", targetId: "cubic", start: 1, duration: 2 },
        { type: "fadeIn", targetId: "der", start: 3.5, duration: 0.7 },
        { type: "highlight", targetId: "der", start: 4.4, duration: 1.0, color: C.s },
        { type: "draw", targetId: "origin", start: 6, duration: 0.3 },
        { type: "highlight", targetId: "origin", start: 6.4, duration: 0.9, color: C.dot },
        { type: "draw", targetId: "flat", start: 7, duration: 1 },
        { type: "highlight", targetId: "flat", start: 8.0, duration: 1.0, color: C.tangent },
        { type: "fadeIn", targetId: "zero", start: 8.2, duration: 0.6 },
        { type: "fadeIn", targetId: "model", start: 13, duration: 0.8 },
        { type: "highlight", targetId: "model", start: 14.0, duration: 1.1, color: C.warm },
      ],
      duration: 30,
    },
  },
];

export function offlineDerivativeScript(topic: string, answers: DiagnosticAnswer[]): LessonScript {
  const background = answerLabel(answers, "background", "Functions and graphs");
  const focus = answerLabel(answers, "focus", "Intuition");
  const pace = answerLabel(answers, "pace", "Gentle");
  return {
    version: 1,
    scriptId: "offline-derivative-script",
    topic: topic || "What is a derivative?",
    title: "Derivative: Resolving Instantaneous Change",
    studentProfile: `Background: ${background}. Focus: ${focus}. Pace: ${pace}.`,
    learningGoals: [
      "Understand why instantaneous rate of change is initially paradoxical.",
      "Connect speed to average change over small intervals.",
      "See tangent slope as the limiting value of nearby secant slopes.",
      "Interpret the derivative as a slope-reporting function.",
      "Connect the visual limit idea to a simple symbolic computation.",
      "Avoid the misconception that a derivative is literal change inside one frozen instant.",
    ],
    misconceptionsToAvoid: [
      "A derivative is not just a formula trick.",
      "Instantaneous rate is not obtained by dividing by zero.",
      "A single snapshot does not contain speed information by itself.",
      "A tangent slope is a local approximation, not a claim about the whole graph.",
      "A derivative value of zero does not mean the quantity never changes.",
    ],
    beats: beats.map((beat) => ({
      id: beat.id,
      teachingGoal: beat.teachingGoal,
      narration: beat.narration,
      visualIntent: beat.visualIntent,
      syncCues: beat.syncCues,
      targetDurationSec: beat.targetDurationSec,
    })),
  };
}

export const offlineDerivativeLesson: Lesson = {
  version: 1,
  topic: "What is a derivative?",
  title: "Derivative: Resolving Instantaneous Change",
  scriptId: "offline-derivative-script",
  studentProfile: "Background: Functions and graphs. Focus: Intuition. Pace: Gentle.",
  sourceBeatIds: beats.map((beat) => beat.id),
  segments: beats.map((beat) => ({
    id: beat.id,
    narration: beat.narration,
    scene: beat.scene,
  })),
};

export const offlineDerivativeStoryboard: VisualStoryboard = {
  version: 1,
  topic: offlineDerivativeLesson.topic,
  title: offlineDerivativeLesson.title,
  beats: beats.map((beat) => ({
    beatId: beat.id,
    visualGoal: beat.teachingGoal,
    scenePlan: beat.visualIntent,
    syncCues: beat.syncCues,
    requiredAnimations: beat.scene.timeline
      .map((step) => step.type)
      .filter((type, index, all) => all.indexOf(type) === index),
  })),
};

export function offlineDerivativeVisualLesson(): VisualLesson {
  return {
    version: 1,
    storyboard: offlineDerivativeStoryboard,
    lesson: offlineDerivativeLesson,
  };
}
