// Topic: when a failed transfer's money comes back (SPEC §4, the demo's first topic). Duration values.
import { formatValue, isDuration, unitsMatch, valueWords, type AnyValue } from "@/lib/engine/values";
import type { ScopeLike, TopicDef } from "./types";

// Counts in words too, with or without a number behind them: the AI says what they're worth, and this net only sees that they're there.
const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|same|(?:a )?couple(?: of)?|a few|several|a handful of)`;

function scopeSubject(rail: ScopeLike): string {
  return rail === "instant" ? "Instant transfers" : rail === "standard" ? "Standard transfers" : "Failed transfers";
}

/** "4" when the units match the governing value, else the full "4 calendar days". */
function draftShort(draft: AnyValue | null, governing: AnyValue, fallback: string): string {
  if (!draft) return fallback;
  if (unitsMatch(draft, governing) && isDuration(draft)) {
    return draft.amountMax !== undefined && draft.amountMax !== draft.amount ? `${draft.amount}–${draft.amountMax}` : String(draft.amount);
  }
  return valueWords(draft);
}

export const reversalWindow = {
  id: "reversal_window" as const,
  valueKind: "duration",
  label: "reversal-window",
  subject: "the reversal timeline",
  confirming: "the exact reversal timeline",
  coverage: "when the money from a failed transfer comes back",
  asks: /\b(?:money|funds?|cash|amount|balance)\b[^.!?\n]{0,40}\b(?:back|return(?:ed|s)?|gone)\b|\b(?:come|comes|coming|get|getting|got|be) (?:it )?back\b|\brefund|\brevers(?:e|ed|al)\b/i,
  question: "timing",
  noValue: "gives no number",
  prompt: {
    taxonomy: `- "reversal_window": how long it takes for a FAILED transfer's money to be reversed/refunded/returned to the customer.`,
    about: "the reversal window",
    draftRule: `A promise about when money from a failed transfer comes back (refund, reversal, "back in your wallet", "your money will be back") is "reversal_window".`,
    vagueRule: `A vague promise about when that money comes back, with no number ("after the weekend", "before the week is out"), is still "reversal_window": value null, valueText the words as written.`,
  },
  patterns: [
    {
      kind: "duration",
      re: new RegExp(String.raw`\b${NUMBER}[\s-]*(?:business |working |calendar )?(?:day|days|hour|hours|week|weeks|month|months)\b|\ba (?:business |working |calendar )?(?:week|fortnight|month)\b|\ba (?:business|working) day\b|\ba day or two\b|\b(?:in|within) a day\b`, "gi"),
      noun: "the timing",
    },
    { kind: "relative_time", re: /\b(?:same day|today|tomorrow|within|by end of)\b/gi, noun: "the timing" },
  ],
  holdHeadline: ({ railTransfers, governing, cite, draft }) => `Hold: ${railTransfers ?? "failed transfers"} reverse in ${governing} (${cite}). The draft says ${draft}.`,
  replyTemplate: (v) => `For transfers on this payment type, the current policy gives a reversal window of ${formatValue(v)}.`,
  sentence({ verdict, rail, governing, draft, draftText, replaced }) {
    const subject = scopeSubject(rail);
    const gov = valueWords(governing);
    return verdict === "hold"
      ? { sentence: `${subject}${replaced ? " now" : ""} reverse in ${gov}. Your reply says ${draftShort(draft, governing, draftText)}.`, strong: gov }
      : { sentence: `${subject} reverse in ${gov}. Your reply matches.`, strong: gov };
  },
} satisfies TopicDef;
