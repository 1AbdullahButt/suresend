// Safe-reply templates (SPEC §6.7). Never say or imply a reversal has already started or finished.
import type { AnyValue } from "@/lib/engine/values";
import { topicDef } from "@/lib/topics";

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
  return `Thanks for your patience. I'm confirming ${list} for your transfer and will update you here as soon as I have it.`;
}

/** The canonical Ask-first reply (the reversal timeline). */
export const ESCALATE_TEMPLATE = escalateTemplate(["reversal_window"]);
