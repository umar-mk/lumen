"use client";

import { motion, useTime, useTransform, useMotionValue, useMotionValueEvent, type MotionValue } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";

import {
  type AnimationStep,
  type ArrowObject,
  type AxesObject,
  type BoxObject,
  type BraceObject,
  type CounterObject,
  type CameraMove,
  type DotObject,
  type EquationObject,
  type FunctionPlotObject,
  type IconObject,
  type InsetObject,
  type LabelObject,
  type ParametricObject,
  type PathObject,
  type PolygonObject,
  type PolylineObject,
  type SceneObject,
  type SceneSpec,
  type SecantLineObject,
  type TextObject,
  type Vec2,
  type View,
  DEFAULT_VIEW,
  VIEW_H,
  VIEW_W,
} from "@/types/scene";
import { expandAreaModels } from "@/lib/areaModel";
import { worldToPx, type Px } from "@/lib/coords";
import { compileExpr } from "@/lib/mathEval";
import { compileParametric, pathToSvgD, pointOnPolyline, pointsToSvgD, polygonPoints, sampleParametricPoints, samplePathPoints, traceCurvePoints } from "@/lib/scenePaths";
import { expandGroups, resolveObjectPlacements } from "@/lib/sceneTransforms";
import { renderLatex } from "@/lib/katex";

const EASE = [0.22, 1, 0.36, 1] as const; // gentle, 3b1b-ish ease-out
const HOLD_PLAN: MotionPlan = { initialOpacity: 1 };
const BOARD_FONT = 'Georgia, "Times New Roman", serif';
const COLORS = {
  axis: "#b8b8b8",
  grid: "#2b2b2b",
  tick: "#d8d8d8",
  curve: "#4cc9d9",
  dot: "#d6c24a",
  arrow: "#d6c24a",
  text: "#f2f2f2",
  panel: "#000000",
  panelStroke: "#d8d8d8",
};

// Math helpers for clock-driven animation.
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clampCoord = (n: number) => Math.max(-100000, Math.min(100000, n));

// ---------------------------------------------------------------------------
// Camera: the whole scene is rendered under the static base view, then a single
// clock-driven affine (translate + scale) zooms/pans it. One transform moves
// axes, curves, dots and text together, so pushing in on a detail fills frame.
// ---------------------------------------------------------------------------

function lerpView(a: View, b: View, p: number): View {
  return {
    xMin: lerp(a.xMin, b.xMin, p),
    xMax: lerp(a.xMax, b.xMax, p),
    yMin: lerp(a.yMin, b.yMin, p),
    yMax: lerp(a.yMax, b.yMax, p),
  };
}

// Grow a camera target outward by `f` of its span on every side. The model tends
// to frame zoom targets too tight, which pushes edge labels/equations off-screen
// mid-zoom; padding keeps a margin of context so nothing critical clips.
function padView(v: View, f: number): View {
  const px = (v.xMax - v.xMin) * f;
  const py = (v.yMax - v.yMin) * f;
  return { xMin: v.xMin - px, xMax: v.xMax + px, yMin: v.yMin - py, yMax: v.yMax + py };
}

// The visible world rectangle at time tSec: hold at base, ease into each move's
// target in turn, holding the last target in between.
function cameraViewAt(base: View, moves: CameraMove[], tSec: number): View {
  let cur = base;
  for (const m of moves) {
    if (tSec <= m.start) return cur;
    if (tSec >= m.start + m.duration) {
      cur = m.to;
      continue;
    }
    const p = easeInOut(clamp01((tSec - m.start) / Math.max(0.001, m.duration)));
    return lerpView(cur, m.to, p);
  }
  return cur;
}

interface CamAffine {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
}

// Affine that maps a point's base-view pixels to its current-view pixels.
// UNIFORM scale (sx === sy) so circular dots never stretch into ovals, clamped
// so a too-tight target can't over-zoom into giant blobs, and centred on the
// target region.
function cameraAffine(base: View, vc: View): CamAffine {
  const wc = vc.xMax - vc.xMin || 1;
  const hc = vc.yMax - vc.yMin || 1;
  const w0 = base.xMax - base.xMin || 1;
  const h0 = base.yMax - base.yMin || 1;
  // Fit the target rect (min) → whole region visible; clamp the zoom range.
  // Cap at 2.2× so a too-tight target can't push edge labels off-screen or blow
  // a single point up into a giant blob.
  const s = Math.max(0.5, Math.min(Math.min(w0 / wc, h0 / hc), 2.2));
  // Map the target's world centre to the canvas centre.
  const cx = (vc.xMin + vc.xMax) / 2;
  const cy = (vc.yMin + vc.yMax) / 2;
  const pcx = ((cx - base.xMin) / w0) * VIEW_W;
  const pcy = ((base.yMax - cy) / h0) * VIEW_H;
  return { sx: s, sy: s, tx: VIEW_W / 2 - s * pcx, ty: VIEW_H / 2 - s * pcy };
}

// Guardrail: expand the authored view ONLY if some object anchor falls outside
// it, so nothing clips off-edge. Never shrinks an intentional (zoomed) framing.
function fitView(scene: SceneSpec): View {
  const base = scene.view ?? DEFAULT_VIEW;
  if (scene.stage) return base;
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  };
  for (const o of scene.objects) {
    switch (o.type) {
      case "text":
      case "label":
      case "equation":
      case "counter":
      case "dot":
      case "icon":
        add(o.at.x, o.at.y);
        break;
      case "box":
        add(o.at.x - o.width / 2, o.at.y - o.height / 2);
        add(o.at.x + o.width / 2, o.at.y + o.height / 2);
        break;
      case "arrow":
        add(o.from.x, o.from.y);
        add(o.to.x, o.to.y);
        break;
      case "brace":
        add(o.from.x, o.from.y);
        add(o.to.x, o.to.y);
        break;
      case "axes":
        add(o.xRange[0], o.yRange[0]);
        add(o.xRange[1], o.yRange[1]);
        break;
      case "function-plot":
        add(o.domain[0], 0);
        add(o.domain[1], 0);
        break;
      case "parametric":
        sampleParametricPoints(o, 80).forEach((p) => add(p.x, p.y));
        break;
      case "path":
        samplePathPoints(o, 16).forEach((p) => add(p.x, p.y));
        break;
      case "polygon":
      case "polyline":
        polygonPoints(o).forEach((p) => add(p.x, p.y));
        break;
      default:
        break;
    }
  }
  if (xs.length === 0) return base;
  // Generous margins so text (which has height beyond its anchor point) and
  // titles never kiss the edge or clip — extra vertical room top & bottom.
  const spanX = (Math.max(...xs) - Math.min(...xs)) || 1;
  const spanY = (Math.max(...ys) - Math.min(...ys)) || 1;
  const mx = spanX * 0.06 + 0.5;
  const my = spanY * 0.08 + 0.7;
  return {
    xMin: Math.min(base.xMin, Math.min(...xs) - mx),
    xMax: Math.max(base.xMax, Math.max(...xs) + mx),
    yMin: Math.min(base.yMin, Math.min(...ys) - my),
    yMax: Math.max(base.yMax, Math.max(...ys) + my),
  };
}

// ---------------------------------------------------------------------------
// Timeline -> per-object motion plan
// ---------------------------------------------------------------------------

interface MotionPlan {
  initialOpacity: number;
  fadeIn?: { start: number; duration: number };
  fadeOut?: { start: number; duration: number };
  draw?: { start: number; duration: number };
  move?: { to: Vec2; start: number; duration: number };
  highlight?: { start: number; duration: number; color?: string };
  transform?: { toLatex: string; start: number; duration: number };
  morph?: { toExpr: string; toDomain?: [number, number]; start: number; duration: number };
  trace?: { plotId: string; fromX?: number; toX?: number; fromT?: number; toT?: number; start: number; duration: number };
  emphasize?: { scaleTo: number; color?: string; start: number; duration: number };
  slide?: { toX1?: number; toX2?: number; start: number; duration: number };
  reshape?: { toAt?: Vec2; toWidth?: number; toHeight?: number; toRadius?: number; start: number; duration: number };
  count?: { fromValue?: number; toValue?: number; start: number; duration: number };
}

// timeScale stretches every step's start/duration so the authored timeline
// fills the actual narration length (scaling here keeps the framer transitions
// and the clock-driven components consistent, since both read these times).
function planFor(steps: AnimationStep[], timeScale = 1): MotionPlan {
  const plan: MotionPlan = { initialOpacity: 1 };
  const k = timeScale > 0 ? timeScale : 1;
  for (const raw of steps) {
    const s = { ...raw, start: raw.start * k, duration: raw.duration * k };
    if (s.type === "fadeIn") {
      plan.initialOpacity = 0;
      plan.fadeIn = { start: s.start, duration: s.duration };
    } else if (s.type === "fadeOut") {
      plan.fadeOut = { start: s.start, duration: s.duration };
    } else if (s.type === "draw") {
      plan.draw = { start: s.start, duration: s.duration };
    } else if (s.type === "move" && s.to) {
      plan.move = { to: s.to, start: s.start, duration: s.duration };
    } else if (s.type === "highlight") {
      plan.highlight = { start: s.start, duration: s.duration, color: s.color };
    } else if (s.type === "transform" && s.toLatex) {
      plan.transform = { toLatex: s.toLatex, start: s.start, duration: s.duration };
    } else if (s.type === "morph" && s.toExpr) {
      plan.morph = { toExpr: s.toExpr, toDomain: s.toDomain, start: s.start, duration: s.duration };
    } else if (s.type === "trace" && s.plotId) {
      plan.trace = { plotId: s.plotId, fromX: s.fromX, toX: s.toX, fromT: s.fromT, toT: s.toT, start: s.start, duration: s.duration };
    } else if (s.type === "emphasize") {
      plan.emphasize = { scaleTo: s.scaleTo ?? 1.3, color: s.color, start: s.start, duration: s.duration };
    } else if (s.type === "slide") {
      plan.slide = { toX1: s.toX1, toX2: s.toX2, start: s.start, duration: s.duration };
    } else if (s.type === "reshape") {
      plan.reshape = { toAt: s.toAt, toWidth: s.toWidth, toHeight: s.toHeight, toRadius: s.toRadius, start: s.start, duration: s.duration };
    } else if (s.type === "count") {
      plan.count = { fromValue: s.fromValue, toValue: s.toValue, start: s.start, duration: s.duration };
    }
  }
  return plan;
}

