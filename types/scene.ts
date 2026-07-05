/**
 * SceneSpec — the contract between Claude (the brain) and the renderer.
 *
 * Claude emits ONLY this JSON. It never emits drawing/rendering code.
 * The renderer (components/SceneRenderer.tsx) maps this spec to animated
 * Framer Motion + SVG + KaTeX components.
 *
 * Coordinate system (important):
 *   There is ONE world coordinate system for the whole scene, defined by
 *   `view` (math-style: origin in the middle, y points UP). EVERY position in
 *   the spec — text `at`, arrow `from`/`to`, axes ranges, plot domain, dot
 *   positions — is expressed in these world data-coordinates. The renderer maps
 *   world -> pixels. There is no per-object coordinate space, which keeps the
 *   model's mental model simple and the renderer bug-free.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Visible world rectangle. Default: x in [-8,8], y in [-4.5,4.5] (16:9). */
export interface View {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface ObjectBase {
  /** Stable id, referenced by timeline steps. */
  id: string;
  /**
   * Optional relational placement. The model may declare intent here; the
   * deterministic layout resolver converts it into absolute coordinates before
   * rendering. Existing `at`/`from`/`to` fields remain the fallback/source.
   */
  place?: Anchor;
}

export type StageName = "graph" | "split" | "statement" | "plot-inset";
export type RegionName = "main" | "rail" | "caption" | "topStrip" | "statement";

export interface CalloutTarget {
  /** Point to an existing object id, or to an explicit world coordinate. */
  anchorTo: string | Vec2;
}

export type Anchor =
  | { kind: "absolute"; at: Vec2 }
  | { kind: "on"; target: string; x?: number; t?: number; at?: number; offset?: Vec2 }
  | { kind: "relativeTo"; target: string; side: "left" | "right" | "above" | "below" | "center"; gap?: number; offset?: Vec2 }
  | { kind: "distribute"; in: string; axis: "x" | "y"; index: number; count: number; gap?: number; offset?: Vec2 };

interface LayoutIntent {
  /**
   * Region-placed annotations are laid out by `resolveLayout`, not by the
   * model's raw coordinates. This keeps annotation stacks inside safe areas.
   */
  region?: RegionName;
  /**
   * Data callouts are placed in nearby empty space and get a leader line to the
   * target anchor. Use for labels near curves/points instead of text-on-stroke.
   */
  callout?: CalloutTarget;
}

export interface TextObject extends ObjectBase, LayoutIntent {
  type: "text";
  text: string;
  /** World position of the text anchor. */
  at: Vec2;
  /** Font size in pixels (scene canvas is 1600x900). Default 32. */
  fontSize?: number;
  color?: string;
  /** Optional readable backplate when text must sit near strokes/curves. */
  background?: string;
  padding?: number;
  anchor?: "start" | "middle" | "end";
  weight?: "normal" | "bold";
}

export interface EquationObject extends ObjectBase, LayoutIntent {
  type: "equation";
  /** KaTeX/LaTeX source, e.g. "f(x) = x^2". Rendered with trust:false. */
  latex: string;
  at: Vec2;
  /** Font size in pixels. Default 40. */
  fontSize?: number;
  color?: string;
  background?: string;
  padding?: number;
  anchor?: "start" | "middle" | "end";
}

export interface LabelObject extends ObjectBase, LayoutIntent {
  type: "label";
  text: string;
  at: Vec2;
  fontSize?: number;
  color?: string;
  background?: string;
  padding?: number;
  anchor?: "start" | "middle" | "end";
}

export interface CounterObject extends ObjectBase, LayoutIntent {
  type: "counter";
  at: Vec2;
  from: number;
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  color?: string;
  background?: string;
  padding?: number;
  anchor?: "start" | "middle" | "end";
  weight?: "normal" | "bold";
}

export interface AxesObject extends ObjectBase {
  type: "axes";
  /** Data range the axis lines/ticks span (world coords == data coords). */
  xRange: [number, number];
  yRange: [number, number];
  /** Spacing between ticks in world units. Default auto (~1). */
  step?: number;
  showGrid?: boolean;
  xLabel?: string;
  yLabel?: string;
  color?: string;
  /**
   * Make specific tick labels visually prominent without adding separate text
   * on top of the axis/curve. Use this for "look at x = 2" moments.
   */
  emphasizeTicks?: AxisTickEmphasis[];
}

export interface AxisTickEmphasis {
  axis: "x" | "y";
  value: number;
  color?: string;
  /** Optional display override, e.g. "2" instead of "2.0". */
  label?: string;
}

export interface FunctionPlotObject extends ObjectBase {
  type: "function-plot";
  /** Safe math expression in `x`, e.g. "x^2", "sin(x)", "2*x + 1". */
  expr: string;
  /** x-domain to sample over (world coords). */
  domain: [number, number];
  /** Number of samples. Clamped to [2, 400]. Default 200. */
  samples?: number;
  color?: string;
  /** Stroke width in pixels. Default 3. */
  width?: number;
  /** Optional SVG dash pattern, e.g. [10, 8] for projection/helper lines. */
  dash?: [number, number];
}

export interface ParametricObject extends ObjectBase {
  type: "parametric";
  /** Safe math expression in `t` (and optional scalar params), e.g. "cos(t)". */
  xExpr: string;
  /** Safe math expression in `t` (and optional scalar params), e.g. "sin(t)". */
  yExpr: string;
  /** t-domain to sample over. */
  tRange: [number, number];
  /** Optional scalar parameters available by name inside xExpr/yExpr. */
  params?: Record<string, number>;
  /** Number of samples. Clamped to [2, 400]. Default 200. */
  samples?: number;
  color?: string;
  width?: number;
  dash?: [number, number];
  fill?: string;
  close?: boolean;
  opacity?: number;
}

export type PathSegment =
  | { op: "M" | "L"; to: Vec2 }
  | { op: "Q"; control: Vec2; to: Vec2 }
  | { op: "C"; c1: Vec2; c2: Vec2; to: Vec2 }
  | { op: "A"; rx: number; ry: number; rotation?: number; largeArc?: boolean; sweep?: boolean; to: Vec2 };

export interface PathObject extends ObjectBase {
  type: "path";
  segments: PathSegment[];
  close?: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: [number, number];
  opacity?: number;
}

export interface PolygonObject extends ObjectBase {
  type: "polygon";
  points: Vec2[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: [number, number];
  opacity?: number;
}

export interface PolylineObject extends ObjectBase {
  type: "polyline";
  points: Vec2[];
  stroke?: string;
  strokeWidth?: number;
  dash?: [number, number];
  opacity?: number;
}

export interface DotObject extends ObjectBase {
  type: "dot";
  /** World position. */
  at: Vec2;
  /** Radius in pixels (stays round regardless of view aspect). Default 7. */
  radius?: number;
  color?: string;
  /**
   * Solid point (default true) or a hollow ring (false). Use a hollow dot for an
   * OPEN circle — a hole or an excluded endpoint at a discontinuity — and a solid
   * dot for an included point. The open/closed pair is the standard way to draw a
   * jump or removable discontinuity.
   */
  filled?: boolean;
}

export interface ArrowObject extends ObjectBase {
  type: "arrow";
  from: Vec2;
  to: Vec2;
  color?: string;
  width?: number;
  /** Optional SVG dash pattern, e.g. [10, 8] for projection/helper lines. */
  dash?: [number, number];
  /** Draw an arrowhead at `to`. Default true. */
  head?: boolean;
}

export interface BoxObject extends ObjectBase {
  type: "box";
  /** World position of the box center. */
  at: Vec2;
  /** Width and height in world units. */
  width: number;
  height: number;
  /** Corner radius in world units. Default 0.15. */
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export type IconName = "car" | "speedometer" | "camera" | "stopwatch" | "clock" | "person" | "pi-person";

export interface IconObject extends ObjectBase {
  type: "icon";
  name: IconName;
  /** World position of the icon center. */
  at: Vec2;
  /** Icon size in pixels on the 1600x900 scene canvas. Default 96. */
  size?: number;
  color?: string;
  secondaryColor?: string;
}

/**
 * A straight line whose endpoints ride on a function-plot's curve at x = `x1`
 * and x = `x2` (the chord / secant between (x1,f(x1)) and (x2,f(x2))). A `slide`
 * animation can move an endpoint's x along the curve — slide x2 down to x1 and
 * the secant smoothly becomes the tangent. The 3Blue1Brown limit picture.
 */
export interface SecantLineObject extends ObjectBase {
  type: "secant-line";
  /** id of the function-plot this line's endpoints ride on. */
  plotId: string;
  /** x of the first endpoint (world coords). */
  x1: number;
  /** x of the second endpoint (world coords). */
  x2: number;
  /** Extend the line beyond its two points (in world x units) so it reads as a full line, not just a chord. Default 0. */
  extend?: number;
  color?: string;
  width?: number;
  /** Optional SVG dash pattern, e.g. [10, 8] for average-rate helper lines. */
  dash?: [number, number];
}

export interface InsetObject extends ObjectBase {
  type: "inset";
  /** World-space box center where the inset is drawn in the parent scene. */
  at: Vec2;
  width: number;
  height: number;
  /** Data rectangle rendered inside the inset. */
  view: View;
  /** Existing plot/axis/dot ids to mirror inside the inset. */
  shows: string[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  label?: string;
}

export interface BraceObject extends ObjectBase {
  type: "brace";
  from: Vec2;
  to: Vec2;
  /** Which side of the measured span the brace should bulge toward. */
  side?: "left" | "right" | "above" | "below";
  color?: string;
  width?: number;
  label?: string;
  labelOffset?: number;
  fontSize?: number;
}

/** One band (a column's width or a row's height) of an area model, plus its edge label. */
export interface AreaModelBand {
  /** Width (column) or height (row) in world units. Relative magnitudes are what
   * matter — make `x` visibly bigger than `b/2a` and the tiles stay proportional. */
  size: number;
  /** Label drawn along this band's outer edge (LaTeX), e.g. "x" or "\\frac{b}{2a}". */
  label?: string;
}

/** An optional per-tile override, indexed from the bottom-left corner (row 0, col 0). */
export interface AreaModelCell {
  /** 0-based row from the BOTTOM. */
  row: number;
  /** 0-based column from the LEFT. */
  col: number;
  /** Area label drawn centered in the tile (LaTeX), e.g. "x^2" or "\\frac{b}{2a}x". */
  label?: string;
  fill?: string;
}

/**
 * A partitioned-rectangle "area model" (algebra tiles): the model declares the
 * column widths, row heights, and labels; the deterministic layer computes every
 * tile rectangle and label position so they tile PERFECTLY and stay aligned. This
 * is how completing-the-square, (a+b)^2, distributivity, and multiplication grids
 * are drawn without the model ever placing a coordinate. Expanded into boxes +
 * equations before rendering, so the renderer needs no special case.
 */
export interface AreaModelObject extends ObjectBase {
  type: "area-model";
  /** World position of the model's BOTTOM-LEFT corner (y-up). */
  at: Vec2;
  /** Column bands, left → right. */
  columns: AreaModelBand[];
  /** Row bands, bottom → top. */
  rows: AreaModelBand[];
  /** Per-tile labels/fills (any tile omitted is drawn blank). */
  cells?: AreaModelCell[];
  /** Default tile fill (translucent recommended so labels read). */
  fill?: string;
  /** Tile border color. */
  stroke?: string;
  /** Draw the per-band edge labels. Default true. */
  showEdgeLabels?: boolean;
  /** Font size (px) for tile + edge labels. */
  fontSize?: number;
}

export interface GroupTransform {
  translate?: Vec2;
  /** Degrees, counter-clockwise in world coordinates. */
  rotate?: number;
  scale?: number | Vec2;
}

export interface GroupObject extends ObjectBase {
  type: "group";
  /** World origin for the group's child coordinates. */
  at?: Vec2;
  transform?: GroupTransform;
  children: SceneObject[];
  opacity?: number;
}

export type SceneObject =
  | TextObject
  | EquationObject
  | LabelObject
  | CounterObject
  | AxesObject
  | FunctionPlotObject
  | ParametricObject
  | PathObject
  | PolygonObject
  | PolylineObject
  | DotObject
  | ArrowObject
  | BoxObject
  | IconObject
  | SecantLineObject
  | InsetObject
  | BraceObject
  | AreaModelObject
  | GroupObject;

export type AnimationType =
  | "fadeIn"
  | "fadeOut"
  | "draw"
  | "move"
  | "transform"
  | "highlight"
  | "morph"
  | "trace"
  | "emphasize"
  | "slide"
  | "reshape"
  | "count";

export interface AnimationStep {
  type: AnimationType;
  /** id of the object this step animates. */
  targetId: string;
  /** Start time in seconds. */
  start: number;
  /** Duration in seconds. */
  duration: number;
  /** move: destination (world coords). */
  to?: Vec2;
  /** transform: new LaTeX for an equation object (cross-fade). */
  toLatex?: string;
  /** count: override animated numeric range for a counter object. */
  fromValue?: number;
  toValue?: number;
  /** highlight: optional color to flash. */
  color?: string;
  /**
   * morph (on a function-plot): the curve continuously reshapes from its `expr`
   * into `toExpr` (optionally also sliding its domain to `toDomain`). This is the
   * 3Blue1Brown "one curve flows into another" effect.
   */
  toExpr?: string;
  toDomain?: [number, number];
  /**
   * trace (on a dot): the dot sweeps ALONG the curve named by `plotId` — any of:
   * a function-plot (x runs `fromX`→`toX`, default its full domain), a
   * parametric (t runs `fromT`→`toT`, default its full tRange), or a
   * path / polyline / polygon (arc-length fraction runs `fromT`→`toT` in 0..1,
   * default the whole way round). Use this for a point gliding over ANY curve —
   * a dot orbiting a parametric circle is trace, not a series of moves.
   */
  plotId?: string;
  fromX?: number;
  toX?: number;
  fromT?: number;
  toT?: number;
  /**
   * emphasize: grow the object to `scaleTo` (default 1.3) and hold it there to
   * draw the eye. Optional `color` recolors it; text/labels also turn bold.
   */
  scaleTo?: number;
  /**
   * slide (on a secant-line): move its endpoints' x-values to `toX1`/`toX2`
   * along the curve. Slide one toward the other to turn a secant into a tangent.
   */
  toX1?: number;
  toX2?: number;
  /**
   * reshape (on a box): animate the box to a new center/size/corner-radius.
   * Grow `toRadius` to half the side to morph a rectangle into a circle.
   */
  toAt?: Vec2;
  toWidth?: number;
  toHeight?: number;
  toRadius?: number;
}

/**
 * A camera move: over [start, start+duration] the visible world rectangle eases
 * from wherever it currently is to `to`. Chain several to zoom in, hold, pan,
 * and zoom back out within one scene. The whole scene (axes, curves, dots, text)
 * transforms together, so zooming in on two converging points fills the screen
 * with them — the 3Blue1Brown "push in on the detail" move.
 */
export interface CameraMove {
  start: number;
  duration: number;
  to: View;
}

export interface SceneSpec {
  version: 1;
  /** Optional title shown in the corner. */
  title?: string;
  /** Optional deterministic composition preset used by layout/QA. */
  stage?: StageName;
  /**
   * Continue the prior beat's visual stage/view/main object positions. Layout
   * keeps framing stable for "same graph over several beats" sequences.
   */
  continueFrom?: "prev";
  /** Optional semantic motion idiom selected by the script/planner. */
  shotPattern?: string;
  /** Starting visible world rectangle (the camera's initial framing). */
  view?: View;
  /** Optional camera moves that zoom/pan the whole scene over the timeline. */
  camera?: CameraMove[];
  background?: string;
  objects: SceneObject[];
  timeline: AnimationStep[];
  /** Total scene duration hint in seconds. */
  duration?: number;
}

export const DEFAULT_VIEW: View = { xMin: -8, xMax: 8, yMin: -4.5, yMax: 4.5 };

/** Pixel dimensions of the SVG viewBox (16:9). */
export const VIEW_W = 1600;
export const VIEW_H = 900;
