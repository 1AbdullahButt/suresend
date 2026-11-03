// Design v2 copy, generated from the real CheckResult (REDESIGN_PROMPT item 7). Pure functions; no I/O.
// Engine names and reason codes never appear in this copy; they live only in the Trace view and Raw JSON.
import type { Cap, CheckResult, ClaimResult, Evidence, OverallDecision, PatternMatch, Unit, Value } from "@/lib/engine/types";
import { governingScope } from "@/lib/engine/applicability";
import { patternNoun, patternTopic } from "@/lib/engine/patterns";
import { isDuration, sameValue, unitLabel } from "@/lib/engine/values";
import { isCovered, topicDef, wordsFor } from "@/lib/topics";
import { mostSevereClaim, shortDate, WEAKENER_WORDS } from "./format";

export type OutcomeTone = "good" | "check" | "hold" | "ask" | "off";

/** A claim's value inside a sentence: "5 days" reads as it is, while words like "isn't refundable" need quotes. */
function saidValue(claim: ClaimResult | null | undefined): string {
  if (!claim) return "this";
  const { value, valueText } = claim.draftClaim;
  return value && isDuration(value) ? valueText : `“${valueText}”`;
}

/** What the "nothing found" net flagged. A gap entry names its own hits; with no gap entry, every hit counts. */
function gapMatches(result: CheckResult): PatternMatch[] {
  const topics = new Set<string>(result.claims.filter((c) => c.reasonCode === "EXTRACTION_GAP").map((c) => c.draftClaim.topic));
  return topics.size ? result.patternMatches.filter((m) => topics.has(patternTopic(m.kind) ?? "")) : result.patternMatches;
}

export interface OutcomeMeta {
  /** The plain-language name shown in the white pill tag. */
  name: string;
  tone: OutcomeTone;
}

export const OUTCOME: Record<OverallDecision, OutcomeMeta> = {
  ALLOW: { name: "Good to send", tone: "good" },
  CAUTION: { name: "Double-check", tone: "check" },
  HOLD: { name: "Hold", tone: "hold" },
  ESCALATE: { name: "Ask first", tone: "ask" },
  AI_UNAVAILABLE: { name: "Couldn't check", tone: "off" },
};

// ---- small helpers --------------------------------------------------------------------------------

function governingEvidence(claim: ClaimResult | null): Evidence | undefined {
  const g = claim?.governing;
  if (!claim || !g) return undefined;
  return claim.evidence.find((e) => e.source.id === g.sourceId && e.claim.quote === g.quote) ?? claim.evidence.find((e) => e.source.id === g.sourceId);
}

const UNIT_ADJ: Record<Unit, string> = { business_days: "business-day", calendar_days: "day", hours: "hour" };

/** "4 business days" → "4-business-day" (for "The 4-business-day reply was held and not sent."). */
export function valueAdjective(v: Value): string | null {
  if (!v || !isDuration(v)) return null;
  const n = v.amountMax !== undefined && v.amountMax !== v.amount ? `${v.amount}–${v.amountMax}` : String(v.amount);
  return `${n}-${UNIT_ADJ[v.unit]}`;
}

/** Short doc name for prose: "Outgoing Transfers: Reversal SOP" → "Outgoing Transfers SOP" style trimming is not attempted; titles stay real. */
function docName(ev: Evidence): string {
  return ev.source.title;
}

// ---- headline + one sentence ----------------------------------------------------------------------

export interface Summary {
  name: string;
  tone: OutcomeTone;
  headline: string;
  /** One sentence; `strong` is the value to emphasise inside it (may be null). */
  sentence: string;
  strong: string | null;
}

const CAUTION_HEADLINE: Partial<Record<CheckResult["reasonCode"], string>> = {
  CHANGE_SIGNALLED: "Matches today, changing soon",
  WEAK_BASIS: "The doc behind this changed",
  OUTSIDE_COVERAGE: "Outside what we can check",
  SOURCE_UNREAD: "A doc couldn't be read",
  PROPOSAL_ONLY: "Only a proposal says this",
  UNSUPPORTED: "No doc backs this up",
  UNIT_MISMATCH: "Check the units",
  HEDGED_CONTRADICTION: "Your hedge differs from the policy",
  TOPIC_GAP: "Missing an answer",
  CLAIM_UNVERIFIED: "Couldn't verify part of this reply",
};

const candidatesIn = (claim: ClaimResult) => claim.evidence.filter((e) => e.standing === "CANDIDATE" && e.applicability !== "NOT_APPLICABLE" && e.claim.value);

/** A claim with no value, where the docs have something to say, or a doc that might couldn't be read (D-046). */
const isVague = (claim: ClaimResult | null | undefined, result: CheckResult): boolean =>
  !!claim && claim.reasonCode === "UNSUPPORTED" && claim.draftClaim.value === null && isCovered(claim.draftClaim.topic) && (candidatesIn(claim).length > 0 || result.caps.length > 0);

