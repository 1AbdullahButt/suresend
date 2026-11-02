// D-041: the scripts' quota guard. Offline: the messages are the providers' real wording, the HTTP calls are fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTaskError, aiDeps, type AiRuntime } from "./aiDeps";
import { createAiCache } from "./cache";
import { AiRateLimitedError, quotaHit } from "./client";
import { checkQuota, createGuard, describeQuota } from "./quota";
import type { AiRunInfo, SourceForExtraction } from "@/lib/engine/types";

const GROQ_DAY =
  "429 Rate limit reached for model `openai/gpt-oss-120b` in organization `org_abc123` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 198169, Requested 3708. Please try again in 13m30.863999999s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing";
const GROQ_MINUTE =
  "429 Rate limit reached for model `openai/gpt-oss-120b` in organization `org_abc123` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7500, Requested 1200. Please try again in 5.25s.";
const GEMINI_DAY =
  '{"error":{"code":429,"message":"You exceeded your current quota. \\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 500, model: gemini-3.5-flash-lite, description: Generate content requests per day limit exceeded on Free Tier.\\nPlease retry in 5h52m7.415174016s."}}';
const GEMINI_MINUTE =
  '{"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 15, description: Generate content requests per minute limit exceeded.\\nPlease retry in 20s."}}';

const INFO: AiRunInfo = { mode: "unavailable", model: "m", latencyMs: 0, promptVersion: "v" };
const paused = (message: string) => new AiTaskError("rate limit or quota", "paused", INFO, quotaHit(message));

describe("reading a provider's limit message", () => {
  it("Groq's daily tokens", () => {
    const hit = quotaHit(GROQ_DAY);
    expect(hit.window).toBe("day");
    expect(hit.detail).toBe("tokens per day (TPD): Limit 200000, Used 198169, Requested 3708");
    expect(hit.retryAfterMs).toBe(810864);
  });
  it("Groq's per-minute tokens", () => {
    expect(quotaHit(GROQ_MINUTE)).toMatchObject({ window: "minute", retryAfterMs: 5250 });
  });
  it("Gemini's daily requests", () => {
    const hit = quotaHit(GEMINI_DAY);
    expect(hit.window).toBe("day");
    expect(hit.detail).toBe("limit 500");
    expect(hit.retryAfterMs).toBeGreaterThan(5 * 3_600_000);
  });
  it("Gemini's per-minute requests", () => {
    expect(quotaHit(GEMINI_MINUTE)).toMatchObject({ window: "minute", retryAfterMs: 20000 });
  });
  it("a spend limit is its own kind", () => {
    expect(quotaHit("Your organization has reached its spend limit.").window).toBe("spend");
  });
  it("a message that names no limit", () => {
    expect(quotaHit("Too many requests")).toEqual({ window: "unknown", retryAfterMs: null, detail: null });
  });
  it("what it keeps and prints never holds the organization id", () => {
    expect(describeQuota("groq", quotaHit(GROQ_DAY))).not.toMatch(/org_/);
    expect(describeQuota("groq", quotaHit(GROQ_DAY))).toContain("daily limit reached");
  });
});

