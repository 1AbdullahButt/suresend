// Phase 12, part B, written before the fixes and recorded failing in PROGRESS.md. Hand-written extractions stand in for the AI;
// the quotes are read from the seed docs, so they stay verbatim.
import { describe, expect, it } from "vitest";
import { runCheck } from "@/lib/check/runCheck";
import { decide } from "@/lib/engine/decide";
import { claimLines, summarize, traceRows, whyModel } from "@/lib/client/outcome";
import { checkReplyText, checkReply } from "@/lib/mcp/tools";
import { seedTickets } from "@/lib/workspace/seed";
import { seedBody } from "@/lib/workspace/variants";
import type { AiRunInfo, CheckDeps, DraftClaim, Rail, SourceClaim, SourceOverride } from "@/lib/engine/types";

const NOW = "2026-10-30T12:00:00Z";
const INFO: AiRunInfo = { mode: "saved", model: "test", latencyMs: 0, promptVersion: "test" };

/** The line of a seed doc that starts with these words, whole. */
const lineOf = (id: string, start: RegExp) => {
  const line = seedBody(id).split("\n").find((l) => start.test(l));
  if (!line) throw new Error(`no line ${start} in ${id}`);
  return line.trim();
};

function sc(sourceId: string, quote: string, over: Partial<SourceClaim>): SourceClaim {
  return { claimId: `${sourceId}#${quote.length}`, sourceId, sourceVersion: 1, topic: "reversal_window", value: null, valueText: "", scope: { rail: "any" }, effectiveFrom: null, statusWording: "in_force", supersedes: null, quote, ...over };
}

function sourceClaims(id: string): SourceClaim[] {
  if (id === "DOC-101") {
    return [
      sc(id, "When an outgoing transfer fails, the amount is reversed to the customer's wallet within 4 business days.", { value: { amount: 4, unit: "business_days" }, valueText: "4 business days" }),
      sc(id, "Transfer fee is refunded with the principal.", { topic: "fee_refund", value: { flag: true }, valueText: "refunded with the principal" }),
    ];
  }
  if (id === "DOC-103") {
    const exception = lineOf(id, /^For instant/);
    const sup = seedBody(id).split("\n").find((l) => l.startsWith("This supersedes"))!.split(". ")[0]! + ".";
    return [
      sc(id, exception, {
        value: { amount: 1, unit: "business_days" },
        valueText: "1 business day",
        scope: { rail: "instant" },
        effectiveFrom: "2026-10-27",
        supersedes: { targetText: "section 3 of the Outgoing Transfers – Reversal SOP", quote: sup },
      }),
    ];
  }
  return [];
}

const deps = (claims: DraftClaim[], over: Partial<CheckDeps> = {}): CheckDeps => ({
  now: () => new Date(NOW),
  extractDraft: async () => ({ claims, info: INFO }),
  extractSource: async (s) => ({ claims: sourceClaims(s.id), info: INFO }),
  ...over,
});

const fee = (flag: boolean | null, span: string, valueText = span): DraftClaim => ({ claimId: "f", topic: "fee_refund", value: flag === null ? null : { flag }, valueText, span, definitive: true });
const timeline = (amount: number | null, span: string, valueText = span): DraftClaim => ({
  claimId: "t",
  topic: "reversal_window",
  value: amount === null ? null : { amount, unit: "business_days" },
  valueText,
  span,
  definitive: true,
});

const check = (ticketId: string, rail: Rail, draft: string, claims: DraftClaim[], overrides: SourceOverride[] = [], over: Partial<CheckDeps> = {}) =>
  runCheck({ ticketId, rail, draft, role: "support_agent", overrides, decisionTime: NOW }, deps(claims, over));

