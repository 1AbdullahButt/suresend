// Phase 10 (D-041): the fee_refund topic through the unchanged rules. Hand-written extractions stand in for the AI; the
// quotes are the seed docs' own sentences, so runCheck's quote validation runs for real.
import { describe, expect, it } from "vitest";
import { runCheck } from "@/lib/check/runCheck";
import { detectPolicyPatterns } from "@/lib/engine/patterns";
import { present } from "@/lib/mcp/tools";
import { ESCALATE_TEMPLATE, escalateTemplate } from "@/lib/replies/templates";
import { draftSave, seedBody, verifiedSave } from "@/lib/workspace/variants";
import type { AiRunInfo, CheckDeps, DraftClaim, SourceClaim, SourceOverride } from "@/lib/engine/types";

const NOW = "2026-10-30T12:00:00Z";
const INFO: AiRunInfo = { mode: "saved", model: "test", latencyMs: 0, promptVersion: "test" };

function sc(sourceId: string, quote: string, over: Partial<SourceClaim>): SourceClaim {
  return {
    claimId: `${sourceId}#${quote.length}`,
    sourceId,
    sourceVersion: 1,
    topic: "reversal_window",
    value: null,
    valueText: "",
    scope: { rail: "any" },
    effectiveFrom: null,
    statusWording: "unstated",
    supersedes: null,
    quote,
    ...over,
  };
}

const FEE_LINE = "Fees on instant-rail transfers are kept: the transfer fee is not returned when an instant transfer fails.";

/** What a good extractor returns for the seed docs (and for DOC-103 with the instant-rail fee line added). */
function sourceClaims(id: string, body: string): SourceClaim[] {
  switch (id) {
    case "DOC-101":
      return [
        sc("DOC-101", "When an outgoing transfer fails, the amount is reversed to the customer's wallet within 4 business days.", {
          value: { amount: 4, unit: "business_days" },
          valueText: "4 business days",
          statusWording: "in_force",
        }),
        sc("DOC-101", "Transfer fee is refunded with the principal.", {
          topic: "fee_refund",
          value: { flag: true },
          valueText: "refunded with the principal",
          statusWording: "in_force",
        }),
      ];
    case "DOC-103": {
      const claims = [
        sc("DOC-103", "For instant-rail transfers only, failed transfers are reversed within 1 business day.", {
          value: { amount: 1, unit: "business_days" },
          valueText: "1 business day",
          scope: { rail: "instant" },
          effectiveFrom: "2026-10-27",
          statusWording: "in_force",
          supersedes: {
            targetText: "section 3 of the Outgoing Transfers – Reversal SOP",
            quote: "This supersedes section 3 of the Outgoing Transfers – Reversal SOP for instant-rail transfers.",
          },
        }),
      ];
      if (body.includes(FEE_LINE)) {
        claims.push(
          sc("DOC-103", FEE_LINE, { topic: "fee_refund", value: { flag: false }, valueText: "kept", scope: { rail: "instant" }, statusWording: "in_force" }),
        );
      }
      return claims;
    }
    case "SRC-202":
      return [
        sc("SRC-202", "we're planning to move instant reversals to 1 day once compliance signs off.", {
          value: { amount: 1, unit: "calendar_days" },
          valueText: "1 day",
          scope: { rail: "instant" },
          statusWording: "proposed",
        }),
      ];
    default:
      return [];
  }
}

function deps(draftClaims: DraftClaim[]): CheckDeps {
  return {
    extractDraft: async () => ({ claims: draftClaims, info: INFO }),
    extractSource: async (s) => ({ claims: sourceClaims(s.id, s.body), info: INFO }),
  };
}

const timeline = (amount: number, span: string): DraftClaim => ({
  claimId: "d#1",
  topic: "reversal_window",
  value: { amount, unit: "business_days" },
  valueText: `${amount} business day${amount === 1 ? "" : "s"}`,
  span,
  definitive: true,
});
const fee = (flag: boolean, span: string, definitive = true): DraftClaim => ({
  claimId: "d#2",
  topic: "fee_refund",
  value: { flag },
  valueText: span,
  span,
  definitive,
});

