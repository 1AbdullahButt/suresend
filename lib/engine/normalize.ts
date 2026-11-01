// Text normalization shared by quote validation and supersession matching, plus date helpers.
const DASHES = /[‐-―−﹘﹣－]/g;
const SINGLE_QUOTES = /[‘’‚‛′]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;

/**
 * Normalization for verbatim-quote checks (SPEC §6.2, DECISIONS D-002.2): NFKC, dash and quote variants folded,
 * whitespace collapsed. The check stays a strict substring test on the result.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(DASHES, "-")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `quote` is a non-empty verbatim substring of `text` after normalization. */
export function isVerbatim(quote: string, text: string): boolean {
  const q = normalizeText(quote);
  return q.length > 0 && normalizeText(text).includes(q);
}

/** Loose form for naming matches (DECISIONS D-002.6): lowercase, every non-alphanumeric run becomes one space. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Deterministic containment used by D5 condition 3. */
export function namesSource(targetText: string, source: { id: string; title: string }): boolean {
  const target = ` ${normalizeForMatch(targetText)} `;
  return [source.title, source.id].some((name) => {
    const n = normalizeForMatch(name);
    return n.length > 0 && target.includes(` ${n} `);
  });
}

// Value comparison and value wording live in values.ts, the comparator registry (D-041).

/** "27 Oct 2026" from an ISO date; returns the input unchanged if it doesn't parse. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}
