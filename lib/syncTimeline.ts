/**
 * Audio-true retiming: warp a scene's timeline onto the ACTUAL narration audio.
 *
 * The model authors step order + optional `cue` phrases (schema field on
 * timeline steps); Edge TTS gives per-word timestamps for the exact audio being
 * played. This module builds a monotonic piecewise-linear time warp from the
 * authored timeline onto the audio clock: cued steps land at the moment their
 * phrase is spoken, uncued steps stretch proportionally between those anchors,
 * and the scene duration becomes the real audio length. Deterministic, pure,
 * and safe — geometry is untouched, only `start`/`duration` values move.
 *
 * Runs in the player (lib/tts.ts hands the word timings over), so the timings
 * always belong to the audio actually playing — re-synthesis drift is
 * impossible by construction.
 */

import { sceneDuration } from "@/lib/sceneGeometry";
import type { AnimationStep, CameraMove, SceneSpec } from "@/types/scene";

/** One spoken word from Edge TTS word-boundary metadata (times in ms). */
export interface WordTiming {
  part: string;
  start: number;
  end: number;
}

const MIN_STEP_SEC = 0.25;
/** A visual gap longer than this reads as a frozen frame. */
const DEAD_AIR_SEC = 4.5;
/** Step types that can be stretched to fill dead air without looking wrong. */
const STRETCHABLE = new Set(["trace", "morph", "move", "count", "slide", "reshape", "draw"]);

const normalizeWord = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Find when `phrase` is spoken, searching forward from word index `from`.
 * Exact token-sequence match first, then a relaxed prefix match, so a slightly
 * paraphrased cue still lands near the right moment. Returns seconds, or null.
 */
export function findCueTime(words: WordTiming[], phrase: string, from = 0): { seconds: number; nextFrom: number } | null {
  const tokens = phrase.split(/\s+/).map(normalizeWord).filter(Boolean);
  if (!tokens.length || !words.length) return null;
  const normWords = words.map((w) => normalizeWord(w.part));

  const tryMatch = (needed: number) => {
    for (let i = Math.max(0, from); i <= normWords.length - needed; i++) {
      let ok = true;
      for (let j = 0; j < needed; j++) {
        if (normWords[i + j] !== tokens[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  };

  let idx = tryMatch(tokens.length);
  if (idx < 0 && tokens.length > 2) idx = tryMatch(2);
  if (idx < 0 && tokens[0].length >= 4) idx = tryMatch(1);
  if (idx < 0) return null;
  return { seconds: words[idx].start / 1000, nextFrom: idx + 1 };
}

interface WarpAnchor {
  /** Authored time (seconds on the model's clock). */
  fromSec: number;
  /** Spoken time (seconds on the audio clock). */
  toSec: number;
}

/** Monotonic piecewise-linear map through the anchors ((0,0) and (D, audio) included). */
function makeWarp(anchors: WarpAnchor[], authoredDur: number, audioDur: number): (t: number) => number {
  const points: WarpAnchor[] = [{ fromSec: 0, toSec: 0 }];
  for (const a of anchors) {
    const prev = points[points.length - 1];
    // Keep both clocks strictly increasing; drop anchors that would fold time.
    if (a.fromSec > prev.fromSec + 1e-6 && a.toSec > prev.toSec + 1e-6 && a.fromSec < authoredDur && a.toSec < audioDur) {
      points.push(a);
    }
  }
  points.push({ fromSec: Math.max(authoredDur, points[points.length - 1].fromSec + 1e-6), toSec: audioDur });

  return (t: number) => {
    const clamped = Math.max(0, Math.min(authoredDur, t));
    for (let i = 1; i < points.length; i++) {
      if (clamped <= points[i].fromSec) {
        const a = points[i - 1];
        const b = points[i];
        const frac = (clamped - a.fromSec) / Math.max(1e-6, b.fromSec - a.fromSec);
        return a.toSec + frac * (b.toSec - a.toSec);
      }
    }
    return audioDur;
  };
}

/** Stretch steps that precede a long still gap so the board never freezes. */
function fillDeadAir(timeline: AnimationStep[], audioDur: number): AnimationStep[] {
  const steps = [...timeline].sort((a, b) => a.start - b.start);
  const out = timeline.map((s) => ({ ...s }));
  // Walk the coverage frontier; when a gap > DEAD_AIR_SEC opens, extend the
  // latest stretchable step that ends at the frontier to cover most of it.
  let frontier = 0;
  for (const step of steps) {
    const gapEnd = Math.min(step.start, audioDur);
    if (gapEnd - frontier > DEAD_AIR_SEC) extendInto(out, frontier, gapEnd);
    frontier = Math.max(frontier, step.start + step.duration);
  }
  if (audioDur - frontier > DEAD_AIR_SEC) extendInto(out, frontier, audioDur);
  return out;
}

function extendInto(steps: AnimationStep[], gapStart: number, gapEnd: number) {
  let best: AnimationStep | null = null;
  for (const s of steps) {
    const end = s.start + s.duration;
    if (!STRETCHABLE.has(s.type)) continue;
    if (end > gapStart + 0.3 || gapStart - end > 2.5) continue; // must end at/near the frontier
    if (!best || end > best.start + best.duration) best = s;
  }
  if (best) best.duration = Math.max(best.duration, gapStart + (gapEnd - gapStart) * 0.75 - best.start);
}

/**
 * Retime `scene` onto the real narration: cued steps land on their spoken
 * phrase, everything else warps proportionally, duration becomes the audio
 * length, and long frozen gaps are filled by stretching adjacent motion.
 * Pass `words` as null when timings are unavailable — the scene then only
 * gets the proportional stretch + dead-air fill.
 */
export function retimeScene(scene: SceneSpec, words: WordTiming[] | null, audioSeconds: number): SceneSpec {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0 || !scene.timeline.length) return scene;
  const authored = sceneDuration(scene);

  // 1) Collect cue anchors in authored order; search the narration forward so
  //    repeated phrases resolve to successive occurrences.
  const anchors: WarpAnchor[] = [];
  if (words?.length) {
    const cued = scene.timeline.filter((s) => s.cue).sort((a, b) => a.start - b.start);
    let from = 0;
    for (const step of cued) {
      const hit = findCueTime(words, step.cue!, from);
      if (hit) {
        anchors.push({ fromSec: step.start, toSec: hit.seconds });
        from = hit.nextFrom;
      }
    }
  }

  const warp = makeWarp(anchors, authored, audioSeconds);

  const timeline = scene.timeline.map((step) => {
    const start = warp(step.start);
    const end = warp(step.start + step.duration);
    return { ...step, start, duration: Math.max(MIN_STEP_SEC, end - start) };
  });
  const camera: CameraMove[] | undefined = scene.camera?.map((move) => {
    const start = warp(move.start);
    const end = warp(move.start + move.duration);
    return { ...move, start, duration: Math.max(0.8, end - start) };
  });

  return { ...scene, timeline: fillDeadAir(timeline, audioSeconds), camera, duration: audioSeconds };
}
