// "Fix the doc" (D-037), part 2: what an edit may do, and the template fallback. Pure.
// An edit adds one short passage right after the claim sentence, which must be quoted exactly and appear once in the doc.
// A "replace" is accepted only if it keeps the claim sentence word for word at its start (it's then an addition). The
// added passage must state the exception's value exactly, and may contain no other timeline, amount, number, negation or
// promise. Nothing else in the doc can change.
import { normalizeText } from "@/lib/engine/normalize";
import { detectPolicyPatterns } from "@/lib/engine/patterns";
import type { FixSource } from "./source";

export interface FixEdit {
  action: "add_after" | "replace";
  /** The claim sentence, exactly as it appears in the doc. */
  target: string;
  /** The sentence(s) to add after it, or its replacement. */
  text: string;
}

export interface ChangedLine {
  before: string;
  after: string;
}

export const MAX_FIX_TEXT = 400;
const MAX_DOC_CHARS = 4000;

const numbers = (s: string) => s.match(/\d+(?:\.\d+)?/g) ?? [];
const norm = (s: string) => normalizeText(s).toLowerCase();

export function applyFix(body: string, edit: FixEdit): string {
  const i = body.indexOf(edit.target);
  if (i < 0) return body;
  const end = i + edit.target.length;
  return edit.action === "replace" ? body.slice(0, i) + edit.text + body.slice(end) : `${body.slice(0, end)} ${edit.text}${body.slice(end)}`;
}

/** Only the lines that differ (a sentence added inside a paragraph changes that one line). */
export function changedLines(before: string, after: string): ChangedLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length !== b.length) return [{ before, after }];
  return a.flatMap((line, i) => (line === b[i] ? [] : [{ before: line, after: b[i]! }]));
}

/** The validated edit is always an addition after the exact claim sentence. */
export type FixCheck = { ok: true; edit: FixEdit; after: string; changed: ChangedLine[] } | { ok: false; reason: string };

// Checked on the added passage with curly apostrophes folded to straight ones. Any "n't" contraction counts.
const NEGATION_OR_PROMISE = /\b(?:\w+n't|not|no|never|none|nothing|cannot|unless|except|guarantee\w*|promise\w*|always|waive\w*|fees?)\b/i;
// Time words the policy-pattern detector doesn't cover (it stops at "ten" and at weeks).
const EXTRA_TIME =
  /\b(?:months?|years?|immediately|instantly|right away|straight away|asap|(?:eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|hundred|a|an|a couple of|a few|few|several)\s+(?:business\s+|working\s+|calendar\s+)?(?:days?|hours?|weeks?))\b/i;
// Words that would widen or move the exception to another rail.
const ALL_RAILS = /\b(?:all|every|any)\s+(?:transfers?|transfer types?|rails?|payments?)\b/i;

export function validateFix(body: string, edit: FixEdit, fix: FixSource): FixCheck {
  const quote = fix.source.quote;
  // 1. The target is the claim sentence itself, exactly, and it appears once (so the edit can't land anywhere else).
  if (norm(edit.target) !== norm(quote)) return { ok: false, reason: "the edit touches text other than the claim sentence" };
  const at = body.indexOf(quote);
  if (at < 0) return { ok: false, reason: "the claim sentence isn't in the doc exactly" };
  if (body.indexOf(quote, at + 1) >= 0) return { ok: false, reason: "the claim sentence appears more than once in the doc" };

  // 2. Only an addition: a "replace" must keep the claim sentence word for word at its start.
  let added = edit.text.trim();
  if (edit.action === "replace") {
    if (!added.startsWith(quote)) return { ok: false, reason: "a rewrite must keep the claim sentence word for word" };
    added = added.slice(quote.length).trim();
  }

  // 3. One short plain passage that states the exception's value exactly.
  if (!added || added.length > MAX_FIX_TEXT || /[\r\n]/.test(added) || /^\s*[#>*-]/.test(added)) {
    return { ok: false, reason: "the new text isn't one short plain paragraph" };
  }
  if (!added.includes(fix.exception.valueText)) return { ok: false, reason: `the new text doesn't state "${fix.exception.valueText}" exactly` };

  // 4. Nothing else that could change what agents promise: no other timeline, amount or number, no negation or promise.
  const rest = added.split(fix.exception.valueText).join(" ");
  const extraTimes = detectPolicyPatterns(rest).filter((m) => m.text.toLowerCase() !== "within");
  if (extraTimes.length) return { ok: false, reason: `the new text adds another timeline or amount (${extraTimes.map((m) => `"${m.text}"`).join(", ")})` };
  const extraNumbers = numbers(rest);
  if (extraNumbers.length) return { ok: false, reason: `the new text adds other numbers (${extraNumbers.join(", ")})` };
  const plain = added.replace(/[‘’ʼ]/g, "'");
  const time = plain.split(fix.exception.valueText).join(" ").match(EXTRA_TIME)?.[0];
  if (time) return { ok: false, reason: `the new text adds another timeline ("${time}")` };
  const word = plain.match(NEGATION_OR_PROMISE)?.[0];
  if (word) return { ok: false, reason: `the new text contains "${word}": a fix only adds the exception, it can't negate or promise` };

  // 5. It's about the exception's rail, and only that rail.
  const other = fix.exception.rail === "instant" ? "standard" : "instant";
  if (!new RegExp(`\\b${fix.exception.rail}\\b`, "i").test(plain)) return { ok: false, reason: `the new text doesn't name ${fix.exception.rail} transfers` };
  if (new RegExp(`\\b${other}\\b`, "i").test(plain) || ALL_RAILS.test(plain)) {
    return { ok: false, reason: `the new text widens or moves the exception beyond ${fix.exception.rail} transfers` };
  }

  const validated: FixEdit = { action: "add_after", target: quote, text: added };
  const after = applyFix(body, validated);
  if (after.length > MAX_DOC_CHARS) return { ok: false, reason: "the doc would be too long" };
  return { ok: true, edit: validated, after, changed: changedLines(body, after) };
}

/** Deterministic fallback: the exception's own sentence, a pointer to its doc and, if it has one, how to tell the transfer type. */
export function templateFix(fix: FixSource, railHint: string | null): FixEdit {
  const pointer = `${fix.exception.quote.trim().replace(/[.\s]*$/, ".")} See ${fix.exception.title}.`;
  return { action: "add_after", target: fix.source.quote, text: railHint ? `${pointer} ${railHint}` : pointer };
}

/** "How to tell the transfer type: …" from the exception doc, when it has such a line (no numbers, short). */
export function railHintFrom(exceptionBody: string): string | null {
  const line = exceptionBody.split("\n").find((l) => /how to tell the transfer type/i.test(l));
  const hint = line?.trim();
  return hint && hint.length <= 200 && numbers(hint).length === 0 ? hint : null;
}

/** Approve refuses if the doc changed after the fix was drafted: the proposal's "after" was built on its "before". */
export function fixStillApplies(currentBody: string, proposal: { before: string }): boolean {
  return currentBody === proposal.before;
}
