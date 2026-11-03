// Builder-owned tests for "Fix the doc" (D-037): source matching, edit validation, the canonical recheck, and DOC-105.
import { describe, expect, it } from "vitest";
import { runCheck } from "@/lib/check/runCheck";
import type { CheckDeps, Rail, Role } from "@/lib/engine/types";
import { seedSources } from "@/lib/workspace/seed";
import { CANONICAL_DRAFT, DECISION_TIME, ONE_DAY_DRAFT } from "../../tests/helpers/fixtures";
import { CANONICAL_RECHECK, fixOverride, proposeFix } from "./propose";
import { findFixSource, matchingSourceEvidence } from "./source";
import { EXCEPTION_QUOTE, fixAwareDeps } from "./testDeps";
import { fixStillApplies, templateFix, validateFix, type FixEdit } from "./validate";

const RESTRICTED = /DOC-105|FR-HOLD|CMP-7|Fraud Hold/;
const SOP_QUOTE = "When an outgoing transfer fails, the amount is reversed to the customer's wallet within 4 business days.";

const check = (deps: CheckDeps, ticketId: string, rail: Rail, draft = CANONICAL_DRAFT, role: Role = "support_agent", overrides = [] as never[]) =>
  runCheck({ ticketId, rail, draft, role, overrides, decisionTime: DECISION_TIME }, deps);

const input = (ticketId: string, rail: Rail, draft = CANONICAL_DRAFT, role: Role = "support_agent") => ({ ticketId, rail, draft, role, decisionTime: DECISION_TIME });

describe("source matching", () => {
  it("a 4-day Hold on TCK-9001 was copied from DOC-101, which misses the DOC-103 exception", async () => {
    const fix = findFixSource(await check(fixAwareDeps().deps, "TCK-9001", "instant"));
    expect(fix).toMatchObject({ kind: "hold", draftValueText: "4 business days", source: { id: "DOC-101" }, exception: { id: "DOC-103", valueText: "1 business day", rail: "instant" } });
  });

  it("a 4-day Ask first on the unknown-rail ticket points to the same doc and exception", async () => {
    const fix = findFixSource(await check(fixAwareDeps().deps, "TCK-9002", "unknown"));
    expect(fix).toMatchObject({ kind: "ask", source: { id: "DOC-101" }, exception: { id: "DOC-103" } });
  });

  it("a 5-7 day value matches the outdated DOC-104 macro", async () => {
    const result = await check(fixAwareDeps().deps, "TCK-9001", "instant");
    const evidence = result.claims[0]!.evidence;
    expect(matchingSourceEvidence({ amount: 5, amountMax: 7, unit: "calendar_days" }, evidence)?.source.id).toBe("DOC-104");
    expect(matchingSourceEvidence({ amount: 4, unit: "business_days" }, evidence)?.source.id).toBe("DOC-101");
  });

  it("a correct reply gets no proposal, and neither does a rail-specific doc the agent misapplied", async () => {
    expect(findFixSource(await check(fixAwareDeps().deps, "TCK-9001", "instant", ONE_DAY_DRAFT))).toBeNull();
    // 1 business day on a standard transfer is held, but DOC-103 already says "instant transfers only".
    const misapplied = await check(fixAwareDeps().deps, "TCK-9003", "standard", ONE_DAY_DRAFT);
    expect(misapplied.decision).toBe("HOLD");
    expect(findFixSource(misapplied)).toBeNull();
  });
});

