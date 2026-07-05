/**
 * Quick provider smoke test — run with:
 *   node --env-file=.env.local --experimental-strip-types scripts/provider-smoke.ts
 *
 * To override provider inline:
 *   LUMEN_PROVIDER=groq   node --env-file=.env.local --experimental-strip-types scripts/provider-smoke.ts
 *   LUMEN_PROVIDER=gemini node --env-file=.env.local --experimental-strip-types scripts/provider-smoke.ts
 *
 * Uses a tiny schema so it's fast and cheap (1–2 sentences of output).
 */

import { z } from "zod";
import { runTool } from "../lib/llm";

const provider = process.env.LUMEN_PROVIDER ?? "anthropic";
const model = process.env.LUMEN_MODEL ?? "(default)";

const PingSchema = z.object({
  answer: z.string().describe("A one-sentence plain-English answer."),
  confidence: z.number().min(0).max(1).describe("How confident you are, 0–1."),
});

console.log(`\nProvider smoke test`);
console.log(`  LUMEN_PROVIDER : ${provider}`);
console.log(`  LUMEN_MODEL    : ${model}`);
console.log(`  Question       : "What is the derivative of x²?"\n`);

try {
  const { input, usage } = await runTool({
    system: "You are a helpful math tutor. Answer concisely.",
    messages: [{ role: "user", content: "What is the derivative of x²?" }],
    toolName: "answer",
    toolDescription: "Return a one-sentence answer and a confidence score.",
    schema: PingSchema,
    maxTokens: 256,
  });

  const result = PingSchema.safeParse(input);
  if (!result.success) {
    console.error("Schema validation failed:", result.error.issues);
    process.exit(1);
  }

  console.log("✓ Tool call succeeded and validated");
  console.log(`  Answer     : ${result.data.answer}`);
  console.log(`  Confidence : ${result.data.confidence}`);
  console.log(
    `  Tokens     : ${usage.input} in / ${usage.output} out` +
      (usage.cacheRead ? ` / ${usage.cacheRead} cache-read` : ""),
  );
} catch (err) {
  console.error("✗ Provider call failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
