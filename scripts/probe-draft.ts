// Debug helper: one provider's live reading of the vague golden replies (or any reply), through the full check.
//   pnpm tsx scripts/probe-draft.ts groq                     every golden case whose id starts with "vague-"
//   pnpm tsx scripts/probe-draft.ts groq TCK-9001 "A reply"  one reply on one seed ticket, at that ticket's rail
import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { createAiCache } from "@/lib/ai/cache";
import type { ProviderName } from "@/lib/ai/client";
import { summarize } from "@/lib/client/outcome";
import { runCheck } from "@/lib/check/runCheck";
import type { CheckInput } from "@/lib/engine/types";
import { seedTickets } from "@/lib/workspace/seed";

loadEnvConfig(process.cwd());

type Row = { id: string; ticketId: string; rail: CheckInput["rail"]; draft: string };

async function main() {
  const [provider = "groq", ticketId, reply] = process.argv.slice(2);
  const golden = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "golden.json"), "utf8")) as { decisionTime: string; cases: Row[] };
  const ticket = seedTickets().find((t) => t.id === ticketId);
  const rows: Row[] = ticket && reply ? [{ id: "reply", ticketId: ticket.id, rail: ticket.rail, draft: reply }] : golden.cases.filter((c) => c.id.startsWith("vague-"));
  const deps = aiDeps(createRuntime({ only: provider as ProviderName, cache: createAiCache() }));
  for (const c of rows) {
    const r = await runCheck({ ticketId: c.ticketId, rail: c.rail, draft: c.draft, role: "support_agent", overrides: [], decisionTime: golden.decisionTime }, deps);
    const s = summarize(r, c.rail);
    console.log(`${c.id} [${c.ticketId} ${c.rail}] ${r.decision}/${r.reasonCode} (${s.name}, AI ${r.ai.mode})`);
    console.log(`  reply: ${c.draft}`);
    for (const x of r.claims) console.log(`  claim: ${x.draftClaim.topic} "${x.draftClaim.span}" value=${JSON.stringify(x.draftClaim.value)} → ${x.decision}/${x.reasonCode}${x.governing ? `, docs say ${x.governing.valueText}` : ""}`);
    console.log(`  card:  ${s.headline}. ${s.sentence}`);
  }
}

void main();
