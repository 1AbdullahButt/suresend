// D-041: a held-out case only counts while its wording is unseen. Fails if a clean case's wording shows up in what the
// prompts are built from or in the golden set, or if the prompts change after the freeze the held-out report relies on.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIX_PROMPT_VERSION, PROMPT_VERSION, REPLY_PROMPT_VERSION } from "./prompts";
import { SCHEMA_VERSION } from "./schemas";

interface HeldOutCase {
  id: string;
  draft: string;
  exposed?: boolean;
  exposedWhy?: string;
  overrides?: Array<{ body?: string }>;
}
interface HeldOut {
  frozen: { prompt: string; reply: string; fix: string; schema: string };
  cases: HeldOutCase[];
}

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");
const suite = JSON.parse(read("evals", "heldout.json")) as HeldOut;

const topicFiles = readdirSync(path.join(root, "lib", "topics"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ["lib", "topics", f]);
const WATCHED = [["lib", "ai", "prompts.ts"], ["lib", "ai", "schemas.ts"], ["evals", "golden.json"], ["lib", "workspace", "presets.ts"], ...topicFiles];

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const ngrams = (s: string, n: number) => {
  const w = words(s);
  return w.slice(0, Math.max(0, w.length - n + 1)).map((_, i) => w.slice(i, i + n).join(" "));
};
const corpus = new Set(WATCHED.flatMap((p) => ngrams(read(...p), 3)));

// H6–H9 test reworded docs or an injection: their drafts reuse the canonical reply on purpose, so that sentence is skipped.
const CANONICAL = /Failed transfers are reversed within \d business days?\./g;
const seed103 = read("data", "seed", "docs", "DOC-103.md").replace(/\r\n/g, "\n");
/** Only the text a case adds: its draft, and any line its doc edit adds to the seed doc. */
const added = (c: HeldOutCase) => [
  c.draft.replace(CANONICAL, ""),
  ...(c.overrides ?? []).flatMap((o) => (o.body ?? "").split("\n").filter((line) => line.trim() && !seed103.includes(line))),
];

describe("held-out integrity", () => {
  // H1–H10 predate the fee topic and reuse phrases the older prompt already had; the report says so.
  const clean = suite.cases.filter((c) => !c.exposed && Number(/^H(\d+)/.exec(c.id)?.[1]) > 10);

  it("enough clean fee cases remain", () => {
    expect(clean.length).toBeGreaterThanOrEqual(4);
  });

  it.each(clean.map((c) => c.id))("%s shares no three-word phrase with the prompts, schema, golden set or presets", (id) => {
    const c = clean.find((x) => x.id === id)!;
    const overlap = added(c).flatMap((text) => ngrams(text, 3)).filter((g) => corpus.has(g));
    expect(overlap).toEqual([]);
  });

  it("every exposed case says why", () => {
    for (const c of suite.cases.filter((x) => x.exposed)) expect(c.exposedWhy, c.id).toBeTruthy();
  });

  it("the prompts have not changed since the freeze", () => {
    expect({ prompt: PROMPT_VERSION, reply: REPLY_PROMPT_VERSION, fix: FIX_PROMPT_VERSION, schema: SCHEMA_VERSION }).toEqual(suite.frozen);
  });
});
