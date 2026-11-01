// Deterministic policy-pattern detector (SPEC §6.6.2). "Nothing found" by the AI is never proof of safety:
// if this detector fires on a draft the AI returned no in-scope claim for, the result is EXTRACTION_GAP.
// Each covered topic brings its own patterns (lib/topics, D-041); a currency amount is checked for every draft.
import { TOPICS } from "@/lib/topics";
import type { PatternMatch } from "./types";

/** Each detector belongs to the topic that brought it; the currency amount belongs to none (topic null). */
const DETECTORS: ReadonlyArray<{ kind: string; re: RegExp; noun: string; topic: string | null }> = [
  ...TOPICS.flatMap((t) => t.patterns.map((p) => ({ ...p, topic: t.id as string | null }))),
  {
    topic: null,
    kind: "currency",
    re: /(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?|\b(?:usd|eur|gbp|pkr|rs\.?)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|eur|gbp|pkr|dollars?|euros?|pounds?|rupees?)\b)/gi,
    noun: "an amount",
  },
];

/** All detector hits in `text`, ordered by position. Overlapping hits of different kinds are all kept. */
export function detectPolicyPatterns(text: string): PatternMatch[] {
  const out: PatternMatch[] = [];
  for (const { kind, re } of DETECTORS) {
    for (const m of text.matchAll(re)) {
      if (m.index !== undefined) out.push({ text: m[0], index: m.index, kind });
    }
  }
  return out.sort((a, b) => a.index - b.index || b.text.length - a.text.length);
}

/** The topic a detector hit belongs to, or null for one every draft is checked for (a currency amount). */
export function patternTopic(kind: string): string | null {
  return DETECTORS.find((d) => d.kind === kind)?.topic ?? null;
}

/** What the hits are about, for "couldn't confirm the timing": one noun when they agree, else "a policy claim". */
export function patternNoun(matches: ReadonlyArray<Pick<PatternMatch, "kind">>): string {
  const nouns = new Set(matches.map((m) => DETECTORS.find((d) => d.kind === m.kind)?.noun ?? "a policy claim"));
  return nouns.size === 1 ? [...nouns][0]! : "a policy claim";
}

/** Digits or day/hour words: the ESCALATE template must contain none of these (SPEC §6.7). */
export function hasTimelineWords(text: string): boolean {
  return /\d/.test(text) || /\b(?:day|days|hour|hours|week|weeks|today|tomorrow)\b/i.test(text);
}
