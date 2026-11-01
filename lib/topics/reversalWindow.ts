// Topic: when a failed transfer's money comes back (SPEC §4, the demo's first topic). Duration values.
import { formatValue, unitsMatch, valueWords, type AnyValue } from "@/lib/engine/values";
import type { ScopeLike, TopicDef } from "./types";

const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|same)`;

function scopeSubject(rail: ScopeLike): string {
  return rail === "instant" ? "Instant transfers" : rail === "standard" ? "Standard transfers" : "Failed transfers";
}

/** "4" when the units match the governing value, else the full "4 calendar days". */
function draftShort(draft: AnyValue | null, governing: AnyValue, fallback: string): string {
  if (!draft) return fallback;
  if (unitsMatch(draft, governing) && "amount" in draft) {
    return draft.amountMax !== undefined && draft.amountMax !== draft.amount ? `${draft.amount}–${draft.amountMax}` : String(draft.amount);
  }
  return valueWords(draft);
}

export const reversalWindow = {
  id: "reversal_window" as const,
  valueKind: "duration",
  label: "reversal-window",
  subject: "the reversal timeline",
  prompt: {
    taxonomy: `- "reversal_window": how long it takes for a FAILED transfer's money to be reversed/refunded/returned to the customer.`,
    about: "the reversal window",
    draftRule: `A promise about when money from a failed transfer comes back (refund, reversal, "back in your wallet", "your money will be back") is "reversal_window".`,
  },
  patterns: [
    {
      kind: "duration",
      re: new RegExp(String.raw`\b${NUMBER}[\s-]*(?:business |working |calendar )?(?:day|days|hour|hours|week|weeks)\b`, "gi"),
      noun: "the timing",
    },
    { kind: "relative_time", re: /\b(?:same day|today|tomorrow|within|by end of)\b/gi, noun: "the timing" },
  ],
  holdHeadline: ({ railTransfers, governing, cite, draft }) => `Hold: ${railTransfers} reverse in ${governing} (${cite}). The draft says ${draft}.`,
  replyTemplate: (v) => `For transfers on this payment type, the current policy gives a reversal window of ${formatValue(v)}.`,
  sentence({ verdict, rail, governing, draft, draftText }) {
    const subject = scopeSubject(rail);
    const gov = valueWords(governing);
    return verdict === "hold"
      ? { sentence: `${subject} now reverse in ${gov}. Your reply says ${draftShort(draft, governing, draftText)}.`, strong: gov }
      : { sentence: `${subject} reverse in ${gov}. Your reply matches.`, strong: gov };
  },
} satisfies TopicDef;
