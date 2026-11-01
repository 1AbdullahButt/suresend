// Builder-owned unit tests for rule paths the locked acceptance tests don't reach directly.
import { describe, expect, it } from "vitest";
import { decide, type Extractions } from "./decide";
import { isVerbatim, namesSource } from "./normalize";
import { formatValue } from "./values";
import { detectPolicyPatterns, hasTimelineWords } from "./patterns";
import type { DraftClaim, Source, SourceClaim } from "./types";
import { ESCALATE_TEMPLATE } from "@/lib/replies/templates";

const NOW = new Date("2026-10-30T12:00:00Z");

function source(id: string, over: Partial<Source> = {}): Source {
  return {
    id,
    title: `${id} title`,
    kind: "policy",
    body: "",
    version: 1,
    verification: "verified",
    verifiedAt: "2026-10-01",
    updatedAt: "2026-10-01",
    owner: { name: "Owner", active: true },
    flaggedOutdated: false,
    flagNote: null,
    visibility: "everyone",
    ...over,
  };
}

function sclaim(sourceId: string, amount: number, over: Partial<SourceClaim> = {}): SourceClaim {
  return {
    claimId: `${sourceId}#1`,
    sourceId,
    sourceVersion: 1,
    topic: "reversal_window",
    value: { amount, unit: "business_days" },
    valueText: `${amount} business days`,
    scope: { rail: "any" },
    effectiveFrom: null,
    statusWording: "unstated",
    supersedes: null,
    quote: "q",
    ...over,
  };
}

function dclaim(amount: number, over: Partial<DraftClaim> = {}): DraftClaim {
  return {
    claimId: "d#1",
    topic: "reversal_window",
    value: { amount, unit: "business_days" },
    valueText: `${amount} business days`,
    span: `${amount} business days`,
    definitive: true,
    ...over,
  };
}

function run(draft: { text: string; claims: DraftClaim[] }, pairs: Array<[Source, SourceClaim[]]>, rail: "instant" | "standard" | "unknown" = "instant") {
  const ex: Extractions = {
    draft: { ok: true, text: draft.text, claims: draft.claims, rejectedCount: 0 },
    sources: Object.fromEntries(pairs.map(([s, c]) => [s.id, { ok: true as const, claims: c }])),
  };
  return decide(ex, pairs.map(([s]) => s), { id: "TCK-T", rail }, NOW);
}

describe("D6 specific exception", () => {
  it("an unweakened specific candidate beats a general one when nothing supersedes", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [
      [source("GEN"), [sclaim("GEN", 4)]],
      [source("SPEC"), [sclaim("SPEC", 1, { scope: { rail: "instant" } })]],
    ]);
    expect(out.decision).toBe("HOLD");
    expect(out.claims[0]!.governing?.via).toBe("SPECIFIC_EXCEPTION");
    expect(out.claims[0]!.trace.find((t) => t.rule === "D6")?.outcome).toBe("fired");
  });

  it("a weakened specific candidate falls through to D7 (verification is not authority)", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [
      [source("GEN"), [sclaim("GEN", 4)]],
      [source("SPEC", { verification: "unverified" }), [sclaim("SPEC", 1, { scope: { rail: "instant" } })]],
    ]);
    expect(out.decision).toBe("ESCALATE");
    expect(out.reasonCode).toBe("CONFLICT_UNRESOLVED");
  });
});

describe("D5 condition 4", () => {
  it("a supersession sentence does not apply when the superseder is not effective later than the target", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [
      [source("OLD", { title: "Old Policy" }), [sclaim("OLD", 4, { effectiveFrom: "2026-10-20" })]],
      [
        source("NEW", { verification: "unverified" }),
        [sclaim("NEW", 1, { scope: { rail: "instant" }, effectiveFrom: "2026-10-10", supersedes: { targetText: "the Old Policy", quote: "q" } })],
      ],
    ]);
    expect(out.claims[0]!.trace.find((t) => t.rule === "D5")?.outcome).toBe("fail");
    expect(out.decision).toBe("ESCALATE");
  });
});

