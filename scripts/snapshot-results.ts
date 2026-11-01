// Phase 10 gate helper (D-041): the decision and reason code of every saved path the demo relies on, on saved responses
// only (live AI refused, so a missing response shows up as "paused", never as a silent live call). Run it before and after
// a change that re-records data/ai-cache, then diff the two files:
//   pnpm tsx scripts/snapshot-results.ts evals/snapshots/before.json
//   pnpm tsx scripts/snapshot-results.ts evals/snapshots/after.json --compare evals/snapshots/before.json
// Covers the golden cases (both personas, plus "Use this reply → Send"), the guided tour's doc edit (both ways of typing
// it, saved with verify and with re-check), and Fix the doc (the proposal, the reply after approval, and the tour's edit
// on top of it). The MCP tools run the same runCheck, so their results are these too.
import { loadEnvConfig } from "@next/env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { aiDeps, aiFixDeps, createRuntime } from "@/lib/ai/aiDeps";
import { runCheck } from "@/lib/check/runCheck";
import { fixOverride, proposeFix } from "@/lib/fix/propose";
import { seedSources } from "@/lib/workspace/seed";
import { draftSave, seedBody, variantOverrides, verifiedSave, type VariantId } from "@/lib/workspace/variants";
import { tourStep5Edits } from "@/lib/workspace/variantBodies";
import type { CheckInput, CheckResult, Role, SourceOverride } from "@/lib/engine/types";

loadEnvConfig(process.cwd());
process.env.AI_MODE = "saved";

interface Row {
  id: string;
  decision: string;
  reasonCode: string;
  claims: string[];
  suggestion: string | null;
  aiMode: string;
}

const args = process.argv.slice(2);
const outFile = args.find((a) => a.endsWith(".json") && args[args.indexOf(a) - 1] !== "--compare");
const compareFile = args.includes("--compare") ? args[args.indexOf("--compare") + 1] : undefined;
if (!outFile) throw new Error("usage: snapshot-results.ts <out.json> [--compare <before.json>]");

const golden = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "golden.json"), "utf8")) as {
  decisionTime: string;
  saveTime: string;
  cases: Array<{ id: string; ticketId: string; rail: CheckInput["rail"]; draft: string; variant?: VariantId | null }>;
};
const ROLES: Role[] = ["support_agent", "ops_lead"];
const FOUR = "Failed transfers are reversed within 4 business days.";

const rt = createRuntime({ liveGate: async () => false });
const deps = aiDeps(rt);
const fixDeps = aiFixDeps(rt);

const row = (id: string, r: CheckResult): Row => ({
  id,
  decision: r.decision,
  reasonCode: r.reasonCode,
  claims: r.claims.map((c) => `${c.draftClaim.topic}:${c.decision}/${c.reasonCode}`),
  suggestion: r.suggestion ? `${r.suggestion.origin}→${r.suggestion.recheckDecision}` : null,
  aiMode: r.ai.mode,
});

async function withReply(rows: Row[], id: string, input: CheckInput): Promise<void> {
  const r = await runCheck(input, deps);
  rows.push(row(id, r));
  if (r.suggestion) rows.push(row(`${id} → Use this reply → Send`, await runCheck({ ...input, draft: r.suggestion.text }, deps)));
}

async function main() {
  const rows: Row[] = [];
  // Golden cases that existed before Phase 10 (the fee cases, ids "fee-…", are new and have no "before").
  for (const role of ROLES) {
    for (const c of golden.cases.filter((x) => !x.id.startsWith("fee-"))) {
      const overrides: SourceOverride[] = c.variant ? variantOverrides(c.variant, golden.saveTime) : [];
      await withReply(rows, `golden ${c.id} (${role})`, { ticketId: c.ticketId, rail: c.rail, draft: c.draft, role, overrides, decisionTime: golden.decisionTime });
    }
  }
  // Guided tour step 6: the doc edit typed two ways, saved with verify or re-check, then Send on the suggestion.
  const seed103 = seedBody("DOC-103");
  for (const [name, edit] of Object.entries(tourStep5Edits)) {
    for (const [mode, save] of [["verify", verifiedSave], ["re-check", draftSave]] as const) {
      for (const role of ROLES) {
        const overrides = [save("DOC-103", edit(seed103), golden.saveTime)];
        await withReply(rows, `tour edit ${name} ${mode} (${role})`, { ticketId: "TCK-9001", rail: "instant", draft: FOUR, role, overrides });
      }
    }
  }
  // Fix the doc: the proposal for the canonical Hold and Ask first, the reply after approval, the tour edit on top.
  for (const role of ROLES) {
    for (const [ticketId, rail] of [["TCK-9001", "instant"], ["TCK-9002", "unknown"]] as const) {
      const { proposal, why } = await proposeFix({ ticketId, rail, draft: FOUR, role }, deps, fixDeps);
      rows.push({
        id: `fix proposal ${ticketId} (${role})`,
        decision: proposal ? "PROPOSAL" : "NONE",
        reasonCode: proposal ? `${proposal.doc.id} ${proposal.origin}` : (why ?? ""),
        claims: proposal ? proposal.recheck.map((x) => `${x.ticketId}/${x.rail}: ${x.decision}`) : [],
        suggestion: null,
        aiMode: "saved",
      });
      if (!proposal) continue;
      const doc = seedSources().find((s) => s.id === proposal.doc.id)!;
      const fixed = fixOverride(doc, proposal.after, golden.saveTime);
      await withReply(rows, `after fix ${ticketId} (${role})`, { ticketId, rail, draft: FOUR, role, overrides: [fixed] });
      if (ticketId !== "TCK-9001") continue;
      for (const [name, edit] of Object.entries(tourStep5Edits)) {
        for (const [mode, save] of [["verify", verifiedSave], ["re-check", draftSave]] as const) {
          const overrides = [fixed, save("DOC-103", edit(seed103), golden.saveTime)];
          await withReply(rows, `after fix + tour edit ${name} ${mode} (${role})`, { ticketId, rail, draft: FOUR, role, overrides });
        }
      }
    }
  }

  mkdirSync(path.dirname(outFile!), { recursive: true });
  writeFileSync(outFile!, JSON.stringify(rows, null, 2) + "\n");
  const paused = rows.filter((r) => r.aiMode !== "saved").length;
  console.log(`${rows.length} results → ${outFile} (${paused} not on saved responses)`);

  if (compareFile) {
    const before = new Map((JSON.parse(readFileSync(compareFile, "utf8")) as Row[]).map((r) => [r.id, r]));
    let same = 0;
    const diffs: string[] = [];
    for (const r of rows) {
      const b = before.get(r.id);
      if (!b) continue;
      const key = (x: Row) => `${x.decision}/${x.reasonCode} [${x.claims.join(", ")}] suggestion ${x.suggestion ?? "none"}`;
      if (key(b) === key(r)) same++;
      else diffs.push(`${r.id}\n  before: ${key(b)}\n  after:  ${key(r)}`);
    }
    const missing = [...before.keys()].filter((id) => !rows.some((r) => r.id === id));
    console.log(`Compared with ${compareFile}: ${same} identical, ${diffs.length} different, ${missing.length} missing.`);
    for (const d of diffs) console.log(d);
    for (const m of missing) console.log(`missing: ${m}`);
    process.exit(diffs.length || missing.length || paused ? 1 : 0);
  }
  process.exit(paused ? 1 : 0);
}

void main();
