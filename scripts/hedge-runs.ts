// How steady are verdicts on hedged wording? Runs the hedged held-out cases many times on one provider, live, on the frozen prompts,
// and reports the verdict distribution per case and how many misses were strict (Hold, Double-check) or unsafe (Good to send).
// Report only: it writes evals/hedge-runs.md and .json, and never touches the held-out report or data/ai-cache.
//   pnpm tsx scripts/hedge-runs.ts                 Groq, 10 runs per case; a run that stopped continues where it stopped
//   pnpm tsx scripts/hedge-runs.ts --runs 20 --provider gemini --fresh
// Each round is a new runtime, so docs and replies are all read again. Like the eval, a provider error is retried and never scored,
// and a daily limit stops the run with exit code 3 and nothing lost (lib/ai/quota.ts).
import { loadEnvConfig } from "@next/env";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { createAiCache } from "@/lib/ai/cache";
import type { ProviderName } from "@/lib/ai/client";
import { promptFingerprint } from "@/lib/ai/fingerprint";
import { PROMPT_VERSION } from "@/lib/ai/prompts";
import { checkQuota, createGuard, QUOTA_STOP_EXIT } from "@/lib/ai/quota";
import { OUTCOME } from "@/lib/client/outcome";
import { runCheck } from "@/lib/check/runCheck";
import type { CheckDeps, OverallDecision, Rail } from "@/lib/engine/types";

loadEnvConfig(process.cwd());

/** Every held-out case with hedged wording. H20 also states no number, so its expected reason differs. */
const HEDGED = ["H2-hedged", "H14-fee-hedged-no", "H18-fee-hedged-no", "H20-vague-mid-month"];

interface Case {
  id: string;
  ticketId: string;
  rail: Rail;
  draft: string;
  exposed?: boolean;
  overrides?: unknown[];
  expect: { decision: OverallDecision; reasonCode: string };
}
interface Run {
  decision: OverallDecision;
  reasonCode: string;
  /** How the AI read the reply: each claim's topic, value and whether it was hedged. */
  claims: string[];
}
interface Progress {
  stamp: string;
  startedAt: string;
  results: Record<string, Run[]>;
  retries: number;
}

const args = process.argv.slice(2);
const argValue = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const runs = Number(argValue("--runs") ?? 10) || 10;
const provider = (argValue("--provider") ?? "groq") as ProviderName;

const root = process.cwd();
const suite = JSON.parse(readFileSync(path.join(root, "evals", "heldout.json"), "utf8")) as { frozen: { prompt: string; fingerprint: string }; decisionTime: string; cases: Case[] };
const cases = HEDGED.map((id) => {
  const c = suite.cases.find((x) => x.id === id);
  if (!c) throw new Error(`no held-out case ${id}`);
  if (c.overrides?.length) throw new Error(`${id} edits a doc, which this script doesn't apply`);
  return c;
});
// The point of this script is the frozen prompts: refuse to run on anything else.
if (PROMPT_VERSION !== suite.frozen.prompt || promptFingerprint() !== suite.frozen.fingerprint) throw new Error("the prompts have changed since the freeze");

const dir = path.join(root, "evals", ".in-progress", `hedge-${provider}`);
const progressFile = path.join(dir, "progress.json");
const stamp = JSON.stringify([PROMPT_VERSION, promptFingerprint(), provider, runs, HEDGED]);
if (args.includes("--fresh")) rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const saved = existsSync(progressFile) ? (JSON.parse(readFileSync(progressFile, "utf8")) as Progress) : null;
const p: Progress = saved?.stamp === stamp ? saved : { stamp, startedAt: new Date().toISOString(), results: {}, retries: 0 };
const save = () => writeFileSync(progressFile, JSON.stringify(p), "utf8");
const done = () => Object.values(p.results).reduce((n, r) => n + r.length, 0);

function stop(why: string): never {
  save();
  console.error(`\n${provider}: stopped: ${why}.`);
  console.error(`${done()} of ${cases.length * runs} case runs are kept in evals/.in-progress. No report was written. Re-run the same command to continue.`);
  process.exit(QUOTA_STOP_EXIT);
}

const NAME = (d: OverallDecision) => OUTCOME[d].name;

