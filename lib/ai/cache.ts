// Extraction cache (SPEC §10). Key = sha256 of a canonical JSON of the full identity. In-memory LRU first, then
// saved responses in data/ai-cache/<key>.json. A saved file is used only if its stored identity hashes to its key.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Decision, Value } from "@/lib/engine/types";

/** Full cache identity (SPEC §10, plus provider per DECISIONS.md D-001). */
export interface CacheIdentity {
  task: "source_extraction" | "draft_extraction" | "safe_reply" | "doc_fix";
  promptVersion: string;
  schemaVersion: string;
  provider: string;
  model: string;
  inputText: string;
  /** source_extraction only */
  sourceKind?: string;
  /** safe_reply only */
  governing?: { value: Value; quote: string; decision: Decision };
  /** safe_reply only (D-041): the reply's governed claims, each marked right or wrong, as the prompt gives them. */
  claims?: Array<{ span: string; topic: string; correct: string; quote: string; sourceId: string; wrong: boolean }>;
  /** doc_fix only (D-037): the claim sentence agents copy, the exception it misses, and how to tell the rail. */
  fix?: {
    sourceId: string;
    sourceQuote: string;
    exceptionQuote: string;
    exceptionTitle: string;
    exceptionValue: string;
    exceptionRail: string;
    railHint: string | null;
  };
}

/** On-disk format of a saved AI response in data/ai-cache/<key>.json. */
export interface CacheFile {
  key: string;
  identity: CacheIdentity;
  output: unknown;
  recordedAt: string;
}

/** JSON with object keys sorted recursively and undefined members dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** sha256 (hex) of a canonical JSON of the identity (key order independent). */
export function cacheKey(identity: CacheIdentity): string {
  return createHash("sha256").update(canonicalJson(identity)).digest("hex");
}

export interface AiCache {
  /** In-memory LRU first, then `<dir>/<key>.json`. Returns undefined on a miss or an identity mismatch. */
  get(identity: CacheIdentity): unknown | undefined;
  /** Stores in memory only. */
  set(identity: CacheIdentity, output: unknown): void;
  /** Writes `<dir>/<key>.json` (used by `pnpm record`). */
  save(identity: CacheIdentity, output: unknown): void;
}

export function createAiCache(opts: { dir?: string; maxEntries?: number } = {}): AiCache {
  const { dir, maxEntries = 500 } = opts;
  const memory = new Map<string, unknown>();

  const remember = (key: string, output: unknown) => {
    memory.delete(key);
    memory.set(key, output);
    while (memory.size > maxEntries) memory.delete(memory.keys().next().value as string);
  };

  const readFile = (key: string): unknown | undefined => {
    if (!dir) return undefined;
    const file = path.join(dir, `${key}.json`);
    if (!existsSync(file)) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<CacheFile>;
      // Refuse a file whose identity doesn't match its key (or whose key field disagrees with its name).
      if (parsed.key !== key || !parsed.identity || cacheKey(parsed.identity) !== key) return undefined;
      return parsed.output;
    } catch {
      return undefined;
    }
  };

  return {
    get(identity) {
      const key = cacheKey(identity);
      if (memory.has(key)) {
        const hit = memory.get(key);
        remember(key, hit);
        return hit;
      }
      const fromFile = readFile(key);
      if (fromFile !== undefined) remember(key, fromFile);
      return fromFile;
    },
    set(identity, output) {
      remember(cacheKey(identity), output);
    },
    save(identity, output) {
      if (!dir) throw new Error("createAiCache: save() needs a dir");
      const key = cacheKey(identity);
      mkdirSync(dir, { recursive: true });
      const file: CacheFile = { key, identity, output, recordedAt: new Date().toISOString() };
      writeFileSync(path.join(dir, `${key}.json`), `${JSON.stringify(file, null, 2)}\n`, "utf8");
      remember(key, output);
    },
  };
}
