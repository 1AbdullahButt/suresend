// Presentation helpers shared by the v2 UI: dates, values, quote location, diffs, the AI mode line.
// Pure functions; no I/O.
import type { CheckResult, ClaimResult, OverallDecision, Value, Weakener } from "@/lib/engine/types";
import { valueWords as wordsFor } from "@/lib/engine/values";

export const WEAKENER_WORDS: Record<Weakener, string> = {
  UNVERIFIED: "Unverified",
  VERIFICATION_EXPIRED: "Verification expired",
  EDITED_AFTER_VERIFICATION: "Edited after verification",
  OWNER_INACTIVE: "Owner inactive",
};

const SEVERITY: Record<OverallDecision, number> = { ALLOW: 0, CAUTION: 1, HOLD: 2, ESCALATE: 3, AI_UNAVAILABLE: 4 };

export function mostSevereClaim(result: CheckResult): ClaimResult | null {
  let best: ClaimResult | null = null;
  for (const c of result.claims) if (!best || SEVERITY[c.decision] > SEVERITY[best.decision]) best = c;
  return best;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-26" → "Oct 26". Date-only strings are read as calendar dates (no timezone shift). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[3])}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()] ?? ""} ${d.getDate()}`;
}

/** "4 business days", "5–7 days": the comparator's reply wording for the value's kind (D-041). */
export function valueWords(v: Value): string {
  return v ? wordsFor(v) : "no value";
}

// ---- quote location (mirrors the engine's normalization: whitespace, dashes, smart quotes) ------------

const DASHES = /[‐-―−]/;
const SQUOTES = /[‘’‚‛]/;
const DQUOTES = /[“”„‟]/;

function normChar(c: string): string {
  if (DASHES.test(c)) return "-";
  if (SQUOTES.test(c)) return "'";
  if (DQUOTES.test(c)) return '"';
  return c.toLowerCase();
}

function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if (/\s/.test(c)) {
      if (!lastSpace && norm.length > 0) {
        norm += " ";
        map.push(i);
      }
      lastSpace = true;
      continue;
    }
    lastSpace = false;
    norm += normChar(c);
    map.push(i);
  }
  return { norm, map };
}

/** Finds `needle` in `text` (normalized), returning the [start, end) range in the original text. */
export function findRange(text: string, needle: string): { start: number; end: number } | null {
  if (!needle.trim()) return null;
  const direct = text.indexOf(needle);
  if (direct >= 0) return { start: direct, end: direct + needle.length };
  const t = normalizeWithMap(text);
  const n = normalizeWithMap(needle.trim()).norm.trim();
  const at = t.norm.indexOf(n);
  if (at < 0) return null;
  const start = t.map[at];
  const endIdx = t.map[at + n.length - 1];
  if (start === undefined || endIdx === undefined) return null;
  return { start, end: endIdx + 1 };
}


/** A one-line "what changed" summary between two texts: common prefix/suffix stripped. */
export function diffSummary(before: string, after: string): { removed: string; added: string } | null {
  if (before === after) return null;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  // widen to word boundaries so "1 business day" → "2 business days" reads naturally
  while (p > 0 && /\S/.test(before[p - 1] ?? "") && /\S/.test(after[p - 1] ?? "")) p--;
  const removed = before.slice(p, before.length - s);
  const added = after.slice(p, after.length - s);
  const clip = (x: string) => (x.length > 48 ? `${x.slice(0, 45).trim()}…` : x);
  return { removed: clip(removed.replace(/\s+/g, " ").trim()), added: clip(added.replace(/\s+/g, " ").trim()) };
}

export function aiModeLabel(ai: CheckResult["ai"] | null): {
  text: string;
  /** Phone-width label; the full text stays in the badge's aria-label and title. */
  short: string;
  dot: "live" | "saved" | "off" | "paused" | "none";
} {
  if (!ai) return { text: "No check yet", short: "Idle", dot: "none" };
  if (ai.paused) return { text: "Live AI paused, showing saved responses", short: "Paused", dot: "paused" };
  if (ai.mode === "live") {
    return { text: ai.fellBack ? `Live AI · via fallback (${ai.provider ?? "fallback"})` : "Live AI", short: ai.fellBack ? "Fallback" : "Live", dot: "live" };
  }
  if (ai.mode === "saved") return { text: "Saved AI response", short: "Saved", dot: "saved" };
  return { text: "AI unavailable", short: "AI off", dot: "off" };
}
