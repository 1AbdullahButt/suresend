# SureSend: build plan (saved as PLAN.md after approval)

## Context
A fresh folder (`D:\Project\slite`) holds only `SPEC.md` v2.2, `IMPLEMENTATION_BRIEF.md` and `KICKOFF_PROMPT.md`. The goal is SureSend: a Next.js/TypeScript demo where live AI pulls claims out of messy docs and a pure, traced rules engine returns Allow/Caution/Hold/Escalate on a support agent's draft reply. It ships as a public Vercel URL and serves as a portfolio piece for Slite. The build is driven by a gated agent loop (subagents + Node hooks) through Phases 0–4. SPEC wins over the brief.

Environment checked (read-only): Node 22.23, npm 10.9, corepack 0.34, git 2.55, gh logged in as `1AbdullahButt` (scopes include `repo` and `workflow`, so CI can be pushed), Vercel CLI 65.5, ffmpeg 9 (for the demo GIF). **pnpm is not installed.** There is no `.env.local`. The repo name `answerguard` is free on GitHub.

## Standing rules (go into CLAUDE.md)
The 7 rules from brief §7, plus rule 8, **no git worktrees**:
- Work directly in `D:\Project\slite` on `main`.
- Never run `git worktree add`, and never create sibling folders (e.g. `slite-b2`).
- For risky work, `git switch -c <branch>` in this folder. Merge back to `main` when the gate passes, delete the branch, then push.
- At the end of every phase, `git worktree list` must show only `D:\Project\slite`. Paste its output into PROGRESS.md as part of the gate evidence.
- Subagents are spawned **without** `isolation: "worktree"`.

## 1. Agent loop (built first, before Phase 0 code)
- **`.claude/agents/`**
  - `designer.md`: Phase 3 only. Writes `design/DESIGN.md` and 3 static HTML mockups.
  - `builder.md`: implements to SPEC. Never touches locked paths. Reads `.loop/qa-findings.md` when fixing.
  - `tester.md`: in Phase 0, writes T1–T8, the fixtures and the cache-identity test. After that it only runs tests and pastes the raw output.
  - `qa.md`: independent reviewer. Runs the tests and the app itself, checks SPEC acceptance and the phase gate, and writes `.loop/qa-findings.md` (file, line, expected vs actual, severity) ending in `VERDICT: APPROVED | CHANGES_REQUIRED`.
- **`.claude/hooks/protect-locked.mjs`** (PreToolUse; matcher `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell`). PowerShell and NotebookEdit are added because this machine exposes them and they would otherwise bypass the lock.
  - Inactive until `.loop/locked` exists.
  - Normalizes `\` to `/`, lowercases, and resolves paths relative to the project.
  - Blocks writes to `tests/`, `SPEC.md`, `IMPLEMENTATION_BRIEF.md`, `data/seed/`, plus extra paths listed one per line inside `.loop/locked` (used to add `e2e/` in Phase 3).
  - For shell commands, blocks the following when they target a locked path: `rm`/`del`/`Remove-Item`/`rmdir`, `mv`/`move`/`Move-Item`/`ren`, `cp`/`Copy-Item` into it, `>`/`>>`/`Out-File`/`Set-Content`/`Add-Content`/`tee`, `sed -i`, `git checkout|restore|rm|mv -- <locked>`, and `git worktree add` (blocked always, enforcing rule 8).
  - Exits 2 with a message naming the path and saying "locked by SPEC; write .loop/BLOCKER.md if a test is wrong".
- **`.claude/hooks/gate-stop.mjs`** (Stop).
  - Reads the current phase from `.loop/phase`. With no file, the loop is inactive and stopping is allowed.
  - Allows a stop if `.loop/await-human.md` or `.loop/BLOCKER.md` exists, or if PROGRESS.md's `## Phase N` section contains `GATE: PASSED` **and** at least one fenced evidence block.
  - Otherwise returns `{"decision":"block","reason":…}` naming the next loop step, inferred from state: no qa-findings → run tester+qa; `CHANGES_REQUIRED` → builder fixes; and so on.
