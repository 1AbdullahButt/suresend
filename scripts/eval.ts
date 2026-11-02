// Live-AI eval (SPEC §14, brief Phase 2, DECISIONS D-017). Runs every golden case N times (default 3) against each
// provider and reports decision accuracy, quote validity and extraction field accuracy. Writes
// evals/results-<provider>.md per provider and evals/results.md with both sections plus the provider selection:
// whichever passes the gate becomes AI_PROVIDER, the other AI_FALLBACK_PROVIDER; if both pass, fewer quote rejections wins.
//
// Calls are throttled per provider to stay under free tiers (Groq ~8K tokens/min, Gemini Flash-Lite ~500 requests/day).
// Within one run, identical inputs (same task + text) are extracted once and shared across cases; every run starts
// with an empty cache, so the runs are independent model calls.
//
//   pnpm eval                       both providers, 3 runs each, gate enforced (exit 1 if neither passes)
//   pnpm eval --provider gemini     one provider (its section in results.md is replaced, the other kept)
//   pnpm eval --runs 1              quicker smoke run
//   pnpm eval --combine             rebuild results.md from results-<provider>.json (no model calls)
//   pnpm eval --saved               replay data/ai-cache only (AI_MODE=saved, no key needed), configured provider chain
//   pnpm eval --heldout             the held-out cases in evals/heldout.json (D-035): live, both providers, report-only
//                                   → evals/heldout.md; never touches results.md, the provider selection or data/ai-cache
//   pnpm eval ... --fresh           drop an unfinished run of the same suite and provider and start over
//
// Checks the provider's quota first and stops on the first daily limit (lib/ai/quota.ts, exit code 3). A provider's report
// files are only written once all its runs finish. Until then its responses and scores are kept in evals/.in-progress, and
// re-running the same command continues exactly where it stopped: same responses, same scores, no second attempts.
import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runCheck } from "@/lib/check/runCheck";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { createAiCache } from "@/lib/ai/cache";
import type { ProviderName } from "@/lib/ai/client";
import { FIX_PROMPT_VERSION, PROMPT_VERSION, REPLY_PROMPT_VERSION } from "@/lib/ai/prompts";
import { checkQuota, guarded, QUOTA_STOP_EXIT } from "@/lib/ai/quota";
import { SCHEMA_VERSION } from "@/lib/ai/schemas";
import { isVerbatim } from "@/lib/engine/normalize";
import { sameValue } from "@/lib/engine/values";
import { isCovered } from "@/lib/topics";
import { draftSave, variantOverrides, verifiedSave, type VariantId } from "@/lib/workspace/variants";
import type { CheckDeps, DraftClaim, SourceClaim, SourceOverride } from "@/lib/engine/types";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const argValue = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const savedMode = args.includes("--saved");
const heldOutMode = args.includes("--heldout");
if (savedMode && heldOutMode) throw new Error("--heldout runs live only: held-out cases are never recorded (D-035)");
if (savedMode) process.env.AI_MODE = "saved";
const runs = savedMode ? 1 : Number(argValue("--runs") ?? 3) || 3;
const onlyProvider = argValue("--provider") as ProviderName | undefined;
const providers: ProviderName[] = onlyProvider ? [onlyProvider] : ["groq", "gemini"];

/** A held-out case's doc edit: the body as saved with "Save and verify" or "Save and re-check", or the doc removed. */
interface OverrideSpec {
  id: string;
  save?: "verify" | "draft";
  body?: string;
  deleted?: boolean;
}

interface GoldenCase {
  id: string;
  note?: string;
  ticketId: string;
  rail: "instant" | "standard" | "unknown";
  draft: string;
  variant?: VariantId | null;
  overrides?: OverrideSpec[];
  /** Held-out only (D-041): its wording was seen while the prompts or golden set were written, so it is reported apart. */
  exposed?: boolean;
  expect: { decision: string; reasonCode: string; suggestionIncludes?: string };
}

interface Suite {
  decisionTime: string;
  saveTime: string;
  gate?: string[];
  cases: GoldenCase[];
}

const root = process.cwd();
const loadSuite = (file: string) => JSON.parse(readFileSync(path.join(root, "evals", file), "utf8")) as Suite;
const golden = loadSuite("golden.json");
const suite = heldOutMode ? loadSuite("heldout.json") : golden;

