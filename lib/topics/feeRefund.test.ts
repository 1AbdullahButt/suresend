// Phase 10 (D-041): the fee_refund topic through the unchanged rules. Hand-written extractions stand in for the AI; the
// quotes are the seed docs' own sentences, so runCheck's quote validation runs for real.
import { describe, expect, it } from "vitest";
import { runCheck } from "@/lib/check/runCheck";
import { claimCards, summarize, traceRows, whyModel } from "@/lib/client/outcome";
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

describe("the nothing-found net works per topic (QA, D-041)", () => {
  it("a fee claim doesn't vouch for a timeline the AI missed: Double-check, not Good to send", async () => {
    const draft = "The transfer fee is refunded with your money, and it will be back in 4 business days.";
    const r = await check("TCK-9001", "instant", draft, [fee(true, "The transfer fee is refunded with your money")]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "EXTRACTION_GAP"]);
    expect(r.claims.map((c) => `${c.draftClaim.topic}:${c.decision}/${c.reasonCode}`)).toEqual([
      "fee_refund:ALLOW/SUPPORTED",
      "reversal_window:CAUTION/EXTRACTION_GAP",
    ]);
    expect(r.claims[1]?.draftClaim.valueText).toBe("4 business days");
  });

  // QA round 2: the model often gives the whole sentence as a claim's span, so a span says nothing about other topics.
  it("a fee claim with a whole-sentence span doesn't vouch for the timeline in that sentence", async () => {
    const draft = "The transfer fee is refunded with your money, and it will be back in 4 business days.";
    const r = await check("TCK-9001", "instant", draft, [fee(true, draft)]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "EXTRACTION_GAP"]);
    expect(r.claims.map((c) => c.draftClaim.topic)).toEqual(["fee_refund", "reversal_window"]);
  });

  it("a wrong timeline inside a fee claim's span is flagged, not Good to send", async () => {
    const draft = "Your money and the transfer fee will be refunded within 4 business days.";
    const r = await check("TCK-9001", "instant", draft, [fee(true, draft)]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "EXTRACTION_GAP"]);
  });

  it("a wrong fee statement inside a timeline claim's span is flagged, not Good to send", async () => {
    const draft = "Your money will be back in 1 business day, but the transfer fee isn't refundable.";
    const r = await check("TCK-9001", "instant", draft, [timeline(1, draft)]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "EXTRACTION_GAP"]);
    expect(r.claims.map((c) => c.draftClaim.topic)).toEqual(["reversal_window", "fee_refund"]);
  });

  it("the card and the trace name only what was missed, not the claim that was found", async () => {
    const draft = "The transfer fee is refunded with your money, and it will be back in 4 business days.";
    const r = await check("TCK-9001", "instant", draft, [fee(true, "The transfer fee is refunded with your money")]);
    const card = summarize(r, "instant");
    expect(card.headline).toBe("Couldn't confirm the timing");
    expect(card.sentence).toContain("“4 business days”");
    expect(card.sentence).not.toContain("transfer fee");
    const row = traceRows(r).find((x) => x.rule === "D0b" && x.outcome === "fired");
    expect(row?.summary).toBe("No claim on the timing was extracted, but the reply mentions “4 business days”. Check it by hand.");
  });

  it("Why never says the docs are silent about something it didn't compare", async () => {
    const draft = "The transfer fee is refunded with your money, and it will be back in 4 business days.";
    const r = await check("TCK-9001", "instant", draft, [fee(true, "The transfer fee is refunded with your money")]);
    const gap = claimCards(r).find((c) => c.model.replySays === "4 business days");
    expect(gap?.model.governing).toBeNull();
    expect(gap?.model.noDocs).toBe("SureSend didn't compare this with your docs, because the AI didn't pick it up as a claim. Check it by hand.");

    const noClaims = await check("TCK-9001", "instant", "Your money will be back in 4 business days.", []);
    expect(whyModel(noClaims).noDocs).toContain("didn't compare this with your docs");

    const amount: DraftClaim = { claimId: "d#3", topic: "other", value: { quantity: 25, of: "PKR" }, valueText: "PKR 25", span: "a PKR 25 fee", definitive: true };
    const outside = await check("TCK-9003", "standard", "There's a PKR 25 fee on every transfer.", [amount]);
    expect(whyModel(outside).noDocs).toBe("SureSend doesn't check this topic against your docs. Check it by hand.");
  });

  it("a detector hit inside another topic's hit doesn't change which topic the card names", async () => {
    const draft = "The fee in 4 days is refunded, and your money will be back in 1 business day.";
    const r = await check("TCK-9001", "instant", draft, [timeline(1, "your money will be back in 1 business day")]);
    expect(summarize(r, "instant").headline).toBe("Couldn't confirm the fee refund");
  });

  it("a timeline word inside a fee claim's own words gets a Double-check: the safe direction", async () => {
    const draft = "The transfer fee is refunded within the same transfer.";
    const r = await check("TCK-9003", "standard", draft, [fee(true, draft)]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "EXTRACTION_GAP"]);
  });

  it("an out-of-topic claim's span still accounts for a hit, as the spec says", async () => {
    const draft = "There's a PKR 25 fee on every transfer.";
    const amount: DraftClaim = { claimId: "d#3", topic: "other", value: { quantity: 25, of: "PKR" }, valueText: "PKR 25", span: draft, definitive: true };
    const r = await check("TCK-9003", "standard", draft, [amount]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "OUTSIDE_COVERAGE"]);
  });

  it("a timeline claim doesn't vouch for a fee statement the AI missed", async () => {
    const draft = "Your money will be back within 4 business days, and the transfer fee isn't refundable.";
    const r = await check("TCK-9003", "standard", draft, [timeline(4, "within 4 business days")]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "EXTRACTION_GAP"]);
    expect(r.claims.at(-1)?.draftClaim.topic).toBe("fee_refund");
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
