// D-041: the decision rules (S, A, D0–D11) never name a topic and never compare amounts or units themselves. Adding a
// topic is a taxonomy entry (lib/topics), extraction examples and, for a new value kind, a comparator (values.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOPICS } from "@/lib/topics";
import { valueKinds } from "./values";

const RULE_FILES = ["decide.ts", "resolve.ts", "standing.ts", "applicability.ts", "severity.ts"];
const read = (f: string) => readFileSync(path.join(__dirname, f), "utf8");

/** Every way a rule file could name a topic: its id, its label, and their words. */
function topicNames(): string[] {
  const names = new Set<string>();
  for (const t of TOPICS) {
    names.add(t.id);
    names.add(t.id.replace(/_/g, " "));
    names.add(t.id.replace(/_/g, "-"));
    names.add(t.label);
    names.add(t.label.replace(/-/g, " "));
    for (const word of t.id.split("_")) if (word.length >= 3) names.add(word);
  }
  return [...names];
}

describe("the decision rules are topic-agnostic", () => {
  it.each(RULE_FILES)("%s names no topic", (file) => {
    const text = read(file).toLowerCase();
    const found = topicNames().filter((n) => new RegExp(`\\b${n.toLowerCase().replace(/[-\s]/g, "[-\\s_]")}\\b`).test(text));
    expect(found, `${file} mentions ${found.join(", ")}`).toEqual([]);
  });

  it.each(RULE_FILES)("%s compares values only through the comparator registry", (file) => {
    const text = read(file);
    expect(text).not.toMatch(/\.(amount|amountMax|unit|flag|quantity)\b/);
    expect(text).not.toMatch(/\[\s*["'`](amount|amountMax|unit|flag|quantity|of)["'`]\s*\]/);
    expect(text).not.toMatch(/["'`](amount|amountMax|unit|flag|quantity)["'`]\s+in\b/);
    expect(text).not.toMatch(/\{\s*(amount|amountMax|unit|flag|quantity)\b[^}]*\}\s*=/);
    expect(text).not.toMatch(/amountWithin|range\(|topicIds\(\)\s*\[|TOPICS\s*\[/);
  });

  it("every topic's value kind has a comparator", () => {
    for (const t of TOPICS) expect(valueKinds()).toContain(t.valueKind);
  });
});
