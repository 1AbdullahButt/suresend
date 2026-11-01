// Records saved AI responses into data/ai-cache/ (SPEC §10 fallback chain): every seeded doc, every Appendix B
// variant and the canonical drafts, for both personas, plus the safe replies they produce. Each file stores its full
// cache identity (including provider and model); the loader refuses a file whose identity doesn't match its key.
// Records with the configured primary provider (AI_PROVIDER), throttled to stay under its free tier.
//
//   pnpm record                    re-record everything live with AI_PROVIDER (clears data/ai-cache first)
//   pnpm record --provider gemini  record with a specific provider
//   pnpm record --tour-edits       only add what guided-tour step 6 (the doc edit) needs (both ways of typing its edit, saved with
//                                  verify and with re-check); appends, existing files are reused and never cleared (D-034)
//   pnpm record --fix-edits        only add what "Fix the doc" needs on the canonical path: the fix proposal for the
//                                  canonical Hold and Ask first, then the workspace with that fix approved (incl. the tour's
//                                  doc edit on top of it); appends like --tour-edits (D-037)
import { loadEnvConfig } from "@next/env";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { runCheck } from "@/lib/check/runCheck";
import { AI_CACHE_DIR, AiTaskError, aiDeps, aiFixDeps, createRuntime } from "@/lib/ai/aiDeps";
import { fixOverride, proposeFix, type FixDeps } from "@/lib/fix/propose";
import { seedSources } from "@/lib/workspace/seed";
import { createAiCache } from "@/lib/ai/cache";
import { providerChain, type ProviderName } from "@/lib/ai/client";
import { draftSave, seedBody, variantOverrides, verifiedSave, type VariantId } from "@/lib/workspace/variants";
import { tourStep5Edits } from "@/lib/workspace/variantBodies";
import type { CheckDeps, Role } from "@/lib/engine/types";

loadEnvConfig(process.cwd());

interface GoldenCase {
  id: string;
  ticketId: string;
  rail: "instant" | "standard" | "unknown";
  draft: string;
  variant: VariantId | null;
  expect: { decision: string; reasonCode: string };
}

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

