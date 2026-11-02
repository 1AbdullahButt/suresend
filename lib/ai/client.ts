// AI provider adapters (DECISIONS D-001 and D-017, amending SPEC §10). Server-only.
// - groq:      Groq's OpenAI-compatible API, strict JSON-schema structured output (gpt-oss-120b).
// - gemini:    Google Gemini via the official @google/genai SDK, native JSON-schema response (gemini-3.5-flash-lite).
// - anthropic: Anthropic Messages API with a forced tool call. Off by default.
// AI_PROVIDER picks the primary, AI_FALLBACK_PROVIDER the one tried once when the primary is rate-limited.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export type ProviderName = "groq" | "gemini" | "anthropic";

export interface StructuredRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}

export interface AiProvider {
  name: ProviderName;
  model: string;
  /** Returns the parsed JSON object the model produced (not yet zod-validated). */
  complete(req: StructuredRequest): Promise<unknown>;
}

/** Which limit a 429 hit. A daily limit won't clear soon, so the scripts stop; a per-minute one clears in seconds. */
export type QuotaWindow = "day" | "minute" | "spend" | "unknown";

export interface QuotaHit {
  window: QuotaWindow;
  /** How long the provider says to wait, when it says. */
  retryAfterMs: number | null;
  /** The limit's own figures, e.g. "tokens per day (TPD): Limit 200000, Used 198169, Requested 3708". No ids or keys. */
  detail: string | null;
}

/** Reads a provider's 429 message: Groq names the limit in words, Gemini in its quota metric and description. */
export function quotaHit(message: string): QuotaHit {
  const window: QuotaWindow = /spend(?:ing)?\s*limit/i.test(message)
    ? "spend"
    : /per[\s_-]*day|\b[TR]PD\b|daily/i.test(message)
      ? "day"
      : /per[\s_-]*minute|\b[TR]PM\b/i.test(message)
        ? "minute"
        : "unknown";
  const wait = /(?:try again|retry) in ([\d.hms]+)/i.exec(message)?.[1];
  let retryAfterMs: number | null = null;
  if (wait) {
    const scale: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1_000, ms: 1 };
    retryAfterMs = Math.ceil([...wait.matchAll(/([\d.]+)(ms|h|m|s)/g)].reduce((sum, p) => sum + Number(p[1]) * scale[p[2]!]!, 0));
  }
  const groq = /(?:tokens|requests) per (?:day|minute) \([A-Z]+\): Limit \d+, Used \d+, Requested \d+/.exec(message)?.[0];
  const gemini = /limit: (\d+)/.exec(message)?.[1];
  return { window, retryAfterMs, detail: groq ?? (gemini ? `limit ${gemini}` : null) };
}

/** The provider rejected the call with 429 or a quota error: try the fallback once, then use saved responses. */
export class AiRateLimitedError extends Error {
  constructor(
    message?: string,
    readonly quota: QuotaHit = { window: "unknown", retryAfterMs: null, detail: null },
  ) {
    super(message);
  }
}
/** The provider itself rejected the model's output as not matching the schema (e.g. Groq 400 json_validate_failed). */
export class AiInvalidOutputError extends Error {}

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  groq: "openai/gpt-oss-120b",
  gemini: "gemini-3.5-flash-lite",
  anthropic: "claude-haiku-5-5",
};
// Per call. A check makes at most three sequential AI steps (extract → reply → reply recheck), each with at most one
// fallback, so the worst case stays inside the routes' maxDuration (60 s).
const TIMEOUT_MS = 9_000;

const statusOf = (e: unknown): number | undefined => {
  if (typeof e !== "object" || e === null) return undefined;
  const s = (e as { status?: unknown; code?: unknown }).status ?? (e as { code?: unknown }).code;
  return typeof s === "number" ? s : undefined;
};

/** 429, or a quota/rate message (Gemini reports RESOURCE_EXHAUSTED). */
export function isRateLimit(e: unknown): boolean {
  if (statusOf(e) === 429) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /RESOURCE_EXHAUSTED|rate limit|quota|spend(?:ing)?\s*limit/i.test(msg);
}

function rethrow(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (isRateLimit(e)) throw new AiRateLimitedError(`Provider rate limit or quota (${statusOf(e) ?? "quota"})`, quotaHit(msg));
  if (statusOf(e) === 400 && /json_validate_failed|failed to (generate|validate) json/i.test(msg)) {
    throw new AiInvalidOutputError(msg);
  }
  throw e;
}

