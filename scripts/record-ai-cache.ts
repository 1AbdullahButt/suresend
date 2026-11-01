// Records saved AI responses into data/ai-cache/ (SPEC §10 fallback chain): every seeded doc, every Appendix B
// variant and the canonical drafts, for both personas, plus the safe replies they produce. Each file stores its full
// cache identity (including provider and model); the loader refuses a file whose identity doesn't match its key.
// Records with the configured primary provider (AI_PROVIDER), throttled to stay under its free tier.
//
//   pnpm record                    re-record everything live with AI_PROVIDER (clears data/ai-cache first): the golden
//                                  cases, the guided tour's doc edit, Fix the doc and the composer presets (D-041)
//   pnpm record --provider gemini  record with a specific provider
//   pnpm record --tour-edits       only add what guided-tour step 6 (the doc edit) needs (both ways of typing its edit, saved with
//                                  verify and with re-check); appends, existing files are reused and never cleared (D-034)
//   pnpm record --fix-edits        only add what "Fix the doc" needs on the canonical path: the fix proposal for the
//                                  canonical Hold and Ask first, then the workspace with that fix approved (incl. the tour's
//                                  doc edit on top of it); appends like --tour-edits (D-037)
//   pnpm record --presets          only add the composer's "Try another reply" presets; appends like --tour-edits (D-041)
//
// Every check that suggests a reply also records "Use this reply → Send" on that suggestion.
import { loadEnvConfig } from "@next/env";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { runCheck } from "@/lib/check/runCheck";
import { AI_CACHE_DIR, AiTaskError, aiDeps, aiFixDeps, createRuntime } from "@/lib/ai/aiDeps";
import { fixOverride, proposeFix, type FixDeps } from "@/lib/fix/propose";
import { seedSources, seedTickets } from "@/lib/workspace/seed";
import { createAiCache } from "@/lib/ai/cache";
import { providerChain, type ProviderName } from "@/lib/ai/client";
import { draftSave, seedBody, variantOverrides, verifiedSave, type VariantId } from "@/lib/workspace/variants";
import { tourStep5Edits } from "@/lib/workspace/variantBodies";
import { PRESETS } from "@/lib/workspace/presets";
import type { CheckDeps, CheckInput, Role } from "@/lib/engine/types";

loadEnvConfig(process.cwd());

interface GoldenCase {
  id: string;
  ticketId: string;
  rail: "instant" | "standard" | "unknown";
  draft: string;
  variant: VariantId | null;
  expect: { decision: string; reasonCode: string };
}

interface Golden {
  decisionTime: string;
  saveTime: string;
  cases: GoldenCase[];
}

