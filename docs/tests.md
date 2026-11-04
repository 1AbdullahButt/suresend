# Tests, and running it locally

[Back to the README](../README.md)

## Tests

| | What | Result |
|---|---|---|
| `pnpm test` | Locked acceptance tests T1–T8 (engine on hand-written fixtures), cache-identity test, unit tests (incl. saved-response replay for the tour, the doc fix and the presets; Fix the doc; the fee topic; the guard that the rules name no topic; vague replies and rule D0e; a claim dropped for a bad quote; that a suggestion's check matches its Send; the copy rules; number words; the seed against SPEC Appendix A; the quota guard; held-out integrity; and the MCP tools, also over an in-memory MCP client, and the `/api/mcp` route) | 484 passed |
| `snapshot-results.ts` | Every saved path's decision and reason code, before and after Phase 12's new docs, names and prompts: golden, presets, tour, doc fix | 132 of 132 keep their decision, reason and each claim's verdict. On 4 paths, the tour's digit-only edit, the suggested reply now comes from the AI's rewrite instead of the template. After the cap on dropped claims and the new doc owners: 132 of 132 identical again |
| `scripts/slide-over-check.ts` | With the slide-over open at 1099, 1024, 900 and 700 px: the pills and Demo menu on top and working, by mouse and keyboard; Esc and focus; no scrollbar on the strip; a short screen's overlay; Send uncovered in the tour | 51 passed; on the old production site, 22 of the 24 that ran failed |
| `pnpm lint` | ESLint, `next/core-web-vitals` and `next/typescript`, no warnings allowed | clean |
| `pnpm mcp:e2e <url>` | The MCP client SDK against `/api/mcp` over HTTP: tools, tickets, docs (DOC-105 refused), Hold / Ask first / Good to send, a two-claim reply and a doc-fix proposal, all on saved responses | passed (local and live) |
| `pnpm exec playwright test` | One e2e in saved mode: wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped | passed |
| `pnpm eval` | 25 golden cases (3 canonical tickets, Appendix B variants B1–B7, a 1-day Allow, a no-claim draft, 7 fee cases, 6 vague replies) × 3 runs, per provider | see [evals](evals.md) |
| `pnpm eval --heldout` | 25 clean held-out cases, and 14 exposed ones reported apart, × 3 runs, per provider | see [evals](evals.md) |
| `scripts/hedge-runs.ts` | The 4 hedged held-out cases × 10 runs on Groq, on the previous prompt (`2026-11-02.6`) | 34/40 as expected; 6 strict misses; 0 Good to send |
| `scripts/ui-audit.ts` | axe-core + screenshots, 10 states × 1440/1024/390 | 0 serious/critical, no horizontal scroll |

The eval results themselves are in [Evals and results](evals.md).

## Run it

```bash
pnpm install
cp .env.example .env.local   # add GROQ_API_KEY (and GEMINI_API_KEY for the fallback), or set AI_MODE=saved
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm test` | Acceptance + unit tests (fixtures, no network) |
| `pnpm lint` | ESLint, no warnings allowed |
| `pnpm e2e` | Playwright demo flow in saved mode |
| `pnpm eval` | Live eval on both providers → `evals/results.md` |
| `pnpm eval --saved` | Replays saved responses only (no key needed) |
| `pnpm eval --heldout` | Live held-out cases on both providers → `evals/heldout.md` (report only) |
| `pnpm tsx scripts/hedge-runs.ts` | The hedged held-out cases, 10 runs each on Groq: verdict distribution, strict and unsafe misses → `evals/hedge-runs.md` (report only) |
| | `pnpm eval` and `pnpm record` check the provider's quota first and stop on the first daily limit or an outage (exit code 3) without changing that provider's report. A provider error gives no answer, so it's retried and never scored. Re-running an eval continues it: finished cases keep their results, and a provider that already finished isn't run again (`--fresh` forces it) |
| `pnpm record` | Re-records all of `data/ai-cache/` with the primary provider: golden cases, presets, the tour's doc edit, Fix the doc. Built aside; replaces the folder only if it finishes with nothing unexpected |
| `pnpm record --resume` | Continues a recording that stopped on a quota limit |
| `pnpm record --tour-edits` | Adds only what the tour's step-6 doc edit needs; never clears existing saved responses |
| `pnpm mcp:e2e [url]` | Checks an MCP endpoint end to end (default `http://127.0.0.1:3100/api/mcp`) |
| `pnpm record --fix-edits` | Adds only what Fix the doc needs on the canonical path; never clears existing saved responses |
| `pnpm record --presets` | Adds only the composer's "Try another reply" presets; never clears existing saved responses |
| `pnpm tsx scripts/snapshot-results.ts <out.json> [--compare <before.json>]` | Every saved path's decision and reason code (golden, tour, Fix the doc) on saved responses only, compared with an earlier run |

## The build loop

Built by Claude Code with a gated agent loop (builder, tester, QA and designer subagents; a hook that locks the tests and
the spec; a Stop hook that refuses to end a phase without evidence). The log with real test output for every phase is in
[PROGRESS.md](../PROGRESS.md); every judgment call is in [DECISIONS.md](../DECISIONS.md).
