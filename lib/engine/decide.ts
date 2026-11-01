// The decision function (SPEC §6.1: "The AI never decides the outcome"). Pure: no I/O, time is passed in.
// decide(extractions, sources, ticket, now) applies rules S, A and D0a–D11, writing every step to the trace.
import { RAIL_LABEL, applicability } from "./applicability";
import { formatDate, normalizeText } from "./normalize";
import { detectPolicyPatterns, patternNoun } from "./patterns";
import { resolve, skip } from "./resolve";
import { mostSevere } from "./severity";
import { claimStanding, weakeners } from "./standing";
import { formatValue, sameValue, unitLabel, unitsMatch, valueWithin } from "./values";
import { isCovered, topicDef } from "@/lib/topics";
import type {
  Applicability,
  Cap,
  ClaimResult,
  Decision,
  DraftClaim,
  Evidence,
  Governing,
  OverallDecision,
  PatternMatch,
  Rail,
  ReasonCode,
  Relation,
  Source,
  SourceClaim,
  Standing,
  TraceEntry,
  Weakener,
} from "./types";

/** Extraction outcomes after quote validation. `ok: false` means the call failed (error or invalid output after retry). */
export interface Extractions {
  draft: { ok: true; text: string; claims: DraftClaim[]; rejectedCount: number } | { ok: false; text: string; error: string };
  sources: Record<string, { ok: true; claims: SourceClaim[] } | { ok: false; error: string }>;
}

export interface DecideTicket {
  id: string;
  rail: Rail;
}

export interface DecideOutput {
  decision: OverallDecision;
  reasonCode: ReasonCode;
  headline: string;
  claims: ClaimResult[];
  caps: Cap[];
  patternMatches: PatternMatch[];
  /** Draft-level rules (D0a/D0b/D0d), the SOURCE_UNREAD cap and the overall roll-up (extension, D-012.5). */
  trace: TraceEntry[];
}

export interface EvaluatedClaim {
  claim: SourceClaim;
  source: Source;
  standing: Standing;
  standingRule: string;
  standingDetail: string;
  weakeners: Weakener[];
  applicability: Applicability;
}

const DOWNGRADE_PREFIX = "Downgraded to CAUTION";