describe("validation", () => {
  const body = seedSources().find((s) => s.id === "DOC-101")!.body;
  const fixFor = async () => findFixSource(await check(fixAwareDeps().deps, "TCK-9001", "instant"))!;

  it("accepts the template: it adds the exception sentence right after the claim and nothing else", async () => {
    const fix = await fixFor();
    const edit = templateFix(fix, null);
    const v = validateFix(body, edit, fix);
    if (!v.ok) throw new Error(v.reason);
    expect(v.changed).toHaveLength(1);
    expect(v.changed[0]!.after).toContain(`${SOP_QUOTE} ${EXCEPTION_QUOTE}`);
    expect(v.after.replace(` ${edit.text}`, "")).toBe(body);
  });

  it("rejects edits that touch unrelated text, miss the exact value, add numbers or span lines", async () => {
    const fix = await fixFor();
    const ok = templateFix(fix, null);
    const cases: Array<[Partial<FixEdit>, RegExp]> = [
      [{ target: "Transfer fee is refunded with the principal." }, /other than the claim sentence/],
      [{ target: "This sentence is not in the doc." }, /other than the claim sentence/],
      [{ text: "Instant transfers are reversed faster; see the exception." }, /doesn't state "1 business day"/],
      [{ text: "Instant transfers: 1 business day, or 24 hours on weekends." }, /adds another timeline or amount \("24 hours"\)/],
      [{ text: "Instant transfers: 1 business day.\nSee the exception." }, /one short plain paragraph/],
      [{ action: "replace", text: "Instant transfers are reversed within 1 business day." }, /must keep the claim sentence word for word/],
    ];
    for (const [change, reason] of cases) {
      const v = validateFix(body, { ...ok, ...change }, fix);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(reason);
    }
  });

  it("rejects QA's five edits: deleting a line, landing in the scope line or a heading, flipping meaning, number words", async () => {
    const fix = await fixFor();
    const cases: Array<[FixEdit, RegExp]> = [
      // 1. The claim plus the next sentence as the target: a replace would delete "Do NOT promise same day."
      [{ action: "replace", target: `${SOP_QUOTE} Do NOT promise same day.`, text: `${SOP_QUOTE} Instant transfers: 1 business day.` }, /other than the claim sentence/],
      // 2-3. A fragment of the claim as the target: its first match is in the scope line or a heading.
      [{ action: "replace", target: "transfer", text: "transfer (instant transfers: 1 business day)" }, /other than the claim sentence/],
      [{ action: "replace", target: "fail", text: "fail (instant transfers: 1 business day)" }, /other than the claim sentence/],
      // 4. A rewrite that flips the meaning.
      [
        { action: "replace", target: SOP_QUOTE, text: "Failed transfers are never reversed within 4 business days; instant ones take 1 business day." },
        /must keep the claim sentence word for word/,
      ],
      // 5. Number words and a promise in an added sentence.
      [{ action: "add_after", target: SOP_QUOTE, text: "Instant transfers: 1 business day. Standard transfers can take two weeks." }, /another timeline or amount \("two weeks"\)/],
      [{ action: "add_after", target: SOP_QUOTE, text: "Instant transfers take 1 business day, and refunds are guaranteed." }, /contains "guaranteed"/],
      [{ action: "add_after", target: SOP_QUOTE, text: "Instant transfers are not reversed within 1 business day." }, /contains "not"/],
    ];
    for (const [edit, reason] of cases) {
      const v = validateFix(body, edit, fix);
      expect(v.ok, `${edit.target} → ${edit.text}`).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(reason);
    }
  });

  it("rejects QA's second-round additions: curly or other contractions, wrong or all rails, months, 'immediately', fees", async () => {
    const fix = await fixFor();
    const cases: Array<[string, RegExp]> = [
      ["Instant transfers don’t get 1 business day yet.", /contains "don't"/],
      ["The instant-transfer change to 1 business day wasn't approved.", /contains "wasn't"/],
      ["Instant transfers didn't move to 1 business day.", /contains "didn't"/],
      ["Standard transfers are reversed within 1 business day.", /doesn't name instant transfers|beyond instant transfers/],
      ["All transfers on instant transfers are reversed within 1 business day.", /beyond instant transfers/],
      ["Instant transfers take 1 business day; standard ones can take two months.", /another timeline \("months"\)|beyond instant transfers/],
      ["Instant transfers take 1 business day, or eleven days at month-end.", /another timeline/],
      ["Instant transfers take 1 business day, usually immediately.", /another timeline \("immediately"\)/],
      // D-041: the fee detector now catches it first; either way it's refused for the fee wording.
      ["Instant transfers take 1 business day and the fee is waived.", /contains "fee"|contains "waived"|("fee is waived")/],
    ];
    for (const [text, reason] of cases) {
      const v = validateFix(body, { action: "add_after", target: SOP_QUOTE, text }, fix);
      expect(v.ok, text).toBe(false);
      if (!v.ok) expect(v.reason, text).toMatch(reason);
    }
    // The AI's recorded wording and the template still pass.
    const recorded =
      'For instant transfers, failed transfers are reversed within 1 business day (see Instant Transfers: Reversal Exception). How to tell the transfer type: check "Transfer type" on the transaction in the admin panel.';
    expect(validateFix(body, { action: "add_after", target: SOP_QUOTE, text: recorded }, fix).ok).toBe(true);
  });

  it("accepts a replace that keeps the claim sentence word for word, as an addition after it", async () => {
    const fix = await fixFor();
    const v = validateFix(body, { action: "replace", target: SOP_QUOTE, text: `${SOP_QUOTE} Instant transfers: 1 business day.` }, fix);
    if (!v.ok) throw new Error(v.reason);
    expect(v.edit).toEqual({ action: "add_after", target: SOP_QUOTE, text: "Instant transfers: 1 business day." });
    expect(v.changed).toHaveLength(1);
  });

  it("approve refuses when the doc changed after the fix was drafted", () => {
    expect(fixStillApplies(body, { before: body })).toBe(true);
    expect(fixStillApplies(`${body}\nEdited since.`, { before: body })).toBe(false);
  });
});

describe("proposeFix", () => {
  it("proposes a template fix to DOC-101 for the canonical Hold, with only the changed line and the canonical recheck", async () => {
    const { proposal, why } = await proposeFix(input("TCK-9001", "instant"), fixAwareDeps().deps);
    expect(why).toBeNull();
    expect(proposal).toMatchObject({ kind: "hold", doc: { id: "DOC-101" }, origin: "template", draftValue: "4 business days" });
    expect(proposal!.changed).toHaveLength(1);
    expect(proposal!.recheck.map((r) => r.ticketId)).toEqual(CANONICAL_RECHECK.map((c) => c.ticketId));
  });

  it("an approved fix on DOC-101 leaves every canonical decision as it was", async () => {
    const { deps } = fixAwareDeps();
    const { proposal } = await proposeFix(input("TCK-9001", "instant"), deps);
    const doc101 = seedSources().find((s) => s.id === "DOC-101")!;
    const fixed = fixOverride(doc101, proposal!.after, DECISION_TIME);
    for (const c of CANONICAL_RECHECK) {
      const before = await runCheck({ ...c, role: "support_agent", decisionTime: DECISION_TIME }, deps);
      const after = await runCheck({ ...c, role: "support_agent", overrides: [fixed], decisionTime: DECISION_TIME }, deps);
      expect(`${c.ticketId} ${after.decision}/${after.reasonCode}`).toBe(`${c.ticketId} ${before.decision}/${before.reasonCode}`);
    }
    // Once the doc names the exception, the same held reply no longer points to a fix.
    const again = await runCheck({ ...input("TCK-9001", "instant"), overrides: [fixed] }, deps);
    expect(again.decision).toBe("HOLD");
    expect(findFixSource(again)).toBeNull();
  });

  it("drops a fix that would change a canonical decision", async () => {
    // The added sentence extracted as "all rails" makes TCK-9003's 4 days conflict with 1 day.
    const { proposal, why } = await proposeFix(input("TCK-9001", "instant"), fixAwareDeps({ badScope: true }).deps);
    expect(proposal).toBeNull();
    expect(why).toMatch(/would change TCK-9003/);
  });

  it("falls back to the template when the AI's draft touches unrelated text, and says why", async () => {
    const draftDocFix = async () => ({
      edit: { action: "add_after" as const, target: "Transfer fee is refunded with the principal.", text: "Instant: 1 business day." },
      info: { mode: "live" as const, model: "fake", latencyMs: 0, promptVersion: "fake" },
    });
    const { proposal } = await proposeFix(input("TCK-9001", "instant"), fixAwareDeps().deps, { draftDocFix });
    expect(proposal?.origin).toBe("template");
    expect(proposal?.aiSetAside).toMatch(/failed validation \(the edit touches text other than the claim sentence\)/);
  });

  it("uses the AI's draft when it passes validation and the recheck", async () => {
    const text = `${EXCEPTION_QUOTE} See Instant Transfers: Reversal Exception.`;
    const draftDocFix = async () => ({ edit: { action: "add_after" as const, target: SOP_QUOTE, text }, info: { mode: "live" as const, model: "fake", latencyMs: 0, promptVersion: "fake" } });
    const { proposal } = await proposeFix(input("TCK-9001", "instant"), fixAwareDeps().deps, { draftDocFix });
    expect(proposal).toMatchObject({ origin: "ai", aiSetAside: null, edit: { text } });
  });

  it("never proposes or shows DOC-105, even for the ops lead who can see it", async () => {
    const { proposal } = await proposeFix(input("TCK-9001", "instant", CANONICAL_DRAFT, "ops_lead"), fixAwareDeps().deps);
    expect(proposal?.doc.id).toBe("DOC-101");
    expect(JSON.stringify(proposal)).not.toMatch(RESTRICTED);
  });

  it("a correct reply gets no proposal and says why", async () => {
    const { proposal, why } = await proposeFix(input("TCK-9001", "instant", ONE_DAY_DRAFT), fixAwareDeps().deps);
    expect(proposal).toBeNull();
    expect(why).toMatch(/Only a Hold or an Ask first/);
  });
});
