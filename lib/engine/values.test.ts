// D-041: the comparator registry. Durations compare as before; amounts on topic "other" get OUTSIDE_COVERAGE (D0c).
import { describe, expect, it } from "vitest";
import { decide, type Extractions } from "./decide";
import { formatValue, isDuration, kindOf, sameValue, unitLabel, unitsMatch, valueWithin, valueWords } from "./values";
import type { DraftClaim, Source } from "./types";

const NOW = new Date("2026-10-30T12:00:00Z");

describe("duration comparator (moved unchanged)", () => {
  const four = { amount: 4, unit: "business_days" as const };
  const range = { amount: 5, amountMax: 7, unit: "calendar_days" as const };
  it("compares amounts, ranges and units as before", () => {
    expect(kindOf(four)).toBe("duration");
    expect(sameValue(four, { amount: 4, unit: "business_days" })).toBe(true);
    expect(sameValue(four, { amount: 4, unit: "calendar_days" })).toBe(false);
    expect(valueWithin({ amount: 6, unit: "calendar_days" }, range)).toBe(true);
    expect(valueWithin({ amount: 6, unit: "business_days" }, range)).toBe(true); // units are D8's job
    expect(unitsMatch(four, range)).toBe(false);
    expect(unitLabel(four)).toBe("business days");
    expect(formatValue(range)).toBe("5–7 calendar days");
    expect(valueWords(range)).toBe("5–7 days");
    expect(formatValue({ amount: 1, unit: "business_days" })).toBe("1 business day");
  });
});

describe("quantity comparator (amounts outside the covered topics)", () => {
  const limit = { quantity: 500000, of: "PKR" };
  it("formats and compares amounts", () => {
    expect(kindOf(limit)).toBe("quantity");
    expect(isDuration(limit)).toBe(false);
    expect(limit.amount).toBeUndefined();
    expect(formatValue(limit)).toBe("500,000 PKR");
    expect(sameValue(limit, { quantity: 500000, of: " pkr " })).toBe(true);
    expect(unitsMatch(limit, { quantity: 500000, of: "USD" })).toBe(false);
  });
  it("never matches a value of another kind", () => {
    const days = { amount: 4, unit: "business_days" as const };
    expect(sameValue(limit, days)).toBe(false);
    expect(valueWithin(days, limit)).toBe(false);
    expect(unitsMatch(days, limit)).toBe(false);
  });
});

describe("coverage: an amount on topic other is OUTSIDE_COVERAGE (D0c), alone or beside a covered claim", () => {
  const doc: Source = {
    id: "DOC-1",
    title: "SOP",
    kind: "sop",
    body: "Failed transfers are reversed within 4 business days.",
    version: 1,
    verification: "verified",
    verifiedAt: "2026-10-01",
    updatedAt: "2026-10-01",
    owner: { name: "O", active: true },
    flaggedOutdated: false,
    flagNote: null,
    visibility: "everyone",
  };
  const sources: Extractions["sources"] = {
    "DOC-1": {
      ok: true,
      claims: [
        {
          claimId: "DOC-1#1",
          sourceId: "DOC-1",
          sourceVersion: 1,
          topic: "reversal_window",
          value: { amount: 4, unit: "business_days" },
          valueText: "4 business days",
          scope: { rail: "any" },
          effectiveFrom: null,
          statusWording: "in_force",
          supersedes: null,
          quote: "Failed transfers are reversed within 4 business days.",
        },
      ],
    },
  };
  const limit: DraftClaim = {
    claimId: "d#2",
    topic: "other",
    value: { quantity: 500000, of: "PKR" },
    valueText: "PKR 500,000",
    span: "your daily limit is PKR 500,000",
    definitive: true,
  };
  const run = (text: string, claims: DraftClaim[]) =>
    decide({ draft: { ok: true, text, claims, rejectedCount: 0 }, sources }, [doc], { id: "TCK-1", rail: "standard" }, NOW);

  it("alone: the amount is covered by the claim, so D0c fires (not EXTRACTION_GAP)", () => {
    const r = run("Your daily limit is PKR 500,000.", [limit]);
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("OUTSIDE_COVERAGE");
  });

  it("beside a right timeline: the overall result is the most severe, Double-check", () => {
    const four: DraftClaim = {
      claimId: "d#1",
      topic: "reversal_window",
      value: { amount: 4, unit: "business_days" },
      valueText: "4 business days",
      span: "within 4 business days",
      definitive: true,
    };
    const r = run("Your money is back within 4 business days, and your daily limit is PKR 500,000.", [four, limit]);
    expect(r.claims.map((c) => `${c.draftClaim.topic}:${c.decision}`)).toEqual(["reversal_window:ALLOW", "other:CAUTION"]);
    expect(r.decision).toBe("CAUTION");
    expect(r.reasonCode).toBe("OUTSIDE_COVERAGE");
  });
});
