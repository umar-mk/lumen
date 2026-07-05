import { fitFontSize, pxToWorld, rectInside, rectsIntersect, sceneRect, objectAnchor, objectRect, sampleFunctionPoints, type Rect } from "@/lib/sceneGeometry";
import { areaModelSize, expandAreaModels } from "@/lib/areaModel";
import { compileExpr } from "@/lib/mathEval";
import { sampleParametricPoints, samplePathPoints, polygonPoints } from "@/lib/scenePaths";
import { expandGroups, resolveObjectPlacements } from "@/lib/sceneTransforms";
import { strokeHits } from "@/lib/sceneQA";
import { DEFAULT_VIEW, type ArrowObject, type FunctionPlotObject, type RegionName, type SceneObject, type SceneSpec, type StageName, type Vec2, type View } from "@/types/scene";

const BACKPLATE = "#000000";
const LEADER = "#cbd5e1";
const ASPECT = 16 / 9;

const isOverlay = (o: SceneObject) => o.type === "text" || o.type === "label" || o.type === "equation" || o.type === "counter";

interface LayoutOptions {
  previousScene?: SceneSpec;
}

function inferStage(scene: SceneSpec): StageName {
  if (scene.stage) return scene.stage;
  if (scene.objects.some((o) => o.type === "inset")) return "plot-inset";
  if (scene.objects.some((o) => o.type === "axes" || o.type === "function-plot" || o.type === "parametric" || o.type === "secant-line")) return "graph";
  return "statement";
}

function addPoint(xs: number[], ys: number[], p: Vec2) {
  if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
    xs.push(p.x);
    ys.push(p.y);
  }
}

