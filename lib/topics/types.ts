// A topic the engine can check (D-041). Everything topic-specific lives in its TopicDef: the value kind its claims
// carry, its wording, its extraction prompt lines and its detector patterns. The decision rules never name a topic.
// Pure: no I/O.
import type { AnyValue, ValueKind } from "@/lib/engine/values";

export type ScopeLike = "instant" | "standard" | "any";

export interface TopicDef {
  /** The taxonomy id the AI returns ("reversal_window"). */
  id: string;
  /** The value kind of its claims; the comparator registry compares them (lib/engine/values.ts). */
  valueKind: ValueKind;
  /** The topic's words for a value ("refunded"), when the comparator's own wording ("yes") would read badly. */
  valueWords?: (v: AnyValue) => string;
  /** For the trace: "a definitive reversal-window claim". */
  label: string;
  /** For headlines: "the reversal timeline depends on the payment rail". */
  subject: string;
  /** For coverage notes (MCP): "when the money from a failed transfer comes back". */
  coverage: string;
  /** For the Ask-first template: "I'm confirming the exact reversal timeline for your transfer". No detector words. */
  confirming: string;
  /** A customer's message asks about this topic (rule D0e, D-045). Deterministic, like the detector patterns. */
  asks: RegExp;
  /** How a reply falls short when it gives no value: "gives no number" (D-046). */
  noValue: string;
  /** Extraction prompt lines (lib/ai/prompts.ts). */
  prompt: {
    /** The taxonomy line: `- "reversal_window": …`. */
    taxonomy: string;
    /** What "statements about it" means in the no-value rule: "the reversal window". */
    about: string;
    /** The draft-side rule that maps a customer promise to this topic. */
    draftRule: string;
    /** The draft-side rule for vague wording: still a claim on this topic, with no value (D-045). */
    vagueRule: string;
    /** Value examples, for a value kind the shared rules don't explain. */
    values?: string;
    /** Extra guidance for reading documents. */
    sourceNote?: string;
  };
  /** Detector patterns: the "nothing found is never proof of safety" net for this topic (SPEC §6.6.2). */
  patterns: ReadonlyArray<{ kind: string; re: RegExp; noun: string }>;
  /** The engine headline for a Hold on this topic. */
  holdHeadline(p: { railTransfers: string; governing: string; cite: string; draft: string }): string;
  /** The safe-reply template sentence stating the governing value (SPEC §6.7). */
  replyTemplate(v: AnyValue): string;
  /** One plain sentence for the decision card (design v2), and the value to emphasise in it. */
  sentence(p: { verdict: "hold" | "allow"; rail: ScopeLike; governing: AnyValue; draft: AnyValue | null; draftText: string }): {
    sentence: string;
    strong: string | null;
  };
}
