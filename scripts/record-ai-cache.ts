// Records saved AI responses into data/ai-cache/ (SPEC §10 fallback chain): every seeded doc, every Appendix B
// variant and the canonical drafts, for both personas, plus the safe replies they produce. Each file stores its full
// cache identity (including provider and model); the loader refuses a file whose identity doesn't match its key.
// Records with the configured primary provider (AI_PROVIDER), throttled to stay under its free tier.
//
// Checks the provider's quota first and stops on the first daily limit (lib/ai/quota.ts, exit code 3). A full recording
// is built in data/.ai-cache-recording and replaces data/ai-cache only if it finishes with nothing unexpected.
//
//   pnpm record                    re-record everything live with AI_PROVIDER: the golden cases, the guided tour's doc
//                                  edit, Fix the doc and the composer presets (D-041)
//   pnpm record --resume           continue a full recording that stopped; keeps what it already recorded
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
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { runCheck } from "@/lib/check/runCheck";
import { AI_CACHE_DIR, aiDeps, aiFixDeps, createRuntime } from "@/lib/ai/aiDeps";
import { fixOverride, proposeFix, type FixDeps } from "@/lib/fix/propose";
import { seedSources, seedTickets } from "@/lib/workspace/seed";
import { cacheKey, createAiCache, type AiCache } from "@/lib/ai/cache";
import { providerChain, type ProviderName } from "@/lib/ai/client";
import { checkQuota, createGuard, QUOTA_STOP_EXIT } from "@/lib/ai/quota";
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
/** A full recording's own folder (gitignored): data/ai-cache stays as it was until the recording finishes. */
const RECORDING_DIR = path.join(process.cwd(), "data", ".ai-cache-recording");
/** About what a full recording makes, retries included (it saves ~40 responses). */
const FULL_RECORDING_CALLS = 60;

const jsonFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []);

/** Notes which saved responses this pass used, so a resumed recording can drop what an interrupted pass left unused. */
function tracked(cache: AiCache, used: Set<string>): AiCache {
  return {
    get(identity) {
      const hit = cache.get(identity);
      if (hit !== undefined) used.add(cacheKey(identity));
      return hit;
    },
    set: (identity, output) => cache.set(identity, output),
    save(identity, output) {
      used.add(cacheKey(identity));
      cache.save(identity, output);
    },
  };
}

/** The finished recording becomes data/ai-cache. */
function publishRecording(used: Set<string>): void {
  for (const f of jsonFiles(RECORDING_DIR)) {
    if (!used.has(f.replace(/\.json$/, ""))) rmSync(path.join(RECORDING_DIR, f));
  }
  // Moved aside first, so a failed swap leaves the old folder in place, never a partial one.
  const old = `${AI_CACHE_DIR}.old`;
  // If the folder is missing, a killed swap left the good copy in .old: keep it until the new one is in place.
  if (existsSync(AI_CACHE_DIR)) {
    rmSync(old, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    renameSync(AI_CACHE_DIR, old);
  }
  try {
    renameSync(RECORDING_DIR, AI_CACHE_DIR);
  } catch (e) {
    renameSync(old, AI_CACHE_DIR);
    throw e;
  }
  rmSync(old, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
  const args = process.argv.slice(2);
  const only = (args.includes("--provider") ? args[args.indexOf("--provider") + 1] : providerChain()[0]!.provider) as ProviderName;
  const mode = args.includes("--tour-edits") ? "tour" : args.includes("--fix-edits") ? "fix" : args.includes("--presets") ? "presets" : "all";
  const dir = mode === "all" ? RECORDING_DIR : AI_CACHE_DIR;
  const resume = args.includes("--resume");
  const saved = mode === "all" && resume ? jsonFiles(RECORDING_DIR).length : 0;

  const stop = (why: string): never => {
    console.error(`\nStopped: ${why}.`);
    console.error(
      mode === "all"
        ? `data/ai-cache is untouched; ${jsonFiles(RECORDING_DIR).length} responses are kept in data/.ai-cache-recording. Continue with: pnpm record --resume`
        : "Nothing that was already saved changed. Re-run the same command to continue.",
    );
    process.exit(QUOTA_STOP_EXIT);
  };

  const quota = await checkQuota(only, Math.max(5, FULL_RECORDING_CALLS - saved));
  for (const line of quota.lines) console.log(line);
  if (!quota.ok) stop("the quota check failed");

  if (mode === "all" && !resume) rmSync(RECORDING_DIR, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const used = new Set<string>();
  // persist writes every live result to the recording's folder.
  const rt = createRuntime({ only, throttle: true, cache: tracked(createAiCache({ dir, maxEntries: 2000 }), used), persist: true });
  const slot = rt.chain[0]!;
  if (!slot.provider) throw new Error(`No live provider for ${only} (check the key and AI_MODE); data/ai-cache left untouched`);
  const before = jsonFiles(dir).length;
  const base = aiDeps(rt);
  const guard = createGuard(only, stop);
  const deps: CheckDeps = {
    extractSource: (s) => guard(() => base.extractSource(s)),
    extractDraft: (d) => guard(() => base.extractDraft(d)),
    suggestReply: (r) => guard(() => base.suggestReply!(r)),
  };
  const fixBase = aiFixDeps(rt);
  const fixDeps: Required<FixDeps> = { draftDocFix: (r) => guard(() => fixBase.draftDocFix(r)) };

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
  if (mode !== "all") {
    const after = jsonFiles(dir).length;
    console.log(`\nAdded ${after - before} saved responses (${before} → ${after}) with ${slot.name} / ${slot.model}. Unexpected: ${bad}`);
    process.exit(bad === 0 ? 0 : 1);
  }
  if (bad > 0) {
    console.log(`\nUnexpected: ${bad}. data/ai-cache is untouched; the recording is kept in data/.ai-cache-recording.`);
    process.exit(1);
  }
  publishRecording(used);
  console.log(`\nRecorded ${jsonFiles(AI_CACHE_DIR).length} saved responses with ${slot.name} / ${slot.model}. Unexpected: 0`);
  process.exit(0);
}

void main();
