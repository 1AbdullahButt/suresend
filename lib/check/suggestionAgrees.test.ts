// D-045: what a suggested reply's tag promises ("Checked against your docs") is what its Send gets, on the AI's saved reading of
// it. The recheck uses SureSend's own claims, so it can't see a misreading; only a replay of the Send can. The live gate
// refuses, so a missing saved response fails as "paused".
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { runCheck } from "@/lib/check/runCheck";
import type { CheckInput, Role, SourceOverride } from "@/lib/engine/types";
import { variantOverrides, type VariantId } from "@/lib/workspace/variants";

const golden = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "golden.json"), "utf8")) as {
  decisionTime: string;
  saveTime: string;
  cases: Array<{ id: string; ticketId: string; rail: CheckInput["rail"]; draft: string; variant?: VariantId | null }>;
};
const ROLES: Role[] = ["support_agent", "ops_lead"];
const deps = aiDeps(createRuntime({ liveGate: async () => false }));

describe("a suggestion's check matches its Send", () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))("%s", async (_id, c) => {
    for (const role of ROLES) {
      const overrides: SourceOverride[] = c.variant ? variantOverrides(c.variant, golden.saveTime) : [];
      const input: CheckInput = { ticketId: c.ticketId, rail: c.rail, draft: c.draft, role, overrides, decisionTime: golden.decisionTime };
      const r = await runCheck(input, deps);
      if (!r.suggestion) continue;
      const sent = await runCheck({ ...input, draft: r.suggestion.text }, deps);
      expect(sent.ai.mode, role).toBe("saved");
      expect(sent.decision, `${role}: "${r.suggestion.text}"`).toBe(r.suggestion.recheckDecision);
    }
  });
});
