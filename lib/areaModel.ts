import type {
  AnimationStep,
  AreaModelObject,
  BoxObject,
  EquationObject,
  GroupObject,
  SceneObject,
  SceneSpec,
  Vec2,
} from "@/types/scene";

/**
 * Expand each `area-model` into perfectly-tiled boxes + centered equation labels.
 *
 * This is the deterministic half of the area-model primitive: the model only
 * declares column widths, row heights, and labels (1-D scalars it's good at), and
 * THIS computes every 2-D rectangle and label position so the tiles share edges
 * exactly and never drift. The output uses primitives the renderer already draws
 * (boxes render, equations get KaTeX), so nothing downstream needs a special case.
 */

const DEFAULT_TILE_FILL = "rgba(56,189,248,0.10)";
const DEFAULT_TILE_STROKE = "#64748b";

/**
 * Marker embedded in every expanded child id. An area model deliberately repeats
 * labels (a square has `x` on two edges; off-diagonal tiles share an area), so QA
 * skips the duplicate-label check for ids carrying this marker.
 */
export const AREA_MODEL_MARKER = "~am~";
export const isAreaModelChild = (id: string) => id.includes(AREA_MODEL_MARKER);

/** Cumulative edge offsets: edges[k] is the start of band k (edges has length+1). */
function edges(bands: { size: number }[]): number[] {
  const out = [0];
  for (const b of bands) out.push(out[out.length - 1] + b.size);
  return out;
}

export function areaModelSize(am: AreaModelObject): { width: number; height: number; margin: number } {
  const width = am.columns.reduce((s, b) => s + b.size, 0);
  const height = am.rows.reduce((s, b) => s + b.size, 0);
  return { width, height, margin: Math.max(0.4, 0.1 * Math.max(width, height)) };
}

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

function translateChild(child: SceneObject, origin: Vec2): SceneObject {
  if ("at" in child && child.at) return { ...child, at: add(child.at, origin) } as SceneObject;
  return child;
}

export function areaModelToGroup(am: AreaModelObject): GroupObject {
  const children: SceneObject[] = [];
  const colEdges = edges(am.columns);
  const rowEdges = edges(am.rows);
  const { margin } = areaModelSize(am);
  const cellFont = am.fontSize ?? 34;
  const edgeFont = Math.round(cellFont * 0.85);
  const showEdges = am.showEdgeLabels !== false;

  for (let r = 0; r < am.rows.length; r++) {
    for (let c = 0; c < am.columns.length; c++) {
      const w = am.columns[c].size;
      const h = am.rows[r].size;
      const cx = colEdges[c] + w / 2;
      const cy = rowEdges[r] + h / 2;
      const cell = am.cells?.find((k) => k.row === r && k.col === c);
      const box: BoxObject = {
        type: "box",
        id: `${am.id}${AREA_MODEL_MARKER}t-${r}-${c}`,
        at: { x: cx, y: cy },
        width: w,
        height: h,
        radius: 0,
        fill: cell?.fill ?? am.fill ?? DEFAULT_TILE_FILL,
        stroke: am.stroke ?? DEFAULT_TILE_STROKE,
        strokeWidth: 2,
        opacity: 1,
      };
      children.push(box);
      if (cell?.label) {
        const eq: EquationObject = {
          type: "equation",
          id: `${am.id}${AREA_MODEL_MARKER}cl-${r}-${c}`,
          latex: cell.label,
          at: { x: cx, y: cy },
          fontSize: cellFont,
          anchor: "middle",
        };
        children.push(eq);
      }
    }
  }

  if (showEdges) {
    for (let c = 0; c < am.columns.length; c++) {
      const label = am.columns[c].label;
      if (!label) continue;
      const cx = colEdges[c] + am.columns[c].size / 2;
      children.push({ type: "equation", id: `${am.id}${AREA_MODEL_MARKER}col-${c}`, latex: label, at: { x: cx, y: -margin }, fontSize: edgeFont, anchor: "middle" });
    }
    for (let r = 0; r < am.rows.length; r++) {
      const label = am.rows[r].label;
      if (!label) continue;
      const cy = rowEdges[r] + am.rows[r].size / 2;
      children.push({ type: "equation", id: `${am.id}${AREA_MODEL_MARKER}row-${r}`, latex: label, at: { x: -margin, y: cy }, fontSize: edgeFont, anchor: "middle" });
    }
  }

  return {
    type: "group",
    id: `${am.id}${AREA_MODEL_MARKER}group`,
    at: am.at,
    children,
  };
}

export function expandAreaModel(am: AreaModelObject): SceneObject[] {
  const group = areaModelToGroup(am);
  const origin = group.at ?? { x: 0, y: 0 };
  return group.children.map((child) => translateChild(child, origin));
}

/** Replace every area-model in a scene with its expanded primitives + timeline. */
export function expandAreaModels(scene: SceneSpec): SceneSpec {
  if (!scene.objects.some((o) => o.type === "area-model")) return scene;

  const objects: SceneObject[] = [];
  const childrenByModel = new Map<string, string[]>();
  for (const obj of scene.objects) {
    if (obj.type !== "area-model") {
      objects.push(obj);
      continue;
    }
    const children = expandAreaModel(obj);
    childrenByModel.set(obj.id, children.map((c) => c.id));
    objects.push(...children);
  }

  // A timeline step aimed at a model fades in all its tiles/labels together;
  // a model with no step gets a default fade-in so it isn't flagged as frame-1
  // clutter and still builds in.
  const timeline: AnimationStep[] = [];
  const animated = new Set<string>();
  for (const step of scene.timeline) {
    const children = childrenByModel.get(step.targetId);
    if (!children) {
      timeline.push(step);
      continue;
    }
    animated.add(step.targetId);
    for (const childId of children) {
      timeline.push({ type: "fadeIn", targetId: childId, start: step.start, duration: step.duration });
    }
  }
  for (const [modelId, children] of childrenByModel) {
    if (animated.has(modelId)) continue;
    for (const childId of children) timeline.push({ type: "fadeIn", targetId: childId, start: 0, duration: 0.5 });
  }

  return { ...scene, objects, timeline };
}