function overridesFor(c: GoldenCase, saveTime: string): SourceOverride[] {
  if (c.overrides) {
    return c.overrides.map((o) =>
      o.deleted ? { id: o.id, deleted: true } : (o.save === "draft" ? draftSave : verifiedSave)(o.id, o.body ?? "", saveTime),
    );
  }
  return c.variant ? variantOverrides(c.variant, saveTime) : [];
}

// Expected extractions (the hand-written test fixtures, read-only) for field accuracy.
const fixtureDir = path.join(root, "tests", "fixtures", "extractions");
const norm = (s: string) => s.replace(/\r\n/g, "\n").trimEnd();
const sourceFixtures = readdirSync(path.join(fixtureDir, "sources")).map(
  (f) => JSON.parse(readFileSync(path.join(fixtureDir, "sources", f), "utf8")) as { sourceId: string; variant: string; body: string; claims: SourceClaim[] },
);
const draftFixtures = readdirSync(path.join(fixtureDir, "drafts")).map(
  (f) => JSON.parse(readFileSync(path.join(fixtureDir, "drafts", f), "utf8")) as { draft: string; claims: DraftClaim[] },
);

interface CaseRun {
  decision: string;
  reasonCode: string;
  ok: boolean;
  note: string;
}

interface ProviderReport {
  provider: string;
  model: string;
  runs: number;
  promptVersion: string;
  fieldsCorrect: number;
  fieldsTotal: number;
  gatePass: boolean;
  quoteRejections: number;
  markdown: string;
}

/** Scores for one group of cases: the clean ones, or the exposed ones (held-out only). */
interface Tally {
  fieldsCorrect: number;
  fieldsTotal: number;
  quotesValid: number;
  quotesTotal: number;
}
const emptyTally = (): Tally => ({ fieldsCorrect: 0, fieldsTotal: 0, quotesValid: 0, quotesTotal: 0 });

/** What a stopped run keeps in evals/.in-progress, written after every finished case. */
interface Progress {
  /** Prompts, schema, suite and model: a different stamp means these results no longer apply. */
  stamp: string;
  startedAt: string;
  run: number;
  results: Record<string, CaseRun[]>;
  clean: Tally;
  exposed: Tally;
  fieldMisses: string[];
  /** This run's scored inputs: each is scored once per run. */
  scoredSources: string[];
  scoredDrafts: string[];
}

const progressDir = (provider: ProviderName) => path.join(root, "evals", ".in-progress", `${heldOutMode ? "heldout" : "golden"}-${provider}`);

function loadProgress(provider: ProviderName, stamp: string): Progress {
  const dir = progressDir(provider);
  const file = path.join(dir, "progress.json");
  if (!args.includes("--fresh") && existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, "utf8")) as Progress;
    if (saved.stamp === stamp) return saved;
    console.log(`${provider}: an unfinished run used other prompts or cases; starting over.`);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return { stamp, startedAt: new Date().toISOString(), run: 1, results: {}, clean: emptyTally(), exposed: emptyTally(), fieldMisses: [], scoredSources: [], scoredDrafts: [] };
}

function fieldOf(c: SourceClaim, name: string): unknown {
  switch (name) {
    case "value":
      return c.value;
    case "rail":
      return c.scope.rail;
    case "statusWording":
      return c.statusWording;
    case "effectiveFrom":
      return c.effectiveFrom;
    case "supersedes":
      return !!c.supersedes;
    default:
      return true;
  }
}

