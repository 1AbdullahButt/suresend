// "Fix the doc" (D-037), part 1: which visible doc taught the agent the wrong value. Pure: reads a CheckResult only, so the
// browser (to show the link) and the server (to draft the fix) agree. Never decides anything; the engine already has.
import { isDuration, sameValue } from "@/lib/engine/values";
import type { CheckResult, Evidence, Value } from "@/lib/engine/types";

type DefinedValue = NonNullable<Value>;

/** The doc agents copied and the in-force, rail-specific exception it doesn't mention. */
export interface FixSource {
  /** Hold (the reply contradicts the governing value) or Ask first (the rail is unknown and the answer depends on it). */
  kind: "hold" | "ask";
  /** The value the reply promised, as the reply wrote it ("4 business days"). */
  draftValueText: string;
  source: { id: string; title: string; quote: string; valueText: string; value: DefinedValue };
  exception: { id: string; title: string; quote: string; valueText: string; value: DefinedValue; rail: "instant" | "standard" };
}

/** Restricted docs are never a fix target, whoever is looking (DOC-105 is "ops"). */
const shareable = (e: Evidence) => e.source.signals.visibility === "everyone";

/**
 * The visible doc whose extracted claim states exactly the reply's value, whatever its standing (an in-force SOP, an
 * outdated macro…). In-force candidates first. A general matcher; the proposal itself uses findFixSource's narrower rule.
 */
export function matchingSourceEvidence(draftValue: Value, evidence: Evidence[]): Evidence | undefined {
  if (!draftValue) return undefined;
  const matches = evidence.filter((e) => shareable(e) && e.claim.value !== null && sameValue(e.claim.value, draftValue));
  return matches.find((e) => e.standing === "CANDIDATE") ?? matches[0];
}

/**
 * The one pattern this demo fixes: a general doc (scope "any", in force) states the value the reply copied, and an
 * in-force exception in another doc gives that rail a different value. The fix adds the exception to the general doc.
 * Anything else (no matching doc, a rail-specific doc the agent misapplied, docs that disagree, an exception that's
 * already in the general doc) gets no proposal.
 */
export function findFixSource(result: CheckResult): FixSource | null {
  const lead =
    result.decision === "HOLD"
      ? result.claims.find((c) => c.decision === "HOLD" && c.reasonCode === "CONTRADICTS_GOVERNING" && c.governing)
      : result.decision === "ESCALATE"
        ? result.claims.find((c) => c.decision === "ESCALATE" && c.reasonCode === "SCOPE_UNKNOWN")
        : undefined;
  const draftValue = lead?.draftClaim.value;
  // The fix pipeline (validation, template) is written for timelines; a yes/no or amount claim gets no proposal (D-041).
  if (!lead || !draftValue || !isDuration(draftValue)) return null;

  const src = lead.evidence.find(
    (e) =>
      shareable(e) &&
      e.standing === "CANDIDATE" &&
      e.claim.scope.rail === "any" &&
      e.applicability === "APPLIES" &&
      e.claim.value !== null &&
      sameValue(e.claim.value, draftValue),
  );
  if (!src?.claim.value) return null;

  // On Ask first, propose only if exactly one exception clearly applies (one doc, one value).
  const disagreeing =
    result.decision === "HOLD"
      ? []
      : lead.evidence.filter(
          (e) =>
            e.standing === "CANDIDATE" &&
            e.claim.scope.rail !== "any" &&
            e.applicability === "SCOPE_UNRESOLVED" &&
            e.claim.value !== null &&
            !sameValue(e.claim.value, src.claim.value!),
        );
  const distinct = new Set(disagreeing.map((e) => `${e.source.id}|${e.claim.scope.rail}|${JSON.stringify(e.claim.value)}`));
  if (result.decision === "ESCALATE" && distinct.size !== 1) return null;
  const exc =
    result.decision === "HOLD"
      ? lead.evidence.find((e) => e.source.id === lead.governing!.sourceId && e.claim.quote === lead.governing!.quote)
      : disagreeing[0];
  if (!exc?.claim.value || exc.source.id === src.source.id || !shareable(exc) || exc.claim.scope.rail === "any") return null;
  const rail = exc.claim.scope.rail;

  // Already fixed: the general doc itself states the exception's value for that rail.
  const alreadyThere = lead.evidence.some(
    (e) => e.source.id === src.source.id && e.claim.scope.rail === rail && e.claim.value !== null && sameValue(e.claim.value, exc.claim.value!),
  );
  if (alreadyThere) return null;

  return {
    kind: result.decision === "HOLD" ? "hold" : "ask",
    draftValueText: lead.draftClaim.valueText,
    source: { id: src.source.id, title: src.source.title, quote: src.claim.quote, valueText: src.claim.valueText, value: src.claim.value },
    exception: { id: exc.source.id, title: exc.source.title, quote: exc.claim.quote, valueText: exc.claim.valueText, value: exc.claim.value, rail },
  };
}