describe("D2 / D3 / D8 / hedged", () => {
  it("D2: only proposals → CAUTION PROPOSAL_ONLY", () => {
    const out = run({ text: "1 business days", claims: [dclaim(1)] }, [[source("SLK", { kind: "slack" }), [sclaim("SLK", 1)]]]);
    expect(out.reasonCode).toBe("PROPOSAL_ONLY");
  });
  it("D3: nothing applies → CAUTION UNSUPPORTED", () => {
    const out = run({ text: "1 business days", claims: [dclaim(1)] }, [[source("STD"), [sclaim("STD", 3, { scope: { rail: "standard" } })]]]);
    expect(out.reasonCode).toBe("UNSUPPORTED");
  });
  it("D8: calendar vs business days → CAUTION UNIT_MISMATCH", () => {
    const out = run(
      { text: "4 days", claims: [dclaim(4, { value: { amount: 4, unit: "calendar_days" }, span: "4 days" })] },
      [[source("A"), [sclaim("A", 4)]]],
    );
    expect(out.reasonCode).toBe("UNIT_MISMATCH");
  });
  it("a hedged contradiction is CAUTION, not HOLD", () => {
    const out = run({ text: "usually 6 business days", claims: [dclaim(6, { definitive: false })] }, [[source("A"), [sclaim("A", 4)]]]);
    expect(out.decision).toBe("CAUTION");
    expect(out.reasonCode).toBe("HEDGED_CONTRADICTION");
  });
  it("a draft range inside V is supported", () => {
    const out = run({ text: "2-3 business days", claims: [dclaim(2, { value: { amount: 2, amountMax: 3, unit: "business_days" } })] }, [
      [source("A"), [sclaim("A", 1, { value: { amount: 1, amountMax: 4, unit: "business_days" } })]],
    ]);
    expect(out.decision).toBe("ALLOW");
  });
});

describe("D0 family", () => {
  it("D0a: every draft claim rejected → AI_UNAVAILABLE", () => {
    const ex: Extractions = { draft: { ok: true, text: "x", claims: [], rejectedCount: 1 }, sources: {} };
    expect(decide(ex, [], { id: "T", rail: "instant" }, NOW).decision).toBe("AI_UNAVAILABLE");
  });
  it("D0c: only an out-of-topic claim that covers the detector match → OUTSIDE_COVERAGE", () => {
    const out = run({ text: "Please allow 24 hours.", claims: [dclaim(24, { topic: "other", value: { amount: 24, unit: "hours" }, span: "allow 24 hours" })] }, []);
    expect(out.reasonCode).toBe("OUTSIDE_COVERAGE");
  });
  it("D0b: an uncovered timing phrase → EXTRACTION_GAP even with an other-topic claim", () => {
    const out = run(
      { text: "Please allow 24 hours, and the refund lands tomorrow.", claims: [dclaim(24, { topic: "other", value: { amount: 24, unit: "hours" }, span: "allow 24 hours" })] },
      [],
    );
    expect(out.reasonCode).toBe("EXTRACTION_GAP");
  });
  it("D0d: no claims and no pattern → ALLOW NO_POLICY_CLAIM", () => {
    const out = run({ text: "Sorry about that, I'm looking into it for you.", claims: [] }, []);
    expect(out.decision).toBe("ALLOW");
    expect(out.reasonCode).toBe("NO_POLICY_CLAIM");
  });
});

describe("normalization and patterns", () => {
  it("quote validation folds dashes, smart quotes and whitespace", () => {
    expect(isVerbatim("Outgoing Transfers - Reversal SOP", "the Outgoing Transfers – Reversal SOP")).toBe(true);
    expect(isVerbatim("“don’t”", 'say "don\'t"')).toBe(true);
    expect(isVerbatim("reversed  within\n4", "reversed within 4 days")).toBe(true);
    expect(isVerbatim("reversed within 5", "reversed within 4 days")).toBe(false);
    expect(isVerbatim("   ", "anything")).toBe(false);
  });
  it("supersession naming matches titles across punctuation, not partial words", () => {
    const sop = { id: "DOC-101", title: "Outgoing Transfers: Reversal SOP" };
    expect(namesSource("section 3 of the Outgoing Transfers – Reversal SOP", sop)).toBe(true);
    expect(namesSource("see doc-101", sop)).toBe(true);
    expect(namesSource("the Incoming Transfers SOP", sop)).toBe(false);
  });
  it("detector catches durations, relative time and currency", () => {
    const kinds = (s: string) => detectPolicyPatterns(s).map((m) => m.kind);
    expect(kinds("within 4 business days")).toEqual(expect.arrayContaining(["duration", "relative_time"]));
    expect(kinds("five working days")).toContain("duration");
    expect(kinds("refunded in 5-7 days")).toContain("duration");
    expect(kinds("a $25 fee")).toContain("currency");
    expect(kinds("same day")).toContain("relative_time");
    expect(detectPolicyPatterns("Thanks for reaching out.")).toEqual([]);
  });
  it("the ESCALATE template is timeline-free", () => {
    expect(hasTimelineWords(ESCALATE_TEMPLATE)).toBe(false);
    expect(detectPolicyPatterns(ESCALATE_TEMPLATE)).toEqual([]);
  });
  it("formats values for people", () => {
    expect(formatValue({ amount: 1, unit: "business_days" })).toBe("1 business day");
    expect(formatValue({ amount: 5, amountMax: 7, unit: "calendar_days" })).toBe("5–7 calendar days");
  });
});