describe("a question the reply leaves open reads as a missing answer, not an error", () => {
  const draft = "The transfer fee is refunded with your money.";
  const refunded = [fee(true, draft, "refunded with your money")];

  it("says what's missing, then what the docs say", async () => {
    const r = await check("TCK-9001", "instant", draft, refunded);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "TOPIC_GAP"]);
    expect(summarize(r, "instant").sentence).toBe("Your reply doesn't answer their question about timing. Your docs say 1 business day.");
  });

  it("on a standard transfer, the value is that transfer's", async () => {
    const r = await check("TCK-9003", "standard", draft, refunded);
    expect(summarize(r, "standard").sentence).toBe("Your reply doesn't answer their question about timing. Your docs say 4 business days.");
  });

  it("with the transfer type unknown and the docs differing by type, no value is named", async () => {
    const r = await check("TCK-9002", "unknown", draft, refunded);
    expect(summarize(r, "unknown").sentence).toBe("Your reply doesn't answer their question about timing. Your docs don't give one answer for this ticket.");
  });

  it("with a doc unread, it says so rather than naming the next doc's value (D-046)", async () => {
    const r = await check("TCK-9001", "instant", draft, refunded, [], {
      extractSource: async (s) => {
        if (s.id === "DOC-103") throw new Error("down");
        return { claims: sourceClaims(s.id), info: INFO };
      },
    });
    expect(summarize(r, "instant").sentence).toBe("Your reply doesn't answer their question about timing. DOC-103 couldn't be read, so SureSend can't say what your docs give.");
  });

  it("with no doc on the topic, it only says what's missing", async () => {
    const r = await check("TCK-9001", "instant", draft, refunded, [], {
      extractSource: async (s) => ({ claims: sourceClaims(s.id).filter((c) => c.topic === "fee_refund"), info: INFO }),
    });
    expect(r.reasonCode).toBe("TOPIC_GAP");
    expect(summarize(r, "instant").sentence).toBe("Your reply doesn't answer their question about timing.");
  });

  it("the topic asked can be the fee", () => {
    const src = seedBody("DOC-101");
    const out = decide(
      {
        draft: { ok: true, text: "Back within 4 business days.", claims: [timeline(4, "Back within 4 business days")], rejectedCount: 0 },
        sources: { "DOC-101": { ok: true, claims: sourceClaims("DOC-101") } },
      },
      [{ id: "DOC-101", title: "Outgoing Transfers: Reversal SOP", kind: "sop", body: src, version: 1, verification: "verified", verifiedAt: "2026-10-01", updatedAt: "2026-09-30", owner: { name: "Sara", active: true }, flaggedOutdated: false, flagNote: null, visibility: "everyone" }],
      { id: "TCK-9003", rail: "standard", message: "Do I get the transfer fee back, and when does the money come back?" },
      new Date(NOW),
    );
    const gap = out.claims.find((c) => c.reasonCode === "TOPIC_GAP");
    expect(gap?.draftClaim.topic).toBe("fee_refund");
    const only = { ...out, checkHash: "x", suggestion: null, rejectedExtractions: [], ai: INFO, claims: [gap!] };
    expect(summarize(only, "standard").sentence).toBe("Your reply doesn't answer their question about the fee. Your docs say it's refunded.");
  });

  it("MCP says the same, in the same words", async () => {
    const out = await checkReply({ reply: draft, ticket_id: "TCK-9001" }, deps(refunded));
    if (!out.ok) throw new Error("unexpected");
    expect(out.value.reason).toBe("Your reply doesn't answer their question about timing. Your docs say 1 business day.");
    expect(out.value.headline).toMatch(/^Caution: the draft doesn't answer the customer's question about timing\. The policy says 1 business day \(/);
    expect(checkReplyText(out.value)).toContain("doesn't answer the customer's question about timing");
  });
});

describe("two claims with one span show each claim's value", () => {
  const draft = "You'll see it reflected after the weekend, minus the processing charge.";

  it("the sentence isn't repeated: each line gives its own words", async () => {
    const r = await check("TCK-9001", "instant", draft, [timeline(null, draft, "after the weekend"), fee(false, draft, "minus the processing charge")]);
    expect(claimLines(r).map((l) => l.says)).toEqual(["after the weekend", "minus the processing charge"]);
  });

  it("so does the trace's row for each claim", async () => {
    const r = await check("TCK-9001", "instant", draft, [timeline(null, draft, "after the weekend"), fee(false, draft, "minus the processing charge")]);
    const rows = traceRows(r).filter((t) => t.rule === "Claim").map((t) => t.summary);
    expect(rows[0]).toContain("“after the weekend”");
    expect(rows[1]).toContain("“minus the processing charge”");
    expect(rows.join(" ")).not.toContain(draft);
    // A yes/no claim's own row quotes its words too.
    const said = traceRows(r).filter((t) => t.rule === "D0").map((t) => t.summary).join(" ");
    expect(said).toContain("minus the processing charge");
    expect(said).not.toContain(draft);
  });

  it("different spans still show the reply's own words", async () => {
    const a = "Back within 1 business day";
    const b = "the transfer fee isn't refundable";
    const r = await check("TCK-9001", "instant", `${a}, but ${b}.`, [timeline(1, a, "1 business day"), fee(false, b, "isn't refundable")]);
    expect(claimLines(r).map((l) => l.says)).toEqual([a, b]);
  });

  it("the same span with no value text of its own keeps the span", async () => {
    const r = await check("TCK-9001", "instant", draft, [timeline(null, draft, ""), fee(false, draft, "")]);
    expect(claimLines(r).map((l) => l.says)).toEqual([draft, draft]);
  });
});