function continuityPlanFor(steps: AnimationStep[] | undefined, timeScale = 1): MotionPlan {
  const plan = planFor(steps ?? [], timeScale);
  const k = timeScale > 0 ? timeScale : 1;
  const fadeStartsAtZero = plan.fadeIn !== undefined && plan.fadeIn.start <= 0.05 * k;
  const drawStartsAtZero = plan.draw !== undefined && plan.draw.start <= 0.05 * k;
  if (fadeStartsAtZero || drawStartsAtZero) {
    // The pre-armed hold frame already made time-zero objects visible. Keep
    // them visible when the live clock starts so continuity beats do not blink
    // to black just to replay an entry animation.
    plan.initialOpacity = 1;
    if (fadeStartsAtZero) plan.fadeIn = undefined;
    if (drawStartsAtZero) plan.draw = undefined;
  }
  return plan;
}

function stepsByTarget(timeline: AnimationStep[]): Map<string, AnimationStep[]> {
  const map = new Map<string, AnimationStep[]>();
  for (const s of timeline) {
    const list = map.get(s.targetId);
    if (list) list.push(s);
    else map.set(s.targetId, [s]);
  }
  return map;
}

function entersAtStart(steps: AnimationStep[] | undefined) {
  if (!steps || steps.length === 0) return true;
  const entry = steps.filter((s) => s.type === "fadeIn" || s.type === "draw");
  if (entry.length === 0) return true;
  return Math.min(...entry.map((s) => s.start)) <= 0.05;
}

function attentionColor(plan: MotionPlan) {
  return plan.highlight?.color ?? plan.emphasize?.color;
}

function attentionFilter(plan: MotionPlan) {
  return plan.highlight || plan.emphasize ? "url(#lumen-attention-glow)" : undefined;
}

function strokeAttention(base: number, plan: MotionPlan) {
  if (plan.highlight) {
    return {
      animate: [base, base * 2.2, base],
      transition: { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.45, 1] },
    };
  }
  if (plan.emphasize) {
    return {
      animate: base * 1.55,
      transition: { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE },
    };
  }
  return { animate: base, transition: { duration: 0 } };
}

function pushOpacityKeyframe(times: number[], values: number[], total: number, time: number, value: number) {
  const t = clamp01(time / Math.max(0.001, total));
  const last = times[times.length - 1];
  if (last !== undefined && Math.abs(last - t) < 1e-6) {
    values[values.length - 1] = value;
    return;
  }
  times.push(t);
  values.push(value);
}

function opacityMotion(plan: MotionPlan, entry?: { start: number; duration: number }) {
  const enter = entry ?? plan.fadeIn ?? plan.draw;
  const initial = enter ? 0 : plan.initialOpacity;
  if (!plan.fadeOut) {
    return {
      initial,
      animate: 1,
      transition: enter ? { duration: enter.duration, delay: enter.start, ease: EASE } : { duration: 0 },
    };
  }
  const total = Math.max(0.001, plan.fadeOut.start + plan.fadeOut.duration);
  const times: number[] = [];
  const values: number[] = [];
  if (enter) {
    pushOpacityKeyframe(times, values, total, 0, 0);
    pushOpacityKeyframe(times, values, total, enter.start, 0);
    pushOpacityKeyframe(times, values, total, enter.start + enter.duration, 1);
  } else {
    pushOpacityKeyframe(times, values, total, 0, initial);
  }
  pushOpacityKeyframe(times, values, total, plan.fadeOut.start, 1);
  pushOpacityKeyframe(times, values, total, plan.fadeOut.start + plan.fadeOut.duration, 0);
  return {
    initial: values[0] ?? initial,
    animate: values,
    transition: { duration: total, ease: [0, 0, 1, 1] as const, times },
  };
}