describe("guarded", () => {
  const stop = (why: string): never => {
    throw new Error(`STOP: ${why}`);
  };
  const noWait = async () => undefined;
  let stderr: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => stderr.mockRestore());

  it("stops on the first daily limit, without another call", async () => {
    const fn = vi.fn(async () => {
      throw paused(GROQ_DAY);
    });
    await expect(createGuard("groq", stop, noWait)(fn)).rejects.toThrow(/^STOP: groq daily limit reached/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("waits out a per-minute limit for as long as the provider says, then continues", async () => {
    const sleep = vi.fn(async () => undefined);
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(paused(GROQ_MINUTE)).mockResolvedValueOnce("done");
    await expect(createGuard("groq", stop, sleep)(fn)).resolves.toBe("done");
    expect(sleep).toHaveBeenCalledWith(5750);
  });
  it("stops if a per-minute limit outlasts the retries", async () => {
    const fn = vi.fn(async () => {
      throw paused(GROQ_MINUTE);
    });
    await expect(createGuard("groq", stop, noWait)(fn)).rejects.toThrow(/^STOP: groq per-minute limit reached/);
    expect(fn).toHaveBeenCalledTimes(7);
  });
  it("stops at once on a limit that names no window but a long wait", async () => {
    const fn = vi.fn(async () => {
      throw paused("Too many requests. Please retry in 5h52m7s.");
    });
    await expect(createGuard("groq", stop, noWait)(fn)).rejects.toThrow(/^STOP: groq rate limit reached/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("a provider error has no answer to score: it retries, then stops, and never comes back as a result", async () => {
    const down = new AiTaskError("groq: provider error: 500", "provider_error", INFO);
    const retried = vi.fn();
    const fn = vi.fn(async () => {
      throw down;
    });
    await expect(createGuard("groq", stop, noWait, retried)(fn)).rejects.toThrow(/^STOP: groq kept failing on one call/);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(retried).toHaveBeenCalledTimes(3);
  });
  it("a passing call between failures doesn't hide an outage", async () => {
    const down = new AiTaskError("groq: provider error: 500", "provider_error", INFO);
    const guard = createGuard("groq", stop, noWait);
    await expect(guard(async () => "from the run's cache")).resolves.toBe("from the run's cache");
    await expect(
      guard(async () => {
        throw down;
      }),
    ).rejects.toThrow(/^STOP/);
  });
  it("a short outage recovers on a retry", async () => {
    const down = new AiTaskError("groq: provider error: 503", "provider_error", INFO);
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(down).mockResolvedValueOnce("answer");
    await expect(createGuard("groq", stop, noWait)(fn)).resolves.toBe("answer");
  });
  it("a spend limit stops at once and says so", async () => {
    const fn = vi.fn(async () => {
      throw paused("Your organization has reached its spend limit.");
    });
    await expect(createGuard("groq", stop, noWait)(fn)).rejects.toThrow(/^STOP: groq spend limit reached/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("an invalid answer is the model's own result, so it comes through", async () => {
    const err = new AiTaskError("groq: invalid AI output after one retry", "invalid_output", INFO);
    const fn = vi.fn(async () => {
      throw err;
    });
    await expect(createGuard("groq", stop, noWait)(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("a limit reaches the scripts through the task runner", () => {
  it("a provider error's text loses the organization id", async () => {
    const rt: AiRuntime = {
      chain: [
        {
          name: "groq",
          model: "m",
          provider: {
            name: "groq",
            model: "m",
            complete: async () => {
              throw new Error("413 Request too large for model in organization `org_abc123`");
            },
          },
        },
      ],
      savedLookup: [],
      cache: createAiCache(),
      liveGate: async () => true,
    };
    const source: SourceForExtraction = { id: "DOC-1", title: "Doc", kind: "policy", version: 1, body: "A body." };
    const e = await aiDeps(rt).extractSource(source).catch((x: unknown) => x);
    expect((e as AiTaskError).kind).toBe("provider_error");
    expect((e as AiTaskError).message).not.toContain("org_abc123");
  });

  it("AiTaskError carries the window the provider reported", async () => {
    const rt: AiRuntime = {
      chain: [
        {
          name: "groq",
          model: "m",
          provider: {
            name: "groq",
            model: "m",
            complete: async () => {
              throw new AiRateLimitedError("limit", quotaHit(GROQ_DAY));
            },
          },
        },
      ],
      savedLookup: [],
      cache: createAiCache(),
      liveGate: async () => true,
    };
    const source: SourceForExtraction = { id: "DOC-1", title: "Doc", kind: "policy", version: 1, body: "A body." };
    const e = await aiDeps(rt).extractSource(source).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AiTaskError);
    expect((e as AiTaskError).kind).toBe("paused");
    expect((e as AiTaskError).quota?.window).toBe("day");
  });
});

describe("checkQuota", () => {
  const KEY = "fake-key-value";
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", KEY);
    vi.stubEnv("GEMINI_API_KEY", KEY);
  });
  afterEach(() => vi.unstubAllEnvs());

  const http = (status: number, body: string, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(body, { status, headers })) as unknown as typeof fetch;

  it("Groq out of daily tokens: not ok, with the figures and no id", async () => {
    const r = await checkQuota("groq", 90, http(429, JSON.stringify({ error: { message: GROQ_DAY } })));
    expect(r.ok).toBe(false);
    expect(r.lines.join(" ")).toContain("Used 198169");
    expect(r.lines.join(" ")).not.toMatch(/org_|fake-key/);
  });
  it("Groq open: ok, and says what it can't see", async () => {
    const r = await checkQuota("groq", 90, http(200, "{}", { "x-ratelimit-remaining-requests": "900" }));
    expect(r.ok).toBe(true);
    expect(r.lines.join(" ")).toContain("900 requests left");
    expect(r.lines.join(" ")).toContain("doesn't report its daily tokens");
  });
  it("Groq with too few requests left: not ok", async () => {
    const r = await checkQuota("groq", 90, http(200, "{}", { "x-ratelimit-remaining-requests": "12" }));
    expect(r.ok).toBe(false);
  });
  it("warns when a run needs more than a day's tokens on the free tier, not on a paid one", async () => {
    const free = await checkQuota("groq", 300, http(200, "{}", { "x-ratelimit-remaining-requests": "900", "x-ratelimit-limit-requests": "1000" }));
    expect(free.ok).toBe(true);
    expect(free.lines.join(" ")).toContain("expect a stop");
    const paid = await checkQuota("groq", 300, http(200, "{}", { "x-ratelimit-remaining-requests": "9000", "x-ratelimit-limit-requests": "500000" }));
    expect(paid.lines.join(" ")).not.toContain("expect a stop");
  });
  it("a missing header isn't read as zero requests left", async () => {
    const r = await checkQuota("groq", 90, http(200, "{}"));
    expect(r.ok).toBe(true);
    expect(r.lines.join(" ")).toContain("? requests left");
  });
  it("Gemini out for the day: not ok", async () => {
    const r = await checkQuota("gemini", 90, http(429, GEMINI_DAY));
    expect(r.ok).toBe(false);
    expect(r.lines.join(" ")).toContain("gemini daily limit reached");
  });
  it("Gemini open: ok", async () => {
    expect((await checkQuota("gemini", 90, http(200, "{}"))).ok).toBe(true);
  });
  it("no key, or an unreachable provider: not ok", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    expect((await checkQuota("groq", 90, http(200, "{}"))).ok).toBe(false);
    vi.stubEnv("GEMINI_API_KEY", KEY);
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect((await checkQuota("gemini", 90, down)).ok).toBe(false);
  });
});
