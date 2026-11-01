// Layered limits on live AI (SPEC §10): a shared Upstash limiter (per IP + global daily cap) when configured,
// otherwise a best-effort in-memory limiter that is NOT shared across serverless instances.
// A denied request still works: it uses saved responses and shows "Live AI paused".
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** The web demo and MCP callers have separate budgets, so agents can't use up the web demo's live checks (D-036). */
export type Budget = "app" | "mcp";

interface BudgetConfig {
  prefix: string;
  perIp: () => number;
  daily: () => number;
}

const BUDGETS: Record<Budget, BudgetConfig> = {
  app: {
    prefix: "suresend",
    perIp: () => Number(process.env.RATE_LIMIT_PER_10MIN ?? 20),
    daily: () => Number(process.env.GLOBAL_LIVE_CHECKS_PER_DAY ?? 500),
  },
  mcp: {
    prefix: "suresend:mcp",
    perIp: () => Number(process.env.MCP_RATE_LIMIT_PER_10MIN ?? 10),
    daily: () => Number(process.env.MCP_LIVE_CHECKS_PER_DAY ?? 200),
  },
};

export type LimiterKind = "upstash" | "memory";

/** What the last live-check gate on this instance actually used (D-034); no keys or IPs. */
export type LimiterStatus = "upstash" | "upstash-unreachable" | "upstash-unused" | "memory";

interface Limiter {
  kind: LimiterKind;
  allow(ip: string): Promise<boolean>;
  status(): LimiterStatus;
}

function upstashLimiter(url: string, token: string, cfg: BudgetConfig): Limiter {
  const redis = new Redis({ url, token });
  const perIp = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(cfg.perIp(), "10 m"), prefix: `${cfg.prefix}:ip` });
  const global = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(cfg.daily(), "1 d"), prefix: `${cfg.prefix}:global` });
  const fallback = memoryLimiter(cfg);
  let lastOk: boolean | null = null;
  return {
    kind: "upstash",
    async allow(ip) {
      try {
        const ipOk = (await perIp.limit(ip)).success;
        const ok = ipOk && (await global.limit("all")).success;
        lastOk = true;
        return ok;
      } catch {
        lastOk = false;
        return fallback.allow(ip); // Redis unreachable: best effort rather than unlimited
      }
    },
    status: () => (lastOk === null ? "upstash-unused" : lastOk ? "upstash" : "upstash-unreachable"),
  };
}

function memoryLimiter(cfg: BudgetConfig): Limiter {
  const hits = new Map<string, number[]>();
  const WINDOW_MS = 10 * 60_000;
  let day = "";
  let dayCount = 0;
  let lastSweep = 0;
  return {
    kind: "memory",
    async allow(ip) {
      const now = Date.now();
      const today = new Date(now).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        dayCount = 0;
      }
      // Once a minute, drop IPs with no hit inside the window, so the map doesn't grow for the instance's lifetime.
      if (now - lastSweep > 60_000) {
        lastSweep = now;
        for (const [key, times] of hits) if (now - (times[times.length - 1] ?? 0) >= WINDOW_MS) hits.delete(key);
      }
      const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
      if (recent.length >= cfg.perIp() || dayCount >= cfg.daily()) {
        if (recent.length > 0) hits.set(ip, recent);
        return false;
      }
      recent.push(now);
      hits.set(ip, recent);
      dayCount++;
      return true;
    },
    status: () => "memory",
  };
}

const limiters: Partial<Record<Budget, Limiter>> = {};

export function getLimiter(budget: Budget = "app"): Limiter {
  const existing = limiters[budget];
  if (existing) return existing;
  // The Vercel Marketplace integration may name these KV_REST_API_* instead (D-034); either pair works.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const cfg = BUDGETS[budget];
  const created = url && token ? upstashLimiter(url, token, cfg) : memoryLimiter(cfg);
  limiters[budget] = created;
  return created;
}

/** For the `x-suresend-limiter` response header: lets anyone confirm the live demo uses the shared limiter. */
export function limiterStatus(budget: Budget = "app"): LimiterStatus {
  return getLimiter(budget).status();
}

/** One unit per check that needs live AI (cache hits never reach this). */
export function allowLiveCheck(ip: string, budget: Budget = "app"): Promise<boolean> {
  return getLimiter(budget).allow(ip);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