/** A doc that couldn't be read, or the part of one that couldn't (D-060). */
const capName = (c: Cap, name: string = c.sourceId) => (c.partial ? `Part of ${name}` : name);

/** Why no value is named: an unread doc might hold it (D-046). */
const unreadLead = (result: CheckResult): string | null =>
  result.caps.length > 0 ? `${result.caps.map((c) => capName(c)).join(", ")} couldn't be read, so SureSend can't say what your docs give` : null;

/** The docs' value for a reply that gives none, flagged when the doc behind it is in doubt. */
function docsSayWords(claim: ClaimResult, value: NonNullable<Value>): string {
  const doubt = governingEvidence(claim)?.weakeners.length ? ", but that doc is in doubt" : "";
  const topic = claim.draftClaim.topic;
  return `Your docs say ${(isCovered(topic) ? topicDef(topic).stated?.(value) : undefined) ?? wordsFor(topic, value)}${doubt}`;
}

/** The sent card (D-045): what happened, never that the reply was right. Past a Double-check, the docs may well have disagreed. */
export function sentCopy({ decision, payoff }: { decision: OverallDecision; payoff: { heldValue: string | null } | null }): { headline: string; sentence: string } {
  const held = payoff ? (payoff.heldValue ? `The ${payoff.heldValue} reply was held and not sent.` : "The held reply was not sent.") : null;
  return decision === "ALLOW"
    ? { headline: "Sent. Nothing in the docs contradicted it.", sentence: held ?? "SureSend checked it against your docs before it went out." }
    : { headline: "Sent with your OK.", sentence: held ?? "SureSend asked you to double-check it, and you chose to send it." };
}

export function summarize(result: CheckResult, ticketRail: "instant" | "standard" | "unknown"): Summary {
  const meta = OUTCOME[result.decision];
  const claim = mostSevereClaim(result);
  const gov = claim?.governing ?? null;
  // A rule for all transfers names no type unless another type's rule differs (D-056).
  const rail = claim ? governingScope(claim, ticketRail) : "any";
  const topic = claim && isCovered(claim.draftClaim.topic) ? topicDef(claim.draftClaim.topic) : null;
  // The sentence is the topic's own wording (D-041).
  const said = (verdict: "hold" | "allow") =>
    topic && gov && claim
      ? topic.sentence({ verdict, rail, governing: gov.value, draft: claim.draftClaim.value, draftText: claim.draftClaim.valueText, replaced: gov.via !== "CONSENSUS" })
      : null;
  const base = { name: meta.name, tone: meta.tone };

  switch (result.decision) {
    case "AI_UNAVAILABLE":
      return {
        ...base,
        headline: "Not sent, nothing was lost",
        sentence: "The AI didn't answer, so this reply can't be checked yet. Try again, or rewrite the reply without the policy claim.",
        strong: null,
      };
    case "HOLD": {
      const s = said("hold");
      if (s) return { ...base, headline: "Don't send this yet", ...s };
      return { ...base, headline: "Don't send this yet", sentence: firstUpper(result.headline.replace(/^Hold:\s*/i, "")), strong: null };
    }
    case "ESCALATE": {
      if (result.reasonCode === "CONFLICT_UNRESOLVED") {
        const c = conflictPair(claim);
        return {
          ...base,
          headline: "Your docs disagree",
          sentence: c ? `${c.a} says ${c.av} and ${c.b} says ${c.bv}, and no rule picks a winner.` : "Your docs disagree, and no rule picks a winner.",
          strong: null,
        };
      }
      return { ...base, headline: "Depends on the transfer", sentence: "Instant and standard transfers differ, and this ticket doesn't say which.", strong: null };
    }
    case "ALLOW": {
      if (result.reasonCode === "NO_POLICY_CLAIM" || !claim) {
        return { ...base, headline: "No policy promise here", sentence: "There's no policy promise in this reply, so there's nothing to contradict.", strong: null };
      }
      const s = said("allow");
      if (s) return { ...base, headline: "Matches your docs", ...s };
      return { ...base, headline: "Matches your docs", sentence: "Your reply matches your docs.", strong: null };
    }
    case "CAUTION": {
      // EXTRACTION_GAP names what the detector found: "Couldn't confirm the timing".
      const headline =
        result.reasonCode === "SOURCE_UNREAD" && result.caps.every((c) => c.partial)
          ? "Part of a doc couldn't be read"
          : result.reasonCode === "EXTRACTION_GAP"
          ? `Couldn't confirm ${patternNoun(gapMatches(result))}`
          : isVague(claim, result)
            ? "Your reply is vague on this"
            : (CAUTION_HEADLINE[result.reasonCode] ?? CAUTION_HEADLINE[claim?.reasonCode ?? "SUPPORTED"] ?? "Double-check before sending");
      return { ...base, headline, sentence: cautionSentence(result, claim), strong: null };
    }
  }
}

