import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { NextResponse } from "next/server";

import { sceneSpecSchema, validateScene, CAPS } from "@/lib/sceneSchema";
import { derivativeDemo } from "@/lib/exampleScenes";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.LUMEN_MODEL || "claude-sonnet-4-6";

// JSON Schema for the tool, derived from the same zod schema the server uses to
// validate the result — single source of truth.
const SCENE_JSON_SCHEMA = z.toJSONSchema(sceneSpecSchema, { target: "draft-7" }) as Record<string, unknown>;
delete SCENE_JSON_SCHEMA["$schema"];

const SYSTEM = `You are Lumen, a real-time math/science tutor that teaches at a whiteboard like 3Blue1Brown. You NEVER write prose or code to the student. Instead you call the \`render_scene\` tool with a JSON SceneSpec describing an animated visualization, and that is your entire response.

COORDINATE SYSTEM
- One shared world coordinate system, math-style: origin in the centre, y points UP.
- EVERY position (text "at", arrow from/to, axes ranges, plot domain, dot positions) is in these world coords.
- Choose "view" {xMin,xMax,yMin,yMax} so the content fits with a little margin. The canvas is 16:9, so make (xMax-xMin)/(yMax-yMin) ≈ 16/9 for undistorted spacing when it matters.

OBJECTS (each needs a unique "id")
- axes: xRange, yRange, optional step, showGrid, xLabel, yLabel.
- function-plot: expr in x (e.g. "x^2", "sin(x)", "2*x-1"). Allowed: + - * / ^, parentheses, sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs exp log ln log10 sign floor ceil round, and constants pi e tau. domain [a,b], optional samples (<=400), color, width.
- parametric: xExpr/yExpr in t, tRange [t0,t1], optional params, samples, color, width. Use for circles, ellipses, spirals, and curves not representable as y=f(x).
- path / polygon / polyline: arbitrary world-coordinate outlines and diagrams with fill/stroke. Use these for novel static shapes instead of inventing new primitive types.
- group: local child objects with at/transform so composed diagrams can move or appear together.
- dot: at {x,y}, radius (px), color.
- arrow: from {x,y}, to {x,y}, color, head.
- text / label: text, at {x,y}, fontSize (px), color, anchor (start|middle|end).
- equation: latex (KaTeX, e.g. "f(x) = x^2"), at, fontSize, color, anchor.

ANIMATIONS (timeline steps, times in SECONDS)
- draw: stroke-on for axes/plots/arrows (pop-in for dots). Use this for axes and curves.
- fadeIn: opacity in. Use for text/labels/equations.
- move: slide an object to "to" {x,y}. Good for dots tracing a straight path.
- transform: cross-fade an equation to "toLatex". Use to evolve formulas.
- highlight: brief pulse on an object; optional "color".
- morph: on a function-plot, continuously reshape its "expr" into "toExpr" over time; optional "toDomain". Use this often for 3Blue1Brown-style transformations.
- trace: on a dot, move it ALONG a function-plot named by "plotId", with optional "fromX" and "toX". Use this for points sweeping across curves instead of straight-line motion.

RELATIONAL PLACEMENT: objects may include "place": {kind:"absolute"|"on"|"relativeTo"|"distribute", ...}. Use place:on for dots riding curves and place:relativeTo for aligned labels instead of eyeballing coordinates. If an idea is not directly drawable, degrade to a correct 2-D cross-section, graph, table, equation, or schematic; never invent unsupported object types.

STYLE & PACING
- Pure black background (omit "background" to use the default, or "#000000").
- Sequence the timeline with slow, deliberate overlaps so it flows. Draw axes first (~1s), then use morph/trace for the main conceptual motion, then annotations.
- Keep total duration ~6-12s. Keep it focused: one clear idea, not clutter.
- Limits: <= ${CAPS.objects} objects, <= ${CAPS.steps} timeline steps.

When the student interrupts with a follow-up and a current scene is provided, return a COMPLETE new SceneSpec that adapts the explanation to their question (you may reuse/extend the previous scene). Always answer by calling render_scene exactly once.`;

const FEWSHOT_REQUEST = "Show me the derivative of f(x) = x^2 and its tangent line at x = 1.";

// Tiny in-memory guard so an accidental loop can't run up API cost. Resets on
// server restart; fine for a single-process v1.
let lastCallAt = 0;
let inFlight = 0;
const MIN_GAP_MS = 600;
const MAX_INFLIGHT = 2;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 503 },
    );
  }

  const now = Date.now();
  if (now - lastCallAt < MIN_GAP_MS || inFlight >= MAX_INFLIGHT) {
    return NextResponse.json({ error: "Slow down a moment — too many requests." }, { status: 429 });
  }
  lastCallAt = now;
  inFlight++;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      question?: unknown;
      currentScene?: unknown;
    };
    const question = typeof body.question === "string" ? body.question.slice(0, 1000).trim() : "";
    if (!question) {
      return NextResponse.json({ error: "Missing question." }, { status: 400 });
    }

    const userContent = body.currentScene
      ? `The current scene on screen is:\n\`\`\`json\n${JSON.stringify(body.currentScene).slice(0, 12000)}\n\`\`\`\n\nThe student interrupts and asks: "${question}"\n\nReturn a complete new SceneSpec that adapts the explanation.`
      : question;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      // Cache the static system prompt + example so repeated calls are cheap.
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      tools: [
        {
          name: "render_scene",
          description: "Render an animated SceneSpec to the student's whiteboard.",
          input_schema: SCENE_JSON_SCHEMA as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "render_scene" },
      messages: [
        { role: "user", content: FEWSHOT_REQUEST },
        { role: "assistant", content: [{ type: "tool_use", id: "demo", name: "render_scene", input: derivativeDemo }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "demo", content: "Rendered." }] },
        { role: "user", content: userContent },
      ],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json({ error: "Model did not return a scene." }, { status: 502 });
    }

    const result = validateScene(toolUse.input);
    if (!result.ok) {
      return NextResponse.json({ error: `Invalid scene: ${result.error}` }, { status: 502 });
    }

    return NextResponse.json({
      scene: result.scene,
      usage: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
        cacheCreate: message.usage.cache_creation_input_tokens ?? 0,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    inFlight--;
  }
}