async function evalProvider(provider: ProviderName | null): Promise<ProviderReport> {
  // Clean cases first, so the docs they share are scored with them and the exposed cases add only what's theirs.
  const ordered = [...suite.cases.filter((c) => !c.exposed), ...suite.cases.filter((c) => c.exposed)];
  const stamp = createHash("sha256")
    .update(JSON.stringify([PROMPT_VERSION, REPLY_PROMPT_VERSION, FIX_PROMPT_VERSION, SCHEMA_VERSION, runs, suite]))
    .digest("hex");
  const p: Progress = provider
    ? loadProgress(provider, stamp)
    : { stamp, startedAt: new Date().toISOString(), run: 1, results: {}, clean: emptyTally(), exposed: emptyTally(), fieldMisses: [], scoredSources: [], scoredDrafts: [] };
  const caseRunsDone = () => Object.values(p.results).reduce((n, r) => n + r.length, 0);
  const caseRunsTotal = ordered.length * runs;
  const saveProgress = () => {
    if (provider) writeFileSync(path.join(progressDir(provider), "progress.json"), JSON.stringify(p), "utf8");
  };
  const stop = (why: string): never => {
    console.error(`\n${provider}: stopped: ${why}.`);
    console.error(`${caseRunsDone()} of ${caseRunsTotal} case runs are done and kept in evals/.in-progress. No report file was changed. Re-run the same command to continue.`);
    process.exit(QUOTA_STOP_EXIT);
  };
  const guard = <T>(fn: () => Promise<T>): Promise<T> => (savedMode ? fn() : guarded(provider!, fn, stop));

  if (provider) {
    if (caseRunsDone() > 0) console.log(`${provider}: continuing an unfinished run (${caseRunsDone()} of ${caseRunsTotal} case runs done).`);
    // Per run: the docs once each, then each case's reply and, on a Hold, its suggestion and recheck.
    const calls = (caseRunsTotal - caseRunsDone()) * 2 + (runs - p.run + 1) * 10;
    const quota = await checkQuota(provider, calls);
    for (const line of quota.lines) console.log(line);
    if (!quota.ok) stop("the quota check failed");
  }

  let tally = p.clean;
  const scoreSource = (body: string, sourceId: string, claims: SourceClaim[]) => {
    for (const c of claims) {
      tally.quotesTotal++;
      if (isVerbatim(c.quote, body) && (!c.supersedes || isVerbatim(c.supersedes.quote, body))) tally.quotesValid++;
    }
    const fx = sourceFixtures.find((f) => f.sourceId === sourceId && norm(f.body) === norm(body));
    if (!fx) return;
    for (const want of fx.claims.filter((x) => x.value !== null)) {
      const same = (c: SourceClaim) => !!c.value && !!want.value && sameValue(c.value, want.value);
      const got = claims.find((c) => c.topic === want.topic && same(c)) ?? claims.find((c) => c.topic === want.topic);
      const checks: Array<[string, boolean]> = [
        ["found", !!got],
        ["value", !!got && same(got)],
        ["rail", got?.scope.rail === want.scope.rail],
        ["statusWording", got?.statusWording === want.statusWording],
        ["effectiveFrom", (got?.effectiveFrom ?? null) === want.effectiveFrom],
        ["supersedes", !!got?.supersedes === !!want.supersedes],
      ];
      for (const [name, ok] of checks) {
        tally.fieldsTotal++;
        if (ok) tally.fieldsCorrect++;
        else p.fieldMisses.push(`${sourceId}/${fx.variant} ${want.topic} ${name}: want ${JSON.stringify(fieldOf(want, name))} got ${JSON.stringify(got ? fieldOf(got, name) : null)}`);
      }
    }
  };

  const scoreDraft = (draft: string, claims: DraftClaim[]) => {
    for (const c of claims) {
      tally.quotesTotal++;
      if (isVerbatim(c.span, draft)) tally.quotesValid++;
    }
    const fx = draftFixtures.find((f) => f.draft === draft);
    if (!fx) return;
    const want = fx.claims[0];
    const got = want ? claims.find((c) => c.topic === want.topic) : undefined;
    const checks: Array<[string, boolean]> = want
      ? [
          ["found", !!got],
          ["value", !!got && !!got.value && !!want.value && sameValue(got.value, want.value)],
          ["definitive", got?.definitive === want.definitive],
        ]
      : [["no claim", claims.filter((c) => isCovered(c.topic)).length === 0]];
    for (const [name, ok] of checks) {
      tally.fieldsTotal++;
      if (ok) tally.fieldsCorrect++;
      else p.fieldMisses.push(`draft "${draft.slice(0, 40)}" ${name}`);
    }
  };

  let model = "";
  let providerName = "";
  for (let run = p.run; run <= runs; run++) {
    if (run !== p.run) {
      p.run = run;
      p.scoredSources = [];
      p.scoredDrafts = [];
      saveProgress();
    }
    process.stderr.write(`[${provider ?? "saved"}] run ${run}/${runs}\n`);
    // Live: this run's own folder of responses, so a stopped run continues with the same answers.
    const rt = savedMode
      ? createRuntime()
      : createRuntime({ only: provider!, throttle: true, cache: createAiCache({ dir: path.join(progressDir(provider!), `run-${run}`), maxEntries: 1000 }), persist: true });
    const slot = rt.chain[0]!;
    model = slot.model;
    providerName = savedMode ? rt.chain.map((s) => s.name).join(" → ") : slot.name;
    if (!savedMode && !slot.provider) throw new Error(`${provider}: no API key configured`);
    const base = aiDeps(rt);
    const scoredSources = new Set<string>(p.scoredSources);
    const scoredDrafts = new Set<string>(p.scoredDrafts);
    const deps: CheckDeps = {
      extractSource: (s) =>
        guard(() => base.extractSource(s)).then((r) => {
          const key = `${s.id}\n${s.body}`;
          if (!scoredSources.has(key)) {
            scoredSources.add(key);
            scoreSource(s.body, s.id, r.claims);
          }
          return r;
        }),
      extractDraft: (d) =>
        guard(() => base.extractDraft(d)).then((r) => {
          if (!scoredDrafts.has(d)) {
            scoredDrafts.add(d);
            scoreDraft(d, r.claims);
          }
          return r;
        }),
      suggestReply: (req) => guard(() => base.suggestReply!(req)),
    };
    for (const c of ordered) {
      if ((p.results[c.id]?.length ?? 0) >= run) continue; // done before the stop
      tally = c.exposed ? p.exposed : p.clean;
      const overrides = overridesFor(c, suite.saveTime);
      let entry: CaseRun;
      try {
        const r = await runCheck({ ticketId: c.ticketId, rail: c.rail, draft: c.draft, role: "support_agent", overrides, decisionTime: suite.decisionTime }, deps);
        const suggestionOk = !c.expect.suggestionIncludes || (r.suggestion?.text.includes(c.expect.suggestionIncludes) ?? false);
        const ok = r.decision === c.expect.decision && r.reasonCode === c.expect.reasonCode && suggestionOk;
        entry = {
          decision: r.decision,
          reasonCode: r.reasonCode,
          ok,
          note: ok ? "" : `${!suggestionOk ? `suggestion "${r.suggestion?.text ?? "none"}"; ` : ""}rejected ${r.rejectedExtractions.length}`,
        };
      } catch (e) {
        entry = { decision: "ERROR", reasonCode: "-", ok: false, note: e instanceof Error ? e.message : String(e) };
      }
      p.results[c.id] = [...(p.results[c.id] ?? []), entry];
      p.scoredSources = [...scoredSources];
      p.scoredDrafts = [...scoredDrafts];
      saveProgress();
      process.stderr.write(`  ${entry.ok ? "✓" : "✗"} ${c.id}: ${entry.decision}/${entry.reasonCode}${entry.note ? ` (${entry.note})` : ""}\n`);
    }
  }

  const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);
  const gate = suite.gate ?? [];
  const section = (cases: GoldenCase[], t: Tally) => {
    let ok = 0;
    let total = 0;
    const rows = cases.map((c) => {
      const rs = p.results[c.id] ?? [];
      const okCount = rs.filter((r) => r.ok).length;
      ok += okCount;
      total += rs.length;
      const label = heldOutMode ? (c.note ?? "") : gate.includes(c.id) ? "gate" : "";
      return `| ${c.id} | ${label} | ${c.expect.decision} / ${c.expect.reasonCode} | ${rs
        .map((r) => (r.ok ? "✓" : `✗ ${r.decision}/${r.reasonCode}`))
        .join(" · ")} | ${okCount}/${rs.length} |`;
    });
    const quoteRejections = t.quotesTotal - t.quotesValid;
    return {
      summary: `- Decision accuracy: **${pct(ok, total)}** (${ok}/${total})
- Quote validity: **${pct(t.quotesValid, t.quotesTotal)}** (${t.quotesValid}/${t.quotesTotal} extracted quotes/spans verbatim; ${quoteRejections} rejected)`,
      table: `| Case | ${heldOutMode ? "What it probes" : ""} | Expected | Runs | Correct |
|---|---|---|---|---|
${rows.join("\n")}`,
    };
  };
  const gatePass = gate.every((id) => {
    const rs = p.results[id] ?? [];
    return rs.length === runs && rs.every((r) => r.ok);
  });
  const cleanCases = ordered.filter((c) => !c.exposed);
  const exposedCases = ordered.filter((c) => c.exposed);
  const clean = section(cleanCases, p.clean);
  const exposed = exposedCases.length ? section(exposedCases, p.exposed) : null;
  const fieldMisses = [...new Set(p.fieldMisses)];
  const markdown = `## ${providerName} · \`${model}\`${savedMode ? " (saved responses replay, AI_MODE=saved)" : ""}

- Runs per case: ${runs} · started: ${p.startedAt} · finished: ${new Date().toISOString()}${savedMode ? "" : " · throttled"}
${heldOutMode ? `\n**Clean held-out cases (${cleanCases.length})**\n\n` : ""}${clean.summary}
- Extraction field accuracy (vs hand-written fixtures${heldOutMode ? "; seed docs only, the reworded texts have none" : ""}): **${pct(p.clean.fieldsCorrect, p.clean.fieldsTotal)}** (${p.clean.fieldsCorrect}/${p.clean.fieldsTotal})
${heldOutMode ? "" : `- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **${gatePass ? "PASS" : "FAIL"}**\n`}
${clean.table}
${exposed ? `\n**Exposed cases (${exposedCases.length}): regression only, not held-out**\n\n${exposed.summary}\n\n${exposed.table}\n` : ""}${fieldMisses.length ? `\nField misses:\n${fieldMisses.map((m) => `- ${m}`).join("\n")}\n` : ""}`;
  return {
    provider: providerName,
    model,
    runs,
    promptVersion: PROMPT_VERSION,
    fieldsCorrect: p.clean.fieldsCorrect,
    fieldsTotal: p.clean.fieldsTotal,
    gatePass,
    quoteRejections: p.clean.quotesTotal - p.clean.quotesValid,
    markdown,
  };
}

