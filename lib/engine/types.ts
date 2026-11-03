// Domain types. SPEC §6.2, §6.3 and §12 verbatim, plus the extensions recorded in DECISIONS.md D-002.4 and D-041.
import type { TopicId } from "@/lib/topics";
import type { AnyValue } from "./values";

// ---- SPEC §6.2: extraction schemas -------------------------------------------------------------

// D-041: the covered topics come from the taxonomy registry (lib/topics), and a value is any kind the comparator registry
// knows (lib/engine/values.ts). With only reversal_window registered, this is exactly SPEC §6.2.
export type Topic = TopicId | "other";
export type Unit = "business_days" | "calendar_days" | "hours";
export type Value = AnyValue | null;

export type ScopeRail = "instant" | "standard" | "any";
export type StatusWording = "in_force" | "proposed" | "pending_approval" | "deprecated" | "unstated";

export interface SourceClaim {
  claimId: string;
  sourceId: string;
  sourceVersion: number;
  topic: Topic;
  value: Value;
  valueText: string;
  scope: { rail: ScopeRail };
  effectiveFrom: string | null; // ISO date found in the text
  statusWording: StatusWording;
  supersedes: { targetText: string; quote: string } | null;
  quote: string; // MUST be a verbatim substring of the source body
}

export interface DraftClaim {
  claimId: string;
  topic: Topic;
  value: Value;
  valueText: string;
  span: string; // verbatim substring of the draft
  definitive: boolean; // false if hedged ("usually", "we're checking")
}

// ---- SPEC §6.3: source signals (from metadata, never from the AI) ------------------------------

export type SourceKind = "policy" | "sop" | "macro" | "slack" | "release_note";
export type Verification = "verified" | "unverified" | "expired";
export type Visibility = "everyone" | "ops";

export interface Source {
  id: string;
  title: string;
  kind: SourceKind;
  body: string;
  version: number;
  verification: Verification;
  verifiedAt: string | null;
  updatedAt: string;
  owner: { name: string; active: boolean } | null;
  flaggedOutdated: boolean;
  flagNote: string | null;
  visibility: Visibility;
}

export type SourceSignals = Pick<
  Source,
  "verification" | "verifiedAt" | "updatedAt" | "owner" | "flaggedOutdated" | "flagNote" | "visibility" | "version"
>;

// ---- Tickets, personas, workspace overrides (SPEC §4, §8, §9) ---------------------------------

export type Rail = "instant" | "standard" | "unknown";
export type Role = "support_agent" | "ops_lead"; // simulated personas, not authorization (SPEC §8)

export interface Ticket {
  id: string;
  customer: string;
  rail: Rail;
  message: string;
  draft: string;
}

/** A client-side edit to a seed source. Visibility can never be overridden (SPEC §8). */
export interface SourceOverride {
  id: string;
  body?: string;
  version?: number;
  updatedAt?: string;
  verification?: Verification;
  verifiedAt?: string | null;
  flaggedOutdated?: boolean;
  ownerActive?: boolean;
  deleted?: boolean;
}

// ---- Rules (SPEC §6.4–6.6) ---------------------------------------------------------------------

export type Decision = "ALLOW" | "CAUTION" | "HOLD" | "ESCALATE";
export type OverallDecision = Decision | "AI_UNAVAILABLE";

export type Standing = "EXCLUDED" | "PROPOSAL" | "NOT_YET_EFFECTIVE" | "CANDIDATE";
export type Weakener = "UNVERIFIED" | "VERIFICATION_EXPIRED" | "EDITED_AFTER_VERIFICATION" | "OWNER_INACTIVE";
export type Applicability = "APPLIES" | "SCOPE_UNRESOLVED" | "NOT_APPLICABLE";
export type Relation = "supports" | "contradicts" | "n/a";

export type ReasonCode =
  | "EXTRACTION_FAILED"
  | "EXTRACTION_GAP"
  | "OUTSIDE_COVERAGE"
  | "NO_POLICY_CLAIM"
  | "TOPIC_GAP"
  | "CLAIM_UNVERIFIED"
  | "SCOPE_UNKNOWN"
  | "PROPOSAL_ONLY"
  | "UNSUPPORTED"
  | "CONFLICT_UNRESOLVED"
  | "UNIT_MISMATCH"
  | "CONTRADICTS_GOVERNING"
  | "HEDGED_CONTRADICTION"
  | "SUPPORTED"
  | "WEAK_BASIS"
  | "CHANGE_SIGNALLED"
  | "SOURCE_UNREAD";

export interface TraceEntry {
  rule: string; // "D0a" … "D11b"
  outcome: "pass" | "fail" | "fired" | "skipped";
  detail: string;
}

