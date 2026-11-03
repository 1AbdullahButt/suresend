// Phase 12, part B item 4, written before the fix and recorded failing in PROGRESS.md. "A couple of" is 2; "a few" and other counts
// with no number stay vague. The AI reads the number; the detector is the net when it doesn't (SPEC §6.6.2).
import { describe, expect, it } from "vitest";
import { DRAFT_SYSTEM, SOURCE_SYSTEM } from "@/lib/ai/prompts";
import { decide } from "@/lib/engine/decide";
import { detectPolicyPatterns } from "@/lib/engine/patterns";

const durationHits = (s: string) => detectPolicyPatterns(s).filter((m) => m.kind === "duration").map((m) => m.text.toLowerCase());

describe("the detector knows counts written in words", () => {
  it.each([
    ["within a couple of working days", "a couple of working days"],
    ["in a couple of days", "a couple of days"],
    ["give it a couple of business days", "a couple of business days"],
    ["it takes a few days", "a few days"],
    ["a few working days from now", "a few working days"],
    ["the bank needs several working days", "several working days"],
    ["a handful of days", "a handful of days"],
    ["allow about a week", "a week"],
    ["after a fortnight", "a fortnight"],
    ["a day or two at most", "a day or two"],
    ["within a business day", "a business day"],
    ["a couple of hours", "a couple of hours"],
  ])("%s", (text, hit) => {
    expect(durationHits(text)).toContain(hit);
  });

  it.each(["3 transfers a day", "have a nice day", "after the weekend", "we're open all week", "a couple of questions", "a few more details"])("not: %s", (text) => {
    expect(durationHits(text)).toEqual([]);
  });

  it("with the claim missed and no customer message, a reply like this can't pass as having no policy claim", () => {
    const text = "Your refund arrives in a couple of working days.";
    const out = decide({ draft: { ok: true, text, claims: [], rejectedCount: 0 }, sources: {} }, [], { id: "TCK-9001", rail: "instant" }, new Date("2026-10-30T12:00:00Z"));
    expect([out.decision, out.reasonCode]).toEqual(["CAUTION", "EXTRACTION_GAP"]);
  });
});

describe("the prompts say how to read them", () => {
  // "Hi Léa, …" made the model lowercase the first letter of the span on 7 of 10 readings, and a span that isn't verbatim means Couldn't check (D-053).
  it("a span keeps its capitals and accents", () => {
    expect(DRAFT_SYSTEM).toContain("the same capitals, accents and punctuation");
    expect(DRAFT_SYSTEM).toContain("A span that starts a sentence keeps its capital letter");
  });

  it.each([["draft", DRAFT_SYSTEM], ["source", SOURCE_SYSTEM]])("%s: a couple of is 2, in the unit it names", (_name, prompt) => {
    expect(prompt).toContain('"a couple of working days" → amount 2, business_days');
    expect(prompt).toContain('"a couple of days" → amount 2, calendar_days');
  });

  it.each([["draft", DRAFT_SYSTEM], ["source", SOURCE_SYSTEM]])("%s: a few stays vague, and a week is 7 calendar days", (_name, prompt) => {
    expect(prompt).toContain('"a few days"');
    expect(prompt).toMatch(/"a few days"[^\n]*value null/);
    expect(prompt).toContain('"a week" → amount 7, calendar_days');
  });
});
