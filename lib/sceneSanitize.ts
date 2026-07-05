import type { SceneIssue } from "@/lib/sceneQA";
import type { SceneObject, SceneSpec } from "@/types/scene";

/**
 * Deterministic, model-free repair of the severe QA issues that would otherwise
 * force a beat to fall back to bare text. Given a laid-out scene and its lint
 * report, this mechanically resolves each issue so the beat keeps its REAL
 * visuals (axes/curves/points and most labels) instead of being thrown away:
 *
 *   - emoji            → strip the decorative glyphs, keep the label
 *   - text-on-stroke   → give the label a readable backplate, keep it in place
 *   - duplicate-*      → drop the duplicate object
 *   - camera-clips-*   → drop the camera moves (content beats a zoom)
 *   - text-overlap     → drop the wordier of the two overlapping labels
 *   - out-of-frame /   → drop the offending overlay (layout already tried to
 *     empty-*             place it; if it still can't fit, it goes)
 *
 * The route re-lays-out and re-lints after each pass, so cascading fixes settle
 * over a few iterations. Each pass only ever removes/edits objects, so it always
 * converges. Anything it doesn't recognise is left for the caller to handle.
 */

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function stripEmoji(s: string) {
  return s.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();
}

const LEADER_SUFFIX = "__leader";

export function sanitizeScene(scene: SceneSpec, issues: SceneIssue[]): SceneSpec {
  const remove = new Set<string>();
  const addBackplate = new Set<string>();
  const stripGlyphs = new Set<string>();
  let dropCamera = false;

  const textLen = (id: string) => {
    const o = scene.objects.find((x) => x.id === id);
    if (!o) return 0;
    if (o.type === "equation") return o.latex.length;
    if (o.type === "text" || o.type === "label") return o.text.length;
    return 0;
  };

  for (const iss of issues) {
    const ids = iss.objectIds ?? [];
    switch (iss.code) {
      case "emoji":
        if (ids[0]) stripGlyphs.add(ids[0]);
        break;
      case "empty-text":
      case "empty-backplate":
      case "out-of-frame":
        if (ids[0]) remove.add(ids[0]);
        break;
      case "duplicate-label":
      case "duplicate-curve":
      case "duplicate-id":
        // issue is [kept, duplicate] — drop the duplicate (fall back to the only id).
        remove.add(ids[1] ?? ids[0]);
        break;
      case "invalid-expression":
      case "constraint-cycle":
        if (ids[0]) remove.add(ids[0]);
        break;
      case "unresolved-reference":
        // Remove the object with the dangling reference when it exists; timeline
        // steps and inset mirror lists are pruned against the alive set below.
        if (ids[0] && scene.objects.some((o) => o.id === ids[0])) remove.add(ids[0]);
        break;
      case "text-on-stroke":
        if (ids[0]) addBackplate.add(ids[0]);
        break;
      case "text-overlap": {
        const [a, b] = ids;
        if (a && b) remove.add(textLen(a) >= textLen(b) ? a : b);
        else if (a) remove.add(a);
        break;
      }
      case "camera-clips-region":
        dropCamera = true;
        break;
      default:
        break; // warnings (info-budget, first-frame-clutter, scene-title) — not severe
    }
  }

  remove.delete(""); // guard against a missing id
  for (const id of remove) addBackplate.delete(id); // removal wins over re-plating

  let objects: SceneObject[] = scene.objects
    .filter((o) => !remove.has(o.id))
    .map((o) => {
      let next = o;
      if (stripGlyphs.has(o.id)) {
        if (o.type === "text" || o.type === "label") next = { ...o, text: stripEmoji(o.text) };
        else if (o.type === "equation") next = { ...o, latex: stripEmoji(o.latex) };
      }
      if (addBackplate.has(next.id) && "background" in next) {
        next = {
          ...next,
          background: (next as { background?: string }).background || "#000000",
          padding: (next as { padding?: number }).padding ?? 6,
        } as SceneObject;
      }
      return next;
    });

  // Drop leader arrows whose owning callout was removed.
  objects = objects.filter((o) => {
    if (o.type === "arrow" && o.id.endsWith(LEADER_SUFFIX)) {
      return !remove.has(o.id.slice(0, -LEADER_SUFFIX.length));
    }
    return true;
  });

  // Prune dangling references: timeline steps and inset mirror lists.
  const alive = new Set(objects.map((o) => o.id));
  const timeline = scene.timeline.filter((s) => alive.has(s.targetId));
  objects = objects.map((o) => (o.type === "inset" ? { ...o, shows: o.shows.filter((id) => alive.has(id)) } : o));

  return { ...scene, objects, timeline, camera: dropCamera ? undefined : scene.camera };
}