export function decide(extractions: Extractions, sources: Source[], ticket: DecideTicket, now: Date): DecideOutput {
  const decisionTime = now.getTime();
  const draftText = extractions.draft.text;
  const patternMatches = detectPolicyPatterns(draftText);
  const byId = new Map(sources.map((s) => [s.id, s]));

  // D0a: draft extraction failed, or every draft claim was rejected by quote validation
  const draft = extractions.draft;
  const trace: TraceEntry[] = [];
  if (!draft.ok || (draft.claims.length === 0 && draft.rejectedCount > 0)) {
    trace.push({
      rule: "D0a",
      outcome: "fired",
      detail: !draft.ok
        ? `Draft extraction failed (${draft.error}). Send is blocked until the draft is rechecked.`
        : `All ${draft.rejectedCount} extracted claim(s) failed quote validation against the draft. Send is blocked until rechecked.`,
    });
    return {
      decision: "AI_UNAVAILABLE",
      reasonCode: "EXTRACTION_FAILED",
      headline: "AI unavailable: SureSend couldn't read this draft. Retry, or rewrite it without the policy claim.",
      claims: [],
      caps: [],
      patternMatches,
      trace,
    };
  }
  trace.push({ rule: "D0a", outcome: "pass", detail: `Draft read: ${draft.claims.length} claim(s) extracted and quote-validated.` });

  // Validated source claims from sources that were read successfully.
  const pool: EvaluatedClaim[] = [];
  for (const source of sources) {
    const ex = extractions.sources[source.id];
    if (!ex?.ok) continue;
    for (const claim of ex.claims) {
      const st = claimStanding(claim, source, decisionTime);
      pool.push({
        claim,
        source,
        standing: st.standing,
        standingRule: st.rule,
        standingDetail: st.detail,
        weakeners: st.standing === "CANDIDATE" ? weakeners(source) : [],
        applicability: applicability(claim.scope.rail, ticket.rail),
      });
    }
  }

  // Claims on a covered topic go through rules D1–D11; the taxonomy registry says which topics are covered (D-041).
  const covered = draft.claims.filter((c) => isCovered(c.topic));
  const outside = draft.claims.filter((c) => c.topic === "other" && c.value !== null);
  const outsideResults = outside.map((c) => outsideCoverage(c));

  let claims: ClaimResult[];
  let decision: OverallDecision;
  let reasonCode: ReasonCode;

  let gapNoun = "";
  if (covered.length === 0) {
    // D0b / D0c / D0d: "nothing found" is never proof of safety (SPEC §6.6.2)
    const uncovered = patternMatches.filter(
      (m) => !outside.some((o) => normalizeText(o.span).toLowerCase().includes(normalizeText(m.text).toLowerCase())),
    );
    claims = outsideResults;
    const quoted = (ms: PatternMatch[]) => ms.map((m) => `"${m.text}"`).join(", ");
    if (uncovered.length > 0) {
      decision = "CAUTION";
      reasonCode = "EXTRACTION_GAP";
      gapNoun = patternNoun(uncovered);
      trace.push({
        rule: "D0b",
        outcome: "fired",
        detail: `No claim on a checked topic was extracted, but the policy-pattern detector found ${quoted(uncovered)}. SureSend couldn't confirm ${gapNoun}; check it manually.`,
      });
    } else if (outside.length > 0) {
      decision = "CAUTION";
      reasonCode = "OUTSIDE_COVERAGE";
      trace.push({ rule: "D0b", outcome: "pass", detail: "Every detector match is covered by an extracted out-of-topic claim." });
      trace.push({ rule: "D0c", outcome: "fired", detail: `${outside.length} claim(s) outside the topics SureSend checks. Check them manually.` });
    } else {
      decision = "ALLOW";
      reasonCode = "NO_POLICY_CLAIM";
      trace.push({ rule: "D0b", outcome: "pass", detail: "The policy-pattern detector found no timing, amount or deadline in the draft." });
      trace.push({ rule: "D0d", outcome: "fired", detail: "No policy claims in this reply." });
    }
  } else {
    claims = [...covered.map((dc) => decideClaim(dc, pool, ticket, draftText)), ...outsideResults];
    const worst = mostSevere(claims)!;
    decision = worst.decision;
    reasonCode = worst.reasonCode;
    trace.push({
      rule: "Overall",
      outcome: "fired",
      detail: `Most severe of ${claims.length} claim(s): ${decision} (${reasonCode}). Order: AI unavailable > Escalate > Hold > Caution > Allow.`,
    });
  }

  // SOURCE_UNREAD cap: an unread, visible, non-excluded source can never support ALLOW.
  const caps: Cap[] = [];
  for (const source of sources) {
    const ex = extractions.sources[source.id];
    if (ex && !ex.ok && !source.flaggedOutdated) {
      caps.push({
        code: "SOURCE_UNREAD",
        sourceId: source.id,
        detail: `${source.id} (${source.title}) couldn't be read, so it can't support ALLOW. It might hold a contradiction.`,
      });
    }
  }
  if (caps.length > 0) {
    const ids = caps.map((c) => c.sourceId).join(", ");
    if (decision === "ALLOW") {
      decision = "CAUTION";
      reasonCode = "SOURCE_UNREAD";
      trace.push({ rule: "Cap", outcome: "fired", detail: `${ids} couldn't be read, so ALLOW is capped at CAUTION (SOURCE_UNREAD).` });
    } else {
      trace.push({ rule: "Cap", outcome: "pass", detail: `${ids} couldn't be read; the result is already ${decision}, so the cap changes nothing.` });
    }
  }

  return {
    decision,
    reasonCode,
    headline: headlineFor(decision, reasonCode, claims, caps, byId, ticket, gapNoun),
    claims,
    caps,
    patternMatches,
    trace,
  };
}

/** One entry per (source, value); a claim with a supersedes sentence wins over its duplicate. */
function dedupeBySourceValue(list: EvaluatedClaim[]): EvaluatedClaim[] {
  const out: EvaluatedClaim[] = [];
  for (const e of list) {
    const i = out.findIndex((o) => o.source.id === e.source.id && sameValue(o.claim.value!, e.claim.value!));
    if (i === -1) out.push(e);
    else if (!out[i]!.claim.supersedes && e.claim.supersedes) out[i] = e;
  }
  return out;
}

function outsideCoverage(dc: DraftClaim): ClaimResult {
  return {
    draftClaim: dc,
    decision: "CAUTION",
    reasonCode: "OUTSIDE_COVERAGE",
    evidence: [],
    trace: [
      {
        rule: "D0c",
        outcome: "fired",
        detail: `"${dc.span}" makes a claim (${dc.value ? formatValue(dc.value) : dc.valueText}) outside the topics this demo covers. Check it manually.`,
      },
    ],
    governing: null,
  };
}