function dataBounds(scene: SceneSpec): { xMin: number; xMax: number; yMin: number; yMax: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const view = scene.view ?? DEFAULT_VIEW;
  for (const obj of scene.objects) {
    if (isOverlay(obj) && (obj.region || obj.callout)) continue;
    if (obj.type === "axes") {
      addPoint(xs, ys, { x: obj.xRange[0], y: obj.yRange[0] });
      addPoint(xs, ys, { x: obj.xRange[1], y: obj.yRange[1] });
    } else if (obj.type === "function-plot") {
      for (const p of sampleFunctionPoints(view, obj, 120)) {
        addPoint(xs, ys, pxToWorld(view, p));
      }
    } else if (obj.type === "parametric") {
      for (const p of sampleParametricPoints(obj, 120)) addPoint(xs, ys, p);
    } else if (obj.type === "path") {
      for (const p of samplePathPoints(obj, 18)) addPoint(xs, ys, p);
    } else if (obj.type === "polygon" || obj.type === "polyline") {
      for (const p of polygonPoints(obj)) addPoint(xs, ys, p);
    } else if (obj.type === "dot" || obj.type === "icon" || obj.type === "box" || obj.type === "inset" || obj.type === "counter") {
      addPoint(xs, ys, obj.at);
      if ("width" in obj && "height" in obj) {
        addPoint(xs, ys, { x: obj.at.x - obj.width / 2, y: obj.at.y - obj.height / 2 });
        addPoint(xs, ys, { x: obj.at.x + obj.width / 2, y: obj.at.y + obj.height / 2 });
      }
    } else if (obj.type === "arrow") {
      addPoint(xs, ys, obj.from);
      addPoint(xs, ys, obj.to);
    } else if (obj.type === "brace") {
      addPoint(xs, ys, obj.from);
      addPoint(xs, ys, obj.to);
    } else if (obj.type === "area-model") {
      const { width, height, margin } = areaModelSize(obj);
      addPoint(xs, ys, { x: obj.at.x - margin, y: obj.at.y - margin });
      addPoint(xs, ys, { x: obj.at.x + width, y: obj.at.y + height });
    } else if (isOverlay(obj)) {
      addPoint(xs, ys, obj.at);
    } else if (obj.type === "secant-line") {
      const plot = scene.objects.find((o): o is FunctionPlotObject => o.type === "function-plot" && o.id === obj.plotId);
      if (plot) {
        const anchor = objectAnchor(obj, scene);
        if (anchor) addPoint(xs, ys, anchor);
        addPoint(xs, ys, { x: obj.x1, y: 0 });
        addPoint(xs, ys, { x: obj.x2, y: 0 });
      }
    }
  }
  if (!xs.length) return null;
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

function withAspect(bounds: { xMin: number; xMax: number; yMin: number; yMax: number }, stage: StageName): View {
  let xMin = bounds.xMin;
  let xMax = bounds.xMax;
  let yMin = bounds.yMin;
  let yMax = bounds.yMax;
  const w0 = Math.max(1, xMax - xMin);
  const h0 = Math.max(1, yMax - yMin);
  const mx = w0 * 0.12 + 0.45;
  const my = h0 * 0.12 + 0.45;
  xMin -= mx;
  xMax += mx;
  yMin -= my;
  yMax += my;

  if (stage === "graph" || stage === "plot-inset") xMax += (xMax - xMin) * 0.24;
  if (stage === "split") yMax += (yMax - yMin) * 0.28;

  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  let w = xMax - xMin;
  let h = yMax - yMin;
  if (w / h < ASPECT) w = h * ASPECT;
  else h = w / ASPECT;
  return { xMin: cx - w / 2, xMax: cx + w / 2, yMin: cy - h / 2, yMax: cy + h / 2 };
}

function unionView(a: View, b: View): View {
  return {
    xMin: Math.min(a.xMin, b.xMin),
    xMax: Math.max(a.xMax, b.xMax),
    yMin: Math.min(a.yMin, b.yMin),
    yMax: Math.max(a.yMax, b.yMax),
  };
}

function resolveView(scene: SceneSpec, stage: StageName, previousScene?: SceneSpec): View {
  if (scene.continueFrom === "prev" && previousScene?.view && (previousScene.stage ?? inferStage(previousScene)) === stage) {
    return previousScene.view;
  }
  const auto = withAspect(dataBounds(scene) ?? (scene.view ?? DEFAULT_VIEW), stage);
  return scene.view ? unionView(auto, scene.view) : auto;
}

function regionRect(stage: StageName, region: RegionName): Rect {
  if (region === "rail") return { xMin: 1180, xMax: 1505, yMin: 145, yMax: 720 };
  if (region === "caption") return { xMin: 160, xMax: 1440, yMin: 720, yMax: 830 };
  if (region === "topStrip") return { xMin: 170, xMax: 1430, yMin: 70, yMax: stage === "split" ? 245 : 190 };
  if (region === "statement") return { xMin: 285, xMax: 1315, yMin: 180, yMax: 720 };
  return { xMin: 95, xMax: 1100, yMin: 95, yMax: 805 };
}

function regionPlacement(view: View, stage: StageName, region: RegionName, index: number, total: number) {
  const rect = regionRect(stage, region);
  const slot = Math.min(96, Math.max(46, (rect.yMax - rect.yMin) / Math.max(total, 1)));
  const y = rect.yMin + slot * (index + 0.5);
  const isRail = region === "rail";
  const x = isRail ? rect.xMin + 16 : (rect.xMin + rect.xMax) / 2;
  // Pixel space the label may occupy in its slot — the layout engine fits the
  // font to this so a region label can never overflow (false out-of-frame) and
  // stacked labels keep a real gap (the 0.6 factor leaves room for the backplate
  // padding so two slots can't touch and read as an overlap).
  const maxW = (isRail ? rect.xMax - (rect.xMin + 16) : rect.xMax - rect.xMin) - 28;
  const maxH = slot * 0.6;
  return {
    at: pxToWorld(view, { x, y }),
    anchor: isRail ? ("start" as const) : ("middle" as const),
    maxW,
    maxH,
  };
}

function overlayText(obj: SceneObject): { text: string; kind: "text" | "equation"; authored: number } {
  if (obj.type === "equation") return { text: obj.latex, kind: "equation", authored: obj.fontSize ?? 40 };
  if (obj.type === "text") return { text: obj.text, kind: "text", authored: obj.fontSize ?? 32 };
  if (obj.type === "counter") {
    const decimals = obj.decimals ?? 0;
    const wide = Math.abs(obj.to) >= Math.abs(obj.from) ? obj.to : obj.from;
    return { text: `${obj.prefix ?? ""}${wide.toFixed(decimals)}${obj.suffix ?? ""}`, kind: "text", authored: obj.fontSize ?? 32 };
  }
  return { text: (obj as { text?: string }).text ?? "", kind: "text", authored: (obj as { fontSize?: number }).fontSize ?? 22 };
}

function placeRegionObjects(scene: SceneSpec, view: View, stage: StageName): SceneObject[] {
  const regionCounts = new Map<RegionName, number>();
  const regionIndex = new Map<RegionName, number>();
  for (const obj of scene.objects) {
    if (isOverlay(obj) && obj.region) {
      regionCounts.set(obj.region, (regionCounts.get(obj.region) ?? 0) + 1);
    }
  }
  return scene.objects.map((obj) => {
    if (!isOverlay(obj) || !obj.region) return obj;
    const index = regionIndex.get(obj.region) ?? 0;
    regionIndex.set(obj.region, index + 1);
    const placement = regionPlacement(view, stage, obj.region, index, regionCounts.get(obj.region) ?? 1);
    const { text, kind, authored } = overlayText(obj);
    const fontSize = fitFontSize(text, kind, authored, placement.maxW, placement.maxH);
    return {
      ...obj,
      at: placement.at,
      anchor: obj.anchor ?? placement.anchor,
      fontSize,
      background: obj.background ?? (obj.region === "rail" || obj.region === "caption" ? BACKPLATE : obj.background),
      padding: obj.padding ?? (obj.background || obj.region === "rail" || obj.region === "caption" ? 6 : undefined),
    } as SceneObject;
  });
}

function resolveAnchor(scene: SceneSpec, anchorTo: string | Vec2): Vec2 | null {
  if (typeof anchorTo !== "string") return anchorTo;
  const target = scene.objects.find((o) => o.id === anchorTo);
  return target ? objectAnchor(target, scene) : null;
}

function candidateCalloutPoints(view: View, anchor: Vec2): Vec2[] {
  const w = view.xMax - view.xMin;
  const h = view.yMax - view.yMin;
  const dx = w * 0.16;
  const dy = h * 0.13;
  return [
    { x: anchor.x + dx, y: anchor.y + dy },
    { x: anchor.x - dx, y: anchor.y + dy },
    { x: anchor.x + dx, y: anchor.y - dy },
    { x: anchor.x - dx, y: anchor.y - dy },
    { x: view.xMax - w * 0.18, y: anchor.y + dy },
    { x: view.xMin + w * 0.18, y: anchor.y + dy },
  ].map((p) => ({
    x: Math.max(view.xMin + w * 0.08, Math.min(view.xMax - w * 0.08, p.x)),
    y: Math.max(view.yMin + h * 0.08, Math.min(view.yMax - h * 0.08, p.y)),
  }));
}

function placeCallouts(scene: SceneSpec, view: View): SceneObject[] {
  const output: SceneObject[] = [];
  const occupied: Rect[] = scene.objects
    .filter((obj) => !isOverlay(obj) && obj.type !== "axes" && obj.type !== "function-plot")
    .map((obj) => objectRect(scene, obj, view)?.rect)
    .filter((r): r is Rect => Boolean(r));

  for (const obj of scene.objects) {
    if (!isOverlay(obj) || !obj.callout || obj.region) {
      output.push(obj);
      continue;
    }
    const anchor = resolveAnchor(scene, obj.callout.anchorTo);
    if (!anchor) {
      output.push(obj);
      continue;
    }
    let placed: typeof obj = { ...obj, anchor: obj.anchor ?? "middle", background: obj.background ?? BACKPLATE, padding: obj.padding ?? 6 };
    for (const candidate of candidateCalloutPoints(view, anchor)) {
      const trial = { ...placed, at: candidate } as typeof obj;
      const rect = objectRect({ ...scene, objects: [trial] }, trial, view)?.rect;
      if (rect && rectInside(rect, sceneRect(), 18) && occupied.every((r) => !rectsIntersect(rect, r, 14))) {
        placed = trial;
        occupied.push(rect);
        break;
      }
    }
    const leader: ArrowObject = {
      type: "arrow",
      id: `${obj.id}__leader`,
      from: placed.at,
      to: anchor,
      color: obj.color ?? LEADER,
      width: 2,
      head: false,
    };
    output.push(leader, placed);
  }
  return output;
}

const hasOwnBackplate = (o: SceneObject) => isOverlay(o) && "background" in o && Boolean((o as { background?: string }).background);

function overlayLen(obj: SceneObject): number {
  if (obj.type === "equation") return obj.latex.replace(/\\[a-zA-Z]+|[{}]/g, "").length;
  if (obj.type === "text" || obj.type === "label") return obj.text.length;
  return 0;
}

// Where a BROKEN free overlay should be relocated to (a clean one is left where
// the author put it). The narrow rail only takes short labels; long text and
// equations go to the wide caption (graph) or the tall statement column.
function defaultRegionFor(stage: StageName, obj: SceneObject): RegionName {
  if (stage === "statement") return "statement";
  if (stage === "split") return "caption";
  const long = obj.type === "equation" || overlayLen(obj) > 22;
  return long ? "caption" : "rail";
}

// Keep every free overlay (no explicit region/callout) where the author placed
// it IF that position is already clean; relocate ONLY the ones that overlap, sit
// on a stroke, or fall off-frame. This is what stops the layout from degrading a
// well-composed scene while still fixing a broken one.
function placeFreeOverlays(scene: SceneSpec, view: View, stage: StageName): SceneObject[] {
  const overlays = scene.objects.filter((o) => isOverlay(o) && !o.region && !o.callout);
  if (!overlays.length) return scene.objects;

  const freeIds = new Set(overlays.map((o) => o.id));
  const fixed = scene.objects.filter((o) => !freeIds.has(o.id));
  // Overlap is only a problem against other LABELS or a big icon. Curves/axes/
  // arrows are strokes (handled by the stroke check) and boxes/insets are panels
  // meant to sit behind text — a label on its own panel is intended, not a clash.
  const occupied = fixed
    .filter((o) => isOverlay(o) || o.type === "icon")
    .map((o) => objectRect(scene, o, view)?.rect)
    .filter((r): r is Rect => Boolean(r));
  const panels = fixed
    .filter((o) => (o.type === "box" && (o.opacity ?? 1) >= 0.5 && o.fill !== "none") || o.type === "inset")
    .map((o) => objectRect(scene, o, view)?.rect)
    .filter((r): r is Rect => Boolean(r));
  const authored = new Map(overlays.map((o) => [o.id, objectRect(scene, o, view)?.rect] as const));
  const safe = sceneRect();

  const keep = new Set<string>();
  const target = new Map<string, RegionName>();
  const regionTotals = new Map<RegionName, number>();
  for (const o of overlays) {
    const r = authored.get(o.id);
    let clean = false;
    if (r) {
      const inFrame = rectInside(r, safe, 12);
      const onStroke = !hasOwnBackplate(o) && !panels.some((p) => rectInside(r, p, -6)) && Boolean(strokeHits(scene, view, r));
      const hitsFixed = occupied.some((q) => rectsIntersect(r, q, 8));
      const hitsFree = overlays.some((b) => b.id !== o.id && (() => { const br = authored.get(b.id); return br ? rectsIntersect(r, br, 8) : false; })());
      clean = inFrame && !onStroke && !hitsFixed && !hitsFree;
    }
    if (clean) keep.add(o.id);
    else {
      const reg = defaultRegionFor(stage, o);
      target.set(o.id, reg);
      regionTotals.set(reg, (regionTotals.get(reg) ?? 0) + 1);
    }
  }

  const regionIdx = new Map<RegionName, number>();
  return scene.objects.map((o) => {
    if (!freeIds.has(o.id) || keep.has(o.id)) return o;
    const reg = target.get(o.id) ?? "caption";
    const idx = regionIdx.get(reg) ?? 0;
    regionIdx.set(reg, idx + 1);
    const placement = regionPlacement(view, stage, reg, idx, regionTotals.get(reg) ?? 1);
    const { text, kind, authored: auth } = overlayText(o);
    const fontSize = fitFontSize(text, kind, auth, placement.maxW, placement.maxH);
    const ov = o as Extract<SceneObject, { type: "text" | "label" | "equation" | "counter" }>;
    return {
      ...ov,
      at: placement.at,
      anchor: ov.anchor ?? placement.anchor,
      fontSize,
      background: ov.background ?? BACKPLATE,
      padding: ov.padding ?? 6,
    } as SceneObject;
  });
}

// A dot that's MEANT to ride a curve is usually placed a hair off it (the model
// eyeballs the y). If a dot sits within a small band of a plotted curve at its x
// (and inside that curve's domain), snap its y exactly onto f(x). The band is a
// fraction of the view height so a deliberate off-curve marker (origin, an axis
// label dot) is left alone.
function snapDotsToCurves(scene: SceneSpec, view: View): SceneObject[] {
  const plots = scene.objects.filter((o): o is FunctionPlotObject => o.type === "function-plot");
  if (!plots.length) return scene.objects;
  const tol = (view.yMax - view.yMin) * 0.06;
  const compiled = plots.flatMap((plot) => {
    const fn = compileExpr(plot.expr);
    return fn ? [{ plot, lo: Math.min(plot.domain[0], plot.domain[1]), hi: Math.max(plot.domain[0], plot.domain[1]), fn }] : [];
  });
  if (!compiled.length) return scene.objects;

  const withInferredPlacement = scene.objects.map((o) => {
    if (o.type !== "dot") return o;
    let bestPlot: FunctionPlotObject | null = null;
    let bestDist = Infinity;
    for (const c of compiled) {
      if (o.at.x < c.lo - 1e-6 || o.at.x > c.hi + 1e-6) continue;
      const y = c.fn(o.at.x);
      if (!Number.isFinite(y)) continue;
      const d = Math.abs(o.at.y - y);
      if (d < bestDist) {
        bestDist = d;
        bestPlot = c.plot;
      }
    }
    if (bestPlot && bestDist > 1e-9 && bestDist <= tol) {
      return { ...o, place: o.place ?? { kind: "on", target: bestPlot.id, x: o.at.x } };
    }
    return o;
  });
  return resolveObjectPlacements({ ...scene, objects: withInferredPlacement }).objects;
}

export function resolveLayout(scene: SceneSpec, options: LayoutOptions = {}): SceneSpec {
  const placed = resolveObjectPlacements(scene);
  const expanded = expandGroups(placed);
  const placedExpanded = resolveObjectPlacements(expanded);
  const stage = inferStage(placedExpanded);
  const view = resolveView(placedExpanded, stage, options.previousScene);
  const snapped = snapDotsToCurves(placedExpanded, view);
  const base = { ...placedExpanded, title: undefined, stage, view, objects: snapped };
  const regioned = placeRegionObjects(base, view, stage); // overlays with an explicit region
  const withCallouts = placeCallouts({ ...base, objects: regioned }, view); // overlays with an explicit callout
  const objects = placeFreeOverlays({ ...base, objects: withCallouts }, view, stage); // keep-clean-or-relocate
  // Expand area-models LAST, so their tiles/labels are placed deterministically
  // and never re-flowed by the overlay layout above.
  return expandAreaModels({ ...base, objects });
}
