// Safe-reply templates (SPEC §6.7). Never say or imply a reversal has already started or finished.
import type { AnyValue } from "@/lib/engine/values";
import { topicDef } from "@/lib/topics";

/** The HOLD template for a claim on `topic`: the topic's own sentence stating the governing value (D-041). */
export function holdTemplate(topic: string, v: AnyValue): string {
  return topicDef(topic).replyTemplate(v);
}

/** No timeline, and nothing implying anything has happened yet. Asserted timeline-free in runCheck. */
export const ESCALATE_TEMPLATE =
  "Thanks for your patience. I'm confirming the exact reversal timeline for your transfer and will update you here as soon as I have it.";
