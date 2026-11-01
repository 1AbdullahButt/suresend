// The topic taxonomy (D-041). Adding a topic = a TopicDef file registered here, extraction examples in it, and, if its
// values aren't a kind the engine already compares, a comparator in lib/engine/values.ts. The decision rules stay as
// they are: they ask this registry and the comparator registry, and never name a topic (lib/engine/topicAgnostic.test.ts).
import { formatValue, valueWords, type AnyValue } from "@/lib/engine/values";
import { reversalWindow } from "./reversalWindow";
import type { TopicDef } from "./types";

export type { TopicDef } from "./types";

/** Covered topics, in prompt order. "other" is not a topic here: it is everything outside them (SPEC §6.6 D0c). */
export const TOPICS = [reversalWindow] as const satisfies readonly TopicDef[];

export type TopicId = (typeof TOPICS)[number]["id"];

const byId = new Map<string, TopicDef>(TOPICS.map((t) => [t.id, t]));

export function isCovered(topic: string): topic is TopicId {
  return byId.has(topic);
}

/** The definition of a covered topic. Throws for "other" or an unknown id: callers check isCovered first. */
export function topicDef(topic: string): TopicDef {
  const t = byId.get(topic);
  if (!t) throw new Error(`Not a covered topic: ${topic}`);
  return t;
}

export const topicIds = (): TopicId[] => TOPICS.map((t) => t.id);

const custom = (topic: string) => (byId.get(topic) as TopicDef | undefined)?.valueWords;

/** A value as the engine words it (traces, headlines, the governing value): the topic's words, else the comparator's. */
export function describeValue(topic: string, v: AnyValue): string {
  return custom(topic)?.(v) ?? formatValue(v);
}

/** A value as a reply would say it (UI, MCP): the topic's words, else the comparator's reply wording. */
export function wordsFor(topic: string, v: AnyValue): string {
  return custom(topic)?.(v) ?? valueWords(v);
}
