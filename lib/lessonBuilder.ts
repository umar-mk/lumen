/**
 * Per-beat lesson building, extracted from the /api/lesson route so the same
 * real pipeline (compose → layout → lint → sanitize → repair → rescue →
 * fallback) can be driven by the eval harness without HTTP. The route stays a
 * thin NDJSON-streaming wrapper around `buildLesson`.
 */

import { providerConfigured, runTool, type Usage } from "@/lib/llm";
import { resolveLayout } from "@/lib/layout";
import { silentFallbackScene } from "@/lib/fallbackScene";
import { offlineDerivativeVisualLesson, offlineUsage } from "@/lib/offlinePipeline";
import { polishScene } from "@/lib/scenePolish";
import { sanitizeScene } from "@/lib/sceneSanitize";
import { formatIssues, lintScene, severeIssues, type SceneIssue } from "@/lib/sceneQA";
import { validateScene, sceneSpecSchema } from "@/lib/sceneSchema";
import { addUsage, emptyUsage } from "@/lib/scriptBuilder";
import { PERSONA, SCENE_RULES, NARRATION_RULES, SCENE_COMPILE_RULES, SCENE_MINIMAL_RULES, SCENE_REPAIR_RULES, SCENE_REVIEW_RULES } from "@/lib/prompt";
import { applyShotPattern } from "@/lib/shotPatterns";
import type { TeachingBeat, LessonScript } from "@/types/planning";
import type { Lesson, LessonBuildWarning, LessonStreamEvent } from "@/types/lesson";
import type { SceneSpec } from "@/types/scene";

const SYSTEM = `${PERSONA}\n\n${SCENE_RULES}\n\n${NARRATION_RULES}\n\n${SCENE_COMPILE_RULES}`;
const REVIEW_SYSTEM = `${PERSONA}\n\n${SCENE_RULES}\n\n${SCENE_REVIEW_RULES}`;
const REPAIR_SYSTEM = `${PERSONA}\n\n${SCENE_RULES}\n\n${SCENE_REPAIR_RULES}`;
const MINIMAL_SYSTEM = `${PERSONA}\n\n${SCENE_RULES}\n\n${SCENE_MINIMAL_RULES}`;

// The per-beat model review is a full extra call per beat (the bulk of the slow
// ~10-min builds). Deterministic layout + sanitize now handle correctness, so
// review is an opt-in quality pass — set LUMEN_SCENE_REVIEW=1 to re-enable.
const ENABLE_MODEL_REVIEW = process.env.LUMEN_SCENE_REVIEW === "1";

/**
 * A minimal, always-valid scene so a single failed beat can't break the lesson.
 * Text-free by design: never leak authoring meta (the teaching goal) on-screen.
 */
function fallbackScene(beat: TeachingBeat): SceneSpec {
  return silentFallbackScene(beat.targetDurationSec);
}

function sceneBrief(script: LessonScript, beat: TeachingBeat, index: number, total: number, prev?: SceneSpec): string {
  // Pass only the previous scene's framing + objects (not its timeline) so the
  // model can keep positions/objects consistent without a huge token cost.
  const prevContext = prev ? { view: prev.view, camera: prev.camera, objects: prev.objects } : null;
  return `Compose the scene for beat ${index + 1} of ${total}.

LESSON CONTEXT:
- Topic: ${script.topic}
- Title: ${script.title}
- Student: ${script.studentProfile}
- Learning goals: ${script.learningGoals.join("; ")}
- Misconceptions to avoid: ${script.misconceptionsToAvoid.join("; ")}

THIS BEAT:
- Teaching goal: ${beat.teachingGoal}
- Narration (spoken aloud; do NOT change it): "${beat.narration}"
- Visual intent: ${beat.visualIntent}
- Sync cues: ${beat.syncCues.map((c) => `"${c.phrase}" -> ${c.visualAction}`).join("; ") || "(none)"}
- Target duration (seconds): ${beat.targetDurationSec}
- Stage hint: ${beat.stage ?? "(choose best)"}
- Shot pattern hint: ${beat.shotPattern ?? "(choose best)"}
- Continue from previous visual: ${beat.continueFrom === "prev" ? "yes, keep the same stage/view/main object positions when applicable" : "no"}

${prevContext ? `PREVIOUS SCENE (reference only): if THIS beat keeps explaining the same object, reuse it at the same position and transform it; if this beat is a new picture, a formal statement, or a summary, START FRESH and do NOT carry these objects over. Never stack this beat's text/equations on top of a leftover graph.\n\`\`\`json\n${JSON.stringify(prevContext)}\n\`\`\`` : "This is the first beat — open the lesson."}

Return ONE SceneSpec for this beat.`;
}

function sceneReviewBrief(
  script: LessonScript,
  beat: TeachingBeat,
  index: number,
  total: number,
  scene: SceneSpec,
  prev?: SceneSpec,
): string {
  const prevContext = prev ? { view: prev.view, camera: prev.camera, objects: prev.objects } : null;
  return `Review and repair the generated scene for beat ${index + 1} of ${total}.

LESSON CONTEXT:
- Topic: ${script.topic}
- Title: ${script.title}
- Student: ${script.studentProfile}
- Learning goals: ${script.learningGoals.join("; ")}

THIS BEAT:
- Teaching goal: ${beat.teachingGoal}
- Narration (fixed; do NOT change it): "${beat.narration}"
- Visual intent: ${beat.visualIntent}
- Sync cues: ${beat.syncCues.map((c) => `"${c.phrase}" -> ${c.visualAction}`).join("; ") || "(none)"}
- Target duration (seconds): ${beat.targetDurationSec}

${prevContext ? `PREVIOUS SCENE (continuity reference only):\n\`\`\`json\n${JSON.stringify(prevContext)}\n\`\`\`` : "This is the first beat."}

CANDIDATE SCENE:
\`\`\`json
${JSON.stringify(scene)}
\`\`\`

Return ONE corrected SceneSpec. If the candidate is already clean and pedagogically clear, return it unchanged.`;
}