describe("a claim outside the topics", () => {
  const draft = "There's a €2 fee on every transfer.";
  const amount: DraftClaim = { claimId: "o", topic: "other", value: { quantity: 2, of: "EUR" }, valueText: "€2 fee", span: draft, definitive: true };

  it("quotes the reply's words rather than rewording them", async () => {
    const r = await check("TCK-9003", "standard", draft, [amount]);
    expect(r.reasonCode).toBe("OUTSIDE_COVERAGE");
    expect(summarize(r, "standard").sentence).toBe("Your reply says “€2 fee”, which SureSend doesn't cover. Check it against the source.");
    expect(whyModel(r).replySays).toBe("€2 fee");
  });
});

describe("a Hold names a transfer type only when the rule is about one", () => {
  const notRefunded = "The transfer fee isn't refundable.";
  const wrongFee = [fee(false, notRefunded, "isn't refundable")];

  it("the fee rule covers all transfers: no type, on either ticket", async () => {
    for (const [id, rail] of [["TCK-9001", "instant"], ["TCK-9003", "standard"]] as const) {
      const r = await check(id, rail, notRefunded, wrongFee);
      expect(r.headline, id).toBe("Hold: the transfer fee is refunded (Outgoing Transfers: Reversal SOP). The draft says it's not refunded.");
      expect(summarize(r, rail).sentence, id).toBe("The transfer fee is refunded. Your reply says it's not refunded.");
    }
  });

  it("the same when the reply matches", async () => {
    const said = "Back within 1 business day, and the transfer fee is refunded.";
    const r = await check("TCK-9001", "instant", said, [timeline(1, "Back within 1 business day", "1 business day"), fee(true, "the transfer fee is refunded", "refunded")]);
    expect(r.decision).toBe("ALLOW");
    const feeOnly = { ...r, claims: [r.claims[1]!] };
    expect(summarize(feeOnly, "instant").sentence).toBe("The transfer fee is refunded. Your reply matches.");
  });

  it("the exception is about instant transfers, so it says so", async () => {
    const r = await check("TCK-9001", "instant", "Reversed within 4 business days.", [timeline(4, "Reversed within 4 business days", "4 business days")]);
    expect(r.headline).toMatch(/^Hold: instant transfers reverse in 1 business day \(/);
    expect(summarize(r, "instant").sentence).toBe("Instant transfers now reverse in 1 business day. Your reply says 4.");
  });

  it("a general rule beside an exception still names the ticket's type: with another type on a different value, \"failed transfers\" would be false", async () => {
    const r = await check("TCK-9003", "standard", "Reversed within 1 business day.", [timeline(1, "Reversed within 1 business day", "1 business day")]);
    expect(r.headline).toMatch(/^Hold: standard transfers reverse in 4 business days \(/);
    // "Now" is for a value that replaced another. Nothing changed for standard transfers.
    expect(summarize(r, "standard").sentence).toBe("Standard transfers reverse in 4 business days. Your reply says 1.");
  });

  it("a general rule with no exception names no type", async () => {
    const gone: SourceOverride[] = [{ id: "DOC-103", deleted: true }];
    const r = await check("TCK-9003", "standard", "Reversed within 1 business day.", [timeline(1, "Reversed within 1 business day", "1 business day")], gone);
    expect(r.headline).toMatch(/^Hold: failed transfers reverse in 4 business days \(/);
    expect(summarize(r, "standard").sentence).toBe("Failed transfers reverse in 4 business days. Your reply says 1.");
  });

  it("no seed ticket's card says \"for instant\" about a rule for all transfers", async () => {
    for (const t of seedTickets().filter((x) => x.rail !== "unknown")) {
      const r = await check(t.id, t.rail, notRefunded, wrongFee);
      expect(`${r.headline} ${summarize(r, t.rail).sentence}`, t.id).not.toMatch(/for (?:instant|standard)/i);
    }
  });
});
