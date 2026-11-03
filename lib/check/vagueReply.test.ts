// Phase 11 (D-045), written before the fix and recorded failing in PROGRESS.md. A reply with no number used to pass: the
// AI found no claim, the detector found no pattern, so the engine said Good to send and the UI said "got the right answer".
// Hand-written extractions stand in for the AI, in both ways it can read these replies; the quotes are the seed docs' own.
import { describe, expect, it } from "vitest";
import { handleSend } from "@/lib/check/handlers";
import { runCheck } from "@/lib/check/runCheck";
import { decide } from "@/lib/engine/decide";
import { topicsAsked } from "@/lib/topics";
import { sentCopy, summarize, traceRows, whyModel } from "@/lib/client/outcome";
import { checkReply } from "@/lib/mcp/tools";
import { ESCALATE_TEMPLATE } from "@/lib/replies/templates";
import { seedTickets } from "@/lib/workspace/seed";
import { draftSave, seedBody } from "@/lib/workspace/variants";
import type { AiRunInfo, CheckDeps, DraftClaim, Rail, Source, SourceClaim } from "@/lib/engine/types";

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
    statusWording: "in_force",
    supersedes: null,
    quote,
    ...over,
  };
}

function sourceClaims(id: string): SourceClaim[] {
  if (id === "DOC-101") {
    return [
      sc(id, "When an outgoing transfer fails, the amount is reversed to the customer's wallet within 4 business days.", {
        value: { amount: 4, unit: "business_days" },
        valueText: "4 business days",
      }),
      sc(id, "Transfer fee is refunded with the principal.", { topic: "fee_refund", value: { flag: true }, valueText: "refunded with the principal" }),
    ];
  }
  if (id === "DOC-103") {
    return [
      sc(id, "For instant transfers only, failed transfers are reversed within 1 business day.", {
        value: { amount: 1, unit: "business_days" },
        valueText: "1 business day",
        scope: { rail: "instant" },
        effectiveFrom: "2026-10-27",
        supersedes: {
          targetText: "section 3 of the Outgoing Transfers – Reversal SOP",
          quote: "This supersedes section 3 of the Outgoing Transfers – Reversal SOP for instant transfers.",
        },
      }),
    ];
  }
  return [];
}

const vague = (topic: DraftClaim["topic"], span: string, i: number): DraftClaim => ({ claimId: `d${i}`, topic, value: null, valueText: span, span, definitive: true });

function depsFor(draftClaims: DraftClaim[]): CheckDeps {
  return {
    now: () => new Date(NOW),
    extractDraft: async () => ({ claims: draftClaims, info: INFO }),
    extractSource: async (s) => ({ claims: sourceClaims(s.id), info: INFO }),
  };
}

interface Case {
  id: string;
  ticketId: string;
  rail: Rail;
  draft: string;
  /** The vague words a good extractor returns, by topic. */
  vague: Array<[DraftClaim["topic"], string]>;
  /** What the docs say about the timeline on this ticket; null when the rail is unknown and no one value applies. */
  docs: string | null;
}

/** The first is the live-demo repro from the independent review; the other five are natural rewordings. */
const CASES: Case[] = [
  {
    id: "repro",
    ticketId: "TCK-9001",
    rail: "instant",
    draft: "Nothing to do on your side: the reversal is automatic and you'll see it reflected after the weekend, minus the processing charge.",
    vague: [
      ["reversal_window", "after the weekend"],
      ["fee_refund", "minus the processing charge"],
    ],
    docs: "1 business day",
  },
  {
    id: "week-out",
    ticketId: "TCK-9001",
    rail: "instant",
    draft: "No action needed from you. The money lands back in your wallet before the week is out.",
    vague: [["reversal_window", "before the week is out"]],
    docs: "1 business day",
  },
  {
    id: "very-soon",
    ticketId: "TCK-9003",
    rail: "standard",
    draft: "All sorted on our end, the refund is on its way and will show up very soon.",
    vague: [["reversal_window", "very soon"]],
    docs: "4 business days",
  },
  {
    id: "monday-less-charge",
    ticketId: "TCK-9001",
    rail: "instant",
    draft: "You can relax, the funds return on their own by Monday, less the small charge for the transfer.",
    vague: [
      ["reversal_window", "by Monday"],
      ["fee_refund", "less the small charge for the transfer"],
    ],
    docs: "1 business day",
  },
  {
    id: "unknown-rail",
    ticketId: "TCK-9002",
    rail: "unknown",
    draft: "Hang tight, the bank sends these back on its own schedule and it never takes long.",
    vague: [["reversal_window", "it never takes long"]],
    docs: null,
  },
  {
    id: "next-week",
    ticketId: "TCK-9003",
    rail: "standard",
    draft: "Your balance gets topped up again early next week.",
    vague: [["reversal_window", "early next week"]],
    docs: "4 business days",
  },
];