function groqProvider(apiKey: string, model: string): AiProvider {
  const client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1", timeout: TIMEOUT_MS, maxRetries: 0 });
  return {
    name: "groq",
    model,
    async complete(req) {
      try {
        const res = await client.chat.completions.create({
          model,
          temperature: 0,
          reasoning_effort: "medium",
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          response_format: { type: "json_schema", json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
        });
        const text = res.choices[0]?.message?.content ?? "";
        return JSON.parse(text) as unknown;
      } catch (e) {
        rethrow(e);
      }
    },
  };
}

function geminiProvider(apiKey: string, model: string): AiProvider {
  const client = new GoogleGenAI({ apiKey });
  return {
    name: "gemini",
    model,
    async complete(req) {
      try {
        const res = await client.models.generateContent({
          model,
          contents: req.user,
          config: {
            systemInstruction: req.system,
            temperature: 0,
            responseMimeType: "application/json",
            responseJsonSchema: req.schema,
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
          },
        });
        return JSON.parse(res.text ?? "") as unknown;
      } catch (e) {
        rethrow(e);
      }
    },
  };
}

function anthropicProvider(apiKey: string, model: string): AiProvider {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
  return {
    name: "anthropic",
    model,
    async complete(req) {
      try {
        const res = await client.messages.create({
          model,
          max_tokens: 2048,
          // No temperature: the current Messages API no longer accepts it for these models; the forced tool call
          // plus zod validation is what keeps output structured.
          system: req.system,
          tools: [{ name: req.schemaName, description: "Return the result.", input_schema: req.schema as Anthropic.Tool.InputSchema }],
          tool_choice: { type: "tool", name: req.schemaName },
          messages: [{ role: "user", content: req.user }],
        });
        const block = res.content.find((b) => b.type === "tool_use");
        if (!block || block.type !== "tool_use") throw new Error("No tool_use block in response");
        return block.input;
      } catch (e) {
        rethrow(e);
      }
    },
  };
}

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  apiKey: string | undefined;
}

const parseName = (v: string | undefined): ProviderName | null =>
  v === "groq" || v === "gemini" || v === "anthropic" ? v : null;

export function configFor(name: ProviderName, env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  switch (name) {
    case "groq":
      return { provider: name, model: env.GROQ_MODEL || DEFAULT_MODELS.groq, apiKey: env.GROQ_API_KEY };
    case "gemini":
      return { provider: name, model: env.GEMINI_MODEL || DEFAULT_MODELS.gemini, apiKey: env.GEMINI_API_KEY };
    case "anthropic":
      return { provider: name, model: env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic, apiKey: env.ANTHROPIC_API_KEY };
  }
}

/** Primary first, then the fallback (if set and different). Names and models are known even without keys. */
export function providerChain(env: NodeJS.ProcessEnv = process.env): ProviderConfig[] {
  const primary = parseName(env.AI_PROVIDER) ?? "groq";
  const fallback = parseName(env.AI_FALLBACK_PROVIDER);
  return [configFor(primary, env), ...(fallback && fallback !== primary ? [configFor(fallback, env)] : [])];
}

/** Null when AI_MODE=saved or the provider has no key: callers use saved responses. */
export function createProvider(cfg: ProviderConfig, env: NodeJS.ProcessEnv = process.env): AiProvider | null {
  if (env.AI_MODE === "saved" || !cfg.apiKey) return null;
  switch (cfg.provider) {
    case "groq":
      return groqProvider(cfg.apiKey, cfg.model);
    case "gemini":
      return geminiProvider(cfg.apiKey, cfg.model);
    case "anthropic":
      return anthropicProvider(cfg.apiKey, cfg.model);
  }
}

/**
 * Serializes calls and spaces them at least `minIntervalMs` apart. Used by the eval and recorder so they stay under
 * free-tier limits instead of tripping 429s (Groq ~8K tokens/min; Gemini Flash-Lite ~500 requests/day).
 */
export function throttled(provider: AiProvider, minIntervalMs: number): AiProvider {
  let chain: Promise<unknown> = Promise.resolve();
  let last = 0;
  return {
    ...provider,
    complete(req) {
      const run = chain.then(async () => {
        const wait = last + minIntervalMs - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        last = Date.now();
        return provider.complete(req);
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
}

/** Spacing that keeps the scripts under each free tier (see D-017). */
export const SCRIPT_INTERVAL_MS: Record<ProviderName, number> = { groq: 12_000, gemini: 4_500, anthropic: 1_000 };
