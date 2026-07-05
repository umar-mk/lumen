import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Provider-agnostic forced-tool plumbing for the lesson + interrupt routes.
 *
 * The routes never change provider: they all call `runTool` with a zod schema
 * and get back validated JSON. `LUMEN_PROVIDER` selects the backend:
 *   - `anthropic` — native SDK, prompt caching (paid; default model sonnet).
 *   - `groq` / `gemini` / `openrouter` — OpenAI-compatible REST, free tiers.
 *
 * This is built so you can A/B the SAME topic across free providers by flipping
 * one env var. `runTool` also retries on schema-invalid output (feeding the zod
 * error back), which is what makes flakier free models usable.
 */

type ProviderId = "anthropic" | "groq" | "gemini" | "openrouter" | "ollama" | "deepseek";

interface ProviderConfig {
  /** OpenAI-compatible base URL (omit for the native Anthropic SDK path). */
  baseUrl?: string;
  /** Env var that holds this provider's API key. */
  keyEnv: string;
  /** Default model when `LUMEN_MODEL` is unset. */
  defaultModel: string;
  /** Extra headers (e.g. OpenRouter attribution). */
  headers?: Record<string, string>;
  /** No API key needed (e.g. a local Ollama server). */
  keyless?: boolean;
  /** Extra request-body fields merged into every call (e.g. DeepSeek thinking). */
  extraBody?: Record<string, unknown>;
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    keyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-6",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-2.0-flash",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    headers: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Lumen",
    },
  },
  // Local model via Ollama — no rate limits, no quotas, no key. The right home
  // for the per-beat lesson loop. Pull a model first: `ollama pull qwen2.5:14b`.
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    keyEnv: "OLLAMA_API_KEY",
    keyless: true,
    defaultModel: "qwen2.5:14b",
  },
  // DeepSeek — cheap output + automatic prompt caching (great for the repeated
  // per-beat system prompt) and no harsh free-tier request cap. v4-flash defaults
  // to THINKING mode, which can't do forced tool calls — so we explicitly disable
  // thinking (the `deepseek-chat` alias for this is deprecated 2026/07/24).
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-flash",
    extraBody: { thinking: { type: "disabled" } },
  },
};

const PROVIDER = (process.env.LUMEN_PROVIDER || "anthropic").toLowerCase() as ProviderId;
const CONFIG = PROVIDERS[PROVIDER] ?? PROVIDERS.anthropic;
const MODEL = process.env.LUMEN_MODEL || CONFIG.defaultModel;

/** The active provider id (e.g. "deepseek"), for user-facing messages. */
export const ACTIVE_PROVIDER = PROVIDER;

/**
 * Is the active provider ready to make live calls? True if it needs no key
 * (local Ollama) or its key is set. Routes use this to decide live-vs-offline —
 * NOT a hard-coded ANTHROPIC_API_KEY check, which only worked for one provider.
 */
export function providerConfigured(): boolean {
  return CONFIG.keyless === true || !!process.env[CONFIG.keyEnv];
}

/** How many times to re-ask the model after schema-invalid output. */
const MAX_VALIDATION_RETRIES = 2;

/** How many times to wait out a 429 (free-tier tokens-per-minute cap). */
const MAX_RATE_LIMIT_RETRIES = 4;
/** Cap any single rate-limit wait so a request can't hang forever. */
const MAX_RATE_LIMIT_WAIT_MS = 65_000;
/** Total time we'll spend waiting out rate limits in ONE call before giving up. */
const RATE_LIMIT_TOTAL_BUDGET_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `retryable` distinguishes transient decode failures (worth a fresh attempt,
 * e.g. Gemini MALFORMED_FUNCTION_CALL) from hard walls like an exhausted quota
 * or a 4xx — those must fail fast instead of compounding through the retry loop.
 */
class ProviderError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderError";
    this.retryable = retryable;
  }
}

/**
 * Validation keywords that bloat a provider's constrained-decoding grammar
 * (Gemini) without affecting which JSON the model should emit. We enforce all
 * of these server-side via zod anyway, so dropping them from the sent schema is
 * safe and dramatically shrinks the grammar state count.
 */
const STRIPPED_SCHEMA_KEYS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minProperties",
  "maxProperties",
  "pattern",
  "format",
]);

function stripSchemaConstraints(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSchemaConstraints);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (STRIPPED_SCHEMA_KEYS.has(key)) continue;
      out[key] = stripSchemaConstraints(value);
    }
    return out;
  }
  return node;
}

