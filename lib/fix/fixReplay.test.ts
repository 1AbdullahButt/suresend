// Builder-owned (D-037): "Fix the doc" on the canonical path never needs live AI. The proposal for the canonical Hold and
// Ask first, its recheck, and the reply after approval all replay data/ai-cache, with the live gate refusing.
import { describe, expect, it } from "vitest";
import { aiDeps, aiFixDeps, createRuntime } from "@/lib/ai/aiDeps";
import { runCheck } from "@/lib/check/runCheck";
import { seedSources } from "@/lib/workspace/seed";
import { fixOverride, proposeFix } from "./propose";

const FOUR = "Failed transfers are reversed within 4 business days.";

function savedOnly() {
  const rt = createRuntime({ liveGate: async () => false });
  return { deps: aiDeps(rt), fix: aiFixDeps(rt) };
}

describe.each([
  ["TCK-9001", "instant", "HOLD"],
  ["TCK-9002", "unknown", "ESCALATE"],
] as const)("Fix the doc on saved responses: %s", (ticketId, rail, decision) => {
  it("proposes the recorded AI fix to DOC-101, and the reply after approval replays too", async () => {
    const { deps, fix } = savedOnly();
    const { proposal, why } = await proposeFix({ ticketId, rail, draft: FOUR, role: "support_agent" }, deps, fix);
    expect(why).toBeNull();
    expect(proposal).toMatchObject({ doc: { id: "DOC-101" }, origin: "ai", aiSetAside: null });
    expect(proposal!.edit.text).toContain("1 business day");

    const doc101 = seedSources().find((s) => s.id === "DOC-101")!;
    const after = await runCheck({ ticketId, rail, draft: FOUR, role: "support_agent", overrides: [fixOverride(doc101, proposal!.after, new Date().toISOString())] }, deps);
    expect(after.ai.mode).toBe("saved");
    expect(after.decision).toBe(decision);
  });
});
