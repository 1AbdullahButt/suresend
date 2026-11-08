// Impact metrics (SPEC §11), stored in this browser only. Labeled "Simulated · this browser".
import type { CheckResult, Rail } from "@/lib/engine/types";
import { fnv1a } from "./hash";
import { readJson, removeKey, writeJson } from "./storage";

// v2: the demo's customers and doc titles changed in Phase 12, and what v1 saved still names the old ones.
const KEY = "suresend.metrics.v2";

export type Review = "correct" | "false_alarm";

export interface PastFlag {
  checkHash: string;
  ticketId: string;
  customer: string;
  decision: "CAUTION" | "HOLD" | "ESCALATE";
  headline: string;
  /** One line for the flagged list: "Instant transfer: docs say 1 business day, reply said 4". Flags saved before it existed have none. */
  reason?: string;
  draft: string;
  at: string;
  review: Review | null;
}

/** Held replies attributed to the doc they copied (D-037), with the last one so "Review fix" can redraft its fix. */
export interface DocHolds {
  title: string;
  count: number;
  /** The value those replies copied, as written ("4 business days"). */
  valueText: string;
  last: { ticketId: string; rail: Rail; draft: string };
  /** The text an approved fix added (simulated); while the doc still contains it, the menu shows it as fixed. */
  fixedText?: string;
}

export interface Metrics {
  /** Distinct `${ticketId}:${draftHash}` pairs that were checked. */
  checked: string[];
  intercepts: number;
  flags: PastFlag[];
  heldByDoc: Record<string, DocHolds>;
}

export function emptyMetrics(): Metrics {
  return { checked: [], intercepts: 0, flags: [], heldByDoc: {} };
}

const isDocHolds = (v: unknown): v is DocHolds => {
  const d = v as Partial<DocHolds> | null;
  return !!d && typeof d.title === "string" && typeof d.count === "number" && typeof d.valueText === "string" && !!d.last && typeof d.last.draft === "string";
};

export function loadMetrics(): Metrics {
  const m = readJson<Partial<Metrics> | null>(KEY, null);
  if (!m || typeof m !== "object") return emptyMetrics();
  return {
    checked: Array.isArray(m.checked) ? m.checked.filter((x): x is string => typeof x === "string") : [],
    intercepts: typeof m.intercepts === "number" && m.intercepts >= 0 ? m.intercepts : 0,
    flags: Array.isArray(m.flags) ? m.flags : [],
    heldByDoc:
      m.heldByDoc && typeof m.heldByDoc === "object"
        ? Object.fromEntries(Object.entries(m.heldByDoc).filter((e): e is [string, DocHolds] => isDocHolds(e[1])))
        : {},
  };
}

export function saveMetrics(m: Metrics): void {
  writeJson(KEY, m);
}

export function clearMetrics(): void {
  removeKey(KEY);
}

/** Records a completed check: one "draft checked" per (ticket, draft hash), one past flag per flagged check hash. */
export function recordCheck(
  m: Metrics,
  ticketId: string,
  customer: string,
  draft: string,
  result: CheckResult,
  at: string,
  reason?: string,
): Metrics {
  if (result.decision === "AI_UNAVAILABLE") return m; // nothing was checked
  const pair = `${ticketId}:${fnv1a(draft)}`;
  const checked = m.checked.includes(pair) ? m.checked : [...m.checked, pair];
  let flags = m.flags;
  const d = result.decision;
  if ((d === "CAUTION" || d === "HOLD" || d === "ESCALATE") && !m.flags.some((f) => f.checkHash === result.checkHash)) {
    const flag: PastFlag = { checkHash: result.checkHash, ticketId, customer, decision: d, headline: result.headline, ...(reason ? { reason } : {}), draft, at, review: null };
    flags = [flag, ...m.flags].slice(0, 50);
  }
  return { ...m, checked, flags };
}

export function recordIntercept(m: Metrics): Metrics {
  return { ...m, intercepts: m.intercepts + 1 };
}

/** Records (text) or clears (null) the approved fix for doc `id`. */
export function markDocFixed(m: Metrics, id: string, fixedText: string | null): Metrics {
  const d = m.heldByDoc[id];
  if (!d || (d.fixedText ?? null) === fixedText) return m;
  const { fixedText: _old, ...rest } = d;
  return { ...m, heldByDoc: { ...m.heldByDoc, [id]: fixedText === null ? rest : { ...rest, fixedText } } };
}

/** One held reply copied `valueText` from doc `id` (simulated, this browser). */
export function recordDocHold(m: Metrics, id: string, title: string, valueText: string, last: DocHolds["last"]): Metrics {
  const prev = m.heldByDoc[id];
  return { ...m, heldByDoc: { ...m.heldByDoc, [id]: { title, valueText, count: (prev?.count ?? 0) + 1, last } } };
}

export function setReview(m: Metrics, checkHash: string, review: Review | null): Metrics {
  return { ...m, flags: m.flags.map((f) => (f.checkHash === checkHash ? { ...f, review } : f)) };
}

export function falseAlarmStats(m: Metrics): { reviewed: number; falseAlarms: number; rate: number | null } {
  const reviewed = m.flags.filter((f) => f.review !== null).length;
  const falseAlarms = m.flags.filter((f) => f.review === "false_alarm").length;
  return { reviewed, falseAlarms, rate: reviewed >= 3 ? falseAlarms / reviewed : null };
}