/** Work out how long to wait after a 429 from the header or the body hint. */
async function rateLimitWaitMs(res: Response): Promise<number> {
  // Standard header first (seconds).
  const header = res.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.min(secs * 1000 + 250, MAX_RATE_LIMIT_WAIT_MS);
  }
  const body = await res.clone().text().catch(() => "");
  // Groq: "Please try again in 18.7s". Gemini: "Please retry in 36.1s" and/or a
  // structured `"retryDelay": "36s"` field. Match all of them.
  const hint =
    body.match(/(?:try again|retry) in ([\d.]+)\s*s/i) ?? body.match(/"retryDelay":\s*"([\d.]+)s"/i);
  if (hint) {
    const secs = Number(hint[1]);
    if (Number.isFinite(secs)) return Math.min(secs * 1000 + 500, MAX_RATE_LIMIT_WAIT_MS);
  }
  return 5_000; // sensible default
}

// Tiny in-memory guard so an accidental loop can't run up API cost.
let lastCallAt = 0;
let inFlight = 0;
const MIN_GAP_MS = 400;
const MAX_INFLIGHT = 3;

export function rateGuard(): string | null {
  const now = Date.now();
  if (now - lastCallAt < MIN_GAP_MS || inFlight >= MAX_INFLIGHT) {
    return "Too many requests — give it a moment.";
  }
  lastCallAt = now;
  return null;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheCreate: a.cacheCreate + b.cacheCreate,
});

export interface RunToolOptions {
  system: string;
  messages: Anthropic.MessageParam[];
  toolName: string;
  toolDescription: string;
  schema: z.ZodType;
  maxTokens: number;
  /**
   * Sampling temperature. Pinned per call-site so quality isn't hostage to
   * provider defaults: lower for precise repair/param-filling, higher where
   * creative composition helps. Omit to use the provider default.
   */
  temperature?: number;
}

/**
 * One forced tool call that is guaranteed schema-valid, or throws.
 * Retries with the zod error fed back so weaker models can self-correct.
 */
export async function runTool(
  opts: RunToolOptions,
): Promise<{ input: unknown; usage: Usage }> {
  const apiKey = process.env[CONFIG.keyEnv] ?? (CONFIG.keyless ? "local" : undefined);
  if (!apiKey) {
    throw new Error(
      `Missing ${CONFIG.keyEnv} for provider "${PROVIDER}". Set it in .env.local (or change LUMEN_PROVIDER).`,
    );
  }

  // Anthropic's tool input_schema is draft-7; the OpenAI-compatible providers
  // (Groq/Gemini/OpenRouter) validate against draft 2020-12, where tuples must
  // use `prefixItems` rather than an `items` array. Match each to avoid a 400.
  const schemaTarget = PROVIDER === "anthropic" ? "draft-7" : "draft-2020-12";
  const rawSchema = z.toJSONSchema(opts.schema, { target: schemaTarget }) as Record<string, unknown>;
  delete rawSchema["$schema"];
  // Gemini compiles the tool schema into a constrained-decoding grammar and
  // rejects "too many states" (deep oneOf + array caps + numeric bounds). Those
  // bounds are redundant — server-side zod still enforces CAPS — so we strip
  // them from the schema we SEND. (Harmless for Groq/OpenRouter too.)
  const jsonSchema =
    PROVIDER === "anthropic" ? rawSchema : (stripSchemaConstraints(rawSchema) as Record<string, unknown>);

  inFlight++;
  let usage = emptyUsage();
  // Correction messages get appended across retries (provider-agnostic: a plain
  // user nudge avoids replaying assistant tool turns).
  const extraMessages: Anthropic.MessageParam[] = [];

  try {
    for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
      let call: { input: unknown; usage: Usage };
      try {
        call =
          PROVIDER === "anthropic"
            ? await callAnthropic(apiKey, opts, jsonSchema, extraMessages, attempt === 0)
            : await callOpenAICompatible(apiKey, opts, jsonSchema, extraMessages);
      } catch (err) {
        // Hard walls (exhausted quota, 4xx) fail fast — re-asking just compounds
        // the wait. Only transient decode failures (MALFORMED_FUNCTION_CALL,
        // empty/garbled tool call) are worth a fresh attempt.
        const retryable = !(err instanceof ProviderError) || err.retryable;
        if (retryable && attempt < MAX_VALIDATION_RETRIES) continue;
        throw err;
      }

      usage = addUsage(usage, call.usage);

      // Repair recoverable deviations (clamp caps, snap literals) before strict
      // validation — the model never saw the bounds we stripped from its schema.
      const repaired = coerceToSchema(call.input, rawSchema, rawSchema);
      const parsed = opts.schema.safeParse(repaired);
      if (parsed.success) {
        return { input: repaired, usage };
      }

      if (attempt < MAX_VALIDATION_RETRIES) {
        const issues = parsed.error.issues
          .slice(0, 8)
          .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n");
        extraMessages.push({
          role: "user",
          content: `Your previous \`${opts.toolName}\` output failed validation:\n${issues}\n\nReturn a corrected tool call that satisfies the schema exactly. Do not explain — just call the tool.`,
        });
      } else {
        // Out of retries: hand the (repaired) input back so the route's own
        // validator produces a clear 502 rather than us swallowing it.
        return { input: repaired, usage };
      }
    }
    // Unreachable, but keeps the type checker happy.
    throw new Error("runTool exhausted attempts unexpectedly.");
  } finally {
    inFlight--;
  }
}

