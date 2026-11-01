// Orchestration shared by /api/check and /api/send (SPEC §6, §8, §10).
// Order matters: merge overrides → filter by persona → extract (AI, injected) → validate quotes → decide (pure) →
// safe reply (rechecked). Hidden sources are removed before extraction, so they never reach the AI or the response.
import { createHash } from "node:crypto";
import { decide, type DecideTicket, type Extractions } from "@/lib/engine/decide";
import { formatValue, isVerbatim } from "@/lib/engine/normalize";
import { detectPolicyPatterns, hasTimelineWords } from "@/lib/engine/patterns";
import type {
  AiRunInfo,
  CheckDeps,
  CheckInput,
  CheckResult,
  Decision,
  DraftClaim,
  Governing,
  RejectedExtraction,
  Source,
  SourceClaim,
  Suggestion,
} from "@/lib/engine/types";
import { recheckNote, type CheckedSuggestion } from "@/lib/check/recheckNote";
import { MAX_SOURCES_PER_CHECK, mergeOverrides } from "@/lib/workspace/merge";
import { visibleSources } from "@/lib/workspace/permissions";
import { seedSources, seedTickets } from "@/lib/workspace/seed";
import { ESCALATE_TEMPLATE, holdTemplate } from "@/lib/replies/templates";

export class CheckInputError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

/** AI-layer errors may carry run info (mode, model, latency) for the AI run panel. */
const infoOf = (error: unknown): AiRunInfo | undefined =>
  typeof error === "object" && error !== null && "info" in error ? (error as { info?: AiRunInfo }).info : undefined;

/** AI-layer errors carry a kind; only "invalid_output" means the model answered but the answer failed validation. */
const isInvalidOutput = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "kind" in error && (error as { kind?: unknown }).kind === "invalid_output";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const snippet = (s: string) => (s.length > 160 ? `${s.slice(0, 157)}…` : s);

/** Quote validation (SPEC §6.2): drop claims whose quote isn't verbatim; keep the claim but drop an unverifiable supersedes. */
export function validateSourceClaims(
  source: Source,
  claims: SourceClaim[],
  rejected: RejectedExtraction[],
): SourceClaim[] {
  const out: SourceClaim[] = [];
  claims.forEach((raw, i) => {
    const claim: SourceClaim = { ...raw, claimId: raw.claimId || `${source.id}#${i + 1}`, sourceId: source.id, sourceVersion: source.version };
    if (!isVerbatim(claim.quote, source.body)) {
      rejected.push({ sourceId: source.id, reason: "QUOTE_NOT_FOUND", snippet: snippet(claim.quote) });
      return;
    }
    if (claim.supersedes && !isVerbatim(claim.supersedes.quote, source.body)) {
      rejected.push({ sourceId: source.id, reason: "SUPERSEDES_QUOTE_NOT_FOUND", snippet: snippet(claim.supersedes.quote) });
      claim.supersedes = null;
    }
    out.push(claim);
  });
  return out;
}

export function validateDraftClaims(draft: string, claims: DraftClaim[], rejected: RejectedExtraction[]): DraftClaim[] {
  return claims.filter((c) => {
    if (isVerbatim(c.span, draft)) return true;
    rejected.push({ sourceId: "DRAFT", reason: "SPAN_NOT_FOUND", snippet: snippet(c.span) });
    return false;
  });
}

function checkHashOf(input: CheckInput, sources: Source[]): string {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const identity = {
    ticketId: input.ticketId,
    rail: input.rail,
    role: input.role,
    draft: input.draft,
    sources: sources.map((s) => [
      s.id,
      s.version,
      s.updatedAt,
      s.verification,
      s.verifiedAt,
      s.flaggedOutdated,
      s.owner?.active ?? null,
      sha(s.body),
    ]),
  };
  return sha(JSON.stringify(identity));
}