// Sample a compiled function to an SVG path (breaks the path on non-finite y).
function plotPath(fn: (x: number) => number, domain: [number, number], n: number, view?: View): string {
  let d = "";
  let pen = false;
  for (let i = 0; i <= n; i++) {
    const x = domain[0] + ((domain[1] - domain[0]) * i) / n;
    const y = fn(x);
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    const p = worldToPx(view, { x, y });
    d += `${pen ? "L" : "M"} ${clampCoord(p.x).toFixed(2)} ${clampCoord(p.y).toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

// Interpolate between two curves at factor p (0 = A, 1 = B) — the morph.
function morphPath(
  fnA: (x: number) => number,
  domA: [number, number],
  fnB: (x: number) => number,
  domB: [number, number],
  p: number,
  n: number,
  view?: View,
): string {
  let d = "";
  let pen = false;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const xA = domA[0] + (domA[1] - domA[0]) * u;
    const xB = domB[0] + (domB[1] - domB[0]) * u;
    const yA = fnA(xA);
    const yB = fnB(xB);
    if (!Number.isFinite(yA) || !Number.isFinite(yB)) {
      pen = false;
      continue;
    }
    const q = worldToPx(view, { x: lerp(xA, xB, p), y: lerp(yA, yB, p) });
    d += `${pen ? "L" : "M"} ${clampCoord(q.x).toFixed(2)} ${clampCoord(q.y).toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

// ---------------------------------------------------------------------------
// SVG geometry objects
// ---------------------------------------------------------------------------

// A round tick step (1/2/5 × 10ⁿ) that yields ~`target` ticks across `span`.
function niceStep(span: number, target = 8): number {
  if (!(span > 0)) return 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag; // 1..10
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
}

// Use the model's `step` only if it produces a sane number of ticks for THIS
// axis; otherwise pick a nice step. A single shared step can't suit both a
// small x-range and a large y-range, which is what garbled the y-axis labels.
function axisStep(span: number, hint?: number): number {
  if (hint && hint > 0 && span / hint <= 14) return hint;
  return niceStep(span);
}

function Axes({ obj, plan, view }: { obj: AxesObject; plan: MotionPlan; view?: View }) {
  const color = obj.color ?? COLORS.axis;
  const [x0, x1] = obj.xRange;
  const [y0, y1] = obj.yRange;
  const xStep = axisStep(Math.abs(x1 - x0), obj.step);
  const yStep = axisStep(Math.abs(y1 - y0), obj.step);

  const xA = worldToPx(view, { x: x0, y: 0 });
  const xB = worldToPx(view, { x: x1, y: 0 });
  const yA = worldToPx(view, { x: 0, y: y0 });
  const yB = worldToPx(view, { x: 0, y: y1 });

  const ticks: { v: number; axis: "x" | "y" }[] = [];
  for (let v = Math.ceil(x0 / xStep) * xStep; v <= x1 + 1e-9 && ticks.length < 40; v += xStep) {
    if (Math.abs(v) > 1e-9) ticks.push({ v: +v.toFixed(6), axis: "x" });
  }
  for (let v = Math.ceil(y0 / yStep) * yStep; v <= y1 + 1e-9 && ticks.length < 80; v += yStep) {
    if (Math.abs(v) > 1e-9) ticks.push({ v: +v.toFixed(6), axis: "y" });
  }

  const drawTransition = plan.draw ? { duration: plan.draw.duration, delay: plan.draw.start, ease: EASE } : { duration: 0 };
  const groupOpacity = opacityMotion(plan, plan.fadeIn ?? plan.draw);
  const emphasizedTick = (axis: "x" | "y", value: number) =>
    obj.emphasizeTicks?.find((t) => t.axis === axis && Math.abs(t.value - value) < 1e-6);

  return (
    <motion.g initial={{ opacity: groupOpacity.initial }} animate={{ opacity: groupOpacity.animate }} transition={{ opacity: groupOpacity.transition }}>
      {obj.showGrid &&
        ticks.map((t, i) => {
          const a = t.axis === "x" ? worldToPx(view, { x: t.v, y: y0 }) : worldToPx(view, { x: x0, y: t.v });
          const b = t.axis === "x" ? worldToPx(view, { x: t.v, y: y1 }) : worldToPx(view, { x: x1, y: t.v });
          return <line key={`g${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.grid} strokeWidth={0.8} opacity={0.3} />;
        })}

      <motion.path d={`M ${xA.x} ${xA.y} L ${xB.x} ${xB.y}`} stroke={color} strokeWidth={2.5} fill="none" initial={plan.draw ? { pathLength: 0 } : false} animate={plan.draw ? { pathLength: 1 } : undefined} transition={{ pathLength: drawTransition }} />
      <motion.path d={`M ${yA.x} ${yA.y} L ${yB.x} ${yB.y}`} stroke={color} strokeWidth={2.5} fill="none" initial={plan.draw ? { pathLength: 0 } : false} animate={plan.draw ? { pathLength: 1 } : undefined} transition={{ pathLength: drawTransition }} />

      {ticks.map((t, i) => {
        const p = t.axis === "x" ? worldToPx(view, { x: t.v, y: 0 }) : worldToPx(view, { x: 0, y: t.v });
        const mark = emphasizedTick(t.axis, t.v);
        const tickColor = mark?.color ?? color;
        const tickLabel = mark?.label ?? String(t.v);
        const labelSize = mark ? 26 : 18;
        return (
          <g key={`t${i}`}>
            {t.axis === "x" ? (
              <line x1={p.x} y1={p.y - (mark ? 12 : 6)} x2={p.x} y2={p.y + (mark ? 12 : 6)} stroke={tickColor} strokeWidth={mark ? 4 : 2} />
            ) : (
              <line x1={p.x - (mark ? 12 : 6)} y1={p.y} x2={p.x + (mark ? 12 : 6)} y2={p.y} stroke={tickColor} strokeWidth={mark ? 4 : 2} />
            )}
            {mark && <circle cx={p.x} cy={p.y} r={7} fill={tickColor} opacity={0.28} />}
            <text
              x={t.axis === "x" ? p.x : p.x - 12}
              y={t.axis === "x" ? p.y + (mark ? 34 : 26) : p.y + 5}
              fill={mark ? tickColor : COLORS.tick}
              fontSize={labelSize}
              fontWeight={mark ? 800 : 400}
              textAnchor={t.axis === "x" ? "middle" : "end"}
              fontFamily={BOARD_FONT}
              paintOrder="stroke"
              stroke={mark ? "#000000" : "none"}
              strokeWidth={mark ? 5 : 0}
            >
              {tickLabel}
            </text>
          </g>
        );
      })}

      {obj.xLabel && (
        <text x={xB.x - 10} y={xB.y + 30} fill={color} fontSize={24} textAnchor="end" fontFamily={BOARD_FONT}>
          {obj.xLabel}
        </text>
      )}
      {obj.yLabel && (
        <text x={yB.x + 14} y={yB.y + 26} fill={color} fontSize={24} textAnchor="start" fontFamily={BOARD_FONT}>
          {obj.yLabel}
        </text>
      )}
    </motion.g>
  );
}

function StaticPlot({ obj, plan, view }: { obj: FunctionPlotObject; plan: MotionPlan; view?: View }) {
  const d = useMemo(() => {
    const fn = compileExpr(obj.expr);
    if (!fn) return "";
    return plotPath(fn, obj.domain, Math.max(2, Math.min(400, obj.samples ?? 200)), view);
  }, [obj.expr, obj.domain, obj.samples, view]);

  if (!d) return null;

  const t = plan.draw
    ? { duration: plan.draw.duration, delay: plan.draw.start, ease: EASE }
    : plan.fadeIn
      ? { duration: plan.fadeIn.duration, delay: plan.fadeIn.start, ease: EASE }
      : { duration: 0 };
  const op = opacityMotion(plan, plan.draw ?? plan.fadeIn);

  return (
    <motion.path
      d={d}
      stroke={attentionColor(plan) ?? obj.color ?? COLORS.curve}
      strokeWidth={obj.width ?? 3}
      filter={attentionFilter(plan)}
      strokeDasharray={obj.dash?.join(" ")}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={plan.draw ? { pathLength: 0, opacity: op.initial } : { opacity: op.initial }}
      animate={plan.draw ? { pathLength: 1, opacity: op.animate, strokeWidth: strokeAttention(obj.width ?? 3, plan).animate } : { opacity: op.animate, strokeWidth: strokeAttention(obj.width ?? 3, plan).animate }}
      transition={
        plan.draw
          ? { pathLength: t, opacity: op.transition, strokeWidth: strokeAttention(obj.width ?? 3, plan).transition }
          : { opacity: op.transition, strokeWidth: strokeAttention(obj.width ?? 3, plan).transition }
      }
    />
  );
}

function pathMotion(plan: MotionPlan, width: number) {
  const t = plan.draw
    ? { duration: plan.draw.duration, delay: plan.draw.start, ease: EASE }
    : plan.fadeIn
      ? { duration: plan.fadeIn.duration, delay: plan.fadeIn.start, ease: EASE }
      : { duration: 0 };
  const op = opacityMotion(plan, plan.draw ?? plan.fadeIn);
  return { t, op, stroke: strokeAttention(width, plan) };
}

function ParametricCurve({ obj, plan, view }: { obj: ParametricObject; plan: MotionPlan; view?: View }) {
  const d = useMemo(() => pointsToSvgD(view, sampleParametricPoints(obj, Math.max(2, Math.min(400, obj.samples ?? 200))), obj.close ?? false), [obj, view]);
  if (!d) return null;
  const width = obj.width ?? 3;
  const pathAnim = pathMotion(plan, width);
  return (
    <motion.path
      d={d}
      stroke={attentionColor(plan) ?? obj.color ?? COLORS.curve}
      strokeWidth={width}
      filter={attentionFilter(plan)}
      strokeDasharray={obj.dash?.join(" ")}
      fill={obj.fill ?? "none"}
      opacity={obj.opacity ?? 1}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={plan.draw ? { pathLength: 0, opacity: pathAnim.op.initial } : { opacity: pathAnim.op.initial }}
      animate={plan.draw ? { pathLength: 1, opacity: pathAnim.op.animate, strokeWidth: pathAnim.stroke.animate } : { opacity: pathAnim.op.animate, strokeWidth: pathAnim.stroke.animate }}
      transition={plan.draw ? { pathLength: pathAnim.t, opacity: pathAnim.op.transition, strokeWidth: pathAnim.stroke.transition } : { opacity: pathAnim.op.transition, strokeWidth: pathAnim.stroke.transition }}
    />
  );
}

function PathLike({ obj, plan, view }: { obj: PathObject | PolygonObject | PolylineObject; plan: MotionPlan; view?: View }) {
  const d = useMemo(() => {
    if (obj.type === "path") return pathToSvgD(view, obj);
    return pointsToSvgD(view, polygonPoints(obj), obj.type === "polygon");
  }, [obj, view]);
  if (!d) return null;
  const width = obj.strokeWidth ?? 3;
  const pathAnim = pathMotion(plan, width);
  const isPolyline = obj.type === "polyline";
  return (
    <motion.path
      d={d}
      stroke={attentionColor(plan) ?? obj.stroke ?? COLORS.curve}
      strokeWidth={width}
      filter={attentionFilter(plan)}
      strokeDasharray={obj.dash?.join(" ")}
      fill={isPolyline ? "none" : obj.fill ?? "none"}
      opacity={obj.opacity ?? 1}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={plan.draw ? { pathLength: 0, opacity: pathAnim.op.initial } : { opacity: pathAnim.op.initial }}
      animate={plan.draw ? { pathLength: 1, opacity: pathAnim.op.animate, strokeWidth: pathAnim.stroke.animate } : { opacity: pathAnim.op.animate, strokeWidth: pathAnim.stroke.animate }}
      transition={plan.draw ? { pathLength: pathAnim.t, opacity: pathAnim.op.transition, strokeWidth: pathAnim.stroke.transition } : { opacity: pathAnim.op.transition, strokeWidth: pathAnim.stroke.transition }}
    />
  );
}

// Clock-driven: the curve continuously reshapes expr -> toExpr.
function MorphPlot({ obj, plan, view, clock }: { obj: FunctionPlotObject; plan: MotionPlan; view?: View; clock: MotionValue<number> }) {
  const morph = plan.morph!;
  const fnA = useMemo(() => compileExpr(obj.expr), [obj.expr]);
  const fnB = useMemo(() => compileExpr(morph.toExpr), [morph.toExpr]);
  const n = Math.max(2, Math.min(160, obj.samples ?? 140));
  const domB = morph.toDomain ?? obj.domain;

  const d = useTransform(clock, (ms) => {
    if (!fnA || !fnB) return "";
    const p = easeInOut(clamp01((ms / 1000 - morph.start) / Math.max(0.001, morph.duration)));
    return morphPath(fnA, obj.domain, fnB, domB, p, n, view);
  });

  if (!fnA || !fnB) return null;
  const op = opacityMotion(plan);

  return (
    <motion.path
      d={d}
      stroke={attentionColor(plan) ?? obj.color ?? COLORS.curve}
      strokeWidth={obj.width ?? 3}
      filter={attentionFilter(plan)}
      strokeDasharray={obj.dash?.join(" ")}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ opacity: op.initial }}
      animate={{ opacity: op.animate }}
      transition={{ opacity: op.transition }}
    />
  );
}

function StaticDot({ obj, plan, view }: { obj: DotObject; plan: MotionPlan; view?: View }) {
  const base = worldToPx(view, obj.at);
  const target = plan.move ? worldToPx(view, plan.move.to) : base;
  const r = obj.radius ?? 7;
  const op = opacityMotion(plan, plan.draw ?? plan.fadeIn);

  const initial: Record<string, number> = { opacity: op.initial, x: 0, y: 0 };
  const animate: Record<string, number | number[]> = { opacity: op.animate, x: 0, y: 0 };
  const transition: Record<string, object> = {
    opacity: op.transition,
  };

  if (plan.draw && !plan.highlight) {
    initial.scale = 0;
    animate.scale = 1;
    transition.scale = { duration: plan.draw.duration, delay: plan.draw.start, ease: EASE };
  }
  if (plan.highlight) {
    animate.scale = [1, 1.6, 1];
    transition.scale = { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.5, 1] };
  }
  if (plan.move) {
    animate.x = target.x - base.x;
    animate.y = target.y - base.y;
    transition.x = { duration: plan.move.duration, delay: plan.move.start, ease: EASE };
    transition.y = { duration: plan.move.duration, delay: plan.move.start, ease: EASE };
  }
  if (plan.emphasize) {
    animate.scale = plan.emphasize.scaleTo;
    transition.scale = { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE };
  }

  const tint = plan.emphasize?.color ?? obj.color ?? COLORS.dot;
  // Hollow ring = an OPEN circle (a hole / excluded point at a discontinuity);
  // solid disc = an included point.
  const hollow = obj.filled === false;

  return (
    <motion.g initial={initial} animate={animate} transition={transition} style={{ transformOrigin: `${base.x}px ${base.y}px`, transformBox: "view-box" }}>
      <circle
        cx={base.x}
        cy={base.y}
        r={r}
        filter={attentionFilter(plan)}
        fill={hollow ? "#000000" : tint}
        stroke={hollow ? tint : "none"}
        strokeWidth={hollow ? 3 : 0}
      />
    </motion.g>
  );
}

// Shared circle markup for the clock-driven tracing dots.
function TracedCircle({ obj, plan, cx, cy }: { obj: DotObject; plan: MotionPlan; cx: MotionValue<number>; cy: MotionValue<number> }) {
  const r = obj.radius ?? 7;
  const op = opacityMotion(plan);
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill={attentionColor(plan) ?? obj.color ?? COLORS.dot}
      filter={attentionFilter(plan)}
      initial={{ opacity: op.initial }}
      animate={{
        opacity: op.animate,
        r: plan.highlight ? [r, r * 1.7, r] : plan.emphasize ? r * plan.emphasize.scaleTo : r,
      }}
      transition={{
        opacity: op.transition,
        r: plan.highlight
          ? { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.45, 1] }
          : plan.emphasize
            ? { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE }
            : { duration: 0 },
      }}
    />
  );
}

// Clock-driven: the dot glides ALONG a named function-plot's curve.
function TracingDot({
  obj,
  plan,
  view,
  plot,
  plotPlan,
  clock,
}: {
  obj: DotObject;
  plan: MotionPlan;
  view?: View;
  plot: FunctionPlotObject;
  plotPlan: MotionPlan;
  clock: MotionValue<number>;
}) {
  const trace = plan.trace!;
  const traceExpr = plotPlan.morph?.toExpr ?? plot.expr;
  const fn = useMemo(() => compileExpr(traceExpr), [traceExpr]);
  const fromX = trace.fromX ?? plot.domain[0];
  const toX = trace.toX ?? plot.domain[1];

  const at = useTransform(clock, (ms): Px => {
    if (!fn) return worldToPx(view, obj.at);
    const p = easeInOut(clamp01((ms / 1000 - trace.start) / Math.max(0.001, trace.duration)));
    const x = lerp(fromX, toX, p);
    return worldToPx(view, { x, y: fn(x) });
  });
  const cx = useTransform(at, (p) => clampCoord(p.x));
  const cy = useTransform(at, (p) => clampCoord(p.y));

  if (!fn) return null;
  return <TracedCircle obj={obj} plan={plan} cx={cx} cy={cy} />;
}

// Clock-driven: the dot glides ALONG any other curve in the basis — a
// parametric (t sweeps fromT→toT, default its tRange) or a path / polyline /
// polygon (arc-length fraction sweeps fromT→toT in 0..1). This is what makes a
// unit-circle point orbit instead of sitting still.
function CurveTracingDot({
  obj,
  plan,
  view,
  curve,
  clock,
}: {
  obj: DotObject;
  plan: MotionPlan;
  view?: View;
  curve: ParametricObject | PathObject | PolygonObject | PolylineObject;
  clock: MotionValue<number>;
}) {
  const trace = plan.trace!;
  // fromX/toX are accepted as aliases so a model used to function-plot tracing
  // still animates the dot instead of freezing it.
  const fromRaw = trace.fromT ?? trace.fromX;
  const toRaw = trace.toT ?? trace.toX;
  const pointAt = useMemo((): ((p: number) => Vec2 | null) | null => {
    if (curve.type === "parametric") {
      const fn = compileParametric(curve);
      if (!fn) return null;
      const from = fromRaw ?? curve.tRange[0];
      const to = toRaw ?? curve.tRange[1];
      return (p) => fn(lerp(from, to, p));
    }
    const points = traceCurvePoints(curve);
    if (!points.length) return null;
    const from = clamp01(fromRaw ?? 0);
    const to = clamp01(toRaw ?? 1);
    return (p) => pointOnPolyline(points, lerp(from, to, p));
  }, [curve, fromRaw, toRaw]);

  const at = useTransform(clock, (ms): Px => {
    if (!pointAt) return worldToPx(view, obj.at);
    const p = easeInOut(clamp01((ms / 1000 - trace.start) / Math.max(0.001, trace.duration)));
    const w = pointAt(p);
    return worldToPx(view, w && Number.isFinite(w.x) && Number.isFinite(w.y) ? w : obj.at);
  });
  const cx = useTransform(at, (p) => clampCoord(p.x));
  const cy = useTransform(at, (p) => clampCoord(p.y));

  if (!pointAt) return <StaticDot obj={obj} plan={plan} view={view} />;
  return <TracedCircle obj={obj} plan={plan} cx={cx} cy={cy} />;
}

function Arrow({ obj, plan, view }: { obj: ArrowObject; plan: MotionPlan; view?: View }) {
  const p0 = worldToPx(view, obj.from);
  const p1 = worldToPx(view, obj.to);
  const color = obj.color ?? COLORS.arrow;
  const width = obj.width ?? 3;
  const showHead = obj.head !== false;

  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const hs = 16;
  const head = `M ${p1.x} ${p1.y} L ${p1.x - hs * Math.cos(angle - 0.4)} ${p1.y - hs * Math.sin(angle - 0.4)} L ${p1.x - hs * Math.cos(angle + 0.4)} ${p1.y - hs * Math.sin(angle + 0.4)} Z`;

  const lineTransition = plan.draw
    ? { duration: plan.draw.duration, delay: plan.draw.start, ease: EASE }
    : plan.fadeIn
      ? { duration: plan.fadeIn.duration, delay: plan.fadeIn.start, ease: EASE }
      : { duration: 0 };
  const headDelay = (plan.draw?.start ?? plan.fadeIn?.start ?? 0) + (plan.draw?.duration ?? plan.fadeIn?.duration ?? 0);
  const op = opacityMotion(plan, plan.draw ?? plan.fadeIn);

  return (
    <g>
      <motion.path
        d={`M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`}
        stroke={attentionColor(plan) ?? color}
        strokeWidth={width}
        filter={attentionFilter(plan)}
        strokeDasharray={obj.dash?.join(" ")}
        fill="none"
        strokeLinecap="round"
        initial={plan.draw ? { pathLength: 0, opacity: op.initial } : { opacity: op.initial }}
        animate={plan.draw ? { pathLength: 1, opacity: op.animate, strokeWidth: strokeAttention(width, plan).animate } : { opacity: op.animate, strokeWidth: strokeAttention(width, plan).animate }}
        transition={
          plan.draw
            ? { pathLength: lineTransition, opacity: op.transition, strokeWidth: strokeAttention(width, plan).transition }
            : { opacity: op.transition, strokeWidth: strokeAttention(width, plan).transition }
        }
      />
      {showHead && (
        <motion.path
          d={head}
          fill={attentionColor(plan) ?? color}
          filter={attentionFilter(plan)}
          initial={{ opacity: plan.draw || plan.fadeIn ? 0 : op.initial }}
          animate={{ opacity: plan.fadeOut ? op.animate : 1 }}
          transition={{ opacity: plan.fadeOut ? op.transition : { duration: 0.25, delay: headDelay, ease: EASE } }}
        />
      )}
    </g>
  );
}

function braceNormal(side: BraceObject["side"] | undefined, p0: Px, p1: Px) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  if (side === "left") return { x: -1, y: 0 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "above") return { x: 0, y: -1 };
  if (side === "below") return { x: 0, y: 1 };
  return { x: -uy, y: ux };
}

function bracePath(p0: Px, p1: Px, side: BraceObject["side"] | undefined, depth = 34) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const n = braceNormal(side, p0, p1);
  const q = (t: number, off = 0) => ({ x: p0.x + dx * t + n.x * off, y: p0.y + dy * t + n.y * off });
  const a = q(0);
  const b = q(0.23, depth);
  const c = q(0.43, depth);
  const m1 = q(0.5, depth * 0.25);
  const m = q(0.5, 0);
  const m2 = q(0.5, depth * 0.25);
  const d = q(0.57, depth);
  const e = q(0.77, depth);
  const f = q(1);
  const hook = Math.min(22, len * 0.08);
  const h0 = { x: a.x + ux * hook, y: a.y + uy * hook };
  const h1 = { x: f.x - ux * hook, y: f.y - uy * hook };
  return [
    `M ${a.x.toFixed(2)} ${a.y.toFixed(2)}`,
    `C ${h0.x.toFixed(2)} ${h0.y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}, ${c.x.toFixed(2)} ${c.y.toFixed(2)}`,
    `C ${m1.x.toFixed(2)} ${m1.y.toFixed(2)}, ${m2.x.toFixed(2)} ${m2.y.toFixed(2)}, ${m.x.toFixed(2)} ${m.y.toFixed(2)}`,
    `C ${m2.x.toFixed(2)} ${m2.y.toFixed(2)}, ${d.x.toFixed(2)} ${d.y.toFixed(2)}, ${e.x.toFixed(2)} ${e.y.toFixed(2)}`,
    `C ${e.x.toFixed(2)} ${e.y.toFixed(2)}, ${h1.x.toFixed(2)} ${h1.y.toFixed(2)}, ${f.x.toFixed(2)} ${f.y.toFixed(2)}`,
  ].join(" ");
}

function Brace({ obj, plan, view }: { obj: BraceObject; plan: MotionPlan; view?: View }) {
  const p0 = worldToPx(view, obj.from);
  const p1 = worldToPx(view, obj.to);
  const width = obj.width ?? 3;
  const color = attentionColor(plan) ?? obj.color ?? COLORS.arrow;
  const d = bracePath(p0, p1, obj.side);
  const op = opacityMotion(plan, plan.draw ?? plan.fadeIn);
  const n = braceNormal(obj.side, p0, p1);
  const labelP = {
    x: (p0.x + p1.x) / 2 + n.x * (obj.labelOffset ?? 58),
    y: (p0.y + p1.y) / 2 + n.y * (obj.labelOffset ?? 58),
  };

  return (
    <motion.g initial={{ opacity: op.initial }} animate={{ opacity: op.animate }} transition={{ opacity: op.transition }}>
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={width}
        filter={attentionFilter(plan)}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={plan.draw ? { pathLength: 0 } : false}
        animate={plan.draw ? { pathLength: 1, strokeWidth: strokeAttention(width, plan).animate } : { strokeWidth: strokeAttention(width, plan).animate }}
        transition={plan.draw ? { pathLength: { duration: plan.draw.duration, delay: plan.draw.start, ease: EASE }, strokeWidth: strokeAttention(width, plan).transition } : { strokeWidth: strokeAttention(width, plan).transition }}
      />
      {obj.label && (
        <text
          x={labelP.x}
          y={labelP.y}
          fill={color}
          fontSize={obj.fontSize ?? 26}
          fontFamily={BOARD_FONT}
          textAnchor="middle"
          dominantBaseline="middle"
          paintOrder="stroke"
          stroke="#000000"
          strokeWidth={5}
        >
          {obj.label}
        </text>
      )}
    </motion.g>
  );
}

// Clock-driven secant/tangent: a line riding on a curve at x1,x2 whose
// endpoints can slide along the curve (slide x2 toward x1 -> tangent).
function SecantLine({
  obj,
  plan,
  view,
  plot,
  clock,
}: {
  obj: SecantLineObject;
  plan: MotionPlan;
  view?: View;
  plot: FunctionPlotObject;
  clock: MotionValue<number>;
}) {
  const fn = useMemo(() => compileExpr(plot.expr), [plot.expr]);
  const color = plan.emphasize?.color ?? obj.color ?? COLORS.arrow;
  const width = obj.width ?? 3;
  const extend = obj.extend ?? 0;
  const slide = plan.slide;
  const x1to = slide?.toX1 ?? obj.x1;
  const x2to = slide?.toX2 ?? obj.x2;

  const d = useTransform(clock, (ms) => {
    if (!fn) return "";
    const p = slide ? easeInOut(clamp01((ms / 1000 - slide.start) / Math.max(0.001, slide.duration))) : 0;
    const ax = lerp(obj.x1, x1to, p);
    const bx = lerp(obj.x2, x2to, p);
    const ay = fn(ax);
    const by = fn(bx);
    if (!Number.isFinite(ay) || !Number.isFinite(by)) return "";

    // Slope: chord slope, or a numerical derivative when the points coincide
    // (so a fully-collapsed secant still shows as a proper tangent line).
    let slope: number;
    if (Math.abs(bx - ax) < 1e-4) {
      const h = 1e-3;
      slope = (fn(ax + h) - fn(ax - h)) / (2 * h);
    } else {
      slope = (by - ay) / (bx - ax);
    }
    if (!Number.isFinite(slope)) return "";

    const half = extend > 0 ? extend : Math.abs(bx - ax) < 1e-4 ? 1 : 0;
    const X1 = ax - half;
    const Y1 = ay - slope * half;
    const X2 = bx + half;
    const Y2 = by + slope * half;
    const pa = worldToPx(view, { x: X1, y: Y1 });
    const pb = worldToPx(view, { x: X2, y: Y2 });
    return `M ${clampCoord(pa.x).toFixed(2)} ${clampCoord(pa.y).toFixed(2)} L ${clampCoord(pb.x).toFixed(2)} ${clampCoord(pb.y).toFixed(2)}`;
  });

  if (!fn) return null;

  const opacityTransition = plan.fadeIn
    ? { duration: plan.fadeIn.duration, delay: plan.fadeIn.start, ease: EASE }
    : plan.draw
      ? { duration: plan.draw.duration, delay: plan.draw.start, ease: EASE }
      : { duration: 0 };
  const op = opacityMotion(plan, plan.fadeIn ?? plan.draw);

  return (
    <motion.path
      d={d}
      stroke={color}
      strokeWidth={width}
      filter={attentionFilter(plan)}
      strokeDasharray={obj.dash?.join(" ")}
      fill="none"
      strokeLinecap="round"
      initial={{ opacity: op.initial }}
      animate={{ opacity: op.animate, strokeWidth: strokeAttention(width, plan).animate }}
      transition={{ opacity: plan.fadeOut ? op.transition : opacityTransition, strokeWidth: strokeAttention(width, plan).transition }}
    />
  );
}

function worldScaleX(view?: View) {
  const a = worldToPx(view, { x: 0, y: 0 });
  const b = worldToPx(view, { x: 1, y: 0 });
  return Math.abs(b.x - a.x);
}

function groupMotion(base: Px, plan: MotionPlan, view?: View) {
  const op = opacityMotion(plan, plan.draw ?? plan.fadeIn);
  const initial: Record<string, number> = {
    opacity: op.initial,
    x: 0,
    y: 0,
    scale: plan.draw ? 0.96 : 1,
  };
  const animate: Record<string, number | number[]> = {
    opacity: op.animate,
    x: 0,
    y: 0,
    scale: plan.highlight ? [1, 1.08, 1] : 1,
  };
  const transition: Record<string, object> = {
    opacity: op.transition,
    scale: plan.highlight
      ? { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.5, 1] }
      : plan.draw
        ? { duration: plan.draw.duration, delay: plan.draw.start, ease: EASE }
        : { duration: 0 },
  };

  if (plan.move) {
    const target = worldToPx(view, plan.move.to);
    animate.x = target.x - base.x;
    animate.y = target.y - base.y;
    transition.x = { duration: plan.move.duration, delay: plan.move.start, ease: EASE };
    transition.y = { duration: plan.move.duration, delay: plan.move.start, ease: EASE };
  }
  if (plan.emphasize) {
    // Holds at 1 until the delay, then grows to scaleTo and stays there.
    animate.scale = plan.emphasize.scaleTo;
    transition.scale = { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE };
  }

  return {
    initial,
    animate,
    transition,
    style: { transformOrigin: `${base.x}px ${base.y}px`, transformBox: "view-box" as const },
  };
}

// Pixel rect attributes for a world-space box (center, size, corner radius).
function boxRect(view: View | undefined, at: Vec2, w: number, h: number, r: number) {
  const tl = worldToPx(view, { x: at.x - w / 2, y: at.y + h / 2 });
  const br = worldToPx(view, { x: at.x + w / 2, y: at.y - h / 2 });
  const width = Math.abs(br.x - tl.x);
  const height = Math.abs(br.y - tl.y);
  const rx = Math.min(r * worldScaleX(view), width / 2, height / 2);
  return { x: Math.min(tl.x, br.x), y: Math.min(tl.y, br.y), width, height, rx };
}

function Box({ obj, plan, view, clock }: { obj: BoxObject; plan: MotionPlan; view?: View; clock: MotionValue<number> }) {
  const base = worldToPx(view, obj.at);
  const motionProps = groupMotion(base, plan, view);

  const reshape = plan.reshape;
  const baseR = obj.radius ?? 0.15;
  const toAt = reshape?.toAt ?? obj.at;
  const toW = reshape?.toWidth ?? obj.width;
  const toH = reshape?.toHeight ?? obj.height;
  const toR = reshape?.toRadius ?? baseR;

  // Clock-driven so the box can resize / round into a circle over time.
  const attrs = useTransform(clock, (ms) => {
    if (!reshape) return boxRect(view, obj.at, obj.width, obj.height, baseR);
    const p = easeInOut(clamp01((ms / 1000 - reshape.start) / Math.max(0.001, reshape.duration)));
    return boxRect(
      view,
      { x: lerp(obj.at.x, toAt.x, p), y: lerp(obj.at.y, toAt.y, p) },
      lerp(obj.width, toW, p),
      lerp(obj.height, toH, p),
      lerp(baseR, toR, p),
    );
  });
  const x = useTransform(attrs, (a) => a.x);
  const y = useTransform(attrs, (a) => a.y);
  const width = useTransform(attrs, (a) => a.width);
  const height = useTransform(attrs, (a) => a.height);
  const rx = useTransform(attrs, (a) => a.rx);

  return (
    <motion.g {...motionProps}>
      <motion.rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={rx}
        fill={obj.fill ?? COLORS.panel}
        stroke={plan.emphasize?.color ?? obj.stroke ?? COLORS.panelStroke}
        strokeWidth={obj.strokeWidth ?? 2}
        filter={attentionFilter(plan)}
        opacity={obj.opacity ?? 1}
      />
    </motion.g>
  );
}

function CarIcon({ size, color, secondaryColor }: { size: number; color: string; secondaryColor: string }) {
  const s = size;
  return (
    <g>
      <path d={`M ${-0.36 * s} ${0.08 * s} L ${-0.23 * s} ${-0.12 * s} L ${0.16 * s} ${-0.12 * s} L ${0.34 * s} ${0.08 * s} Z`} fill={color} />
      <rect x={-0.44 * s} y={0.03 * s} width={0.88 * s} height={0.26 * s} rx={0.08 * s} fill={color} />
      <path d={`M ${-0.16 * s} ${-0.08 * s} H ${0.12 * s} L ${0.24 * s} ${0.04 * s} H ${-0.25 * s} Z`} fill={secondaryColor} opacity={0.8} />
      <circle cx={-0.25 * s} cy={0.29 * s} r={0.1 * s} fill="#000000" stroke={secondaryColor} strokeWidth={0.03 * s} />
      <circle cx={0.25 * s} cy={0.29 * s} r={0.1 * s} fill="#000000" stroke={secondaryColor} strokeWidth={0.03 * s} />
    </g>
  );
}

function SpeedometerIcon({ size, color, secondaryColor }: { size: number; color: string; secondaryColor: string }) {
  const s = size;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M ${-0.36 * s} ${0.18 * s} A ${0.42 * s} ${0.42 * s} 0 0 1 ${0.36 * s} ${0.18 * s}`} stroke={color} strokeWidth={0.07 * s} />
      <path d={`M 0 ${0.16 * s} L ${0.22 * s} ${-0.12 * s}`} stroke={secondaryColor} strokeWidth={0.06 * s} />
      <circle cx="0" cy={0.16 * s} r={0.055 * s} fill={secondaryColor} stroke="none" />
      <path d={`M ${-0.28 * s} ${0.08 * s} L ${-0.34 * s} ${0.03 * s} M ${0} ${-0.23 * s} L ${0} ${-0.32 * s} M ${0.28 * s} ${0.08 * s} L ${0.34 * s} ${0.03 * s}`} stroke={color} strokeWidth={0.035 * s} />
    </g>
  );
}

function CameraIcon({ size, color, secondaryColor }: { size: number; color: string; secondaryColor: string }) {
  const s = size;
  return (
    <g>
      <rect x={-0.4 * s} y={-0.23 * s} width={0.8 * s} height={0.55 * s} rx={0.08 * s} fill={color} />
      <rect x={-0.2 * s} y={-0.34 * s} width={0.34 * s} height={0.16 * s} rx={0.04 * s} fill={color} />
      <circle cx="0" cy={0.04 * s} r={0.18 * s} fill="#000000" stroke={secondaryColor} strokeWidth={0.055 * s} />
      <circle cx={0.27 * s} cy={-0.11 * s} r={0.045 * s} fill={secondaryColor} />
    </g>
  );
}

function ClockIcon({ size, color, secondaryColor, stopwatch = false }: { size: number; color: string; secondaryColor: string; stopwatch?: boolean }) {
  const s = size;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {stopwatch && <path d={`M ${-0.12 * s} ${-0.48 * s} H ${0.12 * s} M 0 ${-0.48 * s} V ${-0.37 * s}`} stroke={secondaryColor} strokeWidth={0.055 * s} />}
      <circle cx="0" cy="0" r={0.36 * s} stroke={color} strokeWidth={0.07 * s} />
      <path d={`M 0 0 V ${-0.19 * s} M 0 0 L ${0.16 * s} ${0.1 * s}`} stroke={secondaryColor} strokeWidth={0.055 * s} />
    </g>
  );
}

function PersonIcon({ size, color, secondaryColor }: { size: number; color: string; secondaryColor: string }) {
  const s = size;
  return (
    <g>
      <circle cx="0" cy={-0.24 * s} r={0.14 * s} fill={secondaryColor} />
      <path d={`M ${-0.28 * s} ${0.34 * s} C ${-0.22 * s} ${0.06 * s}, ${0.22 * s} ${0.06 * s}, ${0.28 * s} ${0.34 * s} Z`} fill={color} />
    </g>
  );
}

function PiPersonIcon({ size, color, secondaryColor }: { size: number; color: string; secondaryColor: string }) {
  const s = size;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M ${-0.34 * s} ${-0.28 * s} H ${0.34 * s}`} stroke={color} strokeWidth={0.1 * s} />
      <path d={`M ${-0.22 * s} ${-0.25 * s} V ${0.32 * s}`} stroke={color} strokeWidth={0.1 * s} />
      <path d={`M ${0.22 * s} ${-0.25 * s} V ${0.32 * s}`} stroke={color} strokeWidth={0.1 * s} />
      <circle cx={-0.12 * s} cy={-0.39 * s} r={0.055 * s} fill="#f8fafc" stroke="none" />
      <circle cx={0.1 * s} cy={-0.39 * s} r={0.055 * s} fill="#f8fafc" stroke="none" />
      <circle cx={-0.105 * s} cy={-0.385 * s} r={0.022 * s} fill="#000000" stroke="none" />
      <circle cx={0.115 * s} cy={-0.385 * s} r={0.022 * s} fill="#000000" stroke="none" />
      <path d={`M ${-0.15 * s} ${0.32 * s} C ${-0.24 * s} ${0.5 * s}, ${-0.34 * s} ${0.5 * s}, ${-0.42 * s} ${0.34 * s}`} stroke={secondaryColor} strokeWidth={0.075 * s} />
      <path d={`M ${0.15 * s} ${0.32 * s} C ${0.24 * s} ${0.5 * s}, ${0.34 * s} ${0.5 * s}, ${0.42 * s} ${0.34 * s}`} stroke={secondaryColor} strokeWidth={0.075 * s} />
    </g>
  );
}

function Icon({ obj, plan, view }: { obj: IconObject; plan: MotionPlan; view?: View }) {
  const p = worldToPx(view, obj.at);
  const size = obj.size ?? 96;
  const color = obj.color ?? "#5cc8ff";
  const secondaryColor = obj.secondaryColor ?? "#ffd166";
  const motionProps = groupMotion(p, plan, view);

  return (
    <motion.g {...motionProps} filter={attentionFilter(plan)}>
      <g transform={`translate(${p.x} ${p.y})`}>
        {obj.name === "car" && <CarIcon size={size} color={color} secondaryColor={secondaryColor} />}
        {obj.name === "speedometer" && <SpeedometerIcon size={size} color={color} secondaryColor={secondaryColor} />}
        {obj.name === "camera" && <CameraIcon size={size} color={color} secondaryColor={secondaryColor} />}
        {obj.name === "clock" && <ClockIcon size={size} color={color} secondaryColor={secondaryColor} />}
        {obj.name === "stopwatch" && <ClockIcon size={size} color={color} secondaryColor={secondaryColor} stopwatch />}
        {obj.name === "person" && <PersonIcon size={size} color={color} secondaryColor={secondaryColor} />}
        {obj.name === "pi-person" && <PiPersonIcon size={size} color={color} secondaryColor={secondaryColor} />}
      </g>
    </motion.g>
  );
}

function insetWorldToPx(insetView: View, rect: { x: number; y: number; width: number; height: number }, p: Vec2): Px {
  const w = insetView.xMax - insetView.xMin || 1;
  const h = insetView.yMax - insetView.yMin || 1;
  return {
    x: rect.x + ((p.x - insetView.xMin) / w) * rect.width,
    y: rect.y + ((insetView.yMax - p.y) / h) * rect.height,
  };
}

function insetPlotPath(fn: (x: number) => number, domain: [number, number], n: number, insetView: View, rect: { x: number; y: number; width: number; height: number }) {
  let d = "";
  let pen = false;
  const a = Math.max(domain[0], insetView.xMin);
  const b = Math.min(domain[1], insetView.xMax);
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    const y = fn(x);
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    const p = insetWorldToPx(insetView, rect, { x, y });
    d += `${pen ? "L" : "M"} ${clampCoord(p.x).toFixed(2)} ${clampCoord(p.y).toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

function Inset({
  obj,
  plan,
  view,
  objectsById,
}: {
  obj: InsetObject;
  plan: MotionPlan;
  view?: View;
  objectsById: Map<string, SceneObject>;
}) {
  const base = worldToPx(view, obj.at);
  const motionProps = groupMotion(base, plan, view);
  const rect = boxRect(view, obj.at, obj.width, obj.height, 0.08);
  const clipId = `${obj.id}-clip`;

  return (
    <motion.g {...motionProps}>
      <defs>
        <clipPath id={clipId}>
          <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx={rect.rx} />
        </clipPath>
      </defs>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={rect.rx}
        fill={obj.fill ?? "#000000"}
        stroke={attentionColor(plan) ?? obj.stroke ?? "#94a3b8"}
        strokeWidth={obj.strokeWidth ?? 2}
        filter={attentionFilter(plan)}
        opacity={0.96}
      />
      <g clipPath={`url(#${clipId})`}>
        {obj.shows.map((id) => {
          const shown = objectsById.get(id);
          if (!shown) return null;
          if (shown.type === "function-plot") {
            const fn = compileExpr(shown.expr);
            if (!fn) return null;
            const d = insetPlotPath(fn, shown.domain, Math.max(2, Math.min(160, shown.samples ?? 120)), obj.view, rect);
            return (
              <path
                key={id}
                d={d}
                stroke={shown.color ?? COLORS.curve}
                strokeWidth={shown.width ?? 3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          }
          if (shown.type === "parametric") {
            const points = sampleParametricPoints(shown, Math.max(2, Math.min(160, shown.samples ?? 120)));
            const d = points
              .map((point, i) => {
                const p = insetWorldToPx(obj.view, rect, point);
                return `${i === 0 ? "M" : "L"} ${clampCoord(p.x).toFixed(2)} ${clampCoord(p.y).toFixed(2)}`;
              })
              .join(" ");
            return <path key={id} d={d} stroke={shown.color ?? COLORS.curve} strokeWidth={shown.width ?? 3} fill={shown.fill ?? "none"} strokeLinecap="round" strokeLinejoin="round" />;
          }
          if (shown.type === "path" || shown.type === "polygon" || shown.type === "polyline") {
            const points = shown.type === "path" ? samplePathPoints(shown, 14) : polygonPoints(shown);
            const d = points
              .map((point, i) => {
                const p = insetWorldToPx(obj.view, rect, point);
                return `${i === 0 ? "M" : "L"} ${clampCoord(p.x).toFixed(2)} ${clampCoord(p.y).toFixed(2)}`;
              })
              .join(" ");
            if (!d) return null;
            return <path key={id} d={d} stroke={shown.stroke ?? COLORS.curve} strokeWidth={shown.strokeWidth ?? 3} fill={shown.type === "polyline" ? "none" : shown.fill ?? "none"} strokeLinecap="round" strokeLinejoin="round" />;
          }
          if (shown.type === "axes") {
            const xA = insetWorldToPx(obj.view, rect, { x: shown.xRange[0], y: 0 });
            const xB = insetWorldToPx(obj.view, rect, { x: shown.xRange[1], y: 0 });
            const yA = insetWorldToPx(obj.view, rect, { x: 0, y: shown.yRange[0] });
            const yB = insetWorldToPx(obj.view, rect, { x: 0, y: shown.yRange[1] });
            return (
              <g key={id} opacity={0.7}>
                <line x1={xA.x} y1={xA.y} x2={xB.x} y2={xB.y} stroke={shown.color ?? COLORS.axis} strokeWidth={1.5} />
                <line x1={yA.x} y1={yA.y} x2={yB.x} y2={yB.y} stroke={shown.color ?? COLORS.axis} strokeWidth={1.5} />
              </g>
            );
          }
          if (shown.type === "dot") {
            const p = insetWorldToPx(obj.view, rect, shown.at);
            return <circle key={id} cx={p.x} cy={p.y} r={Math.max(4, (shown.radius ?? 7) * 0.75)} fill={shown.color ?? COLORS.dot} />;
          }
          return null;
        })}
      </g>
      {obj.label && (
        <text x={rect.x + 12} y={rect.y + 24} fill="#d8d8d8" fontSize={20} fontFamily={BOARD_FONT}>
          {obj.label}
        </text>
      )}
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// HTML overlay objects (crisp text + KaTeX), scaled to match the SVG viewBox
// ---------------------------------------------------------------------------

function anchorTransform(anchor?: "start" | "middle" | "end") {
  if (anchor === "start") return "translate(0, -50%)";
  if (anchor === "end") return "translate(-100%, -50%)";
  return "translate(-50%, -50%)";
}

function OverlayText({ obj, plan, view }: { obj: TextObject | LabelObject; plan: MotionPlan; view?: View }) {
  const p = worldToPx(view, obj.at);
  const isText = obj.type === "text";
  const baseColor = obj.color ?? COLORS.text;
  const baseWeight = isText && (obj as TextObject).weight === "bold" ? 700 : 400;
  const op = opacityMotion(plan);

  const scaleAnim = plan.emphasize ? plan.emphasize.scaleTo : plan.highlight ? [1, 1.15, 1] : 1;
  const scaleTransition = plan.emphasize
    ? { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE }
    : plan.highlight
      ? { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.5, 1] }
      : { duration: 0 };

  const animate: Record<string, number | number[] | string | string[]> = { opacity: op.animate, scale: scaleAnim };
  const transition: Record<string, object> = {
    opacity: op.transition,
    scale: scaleTransition,
  };
  if (plan.emphasize?.color) {
    animate.color = plan.emphasize.color;
    transition.color = { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE };
  } else if (plan.highlight?.color) {
    animate.color = [baseColor, plan.highlight.color, baseColor];
    transition.color = { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.45, 1] };
  }
  const glowColor = attentionColor(plan) ?? baseColor;

  return (
    <div style={{ position: "absolute", left: p.x, top: p.y, transform: anchorTransform(obj.anchor), transformOrigin: "center" }}>
      <motion.div
        initial={{ opacity: op.initial, color: baseColor }}
        animate={animate}
        transition={transition}
        style={{
          fontSize: obj.fontSize ?? (isText ? 32 : 22),
          color: baseColor,
          fontWeight: plan.emphasize ? 700 : baseWeight,
          whiteSpace: "nowrap",
          lineHeight: 1.1,
          fontFamily: BOARD_FONT,
          display: "inline-block",
          textShadow: plan.highlight || plan.emphasize ? `0 0 18px ${glowColor}, 0 0 34px ${glowColor}` : "none",
          background: obj.background ?? "transparent",
          padding: obj.background ? `${obj.padding ?? 6}px ${Math.round((obj.padding ?? 6) * 1.35)}px` : 0,
          borderRadius: obj.background ? 3 : 0,
        }}
      >
        {obj.text}
      </motion.div>
    </div>
  );
}

function OverlayEquation({ obj, plan, view }: { obj: EquationObject; plan: MotionPlan; view?: View }) {
  const p = worldToPx(view, obj.at);
  const fromHtml = useMemo(() => renderLatex(obj.latex), [obj.latex]);
  const toHtml = useMemo(() => (plan.transform ? renderLatex(plan.transform.toLatex) : ""), [plan.transform]);
  const morph = plan.transform;
  const baseColor = obj.color ?? COLORS.text;
  const glowColor = attentionColor(plan) ?? baseColor;
  const op = opacityMotion(plan);
  const scaleAnim = plan.emphasize ? plan.emphasize.scaleTo : plan.highlight ? [1, 1.13, 1] : 1;
  const scaleTransition = plan.emphasize
    ? { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE }
    : plan.highlight
      ? { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.45, 1] }
      : { duration: 0 };

  return (
    <div style={{ position: "absolute", left: p.x, top: p.y, transform: anchorTransform(obj.anchor), fontSize: obj.fontSize ?? 40, color: baseColor }}>
      <motion.div
        initial={{ scale: 1, color: baseColor, opacity: op.initial }}
        animate={{
          opacity: op.animate,
          scale: scaleAnim,
          color: plan.highlight?.color ? [baseColor, plan.highlight.color, baseColor] : plan.emphasize?.color ? plan.emphasize.color : baseColor,
        }}
        transition={{
          opacity: op.transition,
          scale: scaleTransition,
          color: plan.highlight
            ? { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.45, 1] }
            : plan.emphasize
              ? { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE }
              : { duration: 0 },
        }}
        style={{
          display: "grid",
          transformOrigin: "center",
          textShadow: plan.highlight || plan.emphasize ? `0 0 18px ${glowColor}, 0 0 34px ${glowColor}` : "none",
          background: obj.background ?? "transparent",
          padding: obj.background ? `${obj.padding ?? 6}px ${Math.round((obj.padding ?? 6) * 1.35)}px` : 0,
          borderRadius: obj.background ? 3 : 0,
        }}
      >
        <motion.div
          style={{ gridArea: "1 / 1" }}
          initial={{ opacity: plan.initialOpacity }}
          animate={{ opacity: morph ? 0 : 1 }}
          transition={{ opacity: morph ? { duration: morph.duration, delay: morph.start, ease: EASE } : plan.fadeIn ? { duration: plan.fadeIn.duration, delay: plan.fadeIn.start, ease: EASE } : { duration: 0 } }}
          dangerouslySetInnerHTML={{ __html: fromHtml }}
        />
        {morph && (
          <motion.div style={{ gridArea: "1 / 1" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ opacity: { duration: morph.duration, delay: morph.start, ease: EASE } }} dangerouslySetInnerHTML={{ __html: toHtml }} />
        )}
      </motion.div>
    </div>
  );
}

function OverlayCounter({ obj, plan, view, clock }: { obj: CounterObject; plan: MotionPlan; view?: View; clock: MotionValue<number> }) {
  const p = worldToPx(view, obj.at);
  const count = plan.count;
  const from = count?.fromValue ?? obj.from;
  const to = count?.toValue ?? obj.to;
  const start = count?.start ?? 0;
  const duration = count?.duration ?? 0.001;
  const decimals = obj.decimals ?? 0;
  const value = useTransform(clock, (ms) => {
    const progress = count ? easeInOut(clamp01((ms / 1000 - start) / Math.max(0.001, duration))) : 0;
    return `${obj.prefix ?? ""}${lerp(from, to, progress).toFixed(decimals)}${obj.suffix ?? ""}`;
  });
  const [text, setText] = useState(`${obj.prefix ?? ""}${from.toFixed(decimals)}${obj.suffix ?? ""}`);
  useMotionValueEvent(value, "change", setText);
  const baseColor = obj.color ?? COLORS.text;
  const baseWeight = obj.weight === "bold" ? 700 : 400;
  const op = opacityMotion(plan);
  const glowColor = attentionColor(plan) ?? baseColor;
  const scaleAnim = plan.emphasize ? plan.emphasize.scaleTo : plan.highlight ? [1, 1.15, 1] : 1;
  const scaleTransition = plan.emphasize
    ? { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE }
    : plan.highlight
      ? { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.5, 1] }
      : { duration: 0 };

  return (
    <div style={{ position: "absolute", left: p.x, top: p.y, transform: anchorTransform(obj.anchor), transformOrigin: "center" }}>
      <motion.div
        initial={{ opacity: op.initial, color: baseColor }}
        animate={{
          opacity: op.animate,
          scale: scaleAnim,
          color: plan.highlight?.color ? [baseColor, plan.highlight.color, baseColor] : plan.emphasize?.color ? plan.emphasize.color : baseColor,
        }}
        transition={{
          opacity: op.transition,
          scale: scaleTransition,
          color: plan.highlight
            ? { duration: plan.highlight.duration, delay: plan.highlight.start, ease: EASE, times: [0, 0.45, 1] }
            : plan.emphasize
              ? { duration: plan.emphasize.duration, delay: plan.emphasize.start, ease: EASE }
              : { duration: 0 },
        }}
        style={{
          fontSize: obj.fontSize ?? 34,
          fontWeight: plan.emphasize ? 800 : baseWeight,
          fontFamily: BOARD_FONT,
          whiteSpace: "nowrap",
          lineHeight: 1.1,
          display: "inline-block",
          fontVariantNumeric: "tabular-nums",
          textShadow: plan.highlight || plan.emphasize ? `0 0 18px ${glowColor}, 0 0 34px ${glowColor}` : "none",
          background: obj.background ?? "transparent",
          padding: obj.background ? `${obj.padding ?? 6}px ${Math.round((obj.padding ?? 6) * 1.35)}px` : 0,
          borderRadius: obj.background ? 3 : 0,
        }}
      >
        <span>{text}</span>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const isOverlay = (o: SceneObject) => o.type === "text" || o.type === "label" || o.type === "equation" || o.type === "counter";

export default function SceneRenderer({
  scene: rawScene,
  sceneKey,
  narrationSeconds,
  playing,
}: {
  scene: SceneSpec;
  sceneKey: string | number;
  /** Measured narration length; the timeline is stretched to fill it. */
  narrationSeconds?: number;
  /** Whether the lesson clock should advance. */
  playing: boolean;
}) {
  // Defensive: scenes from the route are already expanded by resolveLayout, but a
  // raw/example scene may still carry an area-model — expand it here too (no-op
  // when there's none) so the renderer never has to special-case it.
  const scene = useMemo(() => expandAreaModels(expandGroups(resolveObjectPlacements(rawScene))), [rawScene]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const rawClock = useTime(); // ms since mount; used only as a ticker
  const clock = useMotionValue(0);
  const elapsedMs = useRef(0);
  const lastRawMs = useRef<number | null>(null);

  // Start the timeline ONCE, when playback is actually running and we know how
  // long the narration is, so the
  // scene's pacing is right on the first play. Keying on narrationSeconds would
  // remount and restart the animation a beat in (the visible "reload"); instead
  // we hold at the pre-animation frame until armed, then anchor the scene clock
  // to that moment so everything begins cleanly from t=0. A 1.2s fallback arms
  // us anyway if the measured length is slow to arrive.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!playing || armed) return;
    const arm = () => {
      lastRawMs.current = rawClock.get();
      setArmed(true);
    };
    if (narrationSeconds !== undefined) {
      arm();
      return;
    }
    const id = setTimeout(arm, 1200);
    return () => clearTimeout(id);
  }, [narrationSeconds, playing, armed, rawClock]);

  // Scene time: 0 until armed, then accumulated playback time. It advances only
  // while `playing` is true, so camera/trace/morph/reshape pause with the lesson.
  useMotionValueEvent(rawClock, "change", (ms) => {
    if (!armed || !playing) {
      lastRawMs.current = ms;
      return;
    }
    const prev = lastRawMs.current ?? ms;
    const delta = Math.max(0, ms - prev);
    lastRawMs.current = ms;
    elapsedMs.current += delta;
    clock.set(elapsedMs.current);
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !armed) return;
    for (const animation of el.getAnimations({ subtree: true })) {
      if (playing) animation.play();
      else animation.pause();
    }
  }, [armed, playing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const stepMap = useMemo(() => stepsByTarget(scene.timeline), [scene.timeline]);
  const objectsById = useMemo(() => new Map(scene.objects.map((o) => [o.id, o])), [scene.objects]);
  const view = useMemo(() => fitView(scene), [scene]);
  const scale = width > 0 ? width / VIEW_W : 0;

  // Stretch the authored timeline to the real narration length (clamped so a
  // mis-estimate can't make motion crawl or race). 1 = author's own pacing.
  const authoredDuration = useMemo(() => {
    const ends = scene.timeline.map((s) => s.start + s.duration);
    const camEnds = (scene.camera ?? []).map((m) => m.start + m.duration);
    return scene.duration ?? Math.max(1, ...ends, ...camEnds);
  }, [scene]);
  const timeScale =
    narrationSeconds && authoredDuration > 0
      ? Math.max(0.5, Math.min(3, narrationSeconds / authoredDuration))
      : 1;

  const svgObjects = scene.objects.filter((o) => !isOverlay(o));
  const overlayObjects = scene.objects.filter(isOverlay);

  // Clock-driven camera affine (identity when there are no camera moves).
  const baseView = view;
  const moves = (scene.camera ?? []).map((m) => ({ ...m, start: m.start * timeScale, duration: m.duration * timeScale, to: padView(m.to, 0.16) }));
  const cam = useTransform(clock, (ms) => cameraAffine(baseView, cameraViewAt(baseView, moves, ms / 1000)));
  const hasCamera = moves.length > 0;

  // Apply the camera as an EXPLICIT matrix, imperatively, to both layers. A
  // matrix has no transform-origin/transform-box ambiguity (which is what made
  // framer's style-based version zoom to the wrong spot). Same maths for SVG and
  // the HTML overlay, so they stay locked together.
  const camGroupRef = useRef<SVGGElement>(null);
  const camOverlayRef = useRef<HTMLDivElement>(null);
  const applyCam = useCallback((c: CamAffine) => {
    camGroupRef.current?.setAttribute("transform", `matrix(${c.sx} 0 0 ${c.sy} ${c.tx} ${c.ty})`);
    if (camOverlayRef.current) {
      camOverlayRef.current.style.transform = `matrix(${c.sx},0,0,${c.sy},${c.tx},${c.ty})`;
    }
  }, []);
  useMotionValueEvent(cam, "change", applyCam);
  useEffect(() => {
    applyCam(cam.get());
  }, [applyCam, cam]);

  const renderSvgObject = (obj: SceneObject, plan: MotionPlan, keySuffix: string) => {
    switch (obj.type) {
      case "axes":
        return <Axes key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
      case "function-plot":
        return plan.morph ? (
          <MorphPlot key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} clock={clock} />
        ) : (
          <StaticPlot key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />
        );
      case "parametric":
        return <ParametricCurve key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
      case "path":
      case "polygon":
      case "polyline":
        return <PathLike key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
      case "dot": {
        const curve = plan.trace ? objectsById.get(plan.trace.plotId) : undefined;
        if (plan.trace && curve && curve.type === "function-plot") {
          const plotPlan = continuityPlanFor(stepMap.get(curve.id), timeScale);
          return <TracingDot key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} plot={curve} plotPlan={plotPlan} clock={clock} />;
        }
        if (plan.trace && curve && (curve.type === "parametric" || curve.type === "path" || curve.type === "polygon" || curve.type === "polyline")) {
          return <CurveTracingDot key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} curve={curve} clock={clock} />;
        }
        return <StaticDot key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
      }
      case "arrow":
        return <Arrow key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
      case "brace":
        return <Brace key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
      case "box":
        return <Box key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} clock={clock} />;
      case "icon":
        return <Icon key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
      case "inset":
        return <Inset key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} objectsById={objectsById} />;
      case "secant-line": {
        const plot = objectsById.get(obj.plotId);
        if (!plot || plot.type !== "function-plot") return null;
        return <SecantLine key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} plot={plot} clock={clock} />;
      }
      default:
        return null;
    }
  };

  const renderOverlayObject = (obj: SceneObject, plan: MotionPlan, keySuffix: string) => {
    if (obj.type === "equation") return <OverlayEquation key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
    if (obj.type === "counter") return <OverlayCounter key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} clock={clock} />;
    if (obj.type === "text" || obj.type === "label") {
      return <OverlayText key={`${obj.id}${keySuffix}`} obj={obj} plan={plan} view={view} />;
    }
    return null;
  };

  const svgChildren = svgObjects.map((obj) => renderSvgObject(obj, continuityPlanFor(stepMap.get(obj.id), timeScale), "-live"));
  const overlayChildren = overlayObjects.map((obj) => renderOverlayObject(obj, continuityPlanFor(stepMap.get(obj.id), timeScale), "-live"));
  const holdSvgChildren = svgObjects
    .filter((obj) => entersAtStart(stepMap.get(obj.id)))
    .map((obj) => renderSvgObject(obj, HOLD_PLAN, "-hold"));
  const holdOverlayChildren = overlayObjects
    .filter((obj) => entersAtStart(stepMap.get(obj.id)))
    .map((obj) => renderOverlayObject(obj, HOLD_PLAN, "-hold"));
  const visibleSvgChildren = armed ? svgChildren : holdSvgChildren;
  const visibleOverlayChildren = armed ? overlayChildren : holdOverlayChildren;

  return (
    <div ref={containerRef} className="relative w-full aspect-video overflow-hidden bg-black" style={{ background: scene.background ?? "#000000" }}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        <defs>
          <filter id="lumen-attention-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {hasCamera ? <g ref={camGroupRef}>{visibleSvgChildren}</g> : visibleSvgChildren}
      </svg>

      {scale > 0 && (
        <div className="pointer-events-none absolute left-0 top-0" style={{ width: VIEW_W, height: VIEW_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {hasCamera ? (
            <div ref={camOverlayRef} style={{ width: VIEW_W, height: VIEW_H, transformOrigin: "0 0" }}>
              {visibleOverlayChildren}
            </div>
          ) : (
            visibleOverlayChildren
          )}
        </div>
      )}

      {/* sceneKey is consumed by the parent to remount this component per scene */}
      <span hidden data-scene={String(sceneKey)} />
    </div>
  );
}