function report(model: string): void {
  type Row = { id: string; exposed: boolean; expected: string; total: number; right: number; strict: number; unsafe: number; couldnt: number; verdicts: Array<{ verdict: string; count: number }>; readings: Array<{ reading: string; count: number }> };
  const tally = (xs: string[]) => [...new Set(xs)].map((x) => ({ x, count: xs.filter((y) => y === x).length })).sort((a, b) => b.count - a.count);
  const rows: Row[] = cases.map((c) => {
    const rs = p.results[c.id] ?? [];
    const right = rs.filter((r) => r.decision === c.expect.decision && r.reasonCode === c.expect.reasonCode);
    const misses = rs.filter((r) => !right.includes(r));
    return {
      id: c.id,
      exposed: !!c.exposed,
      expected: `${NAME(c.expect.decision)} (${c.expect.reasonCode})`,
      total: rs.length,
      right: right.length,
      unsafe: misses.filter((r) => r.decision === "ALLOW").length,
      couldnt: misses.filter((r) => r.decision === "AI_UNAVAILABLE").length,
      strict: misses.filter((r) => r.decision !== "ALLOW" && r.decision !== "AI_UNAVAILABLE").length,
      verdicts: tally(rs.map((r) => `${NAME(r.decision)} (${r.reasonCode})`)).map(({ x, count }) => ({ verdict: x, count })),
      readings: tally(rs.map((r) => r.claims.join(" + ") || "no claims")).map(({ x, count }) => ({ reading: x, count })),
    };
  });
  const sum = (k: "total" | "right" | "strict" | "unsafe" | "couldnt", list = rows) => list.reduce((n, r) => n + r[k], 0);
  const clean = rows.filter((r) => !r.exposed);
  const line = (list: Row[]) => `${sum("right", list)} of ${sum("total", list)} as expected · ${sum("strict", list)} strict misses (Hold or Double-check, wrong reason) · ${sum("unsafe", list)} unsafe (Good to send) · ${sum("couldnt", list)} couldn't be checked`;
  const finished = new Date().toISOString();
  const md = `# Hedged replies, run many times

Every held-out case with hedged wording, ${runs} runs each on ${provider} \`${model}\`, live, prompt \`${PROMPT_VERSION}\`, temperature 0. ${p.startedAt} to ${finished}. Each round reads the docs and the replies again. Provider errors were retried and not scored (${p.retries}). Report only: \`pnpm tsx scripts/hedge-runs.ts\`.

A **miss** is any run that doesn't get the expected verdict and reason. **Strict** means it still can't go out unchecked: Hold or Double-check, for another reason. **Unsafe** means Good to send.

**All ${rows.length} cases:** ${line(rows)}.

**Clean cases only (${clean.length}; H14 is exposed):** ${line(clean)}.

| Case | Expected | Verdicts | As expected | Strict misses | Unsafe |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id}${r.exposed ? " (exposed)" : ""} | ${r.expected} | ${r.verdicts.map((v) => `${v.verdict}: ${v.count}`).join("<br>")} | ${r.right}/${r.total} | ${r.strict} | ${r.unsafe} |`).join("\n")}

How the AI read each reply. The rules are the same on every run, so a different verdict always comes from a different reading here:

${cases
  .map((c, i) => `- **${c.id}**: "${c.draft}"\n${rows[i]!.readings.map((v) => `  - ${v.count}×: ${v.reading}`).join("\n")}`)
  .join("\n")}

Runs close together at temperature 0 may not be independent samples: earlier sessions on one prompt gave the same answer on all 3 runs and a different one in the next session.
`;
  writeFileSync(path.join(root, "evals", "hedge-runs.md"), md, "utf8");
  writeFileSync(path.join(root, "evals", "hedge-runs.json"), `${JSON.stringify({ provider, model, promptVersion: PROMPT_VERSION, runs, startedAt: p.startedAt, finishedAt: finished, providerRetries: p.retries, rows }, null, 2)}\n`, "utf8");
  console.log(md);
  rmSync(dir, { recursive: true, force: true });
}

async function main() {
  const guard = createGuard(provider, stop, undefined, () => {
    p.retries += 1;
  });
  save();
  if (done() > 0) console.log(`${provider}: continuing (${done()} of ${cases.length * runs} case runs done).`);
  const quota = await checkQuota(provider, (cases.length * runs - done()) * 2 + runs * 6);
  for (const l of quota.lines) console.log(l);
  if (!quota.ok) stop("the quota check failed");

  let model = "";
  for (let round = 1; round <= runs; round++) {
    // This round's own folder of responses, so a stopped round continues with the same answers.
    const rt = createRuntime({ only: provider, throttle: true, cache: createAiCache({ dir: path.join(dir, `run-${round}`), maxEntries: 200 }), persist: true });
    const slot = rt.chain[0]!;
    model = slot.model;
    if (!slot.provider) throw new Error(`${provider}: no API key configured`);
    const base = aiDeps(rt);
    const deps: CheckDeps = {
      extractSource: (s) => guard(() => base.extractSource(s)),
      extractDraft: (d) => guard(() => base.extractDraft(d)),
      suggestReply: (req) => guard(() => base.suggestReply!(req)),
    };
    process.stderr.write(`[${provider}] round ${round}/${runs}\n`);
    for (const c of cases) {
      if ((p.results[c.id]?.length ?? 0) >= round) continue;
      const r = await runCheck({ ticketId: c.ticketId, rail: c.rail, draft: c.draft, role: "support_agent", overrides: [], decisionTime: suite.decisionTime }, deps);
      const claims = r.claims.filter((x) => x.reasonCode !== "TOPIC_GAP").map((x) => `${x.draftClaim.topic} ${JSON.stringify(x.draftClaim.value)} ${x.draftClaim.definitive ? "definite" : "hedged"}`);
      p.results[c.id] = [...(p.results[c.id] ?? []), { decision: r.decision, reasonCode: r.reasonCode, claims }];
      save();
      process.stderr.write(`  ${c.id}: ${r.decision}/${r.reasonCode}\n`);
    }
  }
  report(model);
}

void main();
