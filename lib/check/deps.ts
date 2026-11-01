// The AI dependencies used by the API routes: cache → saved responses → live provider (Groq by default, D-001)
// behind the shared limiter. One limiter unit per check that actually needs a live call (SPEC §10).
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import type { CheckDeps } from "@/lib/engine/types";
import { allowLiveCheck, clientIp, type Budget } from "@/lib/rateLimit";

/** `budget` is "mcp" for /api/mcp, so agents draw on their own live-check budget (D-036). */
export function routeDeps(headers: Headers, budget: Budget = "app"): CheckDeps {
  const ip = clientIp(headers);
  return aiDeps(createRuntime({ liveGate: () => allowLiveCheck(ip, budget) }));
}