async function main() {
  const golden = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "golden.json"), "utf8")) as {
    decisionTime: string;
    saveTime: string;
    cases: GoldenCase[];
  };
  // Fresh cache bound to the saved-responses dir; persist writes every live result to disk.
  const args = process.argv.slice(2);
  const only = (args.includes("--provider") ? args[args.indexOf("--provider") + 1] : providerChain()[0]!.provider) as ProviderName;
  const rt = createRuntime({ only, throttle: true, cache: createAiCache({ dir: AI_CACHE_DIR, maxEntries: 1000 }), persist: true });
  const slot = rt.chain[0]!;
  if (!slot.provider) throw new Error(`No live provider for ${only} (check the key and AI_MODE); data/ai-cache left untouched`);
  const tourOnly = args.includes("--tour-edits");
  const fixOnly = args.includes("--fix-edits");
  if (!tourOnly && !fixOnly) {
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

  if (fixOnly) {
    const fixBase = aiFixDeps(rt);
    const fixDeps: Required<FixDeps> = { draftDocFix: (r) => withBackoff(() => fixBase.draftDocFix(r)) };
    const four = golden.cases[0]!.draft;
    let unexpected = 0;
    for (const role of ["support_agent", "ops_lead"] as Role[]) {
      for (const [ticketId, rail, expected] of [
        ["TCK-9001", "instant", "HOLD"],
        ["TCK-9002", "unknown", "ESCALATE"],
      ] as const) {
        const { proposal, why } = await proposeFix({ ticketId, rail, draft: four, role }, deps, fixDeps);
        if (!proposal) {
          unexpected++;
          console.log(`✗ ${role.padEnd(13)} ${ticketId} no proposal: ${why}`);
          continue;
        }
        console.log(`✓ ${role.padEnd(13)} ${ticketId} ${proposal.origin} fix to ${proposal.doc.id}${proposal.aiSetAside ? ` (AI set aside: ${proposal.aiSetAside})` : ""}`);
        console.log(`    + ${proposal.edit.text}`);
        // The workspace after "Approve fix (simulated)": the same reply, then the tour's doc edit on top of the fix.
        const doc101 = seedSources().find((s) => s.id === proposal.doc.id)!;
        const fixed = fixOverride(doc101, proposal.after, golden.saveTime);
        const after = await runCheck({ ticketId, rail, draft: four, role, overrides: [fixed] }, deps);
        const ok = after.decision === expected;
        if (!ok) unexpected++;
        console.log(`  ${ok ? "✓" : "✗"} after approval: ${ticketId} ${after.decision}/${after.reasonCode}`);
        if (ticketId === "TCK-9001") {
          const seed103 = seedBody("DOC-103");
          for (const [name, edit] of Object.entries(tourStep5Edits)) {
            for (const [mode, save] of [["verify", verifiedSave], ["re-check", draftSave]] as const) {
              const ov = [fixed, save("DOC-103", edit(seed103), golden.saveTime)];
              const r = await runCheck({ ticketId, rail, draft: four, role, overrides: ov }, deps);
              let reply = "";
              if (r.suggestion) {
                const re = await runCheck({ ticketId, rail, draft: r.suggestion.text, role, overrides: ov }, deps);
                reply = ` · suggestion rechecks ${re.decision}/${re.reasonCode}`;
              }
              const want = mode === "verify" ? "HOLD" : "CAUTION";
              if (r.decision !== want) unexpected++;
              console.log(`  ${r.decision === want ? "✓" : "✗"} + tour ${name} ${mode}: ${r.decision}/${r.reasonCode}${reply}`);
            }
          }
        }
      }
    }
    const added = readdirSync(AI_CACHE_DIR).filter((f) => f.endsWith(".json")).length;
    console.log(`\nAdded ${added - before} saved responses (${before} → ${added}) with ${slot.name} / ${slot.model}. Unexpected: ${unexpected}`);
    process.exit(unexpected === 0 ? 0 : 1);
  }

  if (tourOnly) {
    // Step 6: the canonical 4-day reply on TCK-9001 after the visitor's edit, then "Use this reply" → Send on the suggestion.
    let unexpected = 0;
    const seed = seedBody("DOC-103");
    for (const [name, body] of Object.entries(tourStep5Edits).map(([n, f]) => [n, f(seed)] as const)) {
      for (const [mode, save, expected] of [
        ["verify", verifiedSave, "HOLD"],
        ["re-check", draftSave, "CAUTION"],
      ] as const) {
        for (const role of ["support_agent", "ops_lead"] as Role[]) {
          const overrides = [save("DOC-103", body, golden.saveTime)];
          const input = { ticketId: "TCK-9001", rail: "instant" as const, role, overrides };
          const r = await runCheck({ ...input, draft: golden.cases[0]!.draft }, deps);
          let replyNote = "";
          if (r.suggestion) {
            const re = await runCheck({ ...input, draft: r.suggestion.text }, deps);
            replyNote = ` · suggestion "${r.suggestion.text}" (${r.suggestion.origin}) rechecks ${re.decision}/${re.reasonCode}`;
          }
          const ok = r.decision === expected;
          if (!ok) unexpected++;
          console.log(`${ok ? "✓" : "✗"} ${name.padEnd(9)} ${mode.padEnd(8)} ${role.padEnd(13)} ${r.decision}/${r.reasonCode}${replyNote}`);
        }
      }
    }
    const after = readdirSync(AI_CACHE_DIR).filter((f) => f.endsWith(".json")).length;
    console.log(`\nAdded ${after - before} saved responses (${before} → ${after}) with ${slot.name} / ${slot.model}. Unexpected: ${unexpected}`);
    process.exit(unexpected === 0 ? 0 : 1);
  }

  let mismatches = 0;
  const roles: Role[] = ["support_agent", "ops_lead"];
  for (const role of roles) {
    for (const c of golden.cases) {
      const overrides = c.variant ? variantOverrides(c.variant, golden.saveTime) : [];
      const r = await runCheck({ ticketId: c.ticketId, rail: c.rail, draft: c.draft, role, overrides, decisionTime: golden.decisionTime }, deps);
      const ok = r.decision === c.expect.decision && r.reasonCode === c.expect.reasonCode;
      if (!ok) mismatches++;
      let replyNote = "";
      if (r.suggestion) {
        // "Use safe reply → Send" reruns the full check on the suggestion; record its draft extraction too.
        const re = await runCheck({ ticketId: c.ticketId, rail: c.rail, draft: r.suggestion.text, role, overrides, decisionTime: golden.decisionTime }, deps);
        const replyOk = re.decision === "ALLOW" || re.decision === "CAUTION";
        if (!replyOk) mismatches++;
        replyNote = ` · safe reply (${r.suggestion.origin}) rechecks ${re.decision}/${re.reasonCode}${replyOk ? "" : " ✗"}`;
      }
      console.log(`${ok ? "✓" : "✗"} ${role.padEnd(13)} ${c.id.padEnd(11)} ${r.decision}/${r.reasonCode}${replyNote}`);
    }
  }
  const files = readdirSync(AI_CACHE_DIR).filter((f) => f.endsWith(".json"));
  console.log(`\nRecorded ${files.length} saved responses in data/ai-cache (${slot.name} / ${slot.model}). Mismatches: ${mismatches}`);
  process.exit(mismatches === 0 ? 0 : 1);
}

void main();