function relationTo(dc: DraftClaim, claim: SourceClaim): Relation {
  if (!dc.value || !claim.value) return "n/a";
  return unitsMatch(dc.value, claim.value) && valueWithin(dc.value, claim.value) ? "supports" : "contradicts";
}

function toEvidence(e: EvaluatedClaim, dc: DraftClaim): Evidence {
  const s = e.source;
  return {
    claim: e.claim,
    source: {
      id: s.id,
      title: s.title,
      kind: s.kind,
      signals: {
        verification: s.verification,
        verifiedAt: s.verifiedAt,
        updatedAt: s.updatedAt,
        owner: s.owner,
        flaggedOutdated: s.flaggedOutdated,
        flagNote: s.flagNote,
        visibility: s.visibility,
        version: s.version,
      },
    },
    standing: e.standing,
    standingRule: `${e.standingRule}: ${e.standingDetail}`,
    weakeners: e.weakeners,
    applicability: e.applicability,
    relation: relationTo(dc, e.claim),
  };
}

function decideClaim(dc: DraftClaim, pool: EvaluatedClaim[], ticket: DecideTicket, draftText: string): ClaimResult {
  const trace: TraceEntry[] = [];
  const onTopic = pool.filter((e) => e.claim.topic === dc.topic);
  const evidence = onTopic.map((e) => toEvidence(e, dc));
  const result = (decision: Decision, reasonCode: ReasonCode, governing: Governing | null = null): ClaimResult => ({
    draftClaim: dc,
    decision,
    reasonCode,
    evidence,
    trace,
    governing,
  });

  trace.push({
    rule: "D0",
    outcome: "pass",
    detail: `Draft read: "${dc.span}" is a ${dc.definitive ? "definitive" : "hedged"} ${topicDef(dc.topic).label} claim (${dc.valueText}).${
      draftText.includes(dc.span) ? "" : " Span matched after whitespace normalization."
    }`,
  });

  // Repeated claims from one source with the same value count once (DECISIONS D-012.2); prefer the one carrying a
  // supersedes sentence so an extractor that splits a doc into two claims can't make it compete with itself.
  const C = dedupeBySourceValue(
    onTopic.filter((e) => e.standing === "CANDIDATE" && e.applicability !== "NOT_APPLICABLE" && e.claim.value !== null),
  );
  const signals = onTopic.filter(
    (e) => (e.standing === "PROPOSAL" || e.standing === "NOT_YET_EFFECTIVE") && e.applicability !== "NOT_APPLICABLE" && e.claim.value !== null,
  );
  const describe = (list: EvaluatedClaim[]) =>
    list.length === 0 ? "none" : list.map((e) => `${e.source.id} (${formatValue(e.claim.value!)}, ${RAIL_LABEL[e.claim.scope.rail]})`).join(", ");

  if (!dc.value) {
    // No checkable value: no candidate can support it, so it is treated as unsupported (DECISIONS D-012.4).
    skip(trace, ["D1", "D2"], "The draft claim states no checkable value.");
    trace.push({
      rule: "D3",
      outcome: "fired",
      detail: `"${dc.span}" states no value that a source could support, so it is treated as unsupported. Check it manually.`,
    });
    skip(trace, ["D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11a", "D11b"], "Nothing to compare.");
    return result("CAUTION", "UNSUPPORTED");
  }
  const draftValue = dc.value;

  // D1: scope unknown and it matters
  const unresolved = C.filter((e) => e.applicability === "SCOPE_UNRESOLVED");
  const scopeMatters = unresolved.some((u) => C.some((o) => o !== u && !sameValue(o.claim.value!, u.claim.value!)));
  // D-012.1: also escalate when every candidate is scoped to a rail we can't confirm; a rail-specific rule must not
  // govern a ticket whose rail is unknown.
  const onlyUnresolved = C.length > 0 && unresolved.length === C.length;
  if (ticket.rail === "unknown" && (scopeMatters || onlyUnresolved)) {
    trace.push({
      rule: "D1",
      outcome: "fired",
      detail: scopeMatters
        ? `${ticket.id}'s rail is unknown and the answer depends on it: ${describe(C)}.`
        : `${ticket.id}'s rail is unknown and every applicable rule is rail-specific: ${describe(C)}.`,
    });
    skip(trace, ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11a", "D11b"], "Escalated: scope unknown.");
    return result("ESCALATE", "SCOPE_UNKNOWN");
  }
  trace.push({
    rule: "D1",
    outcome: "pass",
    detail: unresolved.length === 0 ? `Every candidate's scope resolves for the ${RAIL_LABEL[ticket.rail]}.` : "Scope-unresolved claims agree with the rest.",
  });

  // D2 / D3
  if (C.length === 0) {
    if (signals.length > 0) {
      trace.push({ rule: "D2", outcome: "fired", detail: `No in-force candidate applies; only proposals or future changes: ${describe(signals)}.` });
      skip(trace, ["D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11a", "D11b"], "No governing value.");
      return result("CAUTION", "PROPOSAL_ONLY");
    }
    trace.push({ rule: "D2", outcome: "pass", detail: "No proposals either." });
    trace.push({ rule: "D3", outcome: "fired", detail: "No source supports or governs this claim." });
    skip(trace, ["D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11a", "D11b"], "No governing value.");
    return result("CAUTION", "UNSUPPORTED");
  }
  trace.push({ rule: "D2", outcome: "pass", detail: `Candidates: ${describe(C)}.` });
  trace.push({ rule: "D3", outcome: "pass", detail: `${C.length} candidate claim(s) apply.` });

  // D4–D7
  const resolution = resolve(C, { ticketId: ticket.id, rail: ticket.rail }, trace);
  if (resolution.kind === "conflict") {
    skip(trace, ["D8", "D9", "D10", "D11a", "D11b"], "Escalated: conflict unresolved.");
    return result("ESCALATE", "CONFLICT_UNRESOLVED");
  }
  const { governing, basis } = resolution;
  const V = governing.value;

  // D8: units (the comparator for the value kind decides; a kind without units always matches)
  if (!unitsMatch(draftValue, V)) {
    trace.push({
      rule: "D8",
      outcome: "fired",
      detail: `The draft says ${formatValue(draftValue)} but the governing value is ${formatValue(V)}: the units differ.`,
    });
    skip(trace, ["D9", "D10", "D11a", "D11b"], "Unit mismatch.");
    return result("CAUTION", "UNIT_MISMATCH", governing);
  }
  const unit = unitLabel(V);
  trace.push({ rule: "D8", outcome: "pass", detail: unit ? `Units match (${unit}).` : "No units to compare." });

  // D9 / D10
  let decision: Decision;
  let reasonCode: ReasonCode;
  if (!valueWithin(draftValue, V)) {
    if (dc.definitive) {
      trace.push({ rule: "D9", outcome: "fired", detail: `The draft's ${formatValue(draftValue)} is outside V = ${formatValue(V)}.` });
      decision = "HOLD";
      reasonCode = "CONTRADICTS_GOVERNING";
    } else {
      trace.push({
        rule: "D9",
        outcome: "fired",
        detail: `The draft's ${formatValue(draftValue)} is outside V = ${formatValue(V)}, but the claim is hedged, so CAUTION rather than HOLD.`,
      });
      decision = "CAUTION";
      reasonCode = "HEDGED_CONTRADICTION";
    }
    skip(trace, ["D10"], "D9 fired.");
  } else {
    trace.push({ rule: "D9", outcome: "pass", detail: `The draft's ${formatValue(draftValue)} is within V = ${formatValue(V)}.` });
    trace.push({ rule: "D10", outcome: "fired", detail: `Supported by ${governing.sourceId}.` });
    decision = "ALLOW";
    reasonCode = "SUPPORTED";
  }

  // D11(a): V rests only on weakened candidates
  if ((decision === "ALLOW" || decision === "HOLD") && basis.every((e) => e.weakeners.length > 0)) {
    const why = basis.map((e) => `${e.source.id}: ${e.weakeners.join(", ")}`).join("; ");
    trace.push({
      rule: "D11a",
      outcome: "fired",
      detail: `${DOWNGRADE_PREFIX} from ${decision}: V = ${formatValue(V)} rests only on weakened sources (${why}). Verify before sending.`,
    });
    skip(trace, ["D11b"], "Already downgraded.");
    return result("CAUTION", "WEAK_BASIS", governing);
  }
  trace.push({
    rule: "D11a",
    outcome: decision === "ALLOW" || decision === "HOLD" ? "pass" : "skipped",
    detail: decision === "ALLOW" || decision === "HOLD" ? "V rests on at least one unweakened source." : "Applies to ALLOW or HOLD only.",
  });

  // D11(b): a proposal or future-effective change that applies contradicts V
  if (decision === "ALLOW") {
    const contradicting = signals.filter((e) => e.applicability === "APPLIES" && !valueWithin(e.claim.value!, V));
    const unitOnly = signals.filter((e) => e.applicability === "APPLIES" && valueWithin(e.claim.value!, V) && !unitsMatch(e.claim.value!, V));
    if (contradicting.length > 0) {
      trace.push({
        rule: "D11b",
        outcome: "fired",
        detail: `${DOWNGRADE_PREFIX} from ALLOW: a change is signalled for this ticket: ${describe(contradicting)} (${contradicting
          .map((e) => e.standing.toLowerCase().replace(/_/g, " "))
          .join(", ")}).`,
      });
      return result("CAUTION", "CHANGE_SIGNALLED", governing);
    }
    trace.push({
      rule: "D11b",
      outcome: "pass",
      detail:
        unitOnly.length > 0
          ? `No signalled change contradicts V. ${describe(unitOnly)} differ only in unit wording, which is not treated as a contradiction.`
          : signals.length > 0
            ? `Signalled changes agree with V or don't apply: ${describe(signals)}.`
            : "No proposals or future-effective changes apply.",
    });
  } else {
    trace.push({ rule: "D11b", outcome: "skipped", detail: "Applies to ALLOW only." });
  }
  return result(decision, reasonCode, governing);
}

function headlineFor(
  decision: OverallDecision,
  reasonCode: ReasonCode,
  claims: ClaimResult[],
  caps: Cap[],
  byId: Map<string, Source>,
  ticket: DecideTicket,
  gapNoun: string,
): string {
  const lead = claims.find((c) => c.reasonCode === reasonCode) ?? claims[0];
  const topic = lead && isCovered(lead.draftClaim.topic) ? topicDef(lead.draftClaim.topic) : null;
  const g = lead?.governing ?? null;
  const gSource = g ? byId.get(g.sourceId) : undefined;
  const gClaimEffective = lead?.evidence.find((e) => e.source.id === g?.sourceId && e.claim.quote === g?.quote)?.claim.effectiveFrom;
  const cite = gSource ? `${gSource.title}${gClaimEffective ? `, effective ${formatDate(gClaimEffective)}` : ""}` : "";
  const draftVal = lead?.draftClaim.value ? formatValue(lead.draftClaim.value) : "";
  const rail = RAIL_LABEL[ticket.rail];
  const railTransfers = ticket.rail === "unknown" ? "transfers" : `${ticket.rail}-rail transfers`;

  switch (reasonCode) {
    case "CONTRADICTS_GOVERNING":
      return topic
        ? topic.holdHeadline({ railTransfers, governing: g?.valueText ?? "", cite, draft: draftVal })
        : `Hold: the draft contradicts ${cite}.`;
    case "SUPPORTED":
      return `Allow: matches ${cite} (${g?.valueText}).`;
    case "SCOPE_UNKNOWN":
      return `Escalate: ${topic?.subject ?? "the answer"} depends on the payment rail, and this ticket's rail is unknown.`;
    case "CONFLICT_UNRESOLVED":
      return "Escalate: applicable sources disagree and no rule can pick a winner. Newer or verified doesn't win on its own.";
    case "WEAK_BASIS":
      return `Caution: the right value is probably ${g?.valueText} (${cite}), but that source's verification is in doubt. Verify before sending.`;
    case "CHANGE_SIGNALLED":
      return `Caution: ${draftVal} matches the current policy (${cite}), but a change is signalled for the ${rail}. Confirm before sending.`;
    case "UNIT_MISMATCH":
      return `Caution: the draft says ${draftVal} but the policy says ${g?.valueText}. Check the units.`;
    case "HEDGED_CONTRADICTION":
      return `Caution: the draft hedges on ${draftVal}, but the policy says ${g?.valueText} (${cite}).`;
    case "PROPOSAL_ONLY":
      return "Caution: only proposals or not-yet-effective changes cover this. Nothing in force governs it.";
    case "UNSUPPORTED":
      return "Caution: no source supports this claim. Check it manually.";
    case "EXTRACTION_GAP":
      return `Caution: SureSend couldn't confirm ${gapNoun || "a policy claim"} in this draft. Check it manually.`;
    case "OUTSIDE_COVERAGE":
      return "Caution: the draft makes a claim outside the topics SureSend covers. Check it manually.";
    case "NO_POLICY_CLAIM":
      return "Allow: no policy claims in this reply.";
    case "SOURCE_UNREAD":
      return `Caution: ${caps.map((c) => c.sourceId).join(", ")} couldn't be read, so SureSend can't confirm this. Check it manually.`;
    case "EXTRACTION_FAILED":
      return "AI unavailable: SureSend couldn't read this draft. Retry, or rewrite it without the policy claim.";
    default:
      return decision;
  }
}
