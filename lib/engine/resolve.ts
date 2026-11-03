// D4 to D7 (SPEC §6.6, §6.6.1): settle the governing value V among the candidates C.
// Recency and verification are never used to break a tie.
import { RAIL_LABEL } from "./applicability";
import { isVerbatim, namesSource, parseTime } from "./normalize";
import { sameValue } from "./values";
import { describeValue } from "@/lib/topics";
import type { EvaluatedClaim } from "./decide";
import type { Governing, Rail, TraceEntry } from "./types";

export type Resolution =
  | { kind: "governed"; governing: Governing; basis: EvaluatedClaim[] }
  | { kind: "conflict" };

interface Ctx {
  ticketId: string;
  rail: Rail;
}

const valueOf = (e: EvaluatedClaim) => e.claim.value!; // C only holds claims with a value
/** The claim's value in the words of its topic (D-041). */
const formatValue = (v: ReturnType<typeof valueOf>, e: EvaluatedClaim) => describeValue(e.claim.topic, v);

function governingFrom(e: EvaluatedClaim, via: Governing["via"]): Governing {
  const value = valueOf(e);
  return { sourceId: e.source.id, value, valueText: formatValue(value, e), quote: e.claim.quote, via };
}

export function resolve(C: EvaluatedClaim[], ctx: Ctx, trace: TraceEntry[]): Resolution {
  // D4: all of C agree
  const first = C[0]!;
  const allAgree = C.every((e) => sameValue(valueOf(e), valueOf(first)));
  if (allAgree) {
    const preferred = C.find((e) => e.weakeners.length === 0) ?? first;
    const ids = [...new Set(C.map((e) => e.source.id))].join(", ");
    trace.push({ rule: "D4", outcome: "fired", detail: `All ${C.length} candidate claim(s) agree (${ids}): V = ${formatValue(valueOf(first), first)}.` });
    skip(trace, ["D5", "D6", "D7"], "V settled by consensus.");
    return { kind: "governed", governing: governingFrom(preferred, "CONSENSUS"), basis: C };
  }
  const summary = C.map((e) => `${e.source.id} ${formatValue(valueOf(e), e)}`).join(" vs ");
  trace.push({ rule: "D4", outcome: "pass", detail: `Candidates disagree: ${summary}.` });

  // D5: exactly one candidate explicitly supersedes every other disagreeing candidate
  const d5Notes: string[] = [];
  const superseders: Array<{ s: EvaluatedClaim; detail: string }> = [];
  for (const s of C) {
    const sup = s.claim.supersedes;
    if (!sup) continue;
    // Condition 1: S applies to the ticket (not SCOPE_UNRESOLVED).
    if (s.applicability !== "APPLIES") {
      d5Notes.push(`${s.source.id} has a supersedes sentence, but condition 1 fails: its scope is unresolved for ${ctx.ticketId}.`);
      continue;
    }
    // Condition 2: the supersedes quote is verbatim in S's source (re-checked here so the engine never trusts its input).
    if (!isVerbatim(sup.quote, s.source.body)) {
      d5Notes.push(`${s.source.id}: condition 2 fails: its supersedes quote is not verbatim in the source.`);
      continue;
    }
    const targets = C.filter((t) => t !== s && !sameValue(valueOf(t), valueOf(s)));
    const named: string[] = [];
    const dated: string[] = [];
    const failures: string[] = [];
    for (const t of targets) {
      // A document that contradicts itself can't resolve that by superseding its own claim.
      if (t.source.id === s.source.id) {
        failures.push(`condition 3 fails: ${s.source.id} also states ${formatValue(valueOf(t), t)}, and a source can't supersede its own claim`);
        continue;
      }
      // Condition 3: each disagreeing candidate's source is named by targetText.
      if (!namesSource(sup.targetText, t.source)) {
        failures.push(`condition 3 fails: "${sup.targetText}" does not name ${t.source.id} ("${t.source.title}")`);
        continue;
      }
      named.push(`${t.source.id} ("${t.source.title}")`);
      // Condition 4: if both have an effective date, S's is later.
      const sFrom = parseTime(s.claim.effectiveFrom);
      const tFrom = parseTime(t.claim.effectiveFrom);
      if (sFrom !== null && tFrom !== null) {
        if (sFrom <= tFrom) {
          failures.push(`condition 4 fails: ${s.source.id} (effective ${s.claim.effectiveFrom}) is not effective later than ${t.source.id} (effective ${t.claim.effectiveFrom})`);
          continue;
        }
        dated.push(`${s.source.id} (effective ${s.claim.effectiveFrom}) is later than ${t.source.id} (effective ${t.claim.effectiveFrom})`);
      } else if (tFrom === null) {
        dated.push(`${t.source.id} has no effective date, so the explicit sentence is enough`);
      } else {
        dated.push(`${s.source.id} states no effective date, so dates can't be compared and the explicit sentence is enough`);
      }
    }
    if (failures.length === 0 && targets.length > 0) {
      superseders.push({
        s,
        detail:
          `1) ${s.source.id} applies to ${RAIL_LABEL[s.claim.scope.rail]}, which matches ${ctx.ticketId}. ` +
          `2) Its supersedes sentence is quoted verbatim: "${sup.quote.trim().replace(/[.\s]+$/, "")}". ` +
          `3) "${sup.targetText}" names ${named.join(", ")}. ` +
          `4) ${dated.join("; ")}. ` +
          `V = ${formatValue(valueOf(s), s)}.`,
      });
    } else if (failures.length > 0) {
      d5Notes.push(`${s.source.id}: ${failures.join("; ")}.`);
    }
  }
  if (superseders.length === 1) {
    const { s, detail } = superseders[0]!;
    trace.push({ rule: "D5", outcome: "fired", detail });
    skip(trace, ["D6", "D7"], "V settled by explicit supersession.");
    return { kind: "governed", governing: governingFrom(s, "EXPLICIT_SUPERSESSION"), basis: [s] };
  }
  trace.push({
    rule: "D5",
    outcome: superseders.length > 1 || d5Notes.length > 0 ? "fail" : "pass",
    detail:
      superseders.length > 1
        ? `More than one candidate claims to supersede the others (${superseders.map((x) => x.s.source.id).join(", ")}).`
        : d5Notes.length > 0
          ? d5Notes.join(" ")
          : "No candidate has a supersedes sentence.",
  });

  // D6: exactly one specific, unweakened candidate; every other disagreeing candidate is scoped "any"
  const specific = C.filter((e) => e.applicability === "APPLIES" && e.claim.scope.rail !== "any");
  if (specific.length === 1) {
    const s = specific[0]!;
    const others = C.filter((t) => t !== s && !sameValue(valueOf(t), valueOf(s)));
    const othersGeneral = others.every((t) => t.claim.scope.rail === "any");
    if (s.weakeners.length === 0 && othersGeneral) {
      trace.push({
        rule: "D6",
        outcome: "fired",
        detail: `${s.source.id} is the only candidate scoped to ${RAIL_LABEL[ctx.rail]}, has no weakeners, and every other disagreeing candidate covers all transfers. V = ${formatValue(valueOf(s), s)}.`,
      });
      skip(trace, ["D7"], "V settled by specificity.");
      return { kind: "governed", governing: governingFrom(s, "SPECIFIC_EXCEPTION"), basis: [s] };
    }
    trace.push({
      rule: "D6",
      outcome: "fail",
      detail:
        s.weakeners.length > 0
          ? `${s.source.id} is specific to ${RAIL_LABEL[ctx.rail]} but has weakeners (${s.weakeners.join(", ")}); an inferred override from a doubtful source cannot set V.`
          : `${s.source.id} is specific, but another disagreeing candidate is also scoped.`,
    });
  } else {
    trace.push({
      rule: "D6",
      outcome: "pass",
      detail: specific.length === 0 ? "No candidate is scoped specifically to this ticket's transfer type." : `${specific.length} candidates are scoped to this transfer type.`,
    });
  }

  // D7
  trace.push({
    rule: "D7",
    outcome: "fired",
    detail: `Applicable sources still disagree (${summary}). Recency and verification are never used to break the tie.`,
  });
  return { kind: "conflict" };
}

export function skip(trace: TraceEntry[], rules: string[], why: string): void {
  for (const rule of rules) trace.push({ rule, outcome: "skipped", detail: why });
}
