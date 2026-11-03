// Topic: is the transfer fee refunded when a transfer fails? (Phase 10, D-041). Yes/no values, scoped by rail like the
// timeline. The seed already states it: DOC-101 §4 "Transfer fee is refunded with the principal."
import { formatValue, type AnyValue } from "@/lib/engine/values";
import type { TopicDef } from "./types";

/** "refunded" / "not refunded"; any other value kind keeps the comparator's wording. */
const words = (v: AnyValue): string => ("flag" in v ? (v.flag ? "refunded" : "not refunded") : formatValue(v));

const FEE = String.raw`(?:transfer |transaction |processing )?(?:fees?|charges?)`;
const BACK = String.raw`(?:refund(?:ed|able|s)?|non-refundable|return(?:ed|s)?|reimburs(?:ed|able)|back|kept|keeps?|waived|charged|stays?)`;

export const feeRefund = {
  id: "fee_refund" as const,
  valueKind: "boolean",
  valueWords: words,
  label: "fee-refund",
  subject: "whether the transfer fee is refunded",
  coverage: "whether the transfer fee is refunded when a transfer fails",
  // No detector words here (SPEC §6.7): "fee details" doesn't say whether the fee comes back.
  confirming: "the transfer fee details",
  asks: /\b(?:transfer |transaction |processing |service )?(?:fees?|charges?)\b/i,
  question: "the fee",
  noValue: "doesn't say it plainly",
  prompt: {
    taxonomy: `- "fee_refund": whether the customer gets the transfer FEE back when a transfer fails (a yes/no fact, not the fee amount).`,
    about: "the fee refund",
    draftRule: `A statement about whether the customer gets the transfer fee back ("the transfer fee is refunded with your money", "the fee isn't refundable", "the fee is charged anyway") is "fee_refund". A fee AMOUNT ("a €2 fee") is "other". Money coming back with the fee taken off it ("minus the processing charge", "less the fee", "after deducting the fee") says the fee isn't refunded: {"flag": false}.`,
    vagueRule: `A vague statement about the transfer fee, with no clear yes or no ("we'll look at the fee as well"), is still "fee_refund": value null, valueText the words as written.`,
    values: `- "fee_refund" values are yes/no: {"flag": true} when the fee is refunded ("refunded with the principal", "refunded with your money"); {"flag": false} when it isn't ("isn't refundable", "the fee is charged anyway"). Hedged wording ("should be refunded", "probably isn't refunded") keeps its flag. valueText: the words as written, e.g. "refunded with the principal".`,
    sourceNote: `A fee policy stated as a negative ("the transfer fee is not refunded") IS a claim: fee_refund with {"flag": false}. Rule 2 only skips instructions not to say something ("Do NOT promise same day").`,
  },
  patterns: [
    {
      kind: "fee",
      re: new RegExp(
        String.raw`\b${FEE}\b[^.!?\n]{0,40}?\b${BACK}\b|\b(?:refund(?:ed|able)?|return(?:ed)?|get back)\b[^.!?\n]{0,40}?\b${FEE}\b|\bno ${FEE}\b|\bfee-free\b|\bfree of charge\b|\b(?:minus|less|after deducting|deducting|net of)\b[^.!?\n]{0,30}?\b${FEE}\b`,
        "gi",
      ),
      noun: "the fee refund",
    },
  ],
  holdHeadline: ({ railTransfers, governing, cite, draft }) =>
    `Hold: the transfer fee is ${governing}${railTransfers ? ` for ${railTransfers}` : ""} (${cite}). The draft says it's ${draft}.`,
  replyTemplate: (v) => `The transfer fee is ${words(v)}.`,
  sentence({ verdict, rail, governing, draft, draftText }) {
    const gov = words(governing);
    const where = rail === "any" ? "" : ` for ${rail} transfers`;
    return verdict === "hold"
      ? { sentence: `The transfer fee is ${gov}${where}. Your reply says it's ${draft ? words(draft) : draftText}.`, strong: gov }
      : { sentence: `The transfer fee is ${gov}${where}. Your reply matches.`, strong: gov };
  },
} satisfies TopicDef;