function writeCombined() {
  const dir = path.join(root, "evals");
  const files = (["groq", "gemini"] as const).filter((p) => existsSync(path.join(dir, `results-${p}.json`)));
  // Only complete 3-run reports for the current prompt version count toward the selection (stale/smoke runs don't).
  const reports = files
    .map((p) => JSON.parse(readFileSync(path.join(dir, `results-${p}.json`), "utf8")) as ProviderReport)
    .filter((r) => r.runs >= 3 && r.promptVersion === PROMPT_VERSION);
  // D-017: fewer quote rejections wins; D-019 tie-breaks: higher field accuracy, then the incumbent primary (groq, fixed).
  // Fixed order (not the caller's env) so the selection is reproducible: groq is the incumbent primary (D-001).
  const incumbent = "groq";
  const acc = (r: ProviderReport) => (r.fieldsTotal ? r.fieldsCorrect / r.fieldsTotal : 0);
  const passing = reports
    .filter((r) => r.gatePass)
    .sort((a, b) => a.quoteRejections - b.quoteRejections || acc(b) - acc(a) || Number(b.provider === incumbent) - Number(a.provider === incumbent));
  const primary = passing[0];
  const runnerUp = passing[1];
  const fallback = reports.find((r) => r !== primary);
  let why = primary ? `Only ${primary.provider} passed the gate.` : "";
  if (primary && runnerUp) {
    if (primary.quoteRejections !== runnerUp.quoteRejections) {
      why = `Both passed the gate; ${primary.provider} had fewer quote rejections (${primary.quoteRejections} vs ${runnerUp.quoteRejections}).`;
    } else if (acc(primary) !== acc(runnerUp)) {
      why = `Both passed the gate with ${primary.quoteRejections} quote rejections each; ${primary.provider} had higher field accuracy.`;
    } else {
      why = `Both passed the gate and tied on every metric (${primary.quoteRejections} quote rejections each, equal field accuracy); the incumbent primary (${primary.provider}) is kept.`;
    }
  }
  const selection = primary
    ? `**Selection:** \`AI_PROVIDER=${primary.provider}\`${fallback ? `, \`AI_FALLBACK_PROVIDER=${fallback.provider}\`` : ""}. ${why}`
    : "**Selection:** no provider passed the gate.";
  const md = `# Live-AI eval results

