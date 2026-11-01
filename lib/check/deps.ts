// The AI dependencies used by the API routes: cache → saved responses → live provider (Groq by default, D-001)
// behind the shared limiter. One limiter unit per check that actually needs a live call (SPEC §10).
import { aiDeps, aiFixDeps, createRuntime, type AiRuntime } from "@/lib/ai/aiDeps";
import type { CheckDeps } from "@/lib/engine/types";
import type { FixDeps } from "@/lib/fix/propose";
import { allowLiveCheck, clientIp, type Budget } from "@/lib/rateLimit";

/** `budget` is "mcp" for /api/mcp, so agents draw on their own live-check budget (D-036). */
export function routeRuntime(headers: Headers, budget: Budget = "app"): AiRuntime {
  const ip = clientIp(headers);
  return createRuntime({ liveGate: () => allowLiveCheck(ip, budget) });
}

export function routeDeps(headers: Headers, budget: Budget = "app"): CheckDeps {
  return aiDeps(routeRuntime(headers, budget));
}

/** Check and fix deps on one runtime: one fix proposal (its check, draft and recheck) asks the limiter once (D-037). */
export function routeFixDeps(headers: Headers, budget: Budget = "app"): CheckDeps & Required<FixDeps> {
  const rt = routeRuntime(headers, budget);
  return { ...aiDeps(rt), ...aiFixDeps(rt) };
}
