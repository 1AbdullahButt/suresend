// Phase 10 (D-041): every "Try another reply" preset replays saved responses, gets the verdict it promises, and its
// suggested reply's Send replays too. The live gate refuses, so a missing saved response fails as "paused".
import { describe, expect, it } from "vitest";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { runCheck } from "@/lib/check/runCheck";
import { seedTickets } from "@/lib/workspace/seed";
import { PRESETS } from "./presets";

const deps = aiDeps(createRuntime({ liveGate: async () => false }));
const cases = seedTickets().flatMap((t) => (PRESETS[t.id] ?? []).map((p) => [t.id, t.rail, p.id, p] as const));

describe("composer presets", () => {
  it("each ticket has 2–3 presets, each draft unique", () => {
    for (const t of seedTickets()) {
      const ps = PRESETS[t.id] ?? [];
      expect(ps.length).toBeGreaterThanOrEqual(2);
      expect(ps.length).toBeLessThanOrEqual(3);
      expect(new Set(ps.map((p) => p.draft)).size).toBe(ps.length);
    }
  });

  it.each(cases)("%s (%s rail) %s replays saved responses with its verdict", async (ticketId, rail, _id, p) => {
    for (const role of ["support_agent", "ops_lead"] as const) {
      const r = await runCheck({ ticketId, rail, draft: p.draft, role }, deps);
      expect(r.ai.mode, `${p.id} (${role})`).toBe("saved");
      expect(r.decision, `${p.id} (${role})`).toBe(p.expect);
      if (r.suggestion) {
        const sent = await runCheck({ ticketId, rail, draft: r.suggestion.text, role }, deps);
        expect(sent.ai.mode, `${p.id} suggestion (${role})`).toBe("saved");
        expect(["ALLOW", "CAUTION"]).toContain(sent.decision);
      }
    }
  });
});
