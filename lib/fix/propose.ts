// "Fix the doc" (D-037), part 3 (server): draft a fix for the doc a held reply was copied from, validate it, and recheck
// the demo's canonical replies with the fix applied. Nothing is applied here: the proposal goes to a human, like Slite's
// Triage. The AI drafts first; the template is the fallback; a fix that would change any canonical decision is dropped.
import type { DocFixRequest } from "@/lib/ai/prompts";
import { runCheck } from "@/lib/check/runCheck";
import type { AiRunInfo, CheckDeps, CheckInput, Rail, Source, SourceOverride } from "@/lib/engine/types";
import { mergeOverrides } from "@/lib/workspace/merge";
import { visibleSources } from "@/lib/workspace/permissions";
import { seedSources } from "@/lib/workspace/seed";
import { findFixSource, type FixSource } from "./source";
import { railHintFrom, templateFix, validateFix, type ChangedLine, type FixEdit } from "./validate";

export interface FixDeps {
  draftDocFix?: (req: DocFixRequest) => Promise<{ edit: FixEdit; info: AiRunInfo }>;
}

export interface RecheckRow {
  ticketId: string;
  rail: Rail;
  draft: string;
  /** "HOLD / CONTRADICTS_GOVERNING": the same with and without the fix, or the proposal isn't offered. */
  decision: string;
}

export interface FixProposal {
  kind: "hold" | "ask";
  doc: { id: string; title: string };
  /** The value the reply promised, as written ("4 business days"). */
  draftValue: string;
  reason: string;
  edit: FixEdit;
  origin: "ai" | "template";
  /** Why the AI's draft was set aside, when the template is shown instead. */
  aiSetAside: string | null;
  before: string;
  after: string;
  changed: ChangedLine[];
  exception: { id: string; title: string; quote: string; valueText: string; rail: "instant" | "standard" };
  recheck: RecheckRow[];
}

export interface FixResult {
  proposal: FixProposal | null;
  /** Why there's no proposal (null when there is one). */
  why: string | null;
}

const FOUR = "Failed transfers are reversed within 4 business days.";
const ONE = "Failed transfers are reversed within 1 business day.";

/** The demo's canonical replies: an approved fix must leave every one of these decisions exactly as it was. */
export const CANONICAL_RECHECK: ReadonlyArray<{ ticketId: string; rail: Rail; draft: string }> = [
  { ticketId: "TCK-9001", rail: "instant", draft: FOUR },
  { ticketId: "TCK-9002", rail: "unknown", draft: FOUR },
  { ticketId: "TCK-9003", rail: "standard", draft: FOUR },
  { ticketId: "TCK-9001", rail: "instant", draft: ONE },
];

/** The fix as the app applies it on approval: the new text, saved and verified (simulated) now. */
export function fixOverride(source: Source, after: string, at: string, existing?: SourceOverride): SourceOverride {
  return { ...existing, id: source.id, body: after, version: source.version + 1, updatedAt: at, verification: "verified", verifiedAt: at };
}

function withFix(overrides: SourceOverride[], fixed: SourceOverride): SourceOverride[] {
  return [...overrides.filter((o) => o.id !== fixed.id), fixed];
}

async function recheck(input: CheckInput, overrides: SourceOverride[], deps: CheckDeps): Promise<RecheckRow[]> {
  // Decisions only: no safe replies, so the recheck costs no reply-writing AI calls.
  const ruleDeps: CheckDeps = { extractDraft: deps.extractDraft, extractSource: deps.extractSource, ...(deps.now ? { now: deps.now } : {}) };
  const rows: RecheckRow[] = [];
  for (const c of CANONICAL_RECHECK) {
    const r = await runCheck({ ...c, role: input.role, overrides, ...(input.decisionTime ? { decisionTime: input.decisionTime } : {}) }, ruleDeps);
    rows.push({ ...c, decision: `${r.decision} / ${r.reasonCode}` });
  }
  return rows;
}

