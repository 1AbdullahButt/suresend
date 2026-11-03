// Debug helper: one provider's live reading of the vague golden replies (or any reply), through the full check.
//   pnpm tsx scripts/probe-draft.ts groq                     every golden case whose id starts with "vague-"
//   pnpm tsx scripts/probe-draft.ts groq TCK-9001 "A reply"  one reply on one seed ticket, at that ticket's rail
//   pnpm tsx scripts/probe-draft.ts groq --para 3 [H32,H34]  the held-out paraphrased wrong timelines, N fresh readings each
//   pnpm tsx scripts/probe-draft.ts groq --spans 10 "A reply"  N fresh readings: how many have a span that isn't verbatim
import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { createAiCache } from "@/lib/ai/cache";
import type { ProviderName } from "@/lib/ai/client";
import { summarize } from "@/lib/client/outcome";
import { runCheck } from "@/lib/check/runCheck";
import { isVerbatim } from "@/lib/engine/normalize";
import type { CheckInput } from "@/lib/engine/types";
import { seedTickets } from "@/lib/workspace/seed";

loadEnvConfig(process.cwd());

type Row = { id: string; ticketId: string; rail: CheckInput["rail"]; draft: string; expect?: { decision: string; reasonCode: string } };

/** A span that isn't verbatim drops its claim, and with no claim left the check can't run. How often does this reply get one? */
async function spans(provider: string, runs: number, reply: string) {
  let bad = 0;
  let read = 0;
  const seen = new Set<string>();
  for (let i = 0; i < runs; i++) {
    const deps = aiDeps(createRuntime({ only: provider as ProviderName, throttle: true, cache: createAiCache() }));
    // A provider error gives no reading to count, and it says so rather than reading as 0 of 0.
    const r = await deps.extractDraft(reply).catch((e: unknown) => {
      console.error(`  no reading: ${e instanceof Error ? e.message.slice(0, 160) : "provider error"}`);
      return null;
    });
    if (!r) continue;
    read++;
    const wrong = r.claims.filter((c) => !isVerbatim(c.span, reply));
    if (wrong.length) bad++;
    for (const c of wrong) seen.add(c.span);
  }
  console.log(`${bad} of ${read} readings had a span that isn't verbatim: "${reply.slice(0, 50)}…"`);
  for (const s of seen) console.log(`  "${s}"`);
}

/** Each round is a new runtime, so the docs and replies are read again. Prints the verdicts per case and the totals. */
async function paraphrases(provider: string, runs: number, only?: string) {
  const suite = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "heldout.json"), "utf8")) as { decisionTime: string; cases: Row[] };
  const rows = suite.cases.filter((c) => c.id.includes("-para-") && (!only || only.split(",").some((x) => c.id.startsWith(`${x}-`))));
  const verdicts = new Map<string, string[]>(rows.map((c) => [c.id, []]));
  for (let run = 1; run <= runs; run++) {
    const deps = aiDeps(createRuntime({ only: provider as ProviderName, throttle: true, cache: createAiCache() }));
    for (const c of rows) {
      const r = await runCheck({ ticketId: c.ticketId, rail: c.rail, draft: c.draft, role: "support_agent", overrides: [], decisionTime: suite.decisionTime }, deps);
      const read = r.claims.filter((x) => x.reasonCode !== "TOPIC_GAP").map((x) => `${JSON.stringify(x.draftClaim.value)} ${x.draftClaim.definitive ? "definite" : "hedged"}`);
      verdicts.get(c.id)!.push(`${r.decision}/${r.reasonCode} [${read.join(" + ") || "no claims"}]`);
    }
  }
  const all = [...verdicts.values()].flat();
  const count = (d: string) => all.filter((v) => v.startsWith(`${d}/`)).length;
  for (const c of rows) {
    console.log(`${c.id} (expected ${c.expect?.decision}/${c.expect?.reasonCode})
  reply: ${c.draft}`);
    for (const v of new Set(verdicts.get(c.id))) console.log(`  ${verdicts.get(c.id)!.filter((x) => x === v).length}× ${v}`);
  }
  console.log(`
Total ${all.length} readings: Hold ${count("HOLD")}, Double-check ${count("CAUTION")}, Ask first ${count("ESCALATE")}, Good to send ${count("ALLOW")}, couldn't check ${count("AI_UNAVAILABLE")}`);
}

async function main() {
  const [provider = "groq", ticketId, reply] = process.argv.slice(2);
  if (ticketId === "--para") return paraphrases(provider, Number(reply) || 3, process.argv[5]);
  if (ticketId === "--spans") return spans(provider, Number(reply) || 10, process.argv[5] ?? "");
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
