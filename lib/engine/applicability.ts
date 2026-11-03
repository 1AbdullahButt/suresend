// Rule A (SPEC §6.5).
import type { Applicability, ClaimResult, Rail, ScopeRail } from "./types";
import { sameValue } from "./values";

export function applicability(scope: ScopeRail, ticketRail: Rail): Applicability {
  if (scope === "any") return "APPLIES";
  if (ticketRail === "unknown") return "SCOPE_UNRESOLVED";
  return scope === ticketRail ? "APPLIES" : "NOT_APPLICABLE";
}

/** How the rules name a scope in words. The field is `rail`; a person reads a transfer type (D-053). */
export const RAIL_LABEL: Record<ScopeRail | Rail, string> = {
  instant: "instant transfers",
  standard: "standard transfers",
  any: "all transfers",
  unknown: "an unknown transfer type",
};

/**
 * Which transfers a governing value speaks for, in a sentence about it (D-056). A rule's own scope, if it has one. A rule for all
 * transfers names no type, unless an in-force rule gives another type a different value: then "failed transfers" would be false,
 * so it names the ticket's own. Words only: it decides nothing.
 */
export function governingScope(claim: ClaimResult, rail: Rail): ScopeRail {
  const g = claim.governing;
  if (!g) return "any";
  const own = claim.evidence.find((e) => e.source.id === g.sourceId && e.claim.quote === g.quote)?.claim.scope.rail ?? "any";
  if (own !== "any" || rail === "unknown") return own;
  const another = claim.evidence.some((e) => e.standing === "CANDIDATE" && e.claim.scope.rail !== "any" && e.claim.value !== null && !sameValue(e.claim.value, g.value));
  return another ? rail : "any";
}