const input = (c: Case) => ({ ticketId: c.ticketId, rail: c.rail, draft: c.draft, role: "support_agent" as const, overrides: [], decisionTime: NOW });

describe("the AI finds nothing in a vague reply: the customer's question is still unanswered", () => {
  it.each(CASES)("$id: Double-check, never Good to send", async (c) => {
    const r = await runCheck(input(c), depsFor([]));
    expect(r.decision).toBe("CAUTION");
    // A fee taken off the money also trips the fee detector (D-052), so D0b gives the reason there.
    expect(r.reasonCode).toBe(c.id === "monday-less-charge" || c.id === "repro" ? "EXTRACTION_GAP" : "TOPIC_GAP");
    expect(r.trace.find((t) => t.rule === "D0e")?.outcome).toBe("fired");
    expect(r.claims.some((x) => x.reasonCode === "TOPIC_GAP" && x.governing?.valueText === (c.docs ?? undefined)) || c.docs === null).toBe(true);
  });

  it.each(CASES)("$id: Send needs a person's OK", async (c) => {
    const send = await handleSend({ ticketId: c.ticketId, rail: c.rail, draft: c.draft, role: "support_agent", overrides: [] }, depsFor([]));
    expect(send.status).toBe(428);
  });

  it.each(CASES)("$id: the plain sentence says what the docs say, and that the reply doesn't", async (c) => {
    const r = await runCheck(input(c), depsFor([]));
    const { headline, sentence } = summarize(r, c.rail);
    expect(headline).not.toMatch(/right/i);
    if (c.id === "monday-less-charge" || c.id === "repro") return expect(sentence).toMatch(/couldn't confirm the fee refund/);
    if (c.docs) expect(sentence).toContain(c.docs);
    expect(sentence).toMatch(/your reply doesn't/i);
  });
});

describe("the fee taken off the money reads as not refunded (D-052)", () => {
  const fee = (span: string): DraftClaim => ({ claimId: "f", topic: "fee_refund", value: { flag: false }, valueText: span, span, definitive: true });

  it("the repro: a Hold, naming the fee, with a suggested reply that states both values", async () => {
    const c = CASES[0]!;
    const claims = [vague("reversal_window", "after the weekend", 0), fee("minus the processing charge")];
    const r = await runCheck(input(c), depsFor(claims));
    expect(r.decision).toBe("HOLD");
    expect(r.reasonCode).toBe("CONTRADICTS_GOVERNING");
    const { headline, sentence } = summarize(r, c.rail);
    expect(headline).toBe("Don't send this yet");
    expect(sentence).toBe("The transfer fee is refunded. Your reply says it's not refunded.");
    expect(r.suggestion?.text).toContain("1 business day");
    expect(r.suggestion?.text).toContain("refunded");
    expect(r.suggestion?.recheckDecision).toBe("ALLOW");
  });

  it("Send is blocked, not waiting for an OK", async () => {
    const c = CASES[0]!;
    const send = await handleSend(
      { ticketId: c.ticketId, rail: c.rail, draft: c.draft, role: "support_agent", overrides: [] },
      depsFor([vague("reversal_window", "after the weekend", 0), fee("minus the processing charge")]),
    );
    expect(send.status).toBe(409);
  });

  it("if the AI misses the fee and states the timeline, the detector still stops it going out as Good to send", async () => {
    const draft = "Back within 1 business day, minus the processing charge.";
    const timeline: DraftClaim = { claimId: "t", topic: "reversal_window", value: { amount: 1, unit: "business_days" }, valueText: "1 business day", span: "within 1 business day", definitive: true };
    const r = await runCheck({ ...input(CASES[1]!), draft }, depsFor([timeline]));
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("EXTRACTION_GAP");
  });
});

describe("the AI reads the vague words as a claim with no value", () => {
  const claimsOf = (c: Case) => c.vague.map(([topic, span], i) => vague(topic, span, i));

  it.each(CASES)("$id: Double-check, and the claim carries the governing value", async (c) => {
    const r = await runCheck(input(c), depsFor(claimsOf(c)));
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("UNSUPPORTED");
    expect(r.claims[0]?.governing?.valueText ?? null).toBe(c.docs);
  });

  it.each(CASES.filter((c) => c.docs))("$id: shows the governing value, not 'No doc backs this up'", async (c) => {
    const r = await runCheck(input(c), depsFor(claimsOf(c)));
    const { headline, sentence } = summarize(r, c.rail);
    expect(headline).not.toBe("No doc backs this up");
    expect(sentence).toBe(`Your docs say ${c.docs}; your reply gives no number.`);
  });

  it("a fee claim with no value shows the fee's governing value in its own words", async () => {
    const c = CASES[0]!;
    const r = await runCheck(input(c), depsFor(claimsOf(c)));
    const fee = whyModel(r, r.claims[1]!);
    expect(r.claims[1]?.governing?.valueText).toBe("refunded");
    expect(fee.governing?.id).toBe("DOC-101");
    expect(summarize({ ...r, claims: [r.claims[1]!] }, c.rail).sentence).toBe("Your docs say refunded; your reply doesn't say it plainly.");
  });

  it("the rail is unknown and the docs differ by rail: no one value is named, and the reply still can't pass", async () => {
    const c = CASES.find((x) => x.id === "unknown-rail")!;
    const r = await runCheck(input(c), depsFor(claimsOf(c)));
    expect(r.claims[0]?.governing).toBeNull();
    const { headline, sentence } = summarize(r, c.rail);
    expect(headline).not.toBe("No doc backs this up");
    expect(sentence).toMatch(/your reply gives no number/i);
  });

  it("the trace still records why, and the decision is unchanged by showing the value (D-012.4)", async () => {
    const c = CASES[1]!;
    const r = await runCheck(input(c), depsFor(claimsOf(c)));
    const d3 = r.claims[0]!.trace.find((t) => t.rule === "D3")!;
    expect(d3.outcome).toBe("fired");
    expect(d3.detail).toContain("1 business day");
    expect(r.headline).toContain("1 business day");
  });
});

describe("a doc that governs can't be read: no other doc's value is offered as the answer", () => {
  const unreadDeps = (claims: DraftClaim[]): CheckDeps => ({
    ...depsFor(claims),
    extractSource: async (s) => {
      if (s.id === "DOC-103") throw new Error("simulated extraction failure");
      return { claims: sourceClaims(s.id), info: INFO };
    },
  });
  const repro = CASES[0]!;
  const claimsOf = repro.vague.map(([topic, span], i) => vague(topic, span, i));

  it("a claim with no value names no value, and the card says why", async () => {
    const r = await runCheck(input(repro), unreadDeps(claimsOf));
    expect(r.decision).toBe("CAUTION");
    expect(r.claims.map((c) => c.governing)).toEqual([null, null]);
    const { headline, sentence } = summarize(r, repro.rail);
    expect(headline).toBe("Your reply is vague on this");
    expect(sentence).toBe("DOC-103 couldn't be read, so SureSend can't say what your docs give; your reply gives no number.");
    expect(r.headline).not.toContain("4 business days");
    const why = whyModel(r, r.claims[0]!);
    expect(why.governing).toBeNull();
    expect(why.others.every((o) => o.label === "Can't confirm")).toBe(true);
    expect(why.didntCount.map((d) => d.text)).toContain("DOC-103 couldn't be read.");
    expect(why.so).toContain("couldn't be read");
    expect(why.so).not.toMatch(/agree/i);
  });

  it("a silent reply names no value either", async () => {
    const r = await runCheck(input(CASES[1]!), unreadDeps([]));
    expect(r.reasonCode).toBe("TOPIC_GAP");
    expect(r.claims[0]?.governing).toBeNull();
    expect(summarize(r, "instant").sentence).toBe("Your reply doesn't answer their question about timing. DOC-103 couldn't be read, so SureSend can't say what your docs give.");
  });

  it("MCP reports no governing value", async () => {
    const out = await checkReply({ reply: repro.draft, ticket_id: "TCK-9001" }, unreadDeps(claimsOf));
    expect(out.ok && out.value.governing).toBeNull();
    expect(out.ok && out.value.claims.map((c) => c.docs_say)).toEqual([null, null]);
  });

  it("a Hold's suggested reply doesn't state the other doc's value for the vague claim", async () => {
    const fee: DraftClaim = { claimId: "f", topic: "fee_refund", value: { flag: false }, valueText: "isn't refundable", span: "the transfer fee isn't refundable", definitive: true };
    const draft = "You'll have it after the weekend, but the transfer fee isn't refundable.";
    const r = await runCheck({ ...input(repro), draft }, unreadDeps([vague("reversal_window", "after the weekend", 0), fee]));
    expect(r.decision).toBe("HOLD");
    expect(r.suggestion?.text).not.toContain("4 business days");
  });
});

describe("the docs' value when the doc behind it is in doubt", () => {
  it("says so, as the comparison path does", async () => {
    const c = CASES.find((x) => x.id === "next-week")!;
    const edited = draftSave("DOC-101", `${seedBody("DOC-101").trimEnd()}\n\nEdited.\n`, "2026-10-29T09:00:00Z");
    const r = await runCheck({ ...input(c), overrides: [edited] }, depsFor([vague("reversal_window", "early next week", 0)]));
    expect(summarize(r, c.rail).sentence).toBe("Your docs say 4 business days, but that doc is in doubt; your reply gives no number.");
  });
});

describe("only SureSend's own holding reply gets past D0e", () => {
  it.each([
    "I'm confirming the exact reversal timeline for your transfer, but you'll see it reflected after the weekend, minus the processing charge.",
    "Don't worry about the exact reversal timeline: you'll see it reflected after the weekend, minus the processing charge.",
    "We never share the exact reversal timeline, so please stop asking.",
    "THE EXACT REVERSAL TIMELINE IS AFTER THE WEEKEND.",
    `${ESCALATE_TEMPLATE} You'll see it reflected after the weekend.`,
    `You'll see it after the weekend. ${ESCALATE_TEMPLATE}`,
    ESCALATE_TEMPLATE.replace("the exact reversal timeline", "the exact reversal timeline and when it lands"),
  ])("the AI finds nothing in %j: still a Double-check", async (draft) => {
    const r = await runCheck({ ...input(CASES[4]!), draft }, depsFor([]));
    expect(r.decision).toBe("CAUTION");
    // A fee taken off the money trips the fee detector as well (D-052); either way the timeline gets its own entry.
    expect(r.reasonCode).toBe(draft.includes("minus the processing charge") ? "EXTRACTION_GAP" : "TOPIC_GAP");
    expect(r.claims.some((c) => c.reasonCode === "TOPIC_GAP")).toBe(true);
    const send = await handleSend({ ticketId: "TCK-9002", rail: "unknown", draft, role: "support_agent", overrides: [] }, depsFor([]));
    expect(send.status).toBe(428);
  });

  // The two readings QA built: words after the sentence that the AI's own span "covers" account for nothing.
  it("a claim the rules ignore can't vouch for words added after the sentence", async () => {
    const added = "You'll see it reflected after the weekend, minus the processing charge.";
    const draft = `${ESCALATE_TEMPLATE} ${added}`;
    const other: DraftClaim = { claimId: "o", topic: "other", value: null, valueText: "", span: added, definitive: true };
    const r = await runCheck({ ...input(CASES[4]!), draft }, depsFor([other]));
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("EXTRACTION_GAP"); // the fee detector, D-052
    expect(r.claims.some((c) => c.reasonCode === "TOPIC_GAP")).toBe(true);
  });

  it("a right fee claim with a wide span can't vouch for timing words", async () => {
    const added = "The transfer fee is refunded and you'll see the money after the weekend.";
    const fee: DraftClaim = { claimId: "f", topic: "fee_refund", value: { flag: true }, valueText: "refunded", span: added, definitive: true };
    const r = await runCheck({ ...input(CASES[4]!), draft: `${ESCALATE_TEMPLATE} ${added}` }, depsFor([fee]));
    expect(r.decision).toBe("CAUTION");
    expect(r.claims.map((c) => c.reasonCode)).toEqual(["SUPPORTED", "TOPIC_GAP"]);
  });

  // The real saved reading of "…as soon as I have it. The transfer fee is refunded." (QA round 2): the AI read SureSend's own sentence as a timeline with no value.
  it.each([
    ["the whole sentence", ESCALATE_TEMPLATE],
    ["part of it", "the exact reversal timeline"],
    ["the promise", "I'm confirming the exact reversal timeline for your transfer and will update you here as soon as I have it."],
  ])("the AI reads %s as a claim with no value: not a claim, so the reply goes out", async (_label, span) => {
    const own: DraftClaim = { claimId: "o", topic: "reversal_window", value: null, valueText: "", span, definitive: true };
    const fee: DraftClaim = { claimId: "f", topic: "fee_refund", value: { flag: true }, valueText: "refunded", span: "The transfer fee is refunded", definitive: true };
    const kept = `${ESCALATE_TEMPLATE} The transfer fee is refunded.`;
    const base = { ticketId: "TCK-9002", rail: "unknown" as const, role: "support_agent" as const, overrides: [] };
    expect((await handleSend({ ...base, draft: kept }, depsFor([own, fee]))).status).toBe(200);
    // Alone, it's the only claim: it mustn't count as "every claim rejected", which would read as the AI failing.
    expect((await handleSend({ ...base, draft: ESCALATE_TEMPLATE }, depsFor([own]))).status).toBe(200);
  });

  it("the claim set aside stays on the record, without counting as the AI failing", async () => {
    const own: DraftClaim = { claimId: "o", topic: "reversal_window", value: null, valueText: "", span: "the exact reversal timeline", definitive: true };
    const r = await runCheck({ ...input(CASES[4]!), draft: ESCALATE_TEMPLATE }, depsFor([own]));
    expect(r.decision).toBe("ALLOW");
    expect(r.rejectedExtractions).toEqual([{ sourceId: "DRAFT", reason: "OWN_HOLDING_SENTENCE", snippet: "the exact reversal timeline" }]);
  });

  // QA round 3: a span is just words. With anything added to the reply, one that happens to match the sentence is about those words.
  describe("with words added, a span that matches the sentence is still a claim", () => {
    const timeline: DraftClaim = { claimId: "t", topic: "reversal_window", value: { amount: 1, unit: "business_days" }, valueText: "1 business day", span: "Back within 1 business day", definitive: true };
    const lea = CASES[1]!;

    it("a vague fee whose span is a fragment of the sentence", async () => {
      const fee: DraftClaim = { claimId: "f", topic: "fee_refund", value: null, valueText: "minus the charge", span: "for your transfer", definitive: true };
      const draft = `${ESCALATE_TEMPLATE} Back within 1 business day, minus the charge for your transfer.`;
      const r = await runCheck({ ...input(lea), draft }, depsFor([timeline, fee]));
      expect(r.decision).toBe("CAUTION");
      expect(r.rejectedExtractions).toEqual([]);
    });

    it("a second, vague timeline claim", async () => {
      const second: DraftClaim = { claimId: "s", topic: "reversal_window", value: null, valueText: "as soon as I have it", span: "as soon as I have it", definitive: true };
      const draft = `${ESCALATE_TEMPLATE} Back within 1 business day, or as soon as I have it.`;
      const r = await runCheck({ ...input(lea), draft }, depsFor([timeline, second]));
      expect(r.decision).toBe("CAUTION");
    });

    it("MCP with no ticket, where D0e can't step in: the AI read only the sentence", async () => {
      const own: DraftClaim = { claimId: "o", topic: "reversal_window", value: null, valueText: "", span: "the exact reversal timeline", definitive: true };
      const out = await checkReply({ reply: `${ESCALATE_TEMPLATE} You'll see it reflected after the weekend.` }, depsFor([own]));
      expect(out.ok && out.value.engine_decision).toBe("CAUTION");
      expect(out.ok && out.value.reason_code).toBe("UNSUPPORTED");
    });
  });

  it("that doesn't reach past the sentence: a vague claim on words after it still counts, and so does one in any other reply", async () => {
    const after: DraftClaim = { claimId: "a", topic: "reversal_window", value: null, valueText: "after the weekend", span: "after the weekend", definitive: true };
    const r = await runCheck({ ...input(CASES[4]!), draft: `${ESCALATE_TEMPLATE} You'll see it after the weekend.` }, depsFor([after]));
    expect(r.reasonCode).toBe("UNSUPPORTED");
    const similar = "I'm confirming the exact reversal timeline for your transfer.";
    const own: DraftClaim = { claimId: "o", topic: "reversal_window", value: null, valueText: "", span: similar, definitive: true };
    expect((await runCheck({ ...input(CASES[4]!), draft: similar }, depsFor([own]))).reasonCode).toBe("UNSUPPORTED");
  });

  it("the holding reply with a kept claim after it, as Ask first suggests it, still goes out", async () => {
    const draft = `${ESCALATE_TEMPLATE} The transfer fee is refunded.`;
    const fee: DraftClaim = { claimId: "f", topic: "fee_refund", value: { flag: true }, valueText: "refunded", span: "transfer fee is refunded", definitive: true };
    const send = await handleSend({ ticketId: "TCK-9002", rail: "unknown", draft, role: "support_agent", overrides: [] }, depsFor([fee]));
    expect(send.status).toBe(200);
  });
});

describe("a suggested reply that drops an answer the draft gave", () => {
  const timeline: DraftClaim = { claimId: "t", topic: "reversal_window", value: { amount: 4, unit: "business_days" }, valueText: "4 business days", span: "within 4 business days", definitive: true };
  const FOUR = "Failed transfers are reversed within 4 business days.";
  const withRewrite = (draftClaims: DraftClaim[], rewrite: string): CheckDeps => ({
    ...depsFor(draftClaims),
    extractDraft: async (text) => ({ claims: text === rewrite ? [] : draftClaims, info: INFO }),
    suggestReply: async () => ({ text: rewrite, info: INFO }),
  });

  it("loses to the template, which states the value", async () => {
    const r = await runCheck({ ...input(CASES[1]!), draft: FOUR }, withRewrite([timeline], "Thanks for your patience, our team is on it."));
    expect(r.decision).toBe("HOLD");
    expect(r.suggestion?.origin).toBe("template");
    expect(r.suggestion?.text).toContain("1 business day");
    expect(r.suggestion?.recheckDecision).toBe("ALLOW");
  });

  // The doc itself can have the typo: a tour visitor changing only the digit gets "2 business day" in DOC-103, and the model copied it.
  it("a rewrite that doesn't state the value as given loses to the template", async () => {
    const r = await runCheck({ ...input(CASES[1]!), draft: FOUR }, {
      ...withRewrite([timeline], "Failed transfers are reversed within one working day."),
      extractDraft: async (text) => ({ claims: text === FOUR ? [timeline] : [{ ...timeline, value: { amount: 1, unit: "business_days" }, valueText: "one working day", span: "within one working day" }], info: INFO }),
    });
    expect(r.suggestion?.origin).toBe("template");
    expect(r.suggestion?.text).toContain("1 business day");
  });

  it("a fee-only draft had no timeline to drop, so its rewrite stands, with a Double-check that says why", async () => {
    const fee: DraftClaim = { claimId: "f", topic: "fee_refund", value: { flag: false }, valueText: "isn't refundable", span: "The transfer fee isn't refundable", definitive: true };
    const rewrite = "The transfer fee is refunded with your money.";
    const deps: CheckDeps = {
      ...depsFor([fee]),
      extractDraft: async (text) => ({ claims: text === rewrite ? [{ ...fee, value: { flag: true }, valueText: "refunded", span: "The transfer fee is refunded" }] : [fee], info: INFO }),
      suggestReply: async () => ({ text: rewrite, info: INFO }),
    };
    const r = await runCheck({ ...input(CASES[2]!), draft: "The transfer fee isn't refundable." }, deps);
    expect(r.suggestion?.origin).toBe("ai");
    expect(r.suggestion?.recheckDecision).toBe("CAUTION");
    expect(r.suggestion).toMatchObject({ recheckNote: "it doesn't answer what the customer asked" });
  });
});

describe("the topic gap stays narrow", () => {
  const t = (message?: string) => ({ id: "T", rail: "standard" as const, ...(message ? { message } : {}) });
  const doc: Source = {
    id: "DOC-101",
    kind: "sop",
    title: "SOP",
    body: seedBody("DOC-101"),
    version: 1,
    updatedAt: "2026-01-01T00:00:00Z",
    verification: "verified",
    verifiedAt: "2026-01-02T00:00:00Z",
    owner: { name: "Sana", active: true },
    flaggedOutdated: false,
    flagNote: null,
    visibility: "everyone",
  } as Source;
  const ex = (text: string, claims: DraftClaim[]) => ({
    draft: { ok: true as const, text, claims, rejectedCount: 0 },
    sources: { "DOC-101": { ok: true as const, claims: sourceClaims("DOC-101") } },
  });
  const now = new Date(NOW);

  it("what a customer is asking: every seed ticket asks about the timeline; timing words alone don't count", () => {
    for (const t of seedTickets()) expect(topicsAsked(t.message), t.id).toEqual(["reversal_window"]);
    expect(topicsAsked("When will my card arrive?")).toEqual([]);
    expect(topicsAsked("How long is the app down for?")).toEqual([]);
    expect(topicsAsked("Do I get the transfer fee back?")).toContain("fee_refund");
  });

  it("a question on no covered topic asks nothing of the reply", () => {
    const out = decide(ex("Thanks, updated.", []), [doc], t("Can I change the email on my account?"), now);
    expect(out.decision).toBe("ALLOW");
    expect(out.reasonCode).toBe("NO_POLICY_CLAIM");
  });

  it("no customer message known: the rule has nothing to compare, as before", () => {
    const out = decide(ex("Thanks, updated.", []), [doc], t(), now);
    expect(out.decision).toBe("ALLOW");
  });

  it("a right answer on the topic asked is not flagged", () => {
    const claim: DraftClaim = { claimId: "c", topic: "reversal_window", value: { amount: 4, unit: "business_days" }, valueText: "4 business days", span: "4 business days", definitive: true };
    const out = decide(ex("It takes 4 business days.", [claim]), [doc], t("When will my refund arrive?"), now);
    expect(out.decision).toBe("ALLOW");
    expect(out.trace.find((x) => x.rule === "D0e")?.outcome).toBe("pass");
  });

  it("a right answer on another topic doesn't answer the question asked", () => {
    const claim: DraftClaim = { claimId: "c", topic: "fee_refund", value: { flag: true }, valueText: "refunded", span: "the fee is refunded", definitive: true };
    const out = decide(ex("Good news: the fee is refunded.", [claim]), [doc], t("My transfer failed. When do I get my money back?"), now);
    expect(out.decision).toBe("CAUTION");
    expect(out.reasonCode).toBe("TOPIC_GAP");
    expect(out.claims.map((c) => c.reasonCode)).toEqual(["SUPPORTED", "TOPIC_GAP"]);
  });

  it("the topic asked can be the fee: a timeline alone doesn't answer it", () => {
    const claim: DraftClaim = { claimId: "c", topic: "reversal_window", value: { amount: 4, unit: "business_days" }, valueText: "4 business days", span: "4 business days", definitive: true };
    const out = decide(ex("It takes 4 business days.", [claim]), [doc], t("Do I get the transfer fee back?"), now);
    expect(out.decision).toBe("CAUTION");
    expect(out.reasonCode).toBe("TOPIC_GAP");
  });

  it("a detector hit on the topic stays EXTRACTION_GAP (T8), with no second entry for the same words", () => {
    const out = decide(ex("Your money will be back in 4 business days", []), [doc], t("How long until the refund?"), now);
    expect(out.reasonCode).toBe("EXTRACTION_GAP");
    expect(out.claims.filter((c) => c.reasonCode === "TOPIC_GAP")).toEqual([]);
  });

  it("SureSend's own Ask-first reply says the answer is being confirmed, so it isn't flagged: it goes out", async () => {
    const send = await handleSend(
      { ticketId: "TCK-9002", rail: "unknown", draft: ESCALATE_TEMPLATE, role: "support_agent", overrides: [] },
      depsFor([]),
    );
    expect(send.status).toBe(200);
  });

  it("a gap entry reads as a missing answer, not as quoted words", async () => {
    const r = await runCheck(input(CASES[1]!), depsFor([]));
    expect(r.claims[0]?.draftClaim.span).toMatch(/nothing on the reversal timeline/i);
    expect(r.claims[0]?.draftClaim.value).toBeNull();
    expect(traceRows(r).some((row) => row.rule === "D0e" && row.outcome === "fired" && row.key)).toBe(true);
  });

  it("MCP: with no ticket_id there is no customer message, so the rule doesn't invent a question", async () => {
    const out = await checkReply({ reply: "Thanks, I've passed this on." }, depsFor([]));
    expect(out.ok && out.value.engine_decision).toBe("ALLOW");
  });

  it("MCP: with a ticket_id the rule applies, and says what the docs say", async () => {
    const out = await checkReply({ reply: "Thanks, I've passed this on.", ticket_id: "TCK-9003" }, depsFor([]));
    expect(out.ok && out.value.engine_decision).toBe("CAUTION");
    expect(out.ok && out.value.reason_code).toBe("TOPIC_GAP");
    expect(out.ok && out.value.governing?.value).toBe("4 business days");
    expect(out.ok && out.value.claims[0]?.in_reply).toBe(false);
  });
});

describe("the sent card never claims correctness", () => {
  it("a reply that passed: nothing in the docs contradicted it", () => {
    expect(sentCopy({ decision: "ALLOW", payoff: null }).headline).toBe("Sent. Nothing in the docs contradicted it.");
  });

  it("a reply sent after a Hold says what was held, as a plain fact", () => {
    const copy = sentCopy({ decision: "ALLOW", payoff: { heldValue: "4-business-day" } });
    expect(copy.headline).toBe("Sent. Nothing in the docs contradicted it.");
    expect(copy.sentence).toBe("The 4-business-day reply was held and not sent.");
  });

  it("a reply sent past a Double-check doesn't say nothing contradicted it: a hedged one may have been contradicted", () => {
    const copy = sentCopy({ decision: "CAUTION", payoff: null });
    expect(copy.headline).toBe("Sent with your OK.");
    expect(copy.headline + copy.sentence).not.toMatch(/contradicted/);
  });

  it("no copy path claims the reply was right", () => {
    for (const decision of ["ALLOW", "CAUTION"] as const) {
      for (const payoff of [null, { heldValue: null }, { heldValue: "4-day" }]) {
        const { headline, sentence } = sentCopy({ decision, payoff });
        expect(`${headline} ${sentence}`).not.toMatch(/right answer|never reached|correct/i);
      }
    }
  });
});