function firstUpper(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function conflictPair(claim: ClaimResult | null): { a: string; av: string; b: string; bv: string } | null {
  if (!claim) return null;
  const cands = claim.evidence.filter((e) => e.standing === "CANDIDATE" && e.applicability !== "NOT_APPLICABLE" && e.claim.value);
  const a = cands[0];
  const b = cands.find((e) => a && e.source.id !== a.source.id && !!e.claim.value && !!a.claim.value && !sameValue(e.claim.value, a.claim.value));
  if (!a || !b) return null;
  return { a: docName(a), av: wordsFor(a.claim.topic, a.claim.value!), b: docName(b), bv: wordsFor(b.claim.topic, b.claim.value!) };
}

function cautionSentence(result: CheckResult, claim: ClaimResult | null): string {
  const gov = claim?.governing ?? null;
  const code = result.reasonCode === "SOURCE_UNREAD" || result.reasonCode === "EXTRACTION_GAP" ? result.reasonCode : (claim?.reasonCode ?? result.reasonCode);
  switch (code) {
    case "CHANGE_SIGNALLED": {
      const sig = claim?.evidence.find((e) => (e.standing === "PROPOSAL" || e.standing === "NOT_YET_EFFECTIVE") && e.relation === "contradicts");
      if (sig) {
        const when = sig.standing === "PROPOSAL" ? "pending sign-off" : `due to start${sig.claim.effectiveFrom ? ` ${shortDate(sig.claim.effectiveFrom)}` : ""}`;
        return `Your reply matches the policy, but a change to ${sig.claim.value ? wordsFor(sig.claim.topic, sig.claim.value) : sig.claim.valueText} is ${when}.`;
      }
      return "Your reply matches the policy, but a change is signalled.";
    }
    case "WEAK_BASIS": {
      const ev = governingEvidence(claim);
      const w = ev?.weakeners.map((x) => WEAKENER_WORDS[x].toLowerCase()).join(" and ") ?? "weakened";
      return gov && ev
        ? `The rules point to ${wordsFor(claim!.draftClaim.topic, gov.value)}, but ${docName(ev)} is ${w}, so it's trusted less.`
        : "The doc behind this answer is trusted less right now.";
    }
    case "EXTRACTION_GAP": {
      const flagged = gapMatches(result);
      const hits = flagged.map((m) => `“${m.text}”`).join(", ");
      const noun = patternNoun(flagged);
      return hits ? `SureSend found ${hits} but couldn't confirm ${noun}. Check it manually.` : `SureSend couldn't confirm ${noun}. Check it manually.`;
    }
    case "SOURCE_UNREAD": {
      const ids = result.caps.map((c) => capName(c)).join(", ");
      return `${ids || "A doc"} couldn't be read, so this can't be confirmed as right. It might hold a contradiction.`;
    }
    case "PROPOSAL_ONLY":
      return `Only a proposal mentions ${saidValue(claim)}. Don't promise it until a policy confirms it.`;
    case "UNSUPPORTED": {
      if (!claim || !isVague(claim, result)) return `No doc supports ${saidValue(claim)}. Check it with the policy owner.`;
      const short = topicDef(claim.draftClaim.topic).noValue;
      return `${gov ? docsSayWords(claim, gov.value) : (unreadLead(result) ?? "Your docs don't give one answer for this ticket")}; your reply ${short}.`;
    }
    case "TOPIC_GAP": {
      const topic = claim && isCovered(claim.draftClaim.topic) ? topicDef(claim.draftClaim.topic) : null;
      // What's missing first, then what the docs have to say about it: a missing answer, not an error (D-055).
      const lead = `Your reply doesn't answer their question about ${topic?.question ?? "this"}.`;
      const docs = gov && claim ? docsSayWords(claim, gov.value) : (unreadLead(result) ?? (claim && candidatesIn(claim).length > 0 ? "Your docs don't give one answer for this ticket" : null));
      return docs ? `${lead} ${docs}.` : lead;
    }
    case "CLAIM_UNVERIFIED": {
      // The AI's words for this part failed validation, so they aren't quoted back (D-060).
      const docs = gov && claim ? docsSayWords(claim, gov.value) : null;
      return `The AI's reading of part of this reply didn't match your words, so the rules didn't check that part.${docs ? ` ${docs}.` : ""} Check it by hand.`;
    }
    case "UNIT_MISMATCH":
      return `Your reply says ${claim?.draftClaim.valueText ?? "one unit"}, but the policy says ${gov && claim ? wordsFor(claim.draftClaim.topic, gov.value) : "a different unit"}.`;
    case "HEDGED_CONTRADICTION":
      return `Your hedged “${claim?.draftClaim.valueText ?? ""}” differs from the policy (${gov && claim ? wordsFor(claim.draftClaim.topic, gov.value) : "another value"}).`;
    case "OUTSIDE_COVERAGE":
      return `Your reply says “${claim?.draftClaim.valueText ?? "something"}”, which SureSend doesn't cover. Check it against the source.`;
    default:
      return firstUpper(result.headline.replace(/^Caution:\s*/i, ""));
  }
}

// ---- Why? --------------------------------------------------------------------------------------------

export interface WhyDoc {
  id: string;
  title: string;
  quote: string;
  highlight: string;
  tags: Array<{ text: string; tone: "good" | "ask" | "amber" | "neutral" }>;
}

export interface WhyOther {
  id: string;
  title: string;
  line: string;
  label: string;
}

export interface WhyModel {
  title: string;
  replySays: string;
  governing: WhyDoc | null;
  others: WhyOther[];
  didntCount: Array<{ id: string; text: string }>;
  /** Shown under "Your docs say" when no doc is listed: why there's nothing to show. */
  noDocs: string;
  so: string;
}

const WHY_TITLE: Record<OverallDecision, string> = {
  HOLD: "Why it's on hold",
  ALLOW: "Why it's good to send",
  CAUTION: "Why to double-check",
  ESCALATE: "Why to ask first",
  AI_UNAVAILABLE: "Why it couldn't be checked",
};

function railShort(rail: "instant" | "standard" | "any"): string {
  return rail === "any" ? "all transfers" : `${rail} transfers`;
}

/** One claim of a reply that makes several (D-041): what it says and its own verdict. */
export interface ClaimLine {
  key: string;
  /** "Claim 1 of 2"; "Not answered" for a question the reply leaves open; "Not verified" for a part the rules couldn't check. */
  label: string;
  /** The words of the reply that make the claim, or what's missing when `quoted` is false. */
  says: string;
  quoted: boolean;
  name: string;
  tone: OutcomeTone;
}

/** The words to show for a claim: its span, or its own value text when another claim has the same span, so a sentence isn't repeated (D-057). */
export function claimWords(result: CheckResult, claim: ClaimResult): string {
  const { span, valueText } = claim.draftClaim;
  return valueText && result.claims.filter((c) => c.draftClaim.span === span).length > 1 ? valueText : span;
}

/** The reply's claims in the order it makes them, each with its own verdict; empty for a reply with one claim or none. */
export function claimLines(result: CheckResult): ClaimLine[] {
  if (result.claims.length < 2) return [];
  const inReply = (c: ClaimResult) => c.reasonCode !== "TOPIC_GAP" && c.reasonCode !== "CLAIM_UNVERIFIED";
  const made = result.claims.filter(inReply).length;
  let n = 0;
  return result.claims.map((c, i) => ({
    key: c.draftClaim.claimId || String(i),
    label: c.reasonCode === "TOPIC_GAP" ? "Not answered" : c.reasonCode === "CLAIM_UNVERIFIED" ? "Not verified" : made > 1 ? `Claim ${++n} of ${made}` : "Your reply",
    says: claimWords(result, c),
    quoted: inReply(c),
    name: OUTCOME[c.decision].name,
    tone: OUTCOME[c.decision].tone,
  }));
}

/** "Why?" for a reply with several claims: one model per claim (D-041). */
export function claimCards(result: CheckResult): Array<ClaimLine & { model: WhyModel }> {
  return claimLines(result).map((line, i) => ({ ...line, model: whyModel(result, result.claims[i]!) }));
}

export function whyModel(result: CheckResult, only?: ClaimResult): WhyModel {
  const claim = only ?? mostSevereClaim(result);
  const gov = claim?.governing ?? null;
  const govEv = governingEvidence(claim);
  const replySays = claim
    ? claim.draftClaim.value && isCovered(claim.draftClaim.topic)
      ? wordsFor(claim.draftClaim.topic, claim.draftClaim.value)
      : claim.draftClaim.valueText || "No value"
    : "No policy promise";

  let governing: WhyDoc | null = null;
  const others: WhyOther[] = [];
  const didntCount: Array<{ id: string; text: string }> = [];
  const seen = new Set<string>();
  // No value is named for this reply because a doc couldn't be read, so what the other docs say can't be called the answer.
  const unconfirmed = result.caps.length > 0 && !gov && (isVague(claim, result) || claim?.reasonCode === "TOPIC_GAP" || claim?.reasonCode === "CLAIM_UNVERIFIED");

  if (gov && govEv) {
    seen.add(govEv.source.id);
    const tags: WhyDoc["tags"] = [];
    const sig = govEv.source.signals;
    if (sig.verification === "verified" && sig.verifiedAt) tags.push({ text: `Verified ${shortDate(sig.verifiedAt)}`, tone: "good" });
    for (const w of govEv.weakeners) tags.push({ text: WEAKENER_WORDS[w], tone: "amber" });
    if (gov.via === "EXPLICIT_SUPERSESSION") {
      const target = claim?.evidence.find(
        (e) => e.standing === "CANDIDATE" && e.source.id !== govEv.source.id && !!e.claim.value && !sameValue(e.claim.value, gov.value),
      );
      tags.push({ text: `Replaces ${target ? target.source.title : "the older doc"} for ${govEv.claim.scope.rail === "any" ? "all" : govEv.claim.scope.rail}`, tone: "ask" });
    } else if (gov.via === "SPECIFIC_EXCEPTION") {
      tags.push({ text: `Specific to ${railShort(govEv.claim.scope.rail)}`, tone: "ask" });
    }
    governing = { id: govEv.source.id, title: govEv.source.title, quote: gov.quote, highlight: gov.valueText, tags };
  }

  for (const ev of claim?.evidence ?? []) {
    if (seen.has(ev.source.id)) continue;
    seen.add(ev.source.id);
    if (ev.standing === "CANDIDATE" && ev.applicability !== "NOT_APPLICABLE") {
      const v = ev.claim.value;
      const differs = gov && v ? !sameValue(v, gov.value) : false;
      const label = gov
        ? differs
          ? gov.via === "EXPLICIT_SUPERSESSION"
            ? "Replaced"
            : "Overridden"
          : "Agrees"
        : unconfirmed
          ? "Can't confirm"
          : ev.applicability === "SCOPE_UNRESOLVED"
          ? "Only for one transfer type"
          : "Disagrees";
      others.push({ id: ev.source.id, title: ev.source.title, line: `${v ? wordsFor(ev.claim.topic, v) : ev.claim.valueText}, ${railShort(ev.claim.scope.rail)}`, label });
    } else {
      const reason =
        ev.standing === "EXCLUDED"
          ? ev.source.signals.flaggedOutdated
            ? "flagged outdated"
            : "deprecated"
          : ev.standing === "PROPOSAL"
            ? "a proposal, not policy"
            : ev.standing === "NOT_YET_EFFECTIVE"
              ? `not in force yet${ev.claim.effectiveFrom ? ` (from ${shortDate(ev.claim.effectiveFrom)})` : ""}`
              : "doesn't apply to this transfer";
      didntCount.push({ id: ev.source.id, text: `${ev.source.title}: ${reason}.` });
    }
  }

  // A doc that lost a claim is listed for what it did say, and here for what it lost.
  for (const cap of result.caps) if (!seen.has(cap.sourceId) || cap.partial) didntCount.push({ id: cap.sourceId, text: `${capName(cap)} couldn't be read.` });

  // A gap, an outside-coverage claim or an unread doc means the docs weren't fully compared, so saying they're silent would be false.
  const reason = claim?.reasonCode ?? result.reasonCode;
  const unread = result.caps.map((c) => capName(c)).join(", ");
  const noDocs =
    reason === "CLAIM_UNVERIFIED"
      ? "SureSend didn't compare this part with your docs, because the AI's reading of it didn't match your words. Check it by hand."
      : reason === "EXTRACTION_GAP"
      ? "SureSend didn't compare this with your docs, because the AI didn't pick it up as a claim. Check it by hand."
      : reason === "OUTSIDE_COVERAGE"
        ? "SureSend doesn't check this topic against your docs. Check it by hand."
        : unread
          ? `${unread} couldn't be read, so SureSend can't say what your docs say about this. Check it by hand.`
          : "No doc makes a claim about this.";
  return { title: WHY_TITLE[result.decision], replySays, governing, others, didntCount, noDocs, so: soSentence(result, claim, govEv, only !== undefined) };
}

function soSentence(result: CheckResult, claim: ClaimResult | null, govEv: Evidence | undefined, perClaim = false): string {
  const gov = claim?.governing ?? null;
  // A card for one claim of several speaks about that claim's own verdict.
  const decision = perClaim && claim ? claim.decision : result.decision;
  let first = "";
  if (gov && govEv) {
    if (gov.via === "EXPLICIT_SUPERSESSION") first = `${govEv.source.title} says it replaces the older doc for ${railShort(govEv.claim.scope.rail)}.`;
    else if (gov.via === "SPECIFIC_EXCEPTION") first = `${govEv.source.title} is the specific rule for ${railShort(govEv.claim.scope.rail)}.`;
    else first = "Your docs agree on this.";
  }
  const code = claim?.reasonCode ?? result.reasonCode;
  let second: string;
  switch (decision) {
    case "HOLD":
      second = perClaim ? "This claim contradicts it, so the reply is held." : "Your reply contradicts it, so it's held.";
      break;
    case "ALLOW":
      second = perClaim
        ? "This claim matches it."
        : claim
          ? "Your reply matches it, so it's good to send."
          : "Your reply makes no policy promise, so it's good to send.";
      break;
    case "ESCALATE":
      second =
        code === "SCOPE_UNKNOWN"
          ? "The rules differ by transfer type and this ticket's type is unknown, so ask first."
          : "They disagree and no rule picks a winner, so ask first. Newer or verified doesn't decide it.";
      break;
    case "CAUTION":
      second =
        code === "CLAIM_UNVERIFIED"
          ? "SureSend couldn't verify part of this reply, so double-check before sending."
          : code === "WEAK_BASIS"
          ? "But it changed after it was verified, so double-check before sending."
          : code === "CHANGE_SIGNALLED"
            ? "A change is signalled, so double-check before sending."
            : result.caps.length > 0 && !gov && (code === "TOPIC_GAP" || isVague(claim, result))
              ? "A doc couldn't be read, so SureSend can't name the value. Double-check before sending."
              : code === "TOPIC_GAP"
              ? "Your reply doesn't answer what the customer asked, so double-check before sending."
              : isVague(claim, result)
                ? "Your reply gives nothing to compare with them, so double-check before sending."
                : "The rules can't confirm it, so double-check before sending.";
      break;
    default:
      second = "The AI didn't answer, so nothing was decided.";
  }
  return first ? `${first} ${second}` : second;
}

// ---- Trace ---------------------------------------------------------------------------------------------

export interface TraceRow {
  /** Engine rule id ("D5", "Overall"). */
  rule: string;
  /** What the ID column shows ("Result" for the roll-up, so it never wraps). */
  label: string;
  outcome: "pass" | "fail" | "fired" | "skipped";
  /** One or two plain sentences, generated from the real result. */
  summary: string;
  /** The engine's verbatim detail, shown behind the row's "Details" toggle. */
  detail: string;
  /** True when the rule mattered: it fired, failed, or ruled a path out. Others sit under "Show all N steps". */
  key: boolean;
}

/**
 * Short doc name for trace sentences: "Outgoing Transfers: Reversal SOP" → "Reversal SOP", "Support Macros: Transfers" →
 * "Support Macros" (for macros the collection name is the meaningful half), any Slack source → "Slack note".
 */
function shortTitle(ev: Evidence): string {
  const { title, kind } = ev.source;
  if (kind === "slack") return "Slack note";
  const i = title.indexOf(": ");
  if (i < 0) return title;
  return kind === "macro" ? title.slice(0, i) : title.slice(i + 2);
}

function firstSentence(s: string): string {
  const m = /^.*?[.!?](?=\s|$)/.exec(s.trim());
  return (m ? m[0] : s).trim();
}

const STANDING_PHRASE: Partial<Record<Evidence["standing"], (ev: Evidence) => string>> = {
  EXCLUDED: (ev) => (ev.source.signals.flaggedOutdated ? "is excluded (flagged outdated)" : "is excluded (deprecated)"),
  PROPOSAL: () => "is only a proposal",
  NOT_YET_EFFECTIVE: () => "isn't in force yet",
};

interface TraceCtx {
  result: CheckResult;
  name: (id: string) => string;
  /** Replaces DOC-/SRC- ids in engine text with short doc titles. */
  named: (text: string) => string;
}

function claimSummary(row: TraceEntryLike, c: ClaimResult, ctx: TraceCtx): string {
  const g = c.governing;
  const V = g?.valueText ?? "";
  const govName = g ? ctx.name(g.sourceId) : "the governing doc";
  const draft = c.draftClaim.value ? wordsFor(c.draftClaim.topic, c.draftClaim.value) : c.draftClaim.valueText;
  // A value kind without units (yes/no) reads "says … , the doc says …" rather than "outside" / "within" (D-041).
  const unitless = g ? unitLabel(g.value) === null : false;
  const fallback = firstSentence(ctx.named(row.detail));
  const others = (pred: (e: Evidence) => boolean) => [...new Set(c.evidence.filter(pred).map((e) => ctx.name(e.source.id)))].join(" and ");
  switch (`${row.rule}:${row.outcome}`) {
    case "D0:pass":
      // A yes/no value reads "Your reply says “the transfer fee isn't refundable”"; an amount reads "Your reply promises 4 business days".
      return c.draftClaim.value && unitLabel(c.draftClaim.value) === null
        ? `Your reply says “${claimWords(ctx.result, c)}”${c.draftClaim.definitive ? "" : ", hedged"}.`
        : `Your reply promises ${c.draftClaim.valueText}${c.draftClaim.definitive ? "" : ", hedged"}.`;
    case "D1:pass": {
      const rail = /resolves for (instant|standard) transfers/.exec(row.detail)?.[1];
      return rail ? `The transfer type is known (${rail}), so there's no scope gap.` : "The transfer type doesn't change the answer here.";
    }
    case "D1:fired":
      return "The transfer type is unknown, and the docs give different answers for different types.";
    case "D2:fired":
      return "Only proposals or upcoming changes cover this; nothing in force does.";
    case "D3:fired":
      return c.draftClaim.value ? "No doc in force covers this claim." : "The reply states no value a doc could support.";
    case "D4:pass":
      return ctx.named(row.detail).replace(/^Candidates disagree:/, "The docs disagree:");
    case "D4:fired":
      return `All applicable docs agree: ${V}.`;
    case "D5:fired": {
      const targets = others((e) => e.standing === "CANDIDATE" && e.applicability !== "NOT_APPLICABLE" && e.source.id !== g?.sourceId && e.relation !== "n/a");
      return `${govName} explicitly replaces ${targets || "the other doc"} for this transfer type, so its ${V} governs.`;
    }
    case "D5:pass":
      return "No doc says it replaces another.";
    case "D6:fired":
      return `${govName} is the only doc specific to this transfer type, so its ${V} governs.`;
    case "D6:pass":
      return "No doc is specific to this transfer type.";
    case "D7:fired":
      return "The docs still disagree and no rule picks a winner. Newer or verified doesn't win on its own.";
    case "D8:fired":
      return `Your reply and the docs use different units (${draft} vs ${V}).`;
    case "D9:fired":
      if (unitless) {
        return c.draftClaim.definitive
          ? `Your reply says ${draft}, but ${govName} says ${V}: Hold.`
          : `Your reply says ${draft}, but ${govName} says ${V}. It's hedged: Double-check.`;
      }
      return c.draftClaim.definitive
        ? `Your reply's ${draft} is outside the governing ${V}: Hold.`
        : `Your reply's ${draft} is outside the governing ${V}, but it's hedged: Double-check.`;
    case "D9:pass":
      return unitless ? `Your reply says ${draft}, as ${govName} does.` : `Your reply's ${draft} is within the governing ${V}.`;
    case "D10:fired":
      return unitless ? `Your reply says ${draft}, as ${govName} does.` : `Your reply's ${draft} matches ${govName} (${V}).`;
    case "D11a:fired": {
      const gov = c.evidence.find((e) => e.source.id === g?.sourceId);
      const why = gov?.weakeners.map((w) => WEAKENER_WORDS[w].toLowerCase()).join(", ");
      return `${govName} has a verification problem${why ? ` (${why})` : ""}, so the result drops to Double-check.`;
    }
    case "D11a:pass":
      return "The governing doc has no verification problems, so there's no downgrade.";
    case "D11b:fired": {
      const signals = others((e) => (e.standing === "PROPOSAL" || e.standing === "NOT_YET_EFFECTIVE") && e.applicability === "APPLIES");
      return `A change is signalled for this transfer type${signals ? ` (${signals})` : ""}, so the result drops to Double-check.`;
    }
    case "D11b:pass":
      return "No proposals or upcoming changes apply.";
    default:
      return fallback;
  }
}

type TraceEntryLike = { rule: string; outcome: TraceRow["outcome"]; detail: string };

function topSummary(row: TraceEntryLike, ctx: TraceCtx): string {
  const { result } = ctx;
  const unread = result.caps.map((cap) => capName(cap, ctx.name(cap.sourceId))).join(" and ");
  switch (`${row.rule}:${row.outcome}`) {
    case "D0a:fired":
      return "The reply couldn't be read, so nothing was sent.";
    case "D0a:fail":
      return "The AI's reading of part of this reply didn't match its words, so that part wasn't checked. The reply can't be better than Double-check.";
    case "D0a:pass":
      return `The reply was read: ${result.claims.length} claim${result.claims.length === 1 ? "" : "s"} found.`;
    case "D0b:fired": {
      const flagged = gapMatches(result);
      const said = [...new Set(flagged.map((m) => `“${m.text}”`))].join(", ");
      // Beside other claims, only this topic's claim is missing.
      if (result.claims.some((c) => c.reasonCode === "EXTRACTION_GAP")) return `No claim on ${patternNoun(flagged)} was extracted, but the reply mentions ${said}. Check it by hand.`;
      return `No claim SureSend checks was extracted, but the reply mentions ${said || patternNoun(flagged)}. Check it by hand.`;
    }
    case "D0c:fired":
      return "The reply makes a claim outside the topics checked here. Check it by hand.";
    case "D0d:fired":
      return "No policy claims in this reply.";
    case "D0e:fired":
      return firstSentence(ctx.named(row.detail));
    case "D0e:pass":
      return row.detail;
    case "Cap:fired":
      return `${unread} couldn't be read, so Good to send is capped at Double-check.`;
    case "Cap:pass":
      return `${unread} couldn't be read; the result is already ${result.decision}.`;
    case "Overall:fired":
      return `Final result: ${result.decision} (${result.reasonCode})${result.claims.length > 1 ? `, the most severe of ${result.claims.length} claims` : ""}.`;
    default:
      return firstSentence(ctx.named(row.detail));
  }
}

/**
 * The trace rows for the Trace view (design v2): draft-level rules, source standings (S), each claim's D-rules and the
 * roll-up, all from the real result. Skipped rules only repeat another rule's result ("V settled by explicit
 * supersession", "D9 fired"), so they're left out; the full engine trace stays in Raw JSON.
 */
export function traceRows(result: CheckResult): TraceRow[] {
  const titles = new Map<string, string>();
  for (const c of result.claims) for (const e of c.evidence) titles.set(e.source.id, shortTitle(e));
  const name = (id: string) => titles.get(id) ?? id;
  const ctx: TraceCtx = { result, name, named: (text) => text.replace(/\b(?:DOC|SRC)-\d+\b/g, (id) => name(id)) };
  const rows: TraceRow[] = [];
  const push = (r: TraceEntryLike, summary: string, key: boolean) => {
    if (r.outcome === "skipped") return;
    rows.push({ rule: r.rule, label: r.rule === "Overall" ? "Result" : r.rule === "Claim" ? "Claim" : r.rule, outcome: r.outcome, summary, detail: r.detail, key });
  };
  const mattered = (r: TraceEntryLike) => r.outcome === "fired" || r.outcome === "fail";

  for (const t of result.trace.filter((x) => x.rule !== "Overall")) push(t, topSummary(t, ctx), mattered(t) || t.rule === "Cap");

  // Source standings: one row; it matters when a doc was ruled out (excluded, proposal, not in force yet).
  const seen = new Map<string, Evidence>();
  for (const c of result.claims) for (const e of c.evidence) if (!seen.has(e.source.id)) seen.set(e.source.id, e);
  if (seen.size) {
    const ruledOut = [...seen.values()].filter((e) => STANDING_PHRASE[e.standing]);
    const summary = ruledOut.length
      ? `${ruledOut.map((e) => `${name(e.source.id)} ${STANDING_PHRASE[e.standing]!(e)}`).join("; ")}.`
      : "Every doc counts: all are in force and none is excluded.";
    push({ rule: "S", outcome: "pass", detail: [...seen.values()].map((e) => `${e.source.id}: ${e.standingRule}`).join(" ") }, summary, ruledOut.length > 0);
  }

  const several = result.claims.length > 1;
  result.claims.forEach((c, i) => {
    // A reply with several claims gets a header row per claim, so each claim's rules read as their own group (D-041).
    if (several) {
      push(
        { rule: "Claim", outcome: c.decision === "ALLOW" ? "pass" : "fired", detail: `${c.decision} (${c.reasonCode}) for "${claimWords(result, c)}"` },
        `Claim ${i + 1} of ${result.claims.length}: “${claimWords(result, c)}” · ${OUTCOME[c.decision].name}`,
        true,
      );
    }
    const fired = (rule: string) => c.trace.some((t) => t.rule === rule && t.outcome === "fired");
    for (const t of c.trace) {
      let key = mattered(t);
      if (!key && t.outcome === "pass") {
        // Passed checks that ruled a path out.
        key =
          t.rule === "D0" ||
          t.rule === "D1" ||
          t.rule === "D4" ||
          ((t.rule === "D5" || t.rule === "D6") && fired("D7")) ||
          (t.rule === "D11a" && fired("D9")) ||
          (t.rule === "D11b" && fired("D10"));
      }
      push(t, claimSummary(t, c, ctx), key);
    }
  });

  for (const t of result.trace.filter((x) => x.rule === "Overall")) push(t, topSummary(t, ctx), true);
  return rows;
}

export function extractedCount(result: CheckResult): number {
  const ids = new Set<string>();
  for (const c of result.claims) {
    ids.add(c.draftClaim.claimId);
    for (const e of c.evidence) ids.add(e.claim.claimId);
  }
  return ids.size;
}

export function modelLine(ai: CheckResult["ai"]): string {
  const model = ai.model.replace(/^[^/]+\//, "");
  const latency = ai.mode === "saved" ? "saved response" : `${(ai.latencyMs / 1000).toFixed(1)} s`;
  return [ai.provider, model, latency].filter(Boolean).join(" · ");
}
