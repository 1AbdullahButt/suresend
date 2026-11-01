// Builder-owned (D-034): guided-tour step 5 never needs live AI. Both ways of typing its edit ("2 business days", or only
// the digit) replay saved responses from data/ai-cache, for Save and verify, the Send that follows, and the tip's re-check.
import { describe, expect, it } from "vitest";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { runCheck } from "@/lib/check/runCheck";
import { draftSave, seedBody, verifiedSave } from "@/lib/workspace/variants";
import { tourStep5Edits } from "@/lib/workspace/variantBodies";

const FOUR_DAY_DRAFT = "Failed transfers are reversed within 4 business days.";
const SAVED_AT = "2026-11-01T10:00:00Z";

// The live gate refuses, so a missing saved response shows up as "paused", never as a silent live call.
const deps = aiDeps(createRuntime({ liveGate: async () => false }));

describe.each(Object.entries(tourStep5Edits))("tour step 5, edit typed as %s", (_name, edit) => {
  const body = edit(seedBody("DOC-103"));

  it.each(["support_agent", "ops_lead"] as const)("Save and verify → Send: saved Hold, and the suggestion's Send is saved too (%s)", async (role) => {
    const input = { ticketId: "TCK-9001", rail: "instant" as const, role, overrides: [verifiedSave("DOC-103", body, SAVED_AT)] };
    const held = await runCheck({ ...input, draft: FOUR_DAY_DRAFT }, deps);
    expect(held.ai.mode).toBe("saved");
    expect(held.decision).toBe("HOLD");
    expect(held.suggestion?.text).toContain("2 business days");

    const sent = await runCheck({ ...input, draft: held.suggestion!.text }, deps);
    expect(sent.ai.mode).toBe("saved");
    expect(sent.decision).toBe("CAUTION");
    expect(sent.reasonCode).toBe("CHANGE_SIGNALLED");
  });

  it("Save and re-check (the tip): saved Double-check", async () => {
    const r = await runCheck(
      { ticketId: "TCK-9001", rail: "instant", role: "support_agent", draft: FOUR_DAY_DRAFT, overrides: [draftSave("DOC-103", body, SAVED_AT)] },
      deps,
    );
    expect(r.ai.mode).toBe("saved");
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("WEAK_BASIS");
  });
});