- **`.claude/commands/build.md`** (`/build`).
  - Loop: builder → tester (real output) → qa → fix from findings → repeat.
  - Tracks attempts per issue in `.loop/attempts.json`. On the 5th failure of the same issue, it writes `.loop/BLOCKER.md` and stops.
  - A gate passes only when the tests pass **and** QA says APPROVED. On a pass: update PROGRESS.md, scan for secrets, commit "Phase N: gate passed", push, bump `.loop/phase`.
- **`.claude/settings.json`** registers both hooks with `node .claude/hooks/<x>.mjs`.
- **Canary.**
  - Create `.loop/locked`, then try a real Edit on `tests/…`, a Bash `rm tests/…` and a PowerShell `Remove-Item tests\…`.
  - Also pipe synthetic JSON with backslash paths through the hook using node.
  - Paste the blocked outputs into PROGRESS.md.

## 2. GitHub
1. `git init -b main` and `.gitignore` as specified.
2. Commit the docs (SPEC, brief, kickoff, PLAN.md, CLAUDE.md, the agent kit).
3. `gh repo create answerguard --private --source . --push` (the repo's original name; renamed `suresend` in Phase 6).
4. **Secret gate before every commit:** run `git diff --cached` and grep for `sk-ant-`, `gho_`/`ghp_`, `UPSTASH_REDIS_REST_TOKEN=.+` and generic `(api[_-]?key|token|secret)\s*[:=]\s*\S{12,}`. A hit aborts the commit. This is wrapped in `scripts/precommit-scan.mjs`, also installed as `.git/hooks/pre-commit`.
5. Every passed gate gets a commit and push named "Phase N: gate passed", followed by `git worktree list` evidence.
6. CI: `.github/workflows/ci.yml` runs `pnpm test` plus the Playwright e2e with `AI_MODE=saved`.

## 3. Phases

### Phase 0: setup and lock
- **pnpm**: install with `corepack enable pnpm`, falling back to `npm i -g pnpm`. Recorded in DECISIONS.md.
- **Hand-scaffold** Next.js 15 (App Router, React 19, TS strict + `noUncheckedIndexedAccess`). `create-next-app` refuses a non-empty folder. Files: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`.
- **Dependencies**: zod, lucide-react, @anthropic-ai/sdk, @upstash/ratelimit, @upstash/redis, vitest, @playwright/test.
- **Seed data, Appendix A verbatim**:
  - `data/seed/docs/{DOC-101,DOC-103,SRC-202,DOC-104,DOC-105}.md` hold the bodies.
  - `sources.json` holds the metadata.
  - `tickets.json` holds the tickets.
  - Bodies are copied byte-exact from SPEC (en dashes, emoji, HTML comment).
- **Test seams and stubs.**
  - The gate needs tests to *fail on behaviour, not imports*, so Phase 0 writes `lib/engine/types.ts` (exact SPEC 6.2/6.3/12 interfaces).
  - It also writes stub modules that `throw new Error("NOT_IMPLEMENTED")`:
    - `lib/check/runCheck.ts`: `runCheck(input, deps)`
    - `lib/check/handlers.ts`: `handleCheck(body, deps)` and `handleSend(body, deps)`, returning `{status, body}`
    - `lib/engine/decide.ts`
    - `lib/ai/cache.ts`
  - `deps = { extractDraft, extractSource, suggestReply?, now }`. This is how fixtures and the T5 spy get injected. The route files become thin wrappers in Phase 1.
- **Tests (tester agent)** in `tests/engine/t1-hold … t8-extraction-gap.test.ts`, plus `tests/ai/cache-identity.test.ts`.
  - The cache-identity test is written now because `tests/` locks at the end of this phase. It is expected to fail until Phase 2.
  - Fixtures go in `tests/fixtures/extractions/*.json`: every seed source, every B-variant needed, the drafts, a DOC-104 without the injection line, and error markers for T8(b/c).
  - All tests use a fixed `decisionTime` of 2026-10-30.
- **Before locking**, QA reviews the tests line-by-line against SPEC §14. A wrong locked test would need you to unlock it.
- Then create `.loop/locked` and run the canary.
- **Gate evidence**:
  - raw `pnpm test` output: 9 files run; T1–T8 fail with `NOT_IMPLEMENTED` or assertion errors, and no import or syntax errors
  - the canary outputs
  - QA APPROVED
  - `git worktree list`

### Phase 1: rules engine (no AI code)
- **Engine modules**:
  - `lib/engine/{standing,applicability,resolve,decide,patterns,normalize,severity}.ts`
  - `lib/workspace/{seed,merge,permissions}.ts`
  - `lib/check/runCheck.ts` and `handlers.ts`
  - `lib/replies/templates.ts`
- **Thin routes**: `app/api/{seed,check,send}/route.ts`, with zod-validated bodies.
- Every rule appends a trace entry.
- Permissions filter **before** any extraction.
- **Safe-reply recheck**: the HOLD template is rechecked with a deterministic draft claim (we wrote the span ourselves), so no AI call is needed. The ESCALATE template is asserted to have no digits, no day/hour words and no detector hit.
- **Gate**: T1–T8 pass on fixtures (raw output pasted) + typecheck + QA APPROVED + worktree list. The cache test may still fail, and that is noted.

### Phase 2: live AI
- **Pause rule**: no `.env.local` key exists today. I first build everything that doesn't need a key: prompts, schemas, `validateQuote`, the cache with identity files, the limiter (in-memory now, Upstash-ready), the record/eval scripts, and golden.json. Then I write `.loop/await-human.md` and stop.
- **Files**: `lib/ai/{client,prompts,schemas,extractSource,extractDraft,suggestReply,cache,validateQuote}.ts`, `lib/rateLimit.ts`, `scripts/{record-ai-cache,eval}.ts`, `evals/golden.json`, `evals/results.md`, `data/ai-cache/*.json`.
- **Structured output**: tool schema → zod → retry once → reject. I'll load the `claude-api` skill first for the current Haiku 5.5 structured-output API.
- **golden.json has 12 cases**:
  - 3 canonical tickets
  - B1–B7
  - TCK-9001 with a "1 business day" draft (ALLOW)
  - a draft with no claim (ALLOW `NO_POLICY_CLAIM`)
- The eval bypasses the cache so all 3 runs are real calls.
- **Gate**:
  - `pnpm eval` shows the canonical tickets plus B1, B2, B3 and B7 correct on 3/3 runs (spec gate ∪ brief gate)
  - cache recorded
  - with the key unset and `AI_MODE=saved`, canonical results reproduce (output pasted)
  - full test suite including the cache test passes
  - QA APPROVED
  - If the eval fails: fix the prompts or schema only.

### Phase 3: design, then UI
- **Designer** writes `design/DESIGN.md` and 3 mockups (HOLD + Check tab, Reasoning expanded, Sources editing). I take Playwright screenshots of the mockups, then write `.loop/await-human.md` and **stop for your approval**.
- **After approval**:
  - The tester writes `e2e/demo.spec.ts` (role/label selectors), and `e2e/` is appended to `.loop/locked`.
  - The builder builds the components listed in brief §3: shell, inbox, panel with 4 tabs, states (empty, checking with progress steps, AI unavailable, rate-limited, invalid output), and responsive slide-over/bottom sheet.
  - Every screen gets the disclaimer footer, and there are no Slite brand assets.
- **Gate**:
  - Playwright e2e passes in saved mode
  - QA screenshots each state at 1440/1024/390 and compares them with the mockups
  - axe-core accessibility scan: no serious or critical issues
  - QA APPROVED

### Phase 4: send, metrics, deploy
- `/api/send` blocked UI (409 inline, CAUTION ack checkbox, 503 retry).
- Impact tab (3 metrics, n<3 guard, "Simulated · this browser").
- 5-step skippable tour.
- README with an architecture diagram, the AI-vs-rules table and eval numbers.
- GIF from a Playwright video converted with ffmpeg.
- **Then I write `.loop/await-human.md` and stop** for:
  - Vercel login/link
  - Upstash via the Marketplace
  - a dedicated Anthropic workspace, key and spend limit, plus whether it is a hard stop
  - setting env vars
- Afterwards I deploy and run QA against the **deployed** URL, using SPEC §18 item by item (mobile viewport smoke test).
- The narrated 4-minute walkthrough video is yours to record. I'll provide the script and the tour.

## 4. Risks, mainly live extraction
| Risk | Effect | Mitigation |
|---|---|---|
| DOC-101 "Do NOT promise same day" extracted as a second claim | A same-day candidate disagrees inside DOC-101 → TCK-9003 ESCALATE | The prompt says negated/prohibited statements are not claims. An eval case catches it. |
| SRC-202 scoped `any` instead of `instant` | D11(b) fires on TCK-9003 → false CAUTION | Scope prompt rule. Eval on TCK-9003. |
| Model writes `-` for the en dash in "Outgoing Transfers – Reversal SOP" | QUOTE_NOT_FOUND kills the supersession → falls to D6 (still HOLD, but the D5 trace story breaks) | See Q2. |
| B2 still says "reversed within 1 business day" assertively | Model labels it `in_force` → HOLD instead of CAUTION | statusWording examples. The whole doc's status line governs. |
| Scope taken from a title (B3) | ESCALATE becomes HOLD | Prompt rule. Fallback is a `scopeQuote` field validated as a substring. |
| Model invents `effectiveFrom` from "reviewed in Sept" | Could disturb D5 condition 4 | Prompt: only explicit "Effective …" dates. |
| Temperature 0 is still not perfectly deterministic | 3/3 can flake | Tighten prompts and enum descriptions. Never touch rules or tests. |
| A locked test turns out to be wrong | Loop cannot fix it | QA reviews before the lock. Otherwise BLOCKER → you. |
| B5 "future" date goes stale | Demo breaks later | Use 2030-01-01 in the variant. |
| Public URL cost | Spend | Layered limits per SPEC 10. Cache hits are free. |

## 5. Spec ambiguities: my default unless you say otherwise
1. **Q1 "Contradicts" across units (D11(b), D1, D4).** Brief §5 makes SRC-202's "1 day" calendar days. If a unit difference counts as a contradiction, T6 (1 business day, instant → ALLOW) becomes CAUTION CHANGE_SIGNALLED. Default: D11(b) compares **amount ranges only** (unit-only differences are noted in the trace). D4/D1 "agree" requires the same amount and unit.
2. **Q2 Quote normalization.** SPEC says "normalize whitespace". Default: whitespace + NFKC + folding dash/quote variants (– — ‑ → -, smart quotes → straight), applied to both sides. Documented as a stated extension.
3. **Q3 D0b vs D0c overlap.** A draft with only "24 hours" (topic `other`) matches both. Default: if every detector match falls inside an extracted claim's span → D0c `OUTSIDE_COVERAGE`. Any uncovered match → D0b `EXTRACTION_GAP`.
4. **CheckResult has no overall reason field** for D0a/b/d or the `SOURCE_UNREAD` cap. Default: extend it, without changing existing fields, with `reasonCode`, `caps[]` and `patternMatches[]`.
5. **Hedged contradiction** has no reason code. Default: `HEDGED_CONTRADICTION` (CAUTION).
6. **Supersession title match.** The metadata title says "Outgoing Transfers: Reversal SOP" while the text says "– Reversal SOP". Default normalization: lowercase, every non-alphanumeric run → one space, then containment.
7. **T5 "no substring of its body"** taken literally (any one character) is untestable. Default: no line of the body ≥ 12 chars, no title, no `DOC-105`/`FR-HOLD`/`CMP-7`, and no visible-source count reveals hidden sources.
8. **Phase 2's cache test** must go into locked `tests/`, so it is written in Phase 0. `e2e/` is locked after it is written in Phase 3.
9. **Next.js 15** per the brief (not 16), pinned.

## 6. Questions for you
- Are defaults Q1–Q3 OK? Those three change outcomes. The rest are cosmetic.
- Is it OK to install pnpm globally (corepack or npm -g)?
- GitHub repo `answerguard`, private, under `1AbdullahButt`: confirm.

## Verification summary
Every gate pastes raw command output (`pnpm test`, `pnpm typecheck`, `pnpm eval`, `pnpm e2e`, `git worktree list`) plus the QA verdict into PROGRESS.md. The Stop hook refuses to end a phase without `GATE: PASSED` plus an evidence block. The final gate is QA against the deployed Vercel URL, using SPEC §18.

## 7. Amendments after approval (2026-10-30)
- **AI provider → Groq** (amends SPEC §10, recorded in DECISIONS.md; SPEC.md untouched).
  `lib/ai/client.ts` is a provider adapter: `AI_PROVIDER=groq` (default) uses Groq's OpenAI-compatible
  Chat Completions API with JSON-schema structured output; `AI_PROVIDER=anthropic` keeps an Anthropic
  adapter, off by default. Env: `GROQ_API_KEY`, `GROQ_MODEL`, `AI_PROVIDER`. Provider and model are part
  of the cache identity. Groq 429 → saved responses + "Live AI paused" badge.
  If the eval cannot reach 3/3 with Groq after prompt fixes → `.loop/await-human.md`, do not switch models/providers.
- Phase 2 pause condition is now "no `GROQ_API_KEY`" (present, so no pause).
- Open questions answered by default: Q1–Q3 defaults adopted; pnpm installed via corepack; repo `answerguard` private.

## 8. Phase 5: Design v2 (added 2026-10-31, approved by Abdullah)
Brief: `design/v2/REDESIGN_PROMPT.md`; artboards `design/v2/*.dc.html`; contract `design/v2/UI-CONTRACT.md`; D-026.
- Restyle and simplify the UI to design v2 (Send runs the check, 3 cards, 2 tabs, plain outcome names, Demo menu, v2 tokens,
  responsive, tour copy). Engine, AI pipeline, API and engine tests unchanged.
- One-time unlock of the demo test folder; the tester rewrites the spec for the same journey; QA compares it with the old
  test; re-lock afterwards.
- **Gate:** typecheck, full test suite, rewritten e2e and the axe audit (1440/1024/390: 0 serious/critical, no horizontal
  scroll, AA contrast) all pass; screenshots of each v2 state at 1440 and 390 compared side by side with the artboards by QA;
  QA APPROVED; re-locked; deployed to Vercel production and smoke-tested (desktop + phone); `git worktree list` clean.

## 9. Phase 6: rename to SureSend (added 2026-10-31, approved by Abdullah)
- Rename AnswerGuard → SureSend everywhere user-facing or public (D-031); GitHub repo → `suresend`; Vercel project →
  `suresend` with https://suresend-demo.vercel.app as production (the fallback: suresend.vercel.app stayed "assigned to
  another project", D-032) and https://answerguard.vercel.app redirecting to it (308).
- **Gate:** typecheck, all tests, e2e and the axe audit (1440/1024/390) pass; GIF re-recorded; deployed; live check that the
  header says SureSend and both URLs load; QA APPROVED; `git worktree list` clean.

## 10. Phase 7: review fixes (added 2026-11-01, approved by Abdullah)
Fixes from the independent pre-sharing review (D-034). The engine, locked tests and seed data stay untouched.
- **Docs and repo:** README accuracy pass (eval table labelled as the tuned demo set, held-out results beside it, video
  placeholder removed, Slite claims limited to the confirmed list, send-integrity limitation), MIT LICENSE, repo
  description/homepage/topics, `docs/VIDEO_SCRIPT.md` in `.gitignore`.
- **Hardening:** security headers (`frame-ancestors 'none'`, nosniff, referrer and permissions policies), postcss advisory
  override, CI `permissions: contents: read` + SHA-pinned actions + concurrency, generic 500 bodies with server-side logging,
  idle IPs dropped from the in-memory limiter.
- **Demo resilience:** Upstash via the Vercel Marketplace (shared per-IP + daily limiter); tour step 5's edit always replays
  saved responses, never live AI.
- **UI:** a hint under the pre-filled composer; the suggested-reply label says why when it's Double-check.
- **Eval:** held-out cases the prompts were never tuned on, reported in their own table.
- **Gate:** typecheck, all tests, e2e, axe audit (1440/1024/390), `pnpm audit` with no high/moderate, held-out eval run on
  both providers and reported; deployed; live check of headers, Upstash in use, tour step 5 replaying saved responses and both
  URLs; QA APPROVED; `git worktree list` clean.

## 11. Phase 8: MCP check_reply tool (added 2026-11-01, approved by Abdullah)
SureSend as a capability any agent can call (D-036). The engine, locked tests and seed data stay untouched.
- **Server:** remote MCP at `/api/mcp` (Streamable HTTP, stateless, JSON responses) on the existing Vercel app, plus a stdio
  entry (`scripts/mcp-stdio.ts`) for Claude Code and Claude Desktop.
- **Tools** (read-only, seed workspace, support-agent persona): `check_reply` (through `handleCheck`), `list_tickets`,
  `get_doc` (never DOC-105). Descriptions tell agents to check before sending and to use the suggested reply or ask a human
  on Hold or Ask first.
- **Safety:** same zod validation and caps, the shared Upstash limiter with its own MCP budget, generic errors, no auth
  (public synthetic demo, stated in the tools and the README).
- **Gate:** typecheck, all tests (tool unit tests incl. DOC-105 never returned and the 4-day Hold with a 1-day suggestion, plus
  an in-memory MCP client test), e2e and axe unchanged, `pnpm mcp:e2e` against the local build and the deployed
  `/api/mcp`, README "Use it from Claude" and `docs/MCP_DEMO.md`; QA APPROVED; deployed; `git worktree list` clean.

## 12. Phase 9: Fix the doc (added 2026-11-01, approved by Abdullah)
A Hold or Ask first is a signal that a doc taught the agent the wrong value; SureSend proposes a fix to that doc and a person
approves it, like Slite's Triage (D-037). The engine, locked tests and seed data stay untouched; an approved fix is an
ordinary client-side doc edit.
- **Source:** the visible general doc (all rails, in force) whose claim matches the held reply's value, when an in-force
  exception in another doc gives that rail a different value. Otherwise no proposal.
- **Proposal:** AI-drafted minimal edit (template fallback), validated (only the claim sentence; the exception's value exactly;
  no other numbers; the general value kept) and offered only if the canonical replies keep their decisions with it applied.
- **UI:** "Fix the doc that caused this" on Hold/Ask first → Triage-style review in the Docs tab (why, changed lines only,
  Approve fix (simulated) / Dismiss); "Docs causing held replies" in the Demo menu; tour step 5 of 6.
- **MCP:** read-only `propose_doc_fix`.
- **Gate:** typecheck, all tests (source matching, validation, canonical recheck, DOC-105, MCP applies nothing, saved replay),
  e2e and axe, browser checks of the review and the tour, `pnpm mcp:e2e` local and live; QA APPROVED; deployed;
  `git worktree list` clean.

## 13. Phase 10: a second topic, fee_refund (added 2026-11-02, approved by Abdullah)
Prove the rules generalise: adding a topic is a taxonomy entry, extraction examples and a comparator, with zero changes to
the decision rules S, A, D0–D11 (D-041). Topic: is the transfer fee refunded when a transfer fails (yes/no, scoped by rail;
DOC-101 §4 already states it). The engine's rule logic, `data/seed`, `SPEC.md`, the brief and the locked tests stay untouched.
- **Engine:** a comparator registry keyed by value kind (`lib/engine/values.ts`; the duration comparison moved in unchanged)
  and a topic taxonomy (`lib/topics`). The rules call the registries and never name a topic
  (`lib/engine/topicAgnostic.test.ts`). Done first as a behaviour-identical refactor (snapshot 68/68 identical).
- **Topic:** `lib/topics/feeRefund.ts` plus a boolean comparator, in a commit that touches no rule file.
- **Replies with several claims:** a decision per claim, the most severe overall, one card per claim in Why and Trace, and a
  suggested reply that fixes only the wrong claim.
- **Coverage:** amounts on other topics (fee amounts, limits) carry a value, so D0c's OUTSIDE_COVERAGE applies to them.
- **Demo:** "Try another reply" presets in the composer, replaying saved responses. No new tickets; the tour is unchanged.
- **Evals:** fee cases in the golden set; 4–6 held-out fee cases written before any fee prompt work; both providers, 3 runs.
- **MCP:** `check_reply` covers the topic and returns a verdict per claim; an MCP e2e case for the two-claim reply.
- **Gate:** typecheck, all tests, e2e, axe; `pnpm record` re-records every saved response and
  `scripts/snapshot-results.ts` shows every canonical, tour and Fix-the-doc decision and reason code unchanged; evals on
  both providers published as they are; `git diff` on the rule files, tests, seed and spec; README "Adding a topic"; D-041;
  QA APPROVED; deployed; `git worktree list` clean.

## 14. Phase 11: fixes from the independent review (added 2026-11-02, Abdullah's brief)
Branch `phase-11`. No merge or deploy until QA approves. In order:
1. **P0-1, a wrong reply passes and the UI celebrates it.** (a) The sent card never claims correctness. (b) The draft prompt extracts
   valueless claims on covered topics; prompt version bumped. (c) A reply that makes no claim on the topic the customer asked about is a
   Double-check, generically (no topic names in `decide.ts`). (d) The repro and 5 natural variants as tests, written first and recorded
   failing. (e) Limitations states the cost.
2. **P0-3.** "SureSend" replaces "Slite Agent" as panel title and actor; one "Independent concept for Slite Agent" tag; OG image checked.
3. **P1-1.** A claim with no value shows the governing value. 4. **P1-3.** The slide-over closes when the conversation changes.
5. **P1-4.** The tour offer doesn't come back after "Not now". 6. **P1-5.** ESLint and a lint script. 7. **P1-2.** README states scope is one axis.
Then re-record, check the 68 saved results, rerun golden and held-out on Groq (3 runs), Gemini when its quota allows (separate commit if
not). README: the 41% line matches the source's subgroup wording; no team-size claim about Slite.
- **Gate:** typecheck, lint, all tests, e2e, axe; the 6 tests recorded failing, then passing; every changed saved result explained by the
  new rule; evals published as they are; D-045 onward; QA APPROVED; then merged, deployed, pushed; `git worktree list` clean.

## 15. Phase 12: a European-friendly demo, and fixes from the re-check (added 2026-11-03, Abdullah's brief)
Branch `phase-12`. Tests first, QA, then merge and deploy. Part A, under a one-time unlock of `data/seed/`, SPEC.md Appendix A, `tests/` and `e2e/`, recorded in DECISIONS.md with the diff and re-locked after: Léa, Lukas and Sofia on the same personas and rails; euros; "instant transfer" and "standard transfer" for the rail, with the code field left as `rail`; the GIF, the OG image and the video script's names.
Part B: 1. the pills and Demo menu reachable beside the slide-over at 700–1100 px, verified at 1024. 2. The topic-gap copy as a missing answer. 3. Each claim's value text when two share a span. 4. "A couple of" is 2 and "a few" stays vague, with held-out cases committed first and the Hold rate on paraphrased wrong timelines reported. 5. No "for instant transfers" when the governing doc covers all. 6. No scrollbar on the pill strip. 7. D-045 corrected.
Then re-record, confirm decisions and reason codes for every saved result except those Part B means to change, and rerun Groq golden and held-out; Gemini when its quota allows, in its own commit. The README isn't cut in this phase.
- **Gate:** typecheck, lint, all tests, e2e, axe, the slide-over check at 1024; new checks recorded failing, then passing; the saved results compared; evals published as they are; QA APPROVED; the re-lock proven; then merged, deployed, pushed; `git worktree list` clean.

**Phase 12, second round (added 2026-11-03, Abdullah's decision).** Branch `phase-12b`. A claim dropped for a bad quote caps the reply at Double-check, with QA's repro as a failing test first, and D0a amended in DECISIONS.md. Doc owners get European names. "About a week" stays a Double-check (D-058), and the "Standard transfers" headline stays (D-056). Then Groq golden and held-out; Gemini after the 08:07 UTC reset, in its own commit; QA, then merge and deploy.