${golden.cases.length} golden cases (\`evals/golden.json\`: the 3 canonical tickets, Appendix B variants B1–B7, a 1-business-day ALLOW,
a no-claim draft and the fee cases), each run 3× per provider, prompt version \`${PROMPT_VERSION}\`. The gate is the canonical tickets plus
B1, B2, B3 and B7 correct on every run. Only complete 3-run reports for this prompt version are listed and used for selection.

${selection}

${reports.map((r) => r.markdown).join("\n")}`;
  writeFileSync(path.join(dir, "results.md"), md, "utf8");
  console.log(md);
  return primary;
}

/** evals/heldout.md from heldout-<provider>.json: report-only, no gate and no provider selection (D-035). */
function writeHeldOut() {
  const dir = path.join(root, "evals");
  const all = (["groq", "gemini"] as const)
    .filter((p) => existsSync(path.join(dir, `heldout-${p}.json`)))
    .map((p) => JSON.parse(readFileSync(path.join(dir, `heldout-${p}.json`), "utf8")) as ProviderReport);
  // Only complete reports for these prompts: a stale one would read as a result for them.
  const reports = all.filter((r) => r.runs >= 3 && r.promptVersion === PROMPT_VERSION);
  const missing = (["groq", "gemini"] as const).filter((p) => !reports.some((r) => r.provider === p));
  const clean = suite.cases.filter((c) => !c.exposed);
  const exposed = suite.cases.filter((c) => c.exposed);
  const md = `# Held-out eval results

${clean.length} clean held-out cases (\`evals/heldout.json\`), run with prompt \`${PROMPT_VERSION}\`. Each runs 3× per provider, live. Report only: no gate, not used for the provider selection, never recorded into \`data/ai-cache\`. Failures are reported as they are.

- **H1–H10** (the timeline) were written after the prompts were frozen at \`2026-10-30.2\`: reworded drafts, a reworded SOP on both rails, a reworded Slack proposal, a calendar-day reply, a hedge, an unknown rail, an injection inside the draft and a no-claim reply. H1 and H5 reuse phrases that older prompt already had, so they're easier than they look.
- **H12** (the fee) was written before any fee prompt text existed and shares no wording with the prompts, schema, golden set or presets.
- **H17–H19** (the fee) were written after the prompts were frozen at \`${PROMPT_VERSION}\`, with wording used nowhere in those files: two claims after a doc edit, a hedge, and an amount outside coverage.

${exposed.length} exposed cases (${exposed.map((c) => c.id.split("-")[0]).join(", ")}) no longer count as held-out and are reported separately as regression cases. Their wording was seen while the prompts or golden set were being written, even where it was later removed (D-041).
${missing.length ? `\nNot run yet on this prompt: ${missing.join(", ")}.\n` : ""}
${reports.map((r) => r.markdown).join("\n")}`;
  writeFileSync(path.join(dir, "heldout.md"), md, "utf8");
  console.log(md);
}