function combineInfo(infos: AiRunInfo[], draftFailed: boolean): AiRunInfo {
  const first = infos[0];
  return {
    mode: draftFailed ? "unavailable" : infos.some((i) => i.mode === "live") ? "live" : infos.length > 0 ? "saved" : "unavailable",
    model: first?.model ?? "unknown",
    latencyMs: infos.reduce((max, i) => Math.max(max, i.latencyMs), 0),
    promptVersion: first?.promptVersion ?? "unknown",
    ...(first?.provider ? { provider: first.provider } : {}),
    ...(infos.some((i) => i.fellBack) ? { fellBack: true } : {}),
    ...(infos.some((i) => i.paused) ? { paused: true } : {}),
  };
}

export async function runCheck(input: CheckInput, deps: CheckDeps): Promise<CheckResult> {
  const ticketSeed = seedTickets().find((t) => t.id === input.ticketId);
  if (!ticketSeed) throw new CheckInputError(`Unknown ticket ${input.ticketId}`, 404);
  const ticket: DecideTicket = { id: ticketSeed.id, rail: input.rail };
  const now = input.decisionTime ? new Date(input.decisionTime) : (deps.now?.() ?? new Date());
  if (Number.isNaN(now.getTime())) throw new CheckInputError("Invalid decisionTime", 400);

  // Persona filter BEFORE extraction (SPEC §8). Visibility comes from the seed, never from overrides.
  const sources = visibleSources(mergeOverrides(seedSources(), input.overrides), input.role).slice(0, MAX_SOURCES_PER_CHECK);

  const [draftOutcome, ...sourceOutcomes] = await Promise.all([
    settle(deps.extractDraft(input.draft)),
    ...sources.map((s) => settle(deps.extractSource({ id: s.id, title: s.title, kind: s.kind, version: s.version, body: s.body }))),
  ]);

  const rejected: RejectedExtraction[] = [];
  const infos: AiRunInfo[] = [];
  const extractions: Extractions = { draft: { ok: false, text: input.draft, error: "not run" }, sources: {} };

  if (draftOutcome!.ok) {
    infos.push(draftOutcome!.value.info);
    const raw = draftOutcome!.value.claims;
    const claims = validateDraftClaims(input.draft, raw, rejected);
    extractions.draft = { ok: true, text: input.draft, claims, rejectedCount: raw.length - claims.length };
  } else {
    const info = infoOf(draftOutcome!.error);
    if (info) infos.push(info);
    extractions.draft = { ok: false, text: input.draft, error: errorText(draftOutcome!.error) };
  }

  sources.forEach((source, i) => {
    const outcome = sourceOutcomes[i]!;
    if (outcome.ok) {
      infos.push(outcome.value.info);
      const raw = outcome.value.claims;
      const claims = validateSourceClaims(source, raw, rejected);
      if (raw.length > 0 && claims.length === 0) {
        // Same rule as the draft side (D0a): every claim rejected means the source was not read (D-012.3).
        extractions.sources[source.id] = { ok: false, error: "every extracted claim failed quote validation" };
        rejected.push({ sourceId: source.id, reason: "ALL_CLAIMS_REJECTED", snippet: `${raw.length} claim(s) from ${source.id} rejected; treated as unread` });
      } else {
        extractions.sources[source.id] = { ok: true, claims };
      }
    } else {
      const info = infoOf(outcome.error);
      if (info) infos.push(info);
      extractions.sources[source.id] = { ok: false, error: errorText(outcome.error) };
      rejected.push({ sourceId: source.id, reason: isInvalidOutput(outcome.error) ? "INVALID_OUTPUT" : "EXTRACTION_ERROR", snippet: snippet(errorText(outcome.error)) });
    }
  });

  const out = decide(extractions, sources, ticket, now);

  let suggestion: CheckedSuggestion | null = null;
  if (out.decision === "HOLD") {
    const governing = out.claims.find((c) => c.decision === "HOLD" && c.governing)?.governing;
    if (governing) suggestion = await holdSuggestion(input.draft, governing, extractions, sources, ticket, now, deps, infos);
  } else if (out.decision === "ESCALATE") {
    suggestion = escalateSuggestion(extractions, sources, ticket, now);
  }

  return {
    checkHash: checkHashOf(input, sources),
    decision: out.decision,
    headline: out.headline,
    claims: out.claims,
    suggestion,
    rejectedExtractions: rejected,
    ai: combineInfo(infos, !extractions.draft.ok),
    reasonCode: out.reasonCode,
    caps: out.caps,
    patternMatches: out.patternMatches,
    trace: out.trace,
  };
}