const check = (ticketId: string, rail: "instant" | "standard" | "unknown", draft: string, claims: DraftClaim[], overrides: SourceOverride[] = []) =>
  runCheck({ ticketId, rail, draft, role: "support_agent", overrides, decisionTime: NOW }, deps(claims));

describe("fee_refund: the detector", () => {
  it("catches fee-refund statements the AI might miss", () => {
    for (const s of [
      "the transfer fee isn't refundable",
      "Just so you know, the transfer charge stays with us.",
      "You get the fee back as well.",
      "There's no transfer fee on this.",
      "The fee is refunded with the principal.",
    ]) {
      expect(detectPolicyPatterns(s).map((m) => m.kind), s).toContain("fee");
    }
  });
  it("stays quiet on the existing replies and on both Ask-first templates", () => {
    for (const s of [
      "Failed transfers are reversed within 4 business days.",
      "Your refund will arrive within 4 business days.",
      "Thanks for reaching out! We're looking into this for you.",
      ESCALATE_TEMPLATE,
      escalateTemplate(["fee_refund"]),
      escalateTemplate(["reversal_window", "fee_refund"]),
    ]) {
      expect(detectPolicyPatterns(s).filter((m) => m.kind === "fee"), s).toEqual([]);
    }
  });
});

describe("fee_refund through the unchanged rules", () => {
  it("refunded: Good to send on every rail, including the unknown one (the fee rule covers all rails)", async () => {
    for (const [id, rail] of [["TCK-9001", "instant"], ["TCK-9002", "unknown"], ["TCK-9003", "standard"]] as const) {
      const r = await check(id, rail, "The transfer fee is refunded with your money.", [fee(true, "The transfer fee is refunded")]);
      expect(r.decision, id).toBe("ALLOW");
      expect(r.reasonCode, id).toBe("SUPPORTED");
      expect(r.headline).toBe("Allow: matches Outgoing Transfers: Reversal SOP (refunded).");
    }
  });

  it("not refunded: Hold, with a topic headline and a template that states the policy", async () => {
    const r = await check("TCK-9003", "standard", "The transfer fee isn't refundable.", [fee(false, "The transfer fee isn't refundable")]);
    expect(r.decision).toBe("HOLD");
    expect(r.reasonCode).toBe("CONTRADICTS_GOVERNING");
    expect(r.headline).toBe(
      "Hold: the transfer fee is refunded for standard-rail transfers (Outgoing Transfers: Reversal SOP). The draft says it's not refunded.",
    );
    expect(r.suggestion?.text).toBe("The transfer fee is refunded.");
    expect(r.suggestion?.recheckDecision).toBe("ALLOW");
  });

  it("hedged and wrong: Double-check, not Hold", async () => {
    const r = await check("TCK-9003", "standard", "The fee probably isn't refunded.", [fee(false, "The fee probably isn't refunded", false)]);
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("HEDGED_CONTRADICTION");
  });

  it("scoped like the timeline: an instant-rail fee rule wins on instant, doesn't apply on standard, asks first on unknown", async () => {
    const edited = [verifiedSave("DOC-103", `${seedBody("DOC-103").trimEnd()}\n\n${FEE_LINE}\n`, "2026-10-29T09:00:00Z")];
    const draft = "Your transfer fee will be refunded too.";
    const claims = [fee(true, "Your transfer fee will be refunded too")];
    const instant = await check("TCK-9001", "instant", draft, claims, edited);
    expect([instant.decision, instant.reasonCode]).toEqual(["HOLD", "CONTRADICTS_GOVERNING"]);
    expect(instant.claims[0]?.trace.find((t) => t.outcome === "fired" && t.rule === "D6")).toBeDefined();
    const standard = await check("TCK-9003", "standard", draft, claims, edited);
    expect([standard.decision, standard.reasonCode]).toEqual(["ALLOW", "SUPPORTED"]);
    const unknown = await check("TCK-9002", "unknown", draft, claims, edited);
    expect([unknown.decision, unknown.reasonCode]).toEqual(["ESCALATE", "SCOPE_UNKNOWN"]);
    expect(unknown.headline).toBe("Escalate: whether the transfer fee is refunded depends on the payment rail, and this ticket's rail is unknown.");
    expect(unknown.suggestion?.text).toBe(
      "Thanks for your patience. I'm confirming the transfer fee details for your transfer and will update you here as soon as I have it.",
    );
  });

  it("a weakened instant-rail fee rule can't override by specificity (D6 needs no weakeners)", async () => {
    const edited = [draftSave("DOC-103", `${seedBody("DOC-103").trimEnd()}\n\n${FEE_LINE}\n`, "2026-10-29T09:00:00Z")];
    const r = await check("TCK-9001", "instant", "Your transfer fee will be refunded too.", [fee(true, "Your transfer fee will be refunded too")], edited);
    expect([r.decision, r.reasonCode]).toEqual(["ESCALATE", "CONFLICT_UNRESOLVED"]);
  });
});

