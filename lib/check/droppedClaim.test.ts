// Phase 12, second round (D-060), written before the fix and recorded failing in PROGRESS.md. QA's repro: a claim whose quote fails
// validation used to vanish, so the claims left decided alone, and a wrong reply could reach Good to send. Hand-written extractions
// stand in for the AI; the source quotes are read from the seed docs, so they stay verbatim.
import { describe, expect, it } from "vitest";
import { handleSend } from "@/lib/check/handlers";
import { runCheck } from "@/lib/check/runCheck";
import { claimLines, summarize, traceRows, whyModel } from "@/lib/client/outcome";
import { decide } from "@/lib/engine/decide";
import { checkReply } from "@/lib/mcp/tools";
import { seedBody, verifiedSave } from "@/lib/workspace/variants";
import type { AiRunInfo, CheckDeps, DraftClaim, Rail, SourceClaim, SourceOverride } from "@/lib/engine/types";

type SourceOverrideList = SourceOverride[];

const NOW = "2026-10-30T12:00:00Z";
const INFO: AiRunInfo = { mode: "saved", model: "test", latencyMs: 0, promptVersion: "test" };

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
    const sup = lineOf(id, /^This supersedes/).split(". ")[0]! + ".";
    return [
      sc(id, lineOf(id, /^For instant/), {
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

const check = (ticketId: string, rail: Rail, draft: string, claims: DraftClaim[], over: Partial<CheckDeps> = {}) =>
  runCheck({ ticketId, rail, draft, role: "support_agent", overrides: [], decisionTime: NOW }, deps(claims, over));

describe("QA's repro: a wrong fee claim, dropped for a miscopied quote", () => {
  const draft = "Your money is back within 1 business day, with the service cost taken off.";
  const right = timeline(1, "Your money is back within 1 business day", "1 business day");
  const miscopied = fee(false, "with the service costs taken off", "with the service cost taken off");
  const copied = fee(false, "with the service cost taken off");

  it("with the quote right, it's a Hold: the control", async () => {
    const r = await check("TCK-9001", "instant", draft, [right, copied]);
    expect([r.decision, r.reasonCode]).toEqual(["HOLD", "CONTRADICTS_GOVERNING"]);
  });

  it("with the quote off by one letter, it can't be Good to send", async () => {
    const r = await check("TCK-9001", "instant", draft, [right, miscopied]);
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("CLAIM_UNVERIFIED");
    expect(r.rejectedExtractions.map((x) => x.reason)).toEqual(["SPAN_NOT_FOUND"]);
  });

  it("the card says part of it couldn't be verified, and what the docs say", async () => {
    const r = await check("TCK-9001", "instant", draft, [right, miscopied]);
    const s = summarize(r, "instant");
    expect(s.name).toBe("Double-check");
    expect(s.headline).toBe("Couldn't verify part of this reply");
    expect(s.sentence).toBe("The AI's reading of part of this reply didn't match your words, so the rules didn't check that part. Your docs say the transfer fee is refunded. Check it by hand.");
  });

  it("the card lists the part it couldn't check, without the AI's miscopied words", async () => {
    const r = await check("TCK-9001", "instant", draft, [right, miscopied]);
    const lines = claimLines(r);
    expect(lines.map((l) => [l.label, l.says, l.quoted, l.name])).toEqual([
      ["Your reply", "Your money is back within 1 business day", true, "Good to send"],
      ["Not verified", "Part of this reply", false, "Double-check"],
    ]);
    expect(JSON.stringify(lines)).not.toContain("costs");
  });

  it("Send needs a person's OK", async () => {
    const input = { ticketId: "TCK-9001", rail: "instant" as const, draft, role: "support_agent" as const, overrides: [] };
    const blocked = await handleSend({ ...input, acknowledged: false }, deps([right, miscopied]));
    expect(blocked.status).toBe(428);
    const ok = await handleSend({ ...input, acknowledged: true }, deps([right, miscopied]));
    expect(ok.status).toBe(200);
  });

  it("MCP says the same", async () => {
    const out = await checkReply({ reply: draft, ticket_id: "TCK-9001" }, deps([right, miscopied]));
    if (!out.ok) throw new Error("unexpected");
    expect(out.value.decision).toBe("Double-check");
    expect(out.value.reason_code).toBe("CLAIM_UNVERIFIED");
    expect(out.value.headline).toMatch(/^Caution: SureSend couldn't verify part of this reply\./);
    expect(out.value.claims.map((c) => [c.says, c.in_reply])).toEqual([
      ["Your money is back within 1 business day", true],
      ["Part of this reply", false],
    ]);
    expect(JSON.stringify(out.value.claims)).not.toContain("costs");
  });

  it("the trace and Why say what happened", async () => {
    const r = await check("TCK-9001", "instant", draft, [right, miscopied]);
    const d0a = traceRows(r).find((t) => t.rule === "D0a");
    expect(d0a?.outcome).toBe("fail");
    expect(d0a?.key).toBe(true);
    expect(d0a?.summary).toBe("The AI's reading of part of this reply didn't match its words, so that part wasn't checked. The reply can't be better than Double-check.");
    expect(whyModel(r).so).toContain("SureSend couldn't verify part of this reply, so double-check before sending.");
  });
});

describe("the cap only caps", () => {
  const monday = "You can relax, the funds return on their own by Monday, less the small charge for the transfer.";
  const miscopied = timeline(null, "the funds return on its own by Monday", "by Monday");
  const less = fee(false, "less the small charge for the transfer");

  it("a Hold stays a Hold, and the dropped timeline isn't called unanswered", async () => {
    const r = await check("TCK-9001", "instant", monday, [miscopied, less]);
    expect([r.decision, r.reasonCode]).toEqual(["HOLD", "CONTRADICTS_GOVERNING"]);
    expect(r.claims.map((c) => c.reasonCode)).toEqual(["CONTRADICTS_GOVERNING", "CLAIM_UNVERIFIED"]);
    expect(claimLines(r).map((l) => l.label)).not.toContain("Not answered");
    expect(claimLines(r).map((l) => l.label)).toContain("Not verified");
  });

  it("its suggested reply states the dropped topic's value too, so it still answers the customer", async () => {
    const r = await check("TCK-9001", "instant", monday, [miscopied, less]);
    expect(r.suggestion?.text).toContain("1 business day");
    expect(r.suggestion?.text).toContain("refunded");
    expect(r.suggestion?.recheckDecision).toBe("ALLOW");
  });

  it("Ask first stays Ask first", async () => {
    const draft = "Your money is back within 4 business days, with the service cost taken off.";
    const r = await check("TCK-9002", "unknown", draft, [timeline(4, "Your money is back within 4 business days", "4 business days"), fee(false, "with the service costs taken off", "with the service cost taken off")]);
    expect([r.decision, r.reasonCode]).toEqual(["ESCALATE", "SCOPE_UNKNOWN"]);
  });

  it("every claim dropped is still Couldn't check, as D0a always was", async () => {
    const r = await check("TCK-9001", "instant", monday, [miscopied]);
    expect([r.decision, r.reasonCode]).toEqual(["AI_UNAVAILABLE", "EXTRACTION_FAILED"]);
  });

  it("nothing dropped changes nothing", async () => {
    const draft = "Failed transfers are reversed within 1 business day.";
    const r = await check("TCK-9001", "instant", draft, [timeline(1, draft, "1 business day")]);
    expect([r.decision, r.reasonCode]).toEqual(["ALLOW", "SUPPORTED"]);
    expect(traceRows(r).find((t) => t.rule === "D0a")?.outcome).toBe("pass");
  });

  it("a dropped claim outside the topics caps a right reply too", async () => {
    const draft = "Failed transfers are reversed within 1 business day. Your daily limit is €5,000.";
    const r = await check("TCK-9001", "instant", draft, [
      timeline(1, "Failed transfers are reversed within 1 business day", "1 business day"),
      { claimId: "o", topic: "other", value: { quantity: 5000, of: "EUR" }, valueText: "€5,000", span: "Your daily limit is €5,001", definitive: true },
    ]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "CLAIM_UNVERIFIED"]);
    expect(summarize(r, "instant").sentence).toBe("The AI's reading of part of this reply didn't match your words, so the rules didn't check that part. Check it by hand.");
  });

  it("a dropped claim outside the topics names no value from the docs, however they read", async () => {
    const draft = "Failed transfers are reversed within 1 business day. Pending ones take a day.";
    const r = await check(
      "TCK-9001",
      "instant",
      draft,
      [timeline(1, "Failed transfers are reversed within 1 business day", "1 business day"), { claimId: "o", topic: "other", value: { amount: 1, unit: "calendar_days" }, valueText: "a day", span: "Pending ones take 1 day", definitive: true }],
      {
        extractSource: async (s) => ({
          claims: s.id === "DOC-101" ? [...sourceClaims(s.id), sc(s.id, "Transfer fee is refunded with the principal.", { topic: "other", value: { amount: 24, unit: "hours" }, valueText: "24 hours" })] : sourceClaims(s.id),
          info: INFO,
        }),
      },
    );
    expect(r.reasonCode).toBe("CLAIM_UNVERIFIED");
    expect(r.claims.find((c) => c.reasonCode === "CLAIM_UNVERIFIED")?.governing).toBeNull();
    expect(summarize(r, "instant").sentence).not.toContain("Your docs say");
  });

  it("a rewrite that echoes the placeholder loses to the template", async () => {
    const r = await check("TCK-9001", "instant", monday, [miscopied, less], {
      // The rewrite reads clean and states both values, so only the placeholder can refuse it.
      extractDraft: async (d) =>
        d === monday
          ? { claims: [miscopied, less], info: INFO }
          : { claims: [timeline(1, "says 1 business day", "1 business day"), fee(true, "the transfer fee is refunded", "refunded")], info: INFO },
      suggestReply: async () => ({ text: "Part of this reply says 1 business day, and the transfer fee is refunded.", info: INFO }),
    });
    expect(r.suggestion?.origin).toBe("template");
    expect(r.suggestion?.text).not.toContain("Part of this reply");
  });

  it("another Double-check keeps its own reason, listed first", async () => {
    const draft = "Refunds usually take around 4 business days, with the service cost taken off.";
    const hedged: DraftClaim = { ...timeline(4, "Refunds usually take around 4 business days", "4 business days"), definitive: false };
    const r = await check("TCK-9001", "instant", draft, [hedged, fee(false, "with the service costs taken off", "with the service cost taken off")]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "HEDGED_CONTRADICTION"]);
    expect(claimLines(r).map((l) => l.label)).toContain("Not verified");
  });

  it("a detector hit on the same topic gets one line, not two", async () => {
    const draft = "Your money is back within 1 business day, minus the processing charge.";
    const r = await check("TCK-9001", "instant", draft, [timeline(1, "Your money is back within 1 business day", "1 business day"), fee(false, "minus the processing charges", "minus the processing charge")]);
    expect([r.decision, r.reasonCode]).toEqual(["CAUTION", "EXTRACTION_GAP"]);
    expect(r.claims.filter((c) => c.draftClaim.topic === "fee_refund").map((c) => c.reasonCode)).toEqual(["EXTRACTION_GAP"]);
  });

  it("with a doc unread, no value is named for the dropped part (D-046)", async () => {
    const draft = "Your money is back within 4 business days, with the service cost taken off.";
    const r = await check("TCK-9003", "standard", draft, [timeline(4, "Your money is back within 4 business days", "4 business days"), fee(false, "with the service costs taken off", "with the service cost taken off")], {
      extractSource: async (s) => {
        if (s.id === "DOC-103") throw new Error("down");
        return { claims: sourceClaims(s.id), info: INFO };
      },
    });
    expect(r.decision).toBe("CAUTION");
    expect(r.claims.find((c) => c.reasonCode === "CLAIM_UNVERIFIED")?.governing).toBeNull();
  });

  it("the engine caps on the count alone, if a caller gives no detail", () => {
    const text = "Failed transfers are reversed within 1 business day.";
    const out = decide(
      {
        draft: { ok: true, text, claims: [timeline(1, text, "1 business day")], rejectedCount: 1 },
        sources: { "DOC-103": { ok: true, claims: [] } },
      },
      [],
      { id: "TCK-9001", rail: "instant" },
      new Date(NOW),
    );
    expect(out.decision).toBe("CAUTION");
    expect(out.claims.some((c) => c.reasonCode === "CLAIM_UNVERIFIED")).toBe(true);
  });
});

describe("a doc's claim dropped for a bad quote caps the reply too", () => {
  const FEE = "For instant transfers, the transfer fee is not refunded.";
  const draft = "Failed transfers are reversed within 4 business days.";
  const edited = [verifiedSave("DOC-103", `${seedBody("DOC-103").trimEnd()}\n\n${FEE}\n`, "2026-10-29T09:00:00Z")];
  const four: DraftClaim = timeline(4, draft, "4 business days");
  const feeClaim = sc("DOC-103", FEE, { topic: "fee_refund", value: { flag: false }, valueText: "not refunded", scope: { rail: "instant" } });
  const run = (doc103: SourceClaim[], claims: DraftClaim[] = [four], over: SourceOverrideList = edited) =>
    runCheck(
      { ticketId: "TCK-9001", rail: "instant", draft, role: "support_agent", overrides: over, decisionTime: NOW },
      deps(claims, { extractSource: async (x) => ({ claims: x.id === "DOC-103" ? doc103 : sourceClaims(x.id), info: INFO }) }),
    );
  const exception = () => sourceClaims("DOC-103")[0]!;

  it("with both quotes right, the exception wins: the control", async () => {
    const r = await run([exception(), feeClaim]);
    expect([r.decision, r.reasonCode]).toEqual(["HOLD", "CONTRADICTS_GOVERNING"]);
  });

  it("with the exception's quote miscopied, the old SOP can't make it Good to send", async () => {
    const r = await run([{ ...exception(), quote: exception().quote.replace("reversed", "refunded") }, feeClaim]);
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("SOURCE_UNREAD");
    expect(r.rejectedExtractions.map((x) => x.reason)).toEqual(["QUOTE_NOT_FOUND"]);
    expect(r.caps.map((c) => [c.sourceId, c.partial])).toEqual([["DOC-103", true]]);
  });

  it("the card says part of the doc, not all of it", async () => {
    const r = await run([{ ...exception(), quote: exception().quote.replace("reversed", "refunded") }, feeClaim]);
    const s = summarize(r, "instant");
    expect(s.headline).toBe("Part of a doc couldn't be read");
    expect(s.sentence).toBe("Part of DOC-103 couldn't be read, so this can't be confirmed as right. It might hold a contradiction.");
  });

  it("a Hold from what's left stays a Hold", async () => {
    const r = await run([exception(), { ...feeClaim, quote: "For instant transfers, the transfer fee isn't refunded." }]);
    expect([r.decision, r.reasonCode]).toEqual(["HOLD", "CONTRADICTS_GOVERNING"]);
    expect(r.caps.map((c) => c.partial)).toEqual([true]);
    // The doc is listed as evidence, for what it did say. Why still says what it lost.
    expect(whyModel(r).didntCount.map((x) => x.text)).toContain("Part of DOC-103 couldn't be read.");
  });

  it("no value is named while part of a doc is missing (D-046)", async () => {
    const said = "Your transfer fee will be refunded with the money.";
    const r = await runCheck(
      { ticketId: "TCK-9001", rail: "instant", draft: said, role: "support_agent", overrides: edited, decisionTime: NOW },
      deps([fee(true, said, "refunded with the money")], { extractSource: async (x) => ({ claims: x.id === "DOC-103" ? [{ ...exception(), quote: exception().quote.replace("reversed", "refunded") }, feeClaim] : sourceClaims(x.id), info: INFO }) }),
    );
    expect(r.claims.find((c) => c.reasonCode === "TOPIC_GAP")?.governing).toBeNull();
    expect(r.claims.find((c) => c.reasonCode === "TOPIC_GAP")?.trace[0]?.detail).not.toContain("The docs say");
  });

  it("every claim dropped is still an unread doc, as before", async () => {
    const r = await run([{ ...exception(), quote: "not in the doc" }]);
    expect(r.caps.map((c) => [c.sourceId, c.partial ?? false])).toEqual([["DOC-103", false]]);
    expect(r.rejectedExtractions.map((x) => x.reason)).toContain("ALL_CLAIMS_REJECTED");
  });

  it("a doc flagged outdated counts for nothing, so its lost part caps nothing", async () => {
    const said = "Failed transfers are reversed within 1 business day.";
    const r = await runCheck(
      { ticketId: "TCK-9001", rail: "instant", draft: said, role: "support_agent", overrides: [], decisionTime: NOW },
      deps([timeline(1, said, "1 business day")], {
        extractSource: async (x) => ({
          claims: x.id === "DOC-104" ? [sc("DOC-104", "Failed transfers are refunded in 5-7 days", { value: { amount: 5, amountMax: 7, unit: "calendar_days" }, valueText: "5-7 days" }), sc("DOC-104", "not in the doc", { value: { amount: 1, unit: "hours" }, valueText: "1 hour" })] : sourceClaims(x.id),
          info: INFO,
        }),
      }),
    );
    expect(r.caps).toEqual([]);
  });
});