/** The suggestion as returned, with the plain reason when its recheck is CAUTION. */
function checked(text: string, origin: Suggestion["origin"], re: ReturnType<typeof decide>, sources: Source[]): CheckedSuggestion {
  const note = recheckNote(re, sources);
  return { text, origin, recheckDecision: re.decision as Decision, ...(note ? { recheckNote: note } : {}) };
}

/** Rechecks a candidate reply against the same source extractions. Pure apart from the given draft claims. */
function recheck(
  text: string,
  claims: DraftClaim[],
  extractions: Extractions,
  sources: Source[],
  ticket: DecideTicket,
  now: Date,
) {
  return decide({ ...extractions, draft: { ok: true, text, claims, rejectedCount: 0 } }, sources, ticket, now);
}

/**
 * SPEC §6.7 says the AI reply's recheck must be ALLOW or CAUTION. A CAUTION that means "couldn't understand the reply"
 * (EXTRACTION_GAP, OUTSIDE_COVERAGE, UNSUPPORTED, UNIT_MISMATCH, HEDGED_CONTRADICTION) is not accepted (D-012.6).
 */
const ACCEPTED_CAUTION = new Set(["WEAK_BASIS", "CHANGE_SIGNALLED", "SOURCE_UNREAD"]);
const isAcceptable = (r: { decision: string; reasonCode: string }) =>
  r.decision === "ALLOW" || (r.decision === "CAUTION" && ACCEPTED_CAUTION.has(r.reasonCode));

async function holdSuggestion(
  draft: string,
  governing: Governing,
  extractions: Extractions,
  sources: Source[],
  ticket: DecideTicket,
  now: Date,
  deps: CheckDeps,
  infos: AiRunInfo[],
): Promise<CheckedSuggestion> {
  // AI rewrite first (SPEC §6.7): it gets only V, its quote and the draft. The server rechecks it.
  if (deps.suggestReply) {
    try {
      const reply = await deps.suggestReply({ draft, decision: "HOLD", governing });
      infos.push(reply.info);
      const text = reply.text.trim();
      if (text.length > 0 && text.length <= 1000) {
        const ex = await deps.extractDraft(text);
        const rejected: RejectedExtraction[] = [];
        const claims = validateDraftClaims(text, ex.claims, rejected);
        const re = recheck(text, claims, extractions, sources, ticket, now);
        if (rejected.length === 0 && isAcceptable(re)) return checked(text, "ai", re, sources);
      }
    } catch {
      // fall through to the template
    }
  }
  // Template, rechecked with a deterministic draft claim: we authored the span, so no AI call is needed (D-005).
  const text = holdTemplate(governing.value);
  const valueText = formatValue(governing.value);
  const re = recheck(
    text,
    [{ claimId: "template#1", topic: "reversal_window", value: governing.value, valueText, span: valueText, definitive: true }],
    extractions,
    sources,
    ticket,
    now,
  );
  return checked(text, "template", re, sources);
}

function escalateSuggestion(extractions: Extractions, sources: Source[], ticket: DecideTicket, now: Date): CheckedSuggestion {
  const text = ESCALATE_TEMPLATE;
  // SPEC §6.7: no digits, no day/hour words, and the policy-pattern detector must not fire.
  if (hasTimelineWords(text) || detectPolicyPatterns(text).length > 0) {
    throw new Error("ESCALATE template contains a timeline; refusing to suggest it");
  }
  const re = recheck(text, [], extractions, sources, ticket, now);
  return checked(text, "template", re, sources);
}