function reasonFor(fix: FixSource): string {
  return `Replies that promise ${fix.draftValueText} match this doc: "${fix.source.quote}" It covers all rails, but ${fix.exception.title} gives ${fix.exception.rail}-rail transfers ${fix.exception.valueText}, and this doc doesn't say so.`;
}

export async function proposeFix(input: CheckInput, deps: CheckDeps, fixDeps: FixDeps = {}): Promise<FixResult> {
  const result = await runCheck(input, deps);
  const fix = findFixSource(result);
  if (!fix) {
    return {
      proposal: null,
      why:
        result.decision === "HOLD" || result.decision === "ESCALATE"
          ? "No doc to fix: no visible, general doc states the value this reply used, or that doc already covers the exception."
          : "Only a Hold or an Ask first points to a doc to fix.",
    };
  }
  const sources = visibleSources(mergeOverrides(seedSources(), input.overrides ?? []), input.role);
  const srcDoc = sources.find((s) => s.id === fix.source.id);
  const excDoc = sources.find((s) => s.id === fix.exception.id);
  if (!srcDoc || !excDoc) return { proposal: null, why: "The doc to fix isn't visible here." };
  const hint = railHintFrom(excDoc.body);

  const candidates: Array<{ edit: FixEdit; origin: "ai" | "template" }> = [];
  let aiSetAside: string | null = null;
  if (fixDeps.draftDocFix) {
    try {
      const { edit } = await fixDeps.draftDocFix({
        sourceId: srcDoc.id,
        sourceBody: srcDoc.body,
        sourceQuote: fix.source.quote,
        exceptionQuote: fix.exception.quote,
        exceptionTitle: fix.exception.title,
        exceptionValue: fix.exception.valueText,
        exceptionRail: fix.exception.rail,
        railHint: hint,
      });
      candidates.push({ edit, origin: "ai" });
    } catch {
      aiSetAside = "the AI couldn't draft a fix";
    }
  }
  candidates.push({ edit: templateFix(fix, hint), origin: "template" });

  const at = new Date(input.decisionTime ?? deps.now?.() ?? Date.now()).toISOString();
  const overrides = input.overrides ?? [];
  const baseline = await recheck(input, overrides, deps);
  let lastWhy = "";
  for (const c of candidates) {
    const v = validateFix(srcDoc.body, c.edit, fix);
    if (!v.ok) {
      lastWhy = v.reason;
      if (c.origin === "ai") aiSetAside = `the AI's draft failed validation (${v.reason})`;
      continue;
    }
    const fixed = fixOverride(srcDoc, v.after, at, overrides.find((o) => o.id === srcDoc.id));
    const rows = await recheck(input, withFix(overrides, fixed), deps);
    const moved = rows.filter((r, i) => r.decision !== baseline[i]?.decision);
    if (moved.length) {
      lastWhy = `it would change ${moved.map((r) => `${r.ticketId} (${baseline[rows.indexOf(r)]?.decision} → ${r.decision})`).join(", ")}`;
      if (c.origin === "ai") aiSetAside = `the AI's draft would change a canonical decision (${lastWhy.replace(/^it would change /, "")})`;
      continue;
    }
    return {
      proposal: {
        kind: fix.kind,
        doc: { id: srcDoc.id, title: srcDoc.title },
        draftValue: fix.draftValueText,
        reason: reasonFor(fix),
        edit: v.edit,
        origin: c.origin,
        aiSetAside: c.origin === "template" ? aiSetAside : null,
        before: srcDoc.body,
        after: v.after,
        changed: v.changed,
        exception: { id: fix.exception.id, title: fix.exception.title, quote: fix.exception.quote, valueText: fix.exception.valueText, rail: fix.exception.rail },
        recheck: rows,
      },
      why: null,
    };
  }
  return { proposal: null, why: `No safe fix to offer: ${lastWhy}.` };
}