/** Native Anthropic path: forced tool-use + ephemeral system-prompt caching. */
async function callAnthropic(
  apiKey: string,
  opts: RunToolOptions,
  jsonSchema: Record<string, unknown>,
  extraMessages: Anthropic.MessageParam[],
  cacheSystem: boolean,
): Promise<{ input: unknown; usage: Usage }> {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    system: [
      {
        type: "text",
        text: opts.system,
        ...(cacheSystem ? { cache_control: { type: "ephemeral" as const } } : {}),
      },
    ],
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [...opts.messages, ...extraMessages],
  });

  const toolUse = msg.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a tool result.");
  }
  return {
    input: toolUse.input,
    usage: {
      input: msg.usage.input_tokens,
      output: msg.usage.output_tokens,
      cacheRead: msg.usage.cache_read_input_tokens ?? 0,
      cacheCreate: msg.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

/** OpenAI-compatible path: Groq / Gemini / OpenRouter share this exact shape. */
async function callOpenAICompatible(
  apiKey: string,
  opts: RunToolOptions,
  jsonSchema: Record<string, unknown>,
  extraMessages: Anthropic.MessageParam[],
): Promise<{ input: unknown; usage: Usage }> {
  const messages = [
    { role: "system", content: opts.system },
    ...[...opts.messages, ...extraMessages].map((m) => ({
      role: m.role,
      content: messageText(m.content),
    })),
  ];

  const requestBody = JSON.stringify({
    model: MODEL,
    max_tokens: opts.maxTokens,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    messages,
    tools: [
      {
        type: "function",
        function: {
          name: opts.toolName,
          description: opts.toolDescription,
          parameters: jsonSchema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: opts.toolName } },
    // Provider-specific extras (e.g. DeepSeek `thinking: {type:"disabled"}` so
    // v4-flash can do forced tool calls instead of running in thinking mode).
    ...(CONFIG.extraBody ?? {}),
  });

  // Free tiers have a tight tokens-per-minute cap (429), and busy free models
  // return transient overload errors (503/500/502/529). Both are worth waiting
  // out — honor the provider's retry hint rather than failing the lesson.
  const RETRYABLE = new Set([429, 500, 502, 503, 529]);
  let res!: Response;
  let waited = 0;
  for (let rlAttempt = 0; rlAttempt <= MAX_RATE_LIMIT_RETRIES; rlAttempt++) {
    res = await fetch(`${CONFIG.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(CONFIG.headers ?? {}),
      },
      body: requestBody,
    });

    if (!RETRYABLE.has(res.status) || rlAttempt === MAX_RATE_LIMIT_RETRIES) break;

    // 429 carries a precise hint; overloads don't, so back off with a ramp.
    const waitMs = res.status === 429 ? await rateLimitWaitMs(res) : Math.min(2000 * (rlAttempt + 1), MAX_RATE_LIMIT_WAIT_MS);
    // Stop waiting once we've spent the budget — a persistent wall won't clear,
    // so fail fast with a clear message instead of hanging for minutes.
    if (waited + waitMs > RATE_LIMIT_TOTAL_BUDGET_MS) break;
    waited += waitMs;
    await sleep(waitMs);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 429/4xx are hard walls (quota, bad request) — don't re-ask; surface them.
    throw new ProviderError(`${PROVIDER} API ${res.status}: ${body.slice(0, 500)}`, false);
  }

  const data = (await res.json()) as {
    choices?: {
      finish_reason?: string;
      message?: {
        content?: string | null;
        tool_calls?: { function?: { arguments?: string } }[];
      };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const usage: Usage = {
    input: data.usage?.prompt_tokens ?? 0,
    output: data.usage?.completion_tokens ?? 0,
    cacheRead: 0,
    cacheCreate: 0,
  };

  const choice = data.choices?.[0];
  // Preferred path: a proper forced tool call.
  let rawArgs = choice?.message?.tool_calls?.[0]?.function?.arguments;
  // Fallback: some providers (Gemini) occasionally ignore forced tool_choice
  // and return the JSON object in `content` instead.
  if (typeof rawArgs !== "string") {
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      rawArgs = stripCodeFence(content);
    }
  }

  if (typeof rawArgs !== "string") {
    const finish = choice?.finish_reason ?? "unknown";
    const snippet = JSON.stringify(choice ?? data).slice(0, 300);
    // Transient decode failure (e.g. MALFORMED_FUNCTION_CALL) — worth re-asking.
    throw new ProviderError(
      `${PROVIDER} returned no tool call (finish_reason=${finish}, ` +
        `output_tokens=${usage.output}). Response: ${snippet}`,
      true,
    );
  }

  // Tolerant parse: strict first, then recover a truncated/lightly-malformed call
  // (salvages every field/element the model finished). Schema validation + coercion
  // upstream then decides if what we recovered is enough.
  const parsed = parseToolArguments(rawArgs);
  if (parsed.ok) return { input: parsed.value, usage };

  // Unrecoverable. Report the REAL shape of the failure (length, finish_reason,
  // and the TAIL where it broke) instead of a blind 200-char head, so we can see
  // truncation vs. genuine garbling.
  const finish = choice?.finish_reason ?? "unknown";
  const tail = rawArgs.length > 240 ? `…${rawArgs.slice(-240)}` : rawArgs;
  if (finish === "length") {
    // Truncated even beyond recovery → re-asking with the same budget repeats it.
    throw new ProviderError(
      `${PROVIDER} truncated the tool call beyond recovery (finish_reason=length, ` +
        `output_tokens=${usage.output}, ${rawArgs.length} chars) — raise this route's maxTokens. Tail: ${tail}`,
      false,
    );
  }
  throw new ProviderError(
    `${PROVIDER} returned unparseable tool arguments (finish_reason=${finish}, ` +
      `output_tokens=${usage.output}, ${rawArgs.length} chars). Tail: ${tail}`,
    true,
  );
}

/**
 * Repair recoverable model deviations against the FULL JSON Schema (the one with
 * bounds, before we strip them for the model). Free models overshoot caps and
 * fuzz literals — and since we hide numeric/array bounds from the schema we send,
 * we must be liberal in what we accept. This clamps arrays/numbers, truncates
 * over-long strings, and coerces `const` literals; anything it can't cleanly
 * handle (unions, mismatched shapes) is left untouched so strict zod validation
 * still runs exactly as before. It never adds or removes required data.
 */
function resolveRef(schema: Record<string, unknown>, root: Record<string, unknown>): Record<string, unknown> {
  let s: Record<string, unknown> = schema;
  const seen = new Set<string>();
  while (typeof s.$ref === "string" && !seen.has(s.$ref)) {
    seen.add(s.$ref);
    const path = s.$ref.replace(/^#\//, "").split("/").map(decodeURIComponent);
    let node: unknown = root;
    for (const p of path) node = (node as Record<string, unknown> | undefined)?.[p];
    if (!node || typeof node !== "object") break;
    s = node as Record<string, unknown>;
  }
  return s;
}

function coerceToSchema(value: unknown, rawSchema: unknown, root: Record<string, unknown>): unknown {
  if (!rawSchema || typeof rawSchema !== "object") return value;
  const schema = resolveRef(rawSchema as Record<string, unknown>, root);

  // Unions/intersections: picking a branch is risky (discriminated SceneSpec
  // objects), so leave the value for zod to judge.
  if (schema.anyOf || schema.oneOf || schema.allOf) return value;

  // A literal: the only valid value IS the const, so snap a stray value to it.
  if ("const" in schema) return value === schema.const ? value : schema.const;

  const type = schema.type;

  if ((type === "object" || schema.properties) && value && typeof value === "object" && !Array.isArray(value)) {
    const props = (schema.properties as Record<string, unknown> | undefined) ?? {};
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [k, v] of Object.entries(out)) {
      if (props[k]) out[k] = coerceToSchema(v, props[k], root);
    }
    return out;
  }

  if ((type === "array" || schema.items || schema.prefixItems) && Array.isArray(value)) {
    let arr = value;
    if (typeof schema.maxItems === "number" && arr.length > schema.maxItems) arr = arr.slice(0, schema.maxItems);
    if (Array.isArray(schema.prefixItems)) {
      const prefix = schema.prefixItems;
      arr = arr.map((it, i) => (prefix[i] ? coerceToSchema(it, prefix[i], root) : it));
    } else if (schema.items && typeof schema.items === "object") {
      arr = arr.map((it) => coerceToSchema(it, schema.items, root));
    }
    return arr;
  }

  if (type === "string" && typeof value === "string") {
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return value.slice(0, schema.maxLength);
    return value;
  }

  if ((type === "number" || type === "integer") && typeof value === "number" && Number.isFinite(value)) {
    let n = value;
    if (typeof schema.minimum === "number") n = Math.max(n, schema.minimum);
    if (typeof schema.exclusiveMinimum === "number") n = Math.max(n, schema.exclusiveMinimum);
    if (typeof schema.maximum === "number") n = Math.min(n, schema.maximum);
    if (typeof schema.exclusiveMaximum === "number") n = Math.min(n, schema.exclusiveMaximum);
    if (type === "integer") n = Math.round(n);
    return n;
  }

  return value;
}

/** Strip ```json fences some models wrap JSON content in. */
function stripCodeFence(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : t;
}

interface Frame {
  close: "}" | "]";
  isObject: boolean;
  /** Object position state; arrays just toggle value/comma. */
  state: "key" | "colon" | "value" | "comma";
}

/**
 * Recover a usable object from truncated or lightly-malformed tool-call JSON.
 *
 * Free models occasionally cut off mid-emission (hitting max_tokens) or emit a
 * stray trailing comma. Rather than throw the whole call away, we walk the text
 * as a JSON state machine and remember the byte offset after every COMPLETE value
 * (a closed string/number/bool/null, or a `}`/`]`). Slicing at the last such
 * offset and appending the still-open closers yields valid JSON containing every
 * element the model finished — e.g. a script truncated mid-beat still recovers
 * all the beats that completed. Returns `{ ok: false }` if nothing parses, so the
 * caller can surface a clear error.
 */
function recoverTruncatedJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  const stack: Frame[] = [];
  let inStr = false;
  let esc = false;
  // Two recovery targets: the last completed value of any kind, and the last
  // completed CONTAINER (`}`/`]`). Preferring the container cut drops a partial
  // trailing array element (a half-written last beat) and keeps the whole ones.
  let valueCut = -1;
  let valueClosers = "";
  let containerCut = -1;
  let containerClosers = "";

  const closers = () => stack.map((f) => f.close).reverse().join("");

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const top = stack[stack.length - 1];

    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') {
        inStr = false;
        if (top && top.isObject && top.state === "key") top.state = "colon";
        else if (top) {
          top.state = "comma";
          valueCut = i + 1; // a completed string VALUE (object value or array element)
          valueClosers = closers();
        }
      }
      continue;
    }

    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === " " || c === "\n" || c === "\t" || c === "\r") continue;
    if (c === "{") {
      stack.push({ close: "}", isObject: true, state: "key" });
      continue;
    }
    if (c === "[") {
      stack.push({ close: "]", isObject: false, state: "value" });
      continue;
    }
    if (c === "}" || c === "]") {
      stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) parent.state = "comma";
      valueCut = containerCut = i + 1; // a completed container
      valueClosers = containerClosers = closers();
      continue;
    }
    if (c === ":") {
      if (top && top.isObject && top.state === "colon") top.state = "value";
      continue;
    }
    if (c === ",") {
      if (top) top.state = top.isObject ? "key" : "value";
      continue;
    }

    // Primitive value: number / true / false / null. Consume to the next delimiter.
    let j = i;
    while (j < raw.length && !/[\s,}\]]/.test(raw[j])) j++;
    if (top && j < raw.length) {
      // Only a primitive that ENDS before EOF is complete (not cut off mid-token).
      top.state = "comma";
      valueCut = j;
      valueClosers = closers();
    }
    i = j - 1;
  }

  // Try the clean container-boundary recovery first, then the looser value cut.
  for (const cand of [
    { cut: containerCut, tail: containerClosers },
    { cut: valueCut, tail: valueClosers },
  ]) {
    if (cand.cut < 0) continue;
    try {
      return { ok: true, value: JSON.parse(raw.slice(0, cand.cut) + cand.tail) };
    } catch {
      // try the next candidate
    }
  }
  return { ok: false };
}

/** Parse tool-call JSON, recovering truncated/lightly-malformed output if needed. */
function parseToolArguments(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return recoverTruncatedJson(raw);
  }
}

/** Flatten Anthropic message content (string or blocks) to plain text. */
function messageText(content: Anthropic.MessageParam["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}