async function main() {
  if (heldOutMode) {
    for (const p of providers) {
      try {
        const r = await evalProvider(p);
        writeFileSync(path.join(root, "evals", `heldout-${p}.json`), JSON.stringify(r, null, 2), "utf8");
        rmSync(progressDir(p), { recursive: true, force: true });
      } catch (e) {
        console.error(`${p}: held-out eval could not run: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    writeHeldOut();
    process.exit(0);
  }
  if (args.includes("--combine")) {
    // Rebuild evals/results.md from the existing results-<provider>.json files without new model calls.
    process.exit(writeCombined() ? 0 : 1);
  }
  if (savedMode) {
    const r = await evalProvider(null);
    console.log(r.markdown);
    process.exit(r.gatePass ? 0 : 1);
  }
  for (const p of providers) {
    try {
      const r = await evalProvider(p);
      writeFileSync(path.join(root, "evals", `results-${p}.json`), JSON.stringify(r, null, 2), "utf8");
      writeFileSync(path.join(root, "evals", `results-${p}.md`), r.markdown, "utf8");
      rmSync(progressDir(p), { recursive: true, force: true });
    } catch (e) {
      console.error(`${p}: eval could not run: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const primary = writeCombined();
  process.exit(primary ? 0 : 1);
}

void main();