function sceneRepairBrief(
  script: LessonScript,
  beat: TeachingBeat,
  index: number,
  total: number,
  scene: SceneSpec,
  issues: SceneIssue[],
): string {
  return `Repair this SceneSpec for beat ${index + 1} of ${total}. The deterministic geometry linter found severe visual defects.

LESSON CONTEXT:
- Topic: ${script.topic}
- Title: ${script.title}

THIS BEAT:
- Teaching goal: ${beat.teachingGoal}
- Narration (fixed; do NOT change it): "${beat.narration}"
- Stage hint: ${beat.stage ?? "(none)"}
- Shot pattern hint: ${beat.shotPattern ?? "(none)"}

LINTER ISSUES:
${formatIssues(issues)}

CANDIDATE SCENE:
\`\`\`json
${JSON.stringify(scene)}
\`\`\`

Return ONE corrected SceneSpec. Fix the listed geometry/layout problems by using regions/callouts/insets, moving/removing clutter, widening/removing camera moves, or simplifying the scene.`;
}

async function reviewScene(
  script: LessonScript,
  beat: TeachingBeat,
  index: number,
  total: number,
  scene: SceneSpec,
  prev?: SceneSpec,
): Promise<{ scene: SceneSpec; usage: Usage; warning?: string }> {
  try {
    const { input, usage } = await runTool({
      system: REVIEW_SYSTEM,
      toolName: "review_scene",
      temperature: 0.35,
      toolDescription:
        "Review one generated animated SceneSpec for visual clarity, overlap, camera framing, continuity, and pedagogy; return the corrected SceneSpec.",
      schema: sceneSpecSchema,
      maxTokens: 16000,
      messages: [{ role: "user", content: sceneReviewBrief(script, beat, index, total, scene, prev) }],
    });

    const result = validateScene(input);
    if (result.ok) return { scene: result.scene, usage };
    return { scene, usage, warning: `review invalid: ${result.error}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { scene, usage: emptyUsage(), warning: `review threw: ${reason}` };
  }
}

async function repairScene(
  script: LessonScript,
  beat: TeachingBeat,
  index: number,
  total: number,
  scene: SceneSpec,
  issues: SceneIssue[],
): Promise<{ scene: SceneSpec; usage: Usage; warning?: string }> {
  try {
    const { input, usage } = await runTool({
      system: REPAIR_SYSTEM,
      toolName: "repair_scene",
      temperature: 0.25,
      toolDescription:
        "Repair one animated SceneSpec using a deterministic geometry linter report; return only the corrected SceneSpec.",
      schema: sceneSpecSchema,
      maxTokens: 16000,
      messages: [{ role: "user", content: sceneRepairBrief(script, beat, index, total, scene, issues) }],
    });

    const result = validateScene(input);
    if (result.ok) return { scene: result.scene, usage };
    return { scene, usage, warning: `repair invalid: ${result.error}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { scene, usage: emptyUsage(), warning: `repair threw: ${reason}` };
  }
}

function minimalSceneBrief(script: LessonScript, beat: TeachingBeat, index: number, total: number): string {
  return `The full scene for beat ${index + 1} of ${total} failed to generate. Compose a MINIMAL replacement scene.

LESSON CONTEXT:
- Topic: ${script.topic}
- Title: ${script.title}

THIS BEAT:
- Teaching goal: ${beat.teachingGoal}
- Narration (spoken aloud; do NOT change it): "${beat.narration}"
- Visual intent: ${beat.visualIntent}
- Target duration (seconds): ${beat.targetDurationSec}

Return ONE minimal SceneSpec for this beat.`;
}

// One constrained "minimal valid scene" regeneration before any silent fallback,
// so an INVALID beat is salvaged into a real (simple) visual whenever possible.
async function rescueMinimalScene(
  script: LessonScript,
  beat: TeachingBeat,
  index: number,
  total: number,
): Promise<{ scene?: SceneSpec; usage: Usage; warning?: string }> {
  try {
    const { input, usage } = await runTool({
      system: MINIMAL_SYSTEM,
      toolName: "compose_minimal_scene",
      temperature: 0.25,
      toolDescription: "Compose ONE deliberately simple, valid SceneSpec that visualizes a teaching beat whose full scene failed to generate.",
      schema: sceneSpecSchema,
      maxTokens: 6000,
      messages: [{ role: "user", content: minimalSceneBrief(script, beat, index, total) }],
    });
    const result = validateScene(input);
    if (result.ok) return { scene: result.scene, usage };
    return { usage, warning: `minimal rescue invalid: ${result.error}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { usage: emptyUsage(), warning: `minimal rescue threw: ${reason}` };
  }
}

export function layoutAndLint(scene: SceneSpec, beat: TeachingBeat, prev?: SceneSpec) {
  const patterned = applyShotPattern(scene, beat);
  const laidOut = polishScene(resolveLayout(patterned, { previousScene: prev }));
  const issues = lintScene(laidOut);
  return { scene: laidOut, issues, severe: severeIssues(issues) };
}

type Gated = ReturnType<typeof layoutAndLint>;

// Deterministic, model-free repair: sanitize the flagged objects, re-lay-out, and
// re-lint, a few times so cascading fixes settle. Each pass only removes/edits
// objects, so it always converges — this is what keeps real visuals on screen
// instead of falling back to bare text.
function runSanitize(gated: Gated, beat: TeachingBeat, prev?: SceneSpec): Gated {
  let g = gated;
  for (let pass = 0; pass < 5 && g.severe.length; pass++) {
    g = layoutAndLint(sanitizeScene(g.scene, g.severe), beat, prev);
  }
  return g;
}

export function layoutOfflineLesson(lesson: Lesson, script: LessonScript): Lesson {
  let prev: SceneSpec | undefined;
  const segments = lesson.segments.map((segment, index) => {
    const beat = script.beats[index];
    if (!beat) return segment;
    const laidOut = layoutAndLint(segment.scene, beat, prev).scene;
    prev = laidOut;
    return { ...segment, scene: laidOut };
  });
  return { ...lesson, segments };
}

export async function buildLesson(script: LessonScript, send: (event: LessonStreamEvent) => void) {
  const lessonHeader: Lesson = {
    version: 1,
    topic: script.topic,
    title: script.title,
    scriptId: script.scriptId,
    studentProfile: script.studentProfile,
    sourceBeatIds: script.beats.map((b) => b.id),
    segments: [],
  };

  if (!providerConfigured()) {
    const visualLesson = offlineDerivativeVisualLesson();
    const lesson = layoutOfflineLesson({ ...visualLesson.lesson, ...lessonHeader, segments: visualLesson.lesson.segments }, script);
    send({ type: "meta", total: lesson.segments.length, lesson: { ...lesson, segments: [] } });
    lesson.segments.forEach((segment, index) => send({ type: "segment", index, segment }));
    send({ type: "done", usage: offlineUsage, offline: true });
    return;
  }

  // Build the lesson one beat at a time: small calls fit free-tier token caps,
  // keep the per-call schema simple, and degrade gracefully if one beat fails.
  const total = script.beats.length;
  let usage = emptyUsage();
  let prev: SceneSpec | undefined;
  const failures: LessonBuildWarning[] = [];
  const reviewWarnings: LessonBuildWarning[] = [];
  const qaWarnings: LessonBuildWarning[] = [];
  send({ type: "meta", total, lesson: lessonHeader });

  for (let i = 0; i < total; i++) {
    const beat = script.beats[i];
    let scene: SceneSpec | null = null;
    try {
      const { input, usage: u } = await runTool({
        system: SYSTEM,
        toolName: "compose_scene",
        temperature: 0.55,
        toolDescription: "Compose ONE playable animated SceneSpec for a single teaching beat.",
        schema: sceneSpecSchema,
        maxTokens: 16000,
        messages: [{ role: "user", content: sceneBrief(script, beat, i, total, prev) }],
      });
      usage = addUsage(usage, u);
      const result = validateScene(input);
      if (result.ok) {
        scene = result.scene;
        if (ENABLE_MODEL_REVIEW) {
          const reviewed = await reviewScene(script, beat, i, total, scene, prev);
          usage = addUsage(usage, reviewed.usage);
          scene = reviewed.scene;
          if (reviewed.warning) {
            console.warn(`[lesson] beat ${i + 1}/${total} (${beat.id}) REVIEW kept original: ${reviewed.warning}`);
            reviewWarnings.push({ beat: i + 1, id: beat.id, reason: reviewed.warning });
          }
        }
      } else {
        // Loud, never silent: reaching the rescue means generation failed.
        console.error(`[lesson] beat ${i + 1}/${total} (${beat.id}) INVALID scene → minimal rescue: ${result.error}`);
        failures.push({ beat: i + 1, id: beat.id, reason: `invalid: ${result.error}` });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[lesson] beat ${i + 1}/${total} (${beat.id}) THREW → minimal rescue: ${reason}`);
      failures.push({ beat: i + 1, id: beat.id, reason });
    }

    if (!scene) {
      // Salvage the beat with ONE constrained regeneration before giving up on
      // a real visual; only if that also fails do we show the silent fallback.
      const rescue = await rescueMinimalScene(script, beat, i, total);
      usage = addUsage(usage, rescue.usage);
      if (rescue.scene) {
        scene = rescue.scene;
        qaWarnings.push({ beat: i + 1, id: beat.id, reason: "beat used minimal rescue scene" });
      } else {
        if (rescue.warning) console.error(`[lesson] beat ${i + 1}/${total} (${beat.id}) ${rescue.warning} → silent fallback`);
        if (rescue.warning) qaWarnings.push({ beat: i + 1, id: beat.id, reason: rescue.warning });
        scene = fallbackScene(beat);
      }
    }

    let gated = layoutAndLint(scene, beat, prev);
    if (gated.severe.length) {
      // 1) Deterministic sanitize — instant, no model call, keeps real visuals.
      gated = runSanitize(gated, beat, prev);
    }
    if (gated.severe.length) {
      // 2) Rare backstop: sanitize couldn't fully clean it, so ask the model to
      //    repair once, then sanitize the result.
      console.warn(`[lesson] beat ${i + 1}/${total} (${beat.id}) sanitize left issues; model repair:\n${formatIssues(gated.severe)}`);
      const repaired = await repairScene(script, beat, i, total, gated.scene, gated.severe);
      usage = addUsage(usage, repaired.usage);
      if (repaired.warning) qaWarnings.push({ beat: i + 1, id: beat.id, reason: repaired.warning });
      gated = layoutAndLint(repaired.scene, beat, prev);
      if (gated.severe.length) gated = runSanitize(gated, beat, prev);
    }
    if (gated.severe.length) {
      // 3) Absolute last resort (should ~never trigger): bare text.
      const reason = `qa failed after sanitize+repair: ${formatIssues(gated.severe, 4)}`;
      console.error(`[lesson] beat ${i + 1}/${total} (${beat.id}) QA fallback: ${reason}`);
      failures.push({ beat: i + 1, id: beat.id, reason });
      gated = layoutAndLint(fallbackScene(beat), beat, prev);
    }
    const nonSevere = gated.issues.filter((issue) => issue.severity !== "error");
    if (nonSevere.length) qaWarnings.push({ beat: i + 1, id: beat.id, reason: formatIssues(nonSevere, 4) });

    send({ type: "segment", index: i, segment: { id: beat.id, narration: beat.narration, scene: gated.scene } });
    prev = gated.scene;
  }

  if (failures.length) {
    console.error(`[lesson] ${failures.length}/${total} beats needed rescue/fallback. First reason: ${failures[0].reason}`);
  }
  if (reviewWarnings.length) {
    console.warn(`[lesson] ${reviewWarnings.length}/${total} scene review passes failed; kept generated scenes.`);
  }
  if (qaWarnings.length) {
    console.warn(`[lesson] ${qaWarnings.length}/${total} QA warnings or repair warnings.`);
  }

  send({
    type: "done",
    usage,
    warnings: failures.length ? failures : undefined,
    reviewWarnings: reviewWarnings.length ? reviewWarnings : undefined,
    qaWarnings: qaWarnings.length ? qaWarnings : undefined,
  });
}