export interface Evidence {
  claim: SourceClaim;
  source: { id: string; title: string; kind: SourceKind; signals: SourceSignals };
  standing: Standing;
  standingRule: string; // "S1" … "S4"
  weakeners: Weakener[];
  applicability: Applicability;
  relation: Relation;
}

/** Extension (D-002.4): the value V and the quote that governs a claim, when one was found. */
export interface Governing {
  sourceId: string;
  value: NonNullable<Value>;
  valueText: string;
  quote: string;
  via: "CONSENSUS" | "EXPLICIT_SUPERSESSION" | "SPECIFIC_EXCEPTION";
}

export interface ClaimResult {
  draftClaim: DraftClaim;
  decision: Decision;
  reasonCode: ReasonCode;
  evidence: Evidence[];
  trace: TraceEntry[];
  governing: Governing | null; // extension (D-002.4)
}

export interface RejectedExtraction {
  sourceId: string; // the source ID, or "DRAFT"
  reason: "QUOTE_NOT_FOUND" | "SPAN_NOT_FOUND" | "SUPERSEDES_QUOTE_NOT_FOUND" | "INVALID_OUTPUT" | "EXTRACTION_ERROR" | "ALL_CLAIMS_REJECTED" | "OWN_HOLDING_SENTENCE";
  snippet: string;
}

export type AiMode = "live" | "saved" | "unavailable";

export interface AiRunInfo {
  mode: AiMode;
  model: string;
  latencyMs: number;
  promptVersion: string;
  /** Which provider produced (or would have produced) this output (D-017). */
  provider?: string;
  /** true when the primary provider was rate-limited or failed and the fallback answered. */
  fellBack?: boolean;
  /** true when live AI was skipped because a rate limit or provider 429 was hit (SPEC §10 "Live AI paused"). */
  paused?: boolean;
}

/** Extension (D-002.4): overall caps such as SOURCE_UNREAD. */
export interface Cap {
  code: "SOURCE_UNREAD";
  sourceId: string;
  detail: string;
  /** Some of the doc was read: it lost a claim to quote validation and kept others (D-060). */
  partial?: boolean;
}

/** Extension (D-002.4): policy-pattern detector hits (SPEC §6.6.2), for highlighting. */
export interface PatternMatch {
  text: string;
  index: number;
  /** "duration", "relative_time" or "currency"; a topic may add its own (D-041). */
  kind: string;
}

export interface Suggestion {
  text: string;
  origin: "ai" | "template";
  recheckDecision: Decision;
}

export interface CheckResult {
  checkHash: string;
  decision: OverallDecision;
  headline: string;
  claims: ClaimResult[];
  suggestion: Suggestion | null;
  rejectedExtractions: RejectedExtraction[];
  ai: AiRunInfo;
  // extensions (D-002.4)
  reasonCode: ReasonCode;
  caps: Cap[];
  patternMatches: PatternMatch[];
  /** Draft-level rules, caps and the overall roll-up (D-012.5). Per-claim rules live in claims[].trace. */
  trace: TraceEntry[];
}

// ---- Orchestration seams (DECISIONS.md D-004) --------------------------------------------------

export interface CheckInput {
  ticketId: string;
  rail: Rail;
  draft: string;
  role: Role;
  overrides?: SourceOverride[];
  decisionTime?: string; // ISO; defaults to deps.now()
  /** The check has no real customer behind it (MCP without a ticket_id), so rule D0e has no question to compare the reply with. */
  noCustomerMessage?: boolean;
}

export interface SendInput extends Omit<CheckInput, "decisionTime"> {
  acknowledged: boolean;
}

/** What the AI layer is given for one source. Never includes sources hidden from the persona. */
export interface SourceForExtraction {
  id: string;
  title: string;
  kind: SourceKind;
  version: number;
  body: string;
}

export interface SafeReplyRequest {
  draft: string;
  decision: Decision;
  governing: Governing;
  /**
   * D-041: every claim in the reply that a doc governs, right or wrong, so the rewrite fixes only the wrong ones and
   * keeps the right ones. `correct` is the governing value as the engine words it ("1 business day").
   */
  claims: Array<{ span: string; topic: Topic; correct: string; quote: string; sourceId: string; wrong: boolean }>;
}

/**
 * Injected AI dependencies. Each function either resolves with raw (not yet quote-validated) output
 * or throws when extraction failed (API error, or invalid output after one retry).
 */
export interface CheckDeps {
  extractSource: (source: SourceForExtraction) => Promise<{ claims: SourceClaim[]; info: AiRunInfo }>;
  extractDraft: (draft: string) => Promise<{ claims: DraftClaim[]; info: AiRunInfo }>;
  suggestReply?: (req: SafeReplyRequest) => Promise<{ text: string; info: AiRunInfo }>;
  now?: () => Date;
}

export interface HandlerResponse {
  status: number;
  body: unknown;
}