const ROLES: Role[] = ["support_agent", "ops_lead"];
const FOUR = "Failed transfers are reversed within 4 business days.";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AiTaskError && e.kind === "paused" && attempt < 6) {
        await sleep(15_000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

/** One check, then "Use this reply → Send" on its suggestion. Returns how many results were unexpected. */
async function withReply(deps: CheckDeps, input: CheckInput, label: string, want?: { decision: string; reasonCode?: string }): Promise<number> {
  const r = await runCheck(input, deps);
  let bad = want && (r.decision !== want.decision || (want.reasonCode !== undefined && r.reasonCode !== want.reasonCode)) ? 1 : 0;
  let note = "";
  if (r.suggestion) {
    const re = await runCheck({ ...input, draft: r.suggestion.text }, deps);
    const ok = re.decision === "ALLOW" || re.decision === "CAUTION";
    if (!ok) bad++;
    note = ` · suggestion (${r.suggestion.origin}) rechecks ${re.decision}/${re.reasonCode}${ok ? "" : " ✗"}`;
  }
  console.log(`${bad ? "✗" : "✓"} ${label}: ${r.decision}/${r.reasonCode}${note}`);
  return bad;
}

async function recordGolden(deps: CheckDeps, golden: Golden): Promise<number> {
  let bad = 0;
  for (const role of ROLES) {
    for (const c of golden.cases) {
      const overrides = c.variant ? variantOverrides(c.variant, golden.saveTime) : [];
      const input = { ticketId: c.ticketId, rail: c.rail, draft: c.draft, role, overrides, decisionTime: golden.decisionTime };
      bad += await withReply(deps, input, `${role.padEnd(13)} ${c.id}`, c.expect);
    }
  }
  return bad;
}

/** Step 6: the canonical 4-day reply on TCK-9001 after the visitor's edit, then "Use this reply" → Send. */
async function recordTour(deps: CheckDeps, golden: Golden): Promise<number> {
  let bad = 0;
  const seed = seedBody("DOC-103");
  for (const [name, edit] of Object.entries(tourStep5Edits)) {
    for (const [mode, save, decision] of [
      ["verify", verifiedSave, "HOLD"],
      ["re-check", draftSave, "CAUTION"],
    ] as const) {
      for (const role of ROLES) {
        const overrides = [save("DOC-103", edit(seed), golden.saveTime)];
        bad += await withReply(deps, { ticketId: "TCK-9001", rail: "instant", role, overrides, draft: FOUR }, `tour ${name} ${mode} ${role}`, { decision });
      }
    }
  }
  return bad;
}

/** Fix the doc: the proposal for the canonical Hold and Ask first, the reply after approval, the tour's edit on top. */
async function recordFix(deps: CheckDeps, fixDeps: Required<FixDeps>, golden: Golden): Promise<number> {
  let bad = 0;
  for (const role of ROLES) {
    for (const [ticketId, rail, decision] of [
      ["TCK-9001", "instant", "HOLD"],
      ["TCK-9002", "unknown", "ESCALATE"],
    ] as const) {
      const { proposal, why } = await proposeFix({ ticketId, rail, draft: FOUR, role }, deps, fixDeps);
      if (!proposal) {
        bad++;
        console.log(`✗ ${role.padEnd(13)} ${ticketId} no proposal: ${why}`);
        continue;
      }
      console.log(`✓ ${role.padEnd(13)} ${ticketId} ${proposal.origin} fix to ${proposal.doc.id}${proposal.aiSetAside ? ` (AI set aside: ${proposal.aiSetAside})` : ""}`);
      console.log(`    + ${proposal.edit.text}`);
      const doc = seedSources().find((s) => s.id === proposal.doc.id)!;
      const fixed = fixOverride(doc, proposal.after, golden.saveTime);
      bad += await withReply(deps, { ticketId, rail, draft: FOUR, role, overrides: [fixed] }, `  after approval ${ticketId}`, { decision });
      if (ticketId !== "TCK-9001") continue;
      const seed103 = seedBody("DOC-103");
      for (const [name, edit] of Object.entries(tourStep5Edits)) {
        for (const [mode, save, want] of [
          ["verify", verifiedSave, "HOLD"],
          ["re-check", draftSave, "CAUTION"],
        ] as const) {
          const overrides = [fixed, save("DOC-103", edit(seed103), golden.saveTime)];
          bad += await withReply(deps, { ticketId, rail, draft: FOUR, role, overrides }, `  + tour ${name} ${mode}`, { decision: want });
        }
      }
    }
  }
  return bad;
}

/** The composer's "Try another reply" presets, on each ticket's own rail (D-041). */
async function recordPresets(deps: CheckDeps): Promise<number> {
  let bad = 0;
  for (const role of ROLES) {
    for (const t of seedTickets()) {
      for (const p of PRESETS[t.id] ?? []) {
        bad += await withReply(deps, { ticketId: t.id, rail: t.rail, draft: p.draft, role }, `${role.padEnd(13)} preset ${p.id}`, { decision: p.expect });
      }
    }
  }
  return bad;
}

async function main() {
  const golden = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "golden.json"), "utf8")) as Golden;
  // Fresh cache bound to the saved-responses dir; persist writes every live result to disk.
  const args = process.argv.slice(2);
  const only = (args.includes("--provider") ? args[args.indexOf("--provider") + 1] : providerChain()[0]!.provider) as ProviderName;
  const rt = createRuntime({ only, throttle: true, cache: createAiCache({ dir: AI_CACHE_DIR, maxEntries: 2000 }), persist: true });
  const slot = rt.chain[0]!;
  if (!slot.provider) throw new Error(`No live provider for ${only} (check the key and AI_MODE); data/ai-cache left untouched`);
  const mode = args.includes("--tour-edits") ? "tour" : args.includes("--fix-edits") ? "fix" : args.includes("--presets") ? "presets" : "all";
  if (mode === "all") {
    rmSync(AI_CACHE_DIR, { recursive: true, force: true });
    mkdirSync(AI_CACHE_DIR, { recursive: true });
  }
  const before = readdirSync(AI_CACHE_DIR).filter((f) => f.endsWith(".json")).length;
  const base = aiDeps(rt);
  const deps: CheckDeps = {
    extractSource: (s) => withBackoff(() => base.extractSource(s)),
    extractDraft: (d) => withBackoff(() => base.extractDraft(d)),
    suggestReply: (r) => withBackoff(() => base.suggestReply!(r)),
  };
  const fixBase = aiFixDeps(rt);
  const fixDeps: Required<FixDeps> = { draftDocFix: (r) => withBackoff(() => fixBase.draftDocFix(r)) };

  let bad = 0;
  if (mode === "all" || mode === "presets") {
    if (mode === "all") {
      console.log("— golden cases");
      bad += await recordGolden(deps, golden);
    }
    console.log("— composer presets");
    bad += await recordPresets(deps);
  }
  if (mode === "all" || mode === "tour") {
    console.log("— guided tour, step 6");
    bad += await recordTour(deps, golden);
  }
  if (mode === "all" || mode === "fix") {
    console.log("— Fix the doc");
    bad += await recordFix(deps, fixDeps, golden);
  }
  const after = readdirSync(AI_CACHE_DIR).filter((f) => f.endsWith(".json")).length;
  console.log(`\n${mode === "all" ? "Recorded" : "Added"} ${after - before} saved responses (${before} → ${after}) with ${slot.name} / ${slot.model}. Unexpected: ${bad}`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
