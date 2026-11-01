// The topic taxonomy (D-041). Adding a topic = a TopicDef file registered here, extraction examples in it, and, if its
// values aren't a kind the engine already compares, a comparator in lib/engine/values.ts. The decision rules stay as
// they are: they ask this registry and the comparator registry, and never name a topic (lib/engine/topicAgnostic.test.ts).
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
