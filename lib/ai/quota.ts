// Quota guard for the scripts that spend provider quota (pnpm record, pnpm eval; D-041). Free tiers: Groq 1,000 requests
// and 200,000 tokens a day (a rolling bucket, ~8,300 tokens back per hour), Gemini 500 requests a day (resets at midnight
// Pacific). Each script checks first, then stops on the first daily limit instead of failing every remaining call.
import { AiTaskError } from "./aiDeps";
import { configFor, quotaHit, type ProviderName, type QuotaHit } from "./client";

/** Exit code of a script that stopped on a quota limit: nothing was overwritten, and re-running continues it. */
export const QUOTA_STOP_EXIT = 3;

const MINUTE_RETRIES = 6;
/** What one real call costs on Groq, measured on the saved-response runs. */
const TOKENS_PER_CALL = 1_600;
const GROQ_DAILY_TOKENS = 200_000;
const GEMINI_DAILY_REQUESTS = 500;
/** About 1,200 tokens: Groq's daily token limit only shows once a request doesn't fit, so a tiny probe would always pass. */
const GROQ_PROBE = "Say ok. ".repeat(400);

function waitText(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
}

export function describeQuota(provider: string, hit: QuotaHit | undefined): string {
  const limit = hit?.window === "day" ? "daily limit" : hit?.window === "minute" ? "per-minute limit" : "rate limit";
  const figures = hit?.detail ? ` (${hit.detail})` : "";
  const wait = hit?.retryAfterMs ? `; the provider says to retry in ${waitText(hit.retryAfterMs)}` : "";
  return `${provider} ${limit} reached${figures}${wait}`;
}

/**
 * Runs one AI step. A per-minute limit waits and retries; a daily limit, or a limit that outlasts the retries, calls
 * `stop` at once. Other AI errors are logged and rethrown: they count as that step's real result.
 */
export async function guarded<T>(
  provider: string,
  fn: () => Promise<T>,
  stop: (why: string) => never,
  sleep: (ms: number) => Promise<unknown> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof AiTaskError)) throw e;
      if (e.kind !== "paused") {
        process.stderr.write(`  AI error (${e.kind}): ${e.message}\n`);
        throw e;
      }
      if (e.quota?.window === "day" || attempt >= MINUTE_RETRIES) stop(describeQuota(provider, e.quota));
      const wait = e.quota?.retryAfterMs ?? 20_000 * (attempt + 1);
      process.stderr.write(`  rate limited, waiting ${Math.ceil(wait / 1000)}s…\n`);
      await sleep(wait + 500);
    }
  }
}

export interface QuotaCheck {
  ok: boolean;
  /** Printable: figures only, never the provider's raw body, an id or a key. */
  lines: string[];
}

async function checkGroq(apiKey: string, model: string, calls: number, http: typeof fetch): Promise<QuotaCheck> {
  const res = await http("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: GROQ_PROBE }], max_completion_tokens: 10 }),
  });
  if (res.status === 429) {
    const hit = quotaHit(await res.text());
    const lines = [describeQuota("groq", hit)];
    return { ok: hit.window === "minute", lines };
  }
  if (!res.ok) return { ok: false, lines: [`groq answered ${res.status} to the quota check`] };
  const left = Number(res.headers.get("x-ratelimit-remaining-requests"));
  const tokens = calls * TOKENS_PER_CALL;
  const lines = [
    `groq: ${Number.isFinite(left) ? left : "?"} requests left today; this run needs about ${calls} calls and ${Math.round(tokens / 1000)}K tokens.`,
    "groq doesn't report its daily tokens until the limit is reached, so this only proves the next call fits.",
  ];
  if (tokens > GROQ_DAILY_TOKENS) lines.push(`On Groq's free tier (${GROQ_DAILY_TOKENS / 1000}K tokens a day), expect a stop, then re-run the same command to continue.`);
  if (Number.isFinite(left) && left < calls) return { ok: false, lines: [`groq: only ${left} requests left today; this run needs about ${calls}.`] };
  return { ok: true, lines };
}

async function checkGemini(apiKey: string, model: string, calls: number, http: typeof fetch): Promise<QuotaCheck> {
  const res = await http(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Say ok." }] }] }),
  });
  if (res.status === 429) {
    const hit = quotaHit(await res.text());
    return { ok: hit.window === "minute", lines: [describeQuota("gemini", hit)] };
  }
  if (!res.ok) return { ok: false, lines: [`gemini answered ${res.status} to the quota check`] };
  return {
    ok: true,
    lines: [`gemini: open. It doesn't report what's left of its ${GEMINI_DAILY_REQUESTS} requests a day; this run needs about ${calls}.`],
  };
}

/** Called before a script spends anything. One small live call; nothing is written. */
export async function checkQuota(provider: ProviderName, calls: number, http: typeof fetch = fetch): Promise<QuotaCheck> {
  const cfg = configFor(provider);
  if (!cfg.apiKey) return { ok: false, lines: [`${provider}: no API key configured`] };
  try {
    if (provider === "groq") return await checkGroq(cfg.apiKey, cfg.model, calls, http);
    if (provider === "gemini") return await checkGemini(cfg.apiKey, cfg.model, calls, http);
    return { ok: true, lines: [`${provider}: no free-tier limit to check`] };
  } catch (e) {
    return { ok: false, lines: [`${provider}: the quota check could not reach the provider (${e instanceof Error ? e.name : "error"})`] };
  }
}
