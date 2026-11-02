// Safe-reply templates (SPEC §6.7). Never say or imply a reversal has already started or finished.
import type { DraftClaim } from "@/lib/engine/types";
import type { AnyValue } from "@/lib/engine/values";
import { isCovered, topicDef, TOPICS } from "@/lib/topics";

const HOLDING_OPEN = "Thanks for your patience. I'm confirming ";
const HOLDING_CLOSE = " for your transfer and will update you here as soon as I have it.";

/** The HOLD template for a claim on `topic`: the topic's own sentence stating the governing value (D-041). */
export function holdTemplate(topic: string, v: AnyValue): string {
  return topicDef(topic).replyTemplate(v);
}

/**
 * The Ask-first sentence for the topics that depend on something unknown. No timeline, and nothing implying anything has
 * happened yet; runCheck asserts the detector doesn't fire on it (SPEC §6.7).
 */
export function escalateTemplate(topics: string[]): string {
  const what = [...new Set(topics)].map((t) => topicDef(t).confirming);
  const list = what.length > 1 ? `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}` : (what[0] ?? "the details");
  return `${HOLDING_OPEN}${list}${HOLDING_CLOSE}`;
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** SureSend's holding sentence, if a reply opens with it word for word: the sentence, the topics it names, and what follows it. */
function holdingSentence(reply: string): { sentence: string; topics: string[]; rest: string } | null {
  const text = flat(reply);
  const end = text.indexOf(HOLDING_CLOSE);
  if (!text.startsWith(HOLDING_OPEN) || end < 0) return null;
  const topics = text.slice(HOLDING_OPEN.length, end).split(/, | and /).map((phrase) => TOPICS.find((t) => t.confirming === phrase)?.id);
  if (topics.some((t) => !t)) return null;
  const close = end + HOLDING_CLOSE.length;
  return { sentence: text.slice(0, close), topics: topics as string[], rest: text.slice(close) };
}

/**
 * The topics a reply says are being confirmed, only if it's SureSend's own Ask-first reply (D-045): that sentence word for
 * word, and after it nothing but SureSend's own sentences for the claims it kept. Any other wording gets no pass from rule D0e,
 * whatever words it shares with this one, and an AI reading of the extra words accounts for nothing.
 */
export function holdingTopics(reply: string, claims: DraftClaim[]): string[] {
  const held = holdingSentence(reply);
  if (!held) return [];
  let rest = held.rest;
  for (const c of claims) {
    if (c.value && isCovered(c.topic)) rest = rest.replace(flat(topicDef(c.topic).replyTemplate(c.value)), "");
  }
  return /[\p{L}\p{N}]/u.test(rest) ? [] : held.topics;
}

/** The AI read part of SureSend's own holding sentence as a claim with no value. That sentence states nothing (SPEC §6.7), so it isn't one. */
export function insideHoldingSentence(reply: string, claim: DraftClaim): boolean {
  const held = holdingSentence(reply);
  return !!held && claim.value === null && held.sentence.includes(flat(claim.span));
}

/** The canonical Ask-first reply (the reversal timeline). */
export const ESCALATE_TEMPLATE = escalateTemplate(["reversal_window"]);