describe("QA Phase 1 fixes", () => {
  const sop = source("SOP", { title: "Outgoing Transfers: Reversal SOP", body: "the SOP" });
  const exc = source("EXC", { body: "This supersedes the Outgoing Transfers – Reversal SOP for instant." });
  const supersedes = { targetText: "the Outgoing Transfers – Reversal SOP", quote: "This supersedes the Outgoing Transfers – Reversal SOP for instant." };

  it("D5 writes all four conditions to the trace", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [
      [sop, [sclaim("SOP", 4)]],
      [exc, [sclaim("EXC", 1, { scope: { rail: "instant" }, supersedes })]],
    ]);
    const d5 = out.claims[0]!.trace.find((t) => t.rule === "D5")!;
    expect(d5.outcome).toBe("fired");
    for (const n of ["1)", "2)", "3)", "4)"]) expect(d5.detail).toContain(n);
    expect(d5.detail).toContain("quoted verbatim");
  });

  it("D5 condition 2 fails when the supersedes quote isn't in the source", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [
      [sop, [sclaim("SOP", 4)]],
      [source("EXC", { body: "nothing here", verification: "unverified" }), [sclaim("EXC", 1, { scope: { rail: "instant" }, supersedes })]],
    ]);
    expect(out.claims[0]!.trace.find((t) => t.rule === "D5")?.detail).toContain("condition 2 fails");
  });

  it("condition 4 wording is right when only the target has an effective date", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [
      [sop, [sclaim("SOP", 4, { effectiveFrom: "2026-01-01" })]],
      [exc, [sclaim("EXC", 1, { scope: { rail: "instant" }, supersedes })]],
    ]);
    const d5 = out.claims[0]!.trace.find((t) => t.rule === "D5")!;
    expect(d5.detail).toContain("EXC states no effective date");
    expect(d5.detail).not.toContain("SOP has no effective date");
  });

  it("a source extracted twice with the same value does not compete with itself", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [
      [sop, [sclaim("SOP", 4)]],
      [exc, [sclaim("EXC", 1, { scope: { rail: "instant" }, supersedes }), sclaim("EXC", 1, { claimId: "EXC#2", scope: { rail: "instant" } })]],
    ]);
    expect(out.decision).toBe("HOLD");
    expect(out.claims[0]!.governing?.via).toBe("EXPLICIT_SUPERSESSION");
  });

  it("D1 escalates when the rail is unknown and every candidate is rail-specific", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [[exc, [sclaim("EXC", 1, { scope: { rail: "instant" } })]]], "unknown");
    expect(out.decision).toBe("ESCALATE");
    expect(out.reasonCode).toBe("SCOPE_UNKNOWN");
  });

  it("a value-less draft claim records D1/D2 as skipped before D3", () => {
    const out = run({ text: "back soon", claims: [dclaim(0, { value: null, span: "back soon" })] }, []);
    const rules = out.claims[0]!.trace.map((t) => `${t.rule}:${t.outcome}`);
    expect(rules.slice(0, 4)).toEqual(["D0:pass", "D1:skipped", "D2:skipped", "D3:fired"]);
  });

  it("draft-level outcomes write a top-level trace entry", () => {
    expect(run({ text: "Sorry, looking into it.", claims: [] }, []).trace.map((t) => t.rule)).toContain("D0d");
    expect(run({ text: "back in 4 business days", claims: [] }, []).trace.find((t) => t.rule === "D0b")?.outcome).toBe("fired");
    const failed: Extractions = { draft: { ok: false, text: "x", error: "boom" }, sources: {} };
    expect(decide(failed, [], { id: "T", rail: "instant" }, NOW).trace[0]).toMatchObject({ rule: "D0a", outcome: "fired" });
  });

  it("skip lists name D11a and D11b, never a bare D11", () => {
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [[exc, [sclaim("EXC", 1, { scope: { rail: "instant" } })]]], "unknown");
    expect(out.claims[0]!.trace.some((t) => t.rule === "D11")).toBe(false);
  });
});

describe("self-contradiction", () => {
  it("a source can't supersede its own disagreeing claim", () => {
    const sop = source("SOP", { title: "Outgoing Transfers: Reversal SOP" });
    const body = "This supersedes the Outgoing Transfers – Reversal SOP for instant.";
    const exc = source("EXC", { body });
    const out = run({ text: "4 business days", claims: [dclaim(4)] }, [
      [sop, [sclaim("SOP", 4)]],
      [exc, [
        sclaim("EXC", 1, { scope: { rail: "instant" }, supersedes: { targetText: "the Outgoing Transfers – Reversal SOP", quote: body } }),
        sclaim("EXC", 3, { claimId: "EXC#2", scope: { rail: "instant" } }),
      ]],
    ]);
    expect(out.claims[0]!.trace.find((t) => t.rule === "D5")?.detail).toContain("can't supersede its own claim");
    expect(out.decision).toBe("ESCALATE");
  });
});
