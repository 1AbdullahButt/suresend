// Builder-owned (D-034): the in-memory fallback limiter and the status reported in the x-suresend-limiter header.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  vi.stubEnv("RATE_LIMIT_PER_10MIN", "2");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("rate limiter without Upstash vars", () => {
  it("reports memory and enforces the per-IP window", async () => {
    vi.useFakeTimers();
    const { allowLiveCheck, limiterStatus } = await import("./rateLimit");
    expect(limiterStatus()).toBe("memory");
    expect(await allowLiveCheck("203.0.113.1")).toBe(true);
    expect(await allowLiveCheck("203.0.113.1")).toBe(true);
    expect(await allowLiveCheck("203.0.113.1")).toBe(false);
    expect(await allowLiveCheck("203.0.113.2")).toBe(true); // another IP has its own window
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(await allowLiveCheck("203.0.113.1")).toBe(true); // the window has passed (and idle entries were swept)
  });

  it("gives MCP callers their own budget: using it up leaves the web demo's untouched", async () => {
    vi.stubEnv("MCP_RATE_LIMIT_PER_10MIN", "1");
    const { allowLiveCheck, limiterStatus } = await import("./rateLimit");
    expect(await allowLiveCheck("203.0.113.9", "mcp")).toBe(true);
    expect(await allowLiveCheck("203.0.113.9", "mcp")).toBe(false);
    expect(await allowLiveCheck("203.0.113.9")).toBe(true); // the app budget (2 per window here) is separate
    expect(limiterStatus("mcp")).toBe("memory");
  });

  it("reports upstash-unused until the first live check when the Marketplace KV_REST_API_* vars are set", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://example.invalid");
    vi.stubEnv("KV_REST_API_TOKEN", "test-not-a-secret");
    const { limiterStatus } = await import("./rateLimit");
    expect(limiterStatus()).toBe("upstash-unused");
  });
});
