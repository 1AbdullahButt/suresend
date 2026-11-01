// Builder-owned tests (D-034): the suggested reply's Double-check reason, and generic 500 bodies.
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCheck } from "@/lib/check/handlers";
import { runCheck } from "@/lib/check/runCheck";
import type { CheckDeps, Rail, SourceOverride } from "@/lib/engine/types";
import { CANONICAL_DRAFT, DECISION_TIME, fixtureDeps, variantBody, verifiedSave } from "../../tests/helpers/fixtures";

async function check(overrides: SourceOverride[], ticketId = "TCK-9001", rail: Rail = "instant") {
  const { deps } = fixtureDeps();
  return runCheck({ ticketId, rail, draft: CANONICAL_DRAFT, role: "support_agent", overrides, decisionTime: DECISION_TIME }, deps);
}

const noteOf = (s: unknown) => (s && typeof s === "object" && "recheckNote" in s ? s.recheckNote : undefined);

describe("suggested reply recheck note", () => {
  it("canonical Hold: the 1-day suggestion checks Good to send, so there is no note", async () => {
    const result = await check([]);
    expect(result.decision).toBe("HOLD");
    expect(result.suggestion?.recheckDecision).toBe("ALLOW");
    expect(noteOf(result.suggestion)).toBeUndefined();
  });

  it("B1 verified (tour step 5): the 2-day suggestion is Double-check because the Slack note proposes 1 day", async () => {
    const result = await check([verifiedSave("DOC-103", variantBody("B1"))]);
    expect(result.decision).toBe("HOLD");
    expect(result.suggestion?.recheckDecision).toBe("CAUTION");
    expect(noteOf(result.suggestion)).toBe("a Slack note proposes 1 day");
  });

  it("Escalate: the timeline-free holding reply has no note", async () => {
    const result = await check([], "TCK-9002", "unknown");
    expect(result.decision).toBe("ESCALATE");
    expect(noteOf(result.suggestion)).toBeUndefined();
  });

  it("names the doc that couldn't be read when the cap turns the suggestion's Good to send into Double-check", async () => {
    // SRC-202 unreadable: the Hold still stands (the cap only limits ALLOW), and the 1-day suggestion is capped at CAUTION.
    const { deps } = fixtureDeps({ failSources: ["SRC-202"] });
    const result = await runCheck(
      { ticketId: "TCK-9001", rail: "instant", draft: CANONICAL_DRAFT, role: "support_agent", decisionTime: DECISION_TIME },
      deps,
    );
    expect(result.decision).toBe("HOLD");
    expect(result.suggestion?.recheckDecision).toBe("CAUTION");
    expect(noteOf(result.suggestion)).toBe("Slack #ops-announcements · 2026-10-24 couldn't be read");
  });
});

describe("unexpected failures", () => {
  afterEach(() => vi.restoreAllMocks());

  it("return a generic 500 body and log the detail server-side only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = fixtureDeps();
    const broken: CheckDeps = {
      ...deps,
      now: () => {
        throw new Error("internal detail: provider endpoint https://example.invalid/v1");
      },
    };
    const res = await handleCheck({ ticketId: "TCK-9001", rail: "instant", draft: CANONICAL_DRAFT, role: "support_agent" }, broken);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("internal detail");
    expect(res.body).toMatchObject({ error: "CHECK_FAILED" });
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[1])).toContain("internal detail");
  });

  it("keep the message for input errors such as an unknown ticket", async () => {
    const { deps } = fixtureDeps();
    const res = await handleCheck({ ticketId: "TCK-0000", rail: "instant", draft: CANONICAL_DRAFT, role: "support_agent" }, deps);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Unknown ticket TCK-0000" });
  });
});
