import { DEFAULT_VIEW, VIEW_H, VIEW_W, type Vec2, type View } from "@/types/scene";

export interface Px {
  x: number;
  y: number;
}

/**
 * Map a world point (math coords, y-up, origin centred) to viewBox pixels
 * (y-down, origin top-left). Independent x/y scales so the view always fills
 * the 1600x900 canvas. Dots use pixel radii so they stay circular.
 */
export function worldToPx(view: View | undefined, p: Vec2): Px {
  const v = view ?? DEFAULT_VIEW;
  const w = v.xMax - v.xMin || 1;
  const h = v.yMax - v.yMin || 1;
  return {
    x: ((p.x - v.xMin) / w) * VIEW_W,
    y: ((v.yMax - p.y) / h) * VIEW_H,
  };
}

/** Convert a viewBox pixel point to overlay percentages (for the HTML layer). */
export function pxToPercent(px: Px): { left: number; top: number } {
  return { left: (px.x / VIEW_W) * 100, top: (px.y / VIEW_H) * 100 };
}

/** Convenience: world point straight to overlay percentages. */
export function worldToPercent(view: View | undefined, p: Vec2) {
  return pxToPercent(worldToPx(view, p));
}