describe("a reply with both claims", () => {
  const AYESHA = "Your money will be back within 1 business day, but the transfer fee isn't refundable.";
  const both = [timeline(1, "within 1 business day"), fee(false, "the transfer fee isn't refundable")];

  it("gets a decision per claim; the overall result is the most severe", async () => {
    const r = await check("TCK-9001", "instant", AYESHA, both);
    expect(r.claims.map((c) => `${c.draftClaim.topic}:${c.decision}/${c.reasonCode}`)).toEqual([
      "reversal_window:ALLOW/SUPPORTED",
      "fee_refund:HOLD/CONTRADICTS_GOVERNING",
    ]);
    expect(r.decision).toBe("HOLD");
  });

  it("the suggested reply fixes only the wrong claim and keeps the right one", async () => {
    const r = await check("TCK-9001", "instant", AYESHA, both);
    expect(r.suggestion?.text).toBe(
      "For transfers on this payment type, the current policy gives a reversal window of 1 business day. The transfer fee is refunded.",
    );
    expect(r.suggestion?.recheckDecision).toBe("ALLOW");
  });

  it("the AI rewrite is told which claim is wrong and which is right", async () => {
    let asked: Parameters<NonNullable<CheckDeps["suggestReply"]>>[0] | null = null;
    const d: CheckDeps = {
      ...deps(both),
      suggestReply: async (req) => {
        asked = req;
        throw new Error("no AI in this test");
      },
    };
    await runCheck({ ticketId: "TCK-9001", rail: "instant", draft: AYESHA, role: "support_agent", decisionTime: NOW }, d);
    expect(asked!.claims.map((c) => [c.span, c.wrong, c.correct])).toEqual([
      ["within 1 business day", false, "1 business day"],
      ["the transfer fee isn't refundable", true, "refunded"],
    ]);
  });

  it("Ask first on the timeline keeps the fee claim the reply got right", async () => {
    const draft = "Your money will be back within 4 business days, and the transfer fee is refunded with it.";
    const r = await check("TCK-9002", "unknown", draft, [timeline(4, "within 4 business days"), fee(true, "the transfer fee is refunded")]);
    expect(r.claims.map((c) => c.decision)).toEqual(["ESCALATE", "ALLOW"]);
    expect(r.decision).toBe("ESCALATE");
    expect(r.suggestion?.text).toBe(`${ESCALATE_TEMPLATE} The transfer fee is refunded.`);
    expect(r.suggestion?.recheckDecision).toBe("ALLOW");
  });

  it("MCP check_reply lists each claim with its own verdict", async () => {
    const r = await check("TCK-9001", "instant", AYESHA, both);
    const out = present(r, { id: "TCK-9001", rail: "instant" });
    expect(out.decision).toBe("Hold");
    expect(out.claims).toEqual([
      { says: "within 1 business day", topic: "reversal window", decision: "Good to send", docs_say: "1 business day" },
      { says: "the transfer fee isn't refundable", topic: "fee refund", decision: "Hold", docs_say: "refunded" },
    ]);
  });
});
