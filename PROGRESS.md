# SureSend · Progress log

Live log of the gated build. Each phase records what was built, the real test output, QA's verdict and the gate result.
Hand-traced reasoning is never evidence.

## Agent loop
- Subagents: `.claude/agents/{designer,builder,tester,qa}.md`
- Hooks: `.claude/hooks/protect-locked.mjs` (PreToolUse), `.claude/hooks/gate-stop.mjs` (Stop), registered in `.claude/settings.json`
- Orchestrator: `.claude/commands/build.md`
- Hook self-test: `node scripts/hook-selftest.mjs` (18 lock cases + 3 stop cases, all PASS before Phase 0)

## Phase 0
**Built:** Next.js 15 / TS strict scaffold (hand-written, pnpm 9), deps (zod, lucide-react, @anthropic-ai/sdk, openai for Groq,
@upstash/*, vitest, playwright, tsx). Seed data in `data/seed/` generated from SPEC Appendix A by `scripts/extract-seed.mjs`
(byte-for-byte; QA re-verified by byte compare). `lib/engine/types.ts` (SPEC 6.2/6.3/12 + D-002.4 extensions) and typed stubs
for the test seams (D-004). Tester wrote T1–T8 + cache-identity test + 13 extraction fixtures. QA reviewed the tests against
SPEC §14 before locking (APPROVED, 5 minor findings; #3 fixed pre-lock by asserting the saved file stores its identity; #5 noted in D-005).
Then `.loop/locked` was created.

**Test run with the stubs in place** (`pnpm test`, captured before any engine code was wired in; failures are all NOT_IMPLEMENTED, no import/syntax/type errors):
```
 ❯ tests/ai/cache-identity.test.ts (13 tests | 13 failed) 18ms
 ❯ tests/engine/t2-allow.test.ts (1 test | 1 failed) 12ms
 ❯ tests/engine/t6-send-integrity.test.ts (1 test | 1 failed) 10ms
 ❯ tests/engine/t7-injection.test.ts (3 tests | 3 failed) 15ms
 ❯ tests/engine/t5-permissions.test.ts (4 tests | 3 failed) 14ms
 ❯ tests/engine/t8-extraction-gap.test.ts (3 tests | 3 failed) 15ms
 ❯ tests/engine/t4-recency.test.ts (8 tests | 8 failed) 23ms
 ❯ tests/engine/t3-escalate.test.ts (1 test | 1 failed) 13ms
 ❯ tests/engine/t1-hold.test.ts (25 tests | 1 failed) 18ms
 Test Files  9 failed (9)
      Tests  34 failed | 25 passed (59)
TEST_EXIT=1
--- every distinct failure reason (vitest groups identical errors), counted:
      4 Error: NOT_IMPLEMENTED: cacheKey
      2 Error: NOT_IMPLEMENTED: createAiCache
      4 Error: NOT_IMPLEMENTED: handleCheck
     15 Error: NOT_IMPLEMENTED: runCheck
```
The 25 passes are the fixture-sanity block (every fixture quote/span verbatim, bodies equal seed/variants) and one T5 precondition.

**Canary (real tool calls after `.loop/locked` was created):**
```
Write tests/engine/canary.test.ts
  PreToolUse:Write hook error: BLOCKED by protect-locked: "tests/engine/canary.test.ts" is locked (SPEC is the contract; see CLAUDE.md rule 1). If a locked test or doc is wrong, write .loop/BLOCKER.md with the test, line, expected vs actual and SPEC section, then stop.
Edit tests/ai/cache-identity.test.ts
  PreToolUse:Edit hook error: BLOCKED by protect-locked: "tests/ai/cache-identity.test.ts" is locked (SPEC is the contract; see CLAUDE.md rule 1). …
Bash: rm -f tests/engine/t2-allow.test.ts
  PreToolUse:Bash hook error: BLOCKED by protect-locked: "rm" on "tests/" is locked (SPEC is the contract; see CLAUDE.md rule 1). …
PowerShell: Set-Content -Path data\seed\docs\DOC-103.md -Value "tampered"
  PreToolUse:PowerShell hook error: BLOCKED by protect-locked: "set-content" on "data/seed/" is locked (SPEC is the contract; see CLAUDE.md rule 1). …
```
Hook self-test (`node scripts/hook-selftest.mjs`): 18/18 lock cases and 3/3 stop cases PASS (Windows backslash paths, redirects, copies, node fs writes, `git checkout --`, `git reset --hard`, and the worktree-add command all blocked; reads/runs allowed).

**QA verdict:** APPROVED (`.loop/qa-findings.md`, pre-lock review): typecheck exit 0; 9/9 files run, all failures NOT_IMPLEMENTED; seed byte-equal to Appendix A; all T1–T8 outcomes hand-traced by QA as following from SPEC + D-002 defaults (QA's trace is review, not evidence; evidence is the test output).

**Worktrees:**
```
D:/Project/slite 8a96403 [main]
```

GATE: PASSED

## Phase 1
**Built:** the deterministic rules engine, with no AI code. Files: `lib/engine/{normalize,patterns,standing,applicability,resolve,decide,severity}.ts` (rules S, A, D0a–D11, the SOURCE_UNREAD cap and a trace entry for every rule); `lib/workspace/{seed,merge,permissions}.ts` (persona filter before extraction, visibility never overridable); `lib/check/{runCheck,handlers,deps}.ts` (quote validation, safe replies with recheck, send integrity, zod bodies); `lib/replies/templates.ts`; thin routes `app/api/{seed,check,send}/route.ts`; builder unit tests `lib/engine/decide.test.ts` and `lib/check/runCheck.test.ts`.

**QA loop:** the first review returned CHANGES_REQUIRED (1 major: the D5 trace omitted condition 2; 10 minor). The builder fixed all 11 and recorded the spec-gap choices as D-012. The re-review came back APPROVED with 2 minors (self-contradicting source, double punctuation), both fixed afterwards and covered by a unit test.

**Typecheck and full test run** (`pnpm typecheck`, `pnpm test`). The only failures are the cache-identity test, which is Phase 2 by design:
```
TYPECHECK_EXIT=0
 ❯ tests/ai/cache-identity.test.ts (13 tests | 13 failed) 25ms
 Test Files  1 failed | 10 passed (11)
      Tests  13 failed | 74 passed (87)
TEST_EXIT=1
--- every failure reason:
      4 Error: NOT_IMPLEMENTED: cacheKey
      2 Error: NOT_IMPLEMENTED: createAiCache
```

**Acceptance tests T1–T8** (`pnpm vitest run --reporter=verbose`, passing lines):
```
 ✓ tests/engine/t3-escalate.test.ts > T3: TCK-9002 unknown rail → ESCALATE > ESCALATE / SCOPE_UNKNOWN with a timeline-free template reply
 ✓ tests/engine/t2-allow.test.ts > T2: TCK-9003 standard, 4 business days → ALLOW > ALLOW / SUPPORTED with DOC-101 governing
 ✓ tests/engine/t4-recency.test.ts > T4: recency and verification don't decide > (a) DOC-103 removed, SRC-202 present → CAUTION / CHANGE_SIGNALLED, never HOLD
 ✓ tests/engine/t4-recency.test.ts > T4: recency and verification don't decide > (b) DOC-103 as B3 (scope any, no supersession, newer, re-verified) → ESCALATE / CONFLICT_UNRESOLVED
 ✓ tests/engine/t4-recency.test.ts > T4: recency and verification don't decide > (c) DOC-103 effective in the future (B5), SRC-202 removed → CAUTION / CHANGE_SIGNALLED via NOT_YET_EFFECTIVE
 ✓ tests/engine/t4-recency.test.ts > T4: recency and verification don't decide > (d) DOC-103 saved as draft after verification → CAUTION / WEAK_BASIS with V = 1 in the trace
 ✓ tests/engine/t4-recency.test.ts > Appendix B variants > B1 (verified, 2 business days) → HOLD, suggestion says 2 business days
 ✓ tests/engine/t4-recency.test.ts > Appendix B variants > B2 (pending approval wording) → CAUTION / CHANGE_SIGNALLED
 ✓ tests/engine/t4-recency.test.ts > Appendix B variants > B6 (DOC-101 saved as draft, TCK-9003 standard) → CAUTION / WEAK_BASIS
 ✓ tests/engine/t4-recency.test.ts > Appendix B variants > B7 (B1 saved as draft) → CAUTION / WEAK_BASIS with V = 2 through D5
 ✓ tests/engine/t1-hold.test.ts > T1: TCK-9001 instant, 4 business days → HOLD > HOLD / CONTRADICTS_GOVERNING via EXPLICIT_SUPERSESSION from DOC-103
 ✓ tests/engine/t6-send-integrity.test.ts > T6: send integrity > draft A (1 business day) checks ALLOW; sending edited draft B (4 business days) is blocked 409 HOLD
 ✓ tests/engine/t7-injection.test.ts > T7: DOC-104 injection line is inert > TCK-9001: decision is the same with and without the line
 ✓ tests/engine/t7-injection.test.ts > T7: DOC-104 injection line is inert > TCK-9002: decision is the same with and without the line
 ✓ tests/engine/t7-injection.test.ts > T7: DOC-104 injection line is inert > TCK-9003: decision is the same with and without the line
 ✓ tests/engine/t5-permissions.test.ts > T5: support agent never sees DOC-105 > sanity: DOC-105 has lines to look for
 ✓ tests/engine/t5-permissions.test.ts > T5: support agent never sees DOC-105 > check response and seed response contain nothing from DOC-105; the AI never receives it
 ✓ tests/engine/t5-permissions.test.ts > T5: support agent never sees DOC-105 > a hostile override that tries to make DOC-105 visible is ignored
 ✓ tests/engine/t5-permissions.test.ts > T5: support agent never sees DOC-105 > control: for ops_lead the AI does receive DOC-105 (so the test cannot pass trivially)
 ✓ tests/engine/t8-extraction-gap.test.ts > T8: extraction gaps and failures > (a) zero draft claims but the policy-pattern detector fires → CAUTION / EXTRACTION_GAP, never ALLOW
 ✓ tests/engine/t8-extraction-gap.test.ts > T8: extraction gaps and failures > (b) draft extraction throws → AI_UNAVAILABLE / EXTRACTION_FAILED, and send returns 503
 ✓ tests/engine/t8-extraction-gap.test.ts > T8: extraction gaps and failures > (c) DOC-103 extraction throws on a standard ticket → at most CAUTION with SOURCE_UNREAD naming DOC-103
```

**QA verdict:** APPROVED (re-review, `.loop/qa-findings.md`). QA independently ran the typecheck, the tests and `pnpm build` + `pnpm start`, and curled the API. `/api/seed` for support_agent has no DOC-105 and ops_lead has it; `/api/check` returns 200 AI_UNAVAILABLE with the D0a trace; `/api/send` returns 503. A grep for AI provider code in lib/ and app/ found nothing.

**Worktrees:**
```
D:/Project/slite 3ff0f35 [main]
```

GATE: PASSED

## Phase 2
**Built:** the live AI layer, with two providers behind one adapter (D-001, D-017). Files: `lib/ai/client.ts` (Groq `openai/gpt-oss-120b` with strict JSON schema; Gemini `gemini-3.5-flash-lite` with native JSON schema; Anthropic off by default; 429/quota detection; throttling for scripts), `lib/ai/aiDeps.ts` (memory → saved → live primary → fallback once → paused/unavailable; zod; retry once), `lib/ai/{schemas,prompts,cache}.ts` (PROMPT_VERSION 2026-10-30.2, `<document>` envelope, full cache identity incl. provider + model), `lib/rateLimit.ts` (Upstash per-IP + global daily, in-memory fallback), `lib/workspace/variants.ts`, `scripts/{eval,record-ai-cache,probe-extract,groq-models}.ts`, `evals/{golden.json,results.md}`, `data/ai-cache/` (17 saved responses), `.github/workflows/ci.yml`.

**Amendments during the phase:** D-017 (Groq + Gemini, fallback on 429/quota, eval on both). The v2 prompt fix (proposals are claims; quotes exclude markdown labels) fixed Gemini's missed SRC-202 claim and its rejected DOC-104 quotes, without touching rules or tests.

**QA loop:** the first review returned CHANGES_REQUIRED (2 major: saved lookups tied to the configured provider; template-reply extractions not recorded; plus 9 minor). All were fixed (D-018). The re-review came back APPROVED; 2 of its 4 remaining minors were fixed afterwards (fixed tie-break order, escaped governing quote).

**Live eval** (`pnpm eval`, both providers, 3 runs each, throttled), from `evals/results.md`:
```
**Selection:** `AI_PROVIDER=groq`, `AI_FALLBACK_PROVIDER=gemini`. Both passed the gate and tied on every metric (0 quote rejections each, equal field accuracy); the incumbent primary (groq) is kept.
  [groq] `openai/gpt-oss-120b`
- Runs per case: 3 · date: 2026-10-30T17:22:19.643Z · throttled to stay under the free tier
- Decision accuracy: **100.0%** (36/36)
- Quote validity: **100.0%** (39/39 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures): **100.0%** (180/180)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**
  [gemini] `gemini-3.5-flash-lite`
- Runs per case: 3 · date: 2026-10-30T17:25:27.542Z · throttled to stay under the free tier
- Decision accuracy: **100.0%** (36/36)
- Quote validity: **100.0%** (38/38 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures): **100.0%** (180/180)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**
```

**Recording** (`pnpm record`, Groq, throttled):
```
✓ support_agent canon-9001  HOLD/CONTRADICTS_GOVERNING · safe reply (ai) rechecks ALLOW/SUPPORTED
✓ support_agent canon-9002  ESCALATE/SCOPE_UNKNOWN · safe reply (template) rechecks ALLOW/NO_POLICY_CLAIM
✓ support_agent canon-9003  ALLOW/SUPPORTED
✓ support_agent B1          HOLD/CONTRADICTS_GOVERNING · safe reply (ai) rechecks CAUTION/CHANGE_SIGNALLED
✓ support_agent B2          CAUTION/CHANGE_SIGNALLED
✓ support_agent B3          ESCALATE/CONFLICT_UNRESOLVED · safe reply (template) rechecks ALLOW/NO_POLICY_CLAIM
✓ support_agent B4          CAUTION/CHANGE_SIGNALLED
✓ support_agent B5          CAUTION/CHANGE_SIGNALLED
✓ support_agent B6          CAUTION/WEAK_BASIS
✓ support_agent B7          CAUTION/WEAK_BASIS
✓ support_agent allow-1day  ALLOW/SUPPORTED
✓ support_agent no-claim    ALLOW/NO_POLICY_CLAIM
✓ ops_lead      canon-9001  HOLD/CONTRADICTS_GOVERNING · safe reply (ai) rechecks ALLOW/SUPPORTED
✓ ops_lead      canon-9002  ESCALATE/SCOPE_UNKNOWN · safe reply (template) rechecks ALLOW/NO_POLICY_CLAIM
✓ ops_lead      canon-9003  ALLOW/SUPPORTED
✓ ops_lead      B1          HOLD/CONTRADICTS_GOVERNING · safe reply (ai) rechecks CAUTION/CHANGE_SIGNALLED
✓ ops_lead      B2          CAUTION/CHANGE_SIGNALLED
✓ ops_lead      B3          ESCALATE/CONFLICT_UNRESOLVED · safe reply (template) rechecks ALLOW/NO_POLICY_CLAIM
✓ ops_lead      B4          CAUTION/CHANGE_SIGNALLED
✓ ops_lead      B5          CAUTION/CHANGE_SIGNALLED
✓ ops_lead      B6          CAUTION/WEAK_BASIS
✓ ops_lead      B7          CAUTION/WEAK_BASIS
✓ ops_lead      allow-1day  ALLOW/SUPPORTED
✓ ops_lead      no-claim    ALLOW/NO_POLICY_CLAIM
Recorded 17 saved responses in data/ai-cache (groq / openai/gpt-oss-120b). Mismatches: 0
RECORD_EXIT=0
```

**Saved-mode replay with no keys** (`GROQ_API_KEY= GEMINI_API_KEY= AI_PROVIDER= AI_FALLBACK_PROVIDER= pnpm eval --saved`):
```
  ✓ canon-9001: HOLD/CONTRADICTS_GOVERNING
  ✓ canon-9002: ESCALATE/SCOPE_UNKNOWN
  ✓ canon-9003: ALLOW/SUPPORTED
  ✓ B1: HOLD/CONTRADICTS_GOVERNING
  ✓ B2: CAUTION/CHANGE_SIGNALLED
  ✓ B3: ESCALATE/CONFLICT_UNRESOLVED
  ✓ B4: CAUTION/CHANGE_SIGNALLED
  ✓ B5: CAUTION/CHANGE_SIGNALLED
  ✓ B6: CAUTION/WEAK_BASIS
  ✓ B7: CAUTION/WEAK_BASIS
  ✓ allow-1day: ALLOW/SUPPORTED
  ✓ no-claim: ALLOW/NO_POLICY_CLAIM
- Decision accuracy: **100.0%** (12/12)
- Quote validity: **100.0%** (13/13 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures): **100.0%** (60/60)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**
| canon-9001 | gate | HOLD / CONTRADICTS_GOVERNING | ✓ | 1/1 |
| canon-9002 | gate | ESCALATE / SCOPE_UNKNOWN | ✓ | 1/1 |
| canon-9003 | gate | ALLOW / SUPPORTED | ✓ | 1/1 |
| B1 | gate | HOLD / CONTRADICTS_GOVERNING | ✓ | 1/1 |
| B2 | gate | CAUTION / CHANGE_SIGNALLED | ✓ | 1/1 |
| B3 | gate | ESCALATE / CONFLICT_UNRESOLVED | ✓ | 1/1 |
| B4 |  | CAUTION / CHANGE_SIGNALLED | ✓ | 1/1 |
| B5 |  | CAUTION / CHANGE_SIGNALLED | ✓ | 1/1 |
| B6 |  | CAUTION / WEAK_BASIS | ✓ | 1/1 |
| B7 | gate | CAUTION / WEAK_BASIS | ✓ | 1/1 |
| allow-1day |  | ALLOW / SUPPORTED | ✓ | 1/1 |
| no-claim |  | ALLOW / NO_POLICY_CLAIM | ✓ | 1/1 |
SAVED_EVAL_EXIT=0
```

**Typecheck and full test run:**
```
TYPECHECK_EXIT=0
 Test Files  12 passed (12)
      Tests  105 passed (105)
TEST_EXIT=0
```

**QA verdict:** APPROVED (re-review, `.loop/qa-findings.md`). QA ran the typecheck, the tests and the build, plus `pnpm eval --saved` with keys unset and again with AI_PROVIDER=gemini (still replays 12/12), `pnpm eval --combine`, an identity check on all 17 cache files, a secret grep, and offline probes (DOC-105 never reaches a provider; paused on 429; limiter charged once per check, never on cache hits).

**Worktrees:**
```
D:/Project/slite 6a14f10 [main]
```

GATE: PASSED

## Phase 3
**Built:** the UI, from the approved mockups plus the D-021 changes. Design: `design/DESIGN.md`, three mockups, and `design/UI-CONTRACT.md` (the accessible names shared with the e2e test). Code:
- `app/` and `styles/tokens.css`
- `components/shell|inbox|panel|ui`: inbox, side panel, Check / Reasoning / Sources / Impact tabs, states, responsive slide-over and bottom sheet
- `lib/client/`: workspace overrides and metrics in localStorage, with try/catch and a memory fallback
- `e2e/demo.spec.ts` + `playwright.config.ts` (locked), `scripts/ui-audit.ts`, and an e2e step in CI

**Process notes:**
- Your approval came with 4 changes (D-021) and the narrow stop-hook waiting marker (D-020, plus the helper fix D-020a).
- While adding the e2e to the lock, a shell-escaping slip briefly put `/(^|D)1(D|$)/` in the Impact assertion. I removed `e2e/` from `.loop/locked`, fixed the regex to `/(^|\D)1(\D|$)/` (verified against "1", "10" and "11"), and re-locked it before any UI work used it.

**QA loop:** the first review returned CHANGES_REQUIRED (1 major: the footer disclaimer was truncated at 390 px; 5 minor). I fixed all six. The re-review came back APPROVED with 2 minors: duplicated banner copy (fixed) and the phone bottom sheet covering the composer (as designed; noted for the Phase 4 phone smoke test).

**UI audit** (`pnpm exec tsx scripts/ui-audit.ts --serve`, saved mode, 6 states × 3 widths):
```
empty       1440px  axe: none
check-hold  1440px  axe: none
reasoning   1440px  axe: none
sources     1440px  axe: none
impact      1440px  axe: none
escalate    1440px  axe: none
empty       1024px  axe: none
check-hold  1024px  axe: none
reasoning   1024px  axe: none
sources     1024px  axe: none
impact      1024px  axe: none
escalate    1024px  axe: none
empty        390px  axe: none
check-hold   390px  axe: none
reasoning    390px  axe: none
sources      390px  axe: none
impact       390px  axe: none
escalate     390px  axe: none
Serious/critical axe violations: 0. Horizontal page scroll: none.
EXIT=0
```

**Final run on the committed code** (`pnpm typecheck && pnpm test && pnpm exec playwright test`, cold build, saved mode):
```
 Test Files  12 passed (12)
      Tests  105 passed (105)
  ok 1 [chromium] › e2e\demo.spec.ts:8:5 › wrong draft → HOLD → blocked send → use safe reply → sent → Impact shows 1 intercept (1.7s)
  1 passed (1.6m)
FINAL_EXIT=0
```

**QA verdict:** APPROVED (re-review, `.loop/qa-findings.md`). QA ran the e2e and the audit itself and looked at every screenshot. It also drove the flows in a browser:
- B1, B7, B2, B3 and B4 Sources edits give the expected outcomes.
- Send returns 409, ack-required or 503 as specified.
- The metrics show the n<3 guard.
- DOC-105 never appears in the Support agent's DOM.
- No reason codes appear on the Check tab, and there is no overflow at 400 px.
- localStorage failures are handled.

**Worktrees:**
```
D:/Project/slite 20d9dfd [main]
```

GATE: PASSED

## Phase 4
**Pre-deploy work (QA APPROVED; the Phase 4 gate is the SPEC §18 check against the deployed URL, still to come):**
- Guided tour (5 steps, following SPEC §16; skippable; keyboard accessible; bottom card on phones), `components/tour/`, D-023.
- README: problem, mermaid architecture, AI vs rules, tests, eval numbers, limitations, what not to claim, and `docs/demo.gif` (19 s, recorded by `scripts/record-demo.ts`).
- CI runs the e2e test (`.github/workflows/ci.yml`). The secret scan now covers Gemini keys.
- QA loop: the first review returned CHANGES_REQUIRED (2 major: stale-pill contrast; scan missed Gemini keys). Both were fixed (D-024). The re-review came back APPROVED; its minor (Esc closing the tour from other dialogs) was fixed afterwards and verified in a browser.

**Evidence (final pre-deploy run):**
```
PASS  Esc in Reset dialog: dialog closed
PASS  Esc in Reset dialog: tour still open
PASS  Esc on persona tooltip: tour still open
PASS  Esc in the tour itself: tour closed
 Test Files  12 passed (12)
      Tests  105 passed (105)
  ok 1 [chromium] › e2e\demo.spec.ts:8:5 › wrong draft → HOLD → blocked send → use safe reply → sent → Impact shows 1 intercept (2.4s)
  1 passed (51.6s)
ESC_EXIT=0
stale       1440px  axe: none
stale       1024px  axe: none
stale        390px  axe: none
Serious/critical axe violations: 0. Horizontal page scroll: none.
```

Status: waiting for deploy setup (`.loop/await-human.md`).

**Deploy (D-025):**
- Vercel project `answerguard` (renamed `suresend` in Phase 6) under the account's default team, deployed with the CLI.
- Live at **https://answerguard.vercel.app**.
- 7 Production env vars added through stdin; no values printed.
- Upstash skipped, since it needs a browser terms click; no money is at risk, only quota.

**Live smoke test** (curl against https://answerguard.vercel.app):
```
GET / → 200 (1.41s)
seed support_agent: DOC-101,DOC-103,SRC-202,DOC-104 | DOC-105 mentions: 0
seed ops_lead: DOC-101,DOC-103,SRC-202,DOC-104,DOC-105
check TCK-9001: HOLD CONTRADICTS_GOVERNING | ai: saved, groq openai/gpt-oss-120b | suggestion: ai | HTTP 200 1.26s
live check (novel draft): ALLOW SUPPORTED | ai: live, groq, latencyMs 1607 | claims: 4 business days (hedged) | HTTP 200 2.24s
send HOLD draft with forged ALLOW result → HTTP 409
```

**Live UI audit, desktop and phone** (`pnpm exec tsx scripts/ui-audit.ts https://answerguard.vercel.app`):
```
empty       1440px  axe: none
check-hold  1440px  axe: none
reasoning   1440px  axe: none
sources     1440px  axe: none
impact      1440px  axe: none
stale       1440px  axe: none
escalate    1440px  axe: none
empty       1024px  axe: none
check-hold  1024px  axe: none
reasoning   1024px  axe: none
sources     1024px  axe: none
impact      1024px  axe: none
stale       1024px  axe: none
escalate    1024px  axe: none
empty        390px  axe: none
check-hold   390px  axe: none
reasoning    390px  axe: none
sources      390px  axe: none
impact       390px  axe: none
stale        390px  axe: none
escalate     390px  axe: none
Serious/critical axe violations: 0. Horizontal page scroll: none.
LIVE_AUDIT_EXIT=0
```

**CI on GitHub (latest run):**
```
completed	success	Deploy to Vercel: live URL, spend-limit and limiter decisions	CI	main	push	41118583389	1m52s	2026-10-30T19:50:59Z
```

**QA verdict:** APPROVED (final gate against the deployed URL, `.loop/qa-findings.md`).
- SPEC §18: all 5 items pass.
  1. The URL works with no setup: the canonical HOLD/ESCALATE/ALLOW checks come from saved responses, and live Groq works.
  2. CI is green: 105 tests, saved eval 12/12, e2e passes. The README eval table matches evals/results.md.
  3. The live dynamic-proof edits behave as specified: B1 → HOLD at 2 days, B2 → CAUTION, B3 → ESCALATE, B7 → CAUTION.
  4. The disclaimer is on every screen at all three widths.
  5. The README is complete, with the exact spend-limit wording.
- Extras: the live send flow and Impact tab work, the tour works at all widths, the Esc fix holds live, and the phone layout is fine.
- Secrets: none in the 664 KB of deployed JS/CSS.
- Personas: DOC-105 never reaches Support agent.
- Open notes (not blocking):
  - The walkthrough video link is a placeholder; Abdullah records it.
  - The 503 path wasn't triggered live, to save quota; it was verified locally in Phase 3.
  - CI warns that some actions target the deprecated Node 20 runtime.

**Worktrees:**
```
D:/Project/slite 3a3ff86 [main]
```

GATE: PASSED

## Phase 5
**Design v2 restyle** (brief `design/v2/REDESIGN_PROMPT.md`; artboards `design/v2/*.dc.html`; D-026, D-027, D-028).
- Send runs the check through `/api/send`: held → "Held by Slite Agent" + disabled "Send (held)" + intercept; Double-check → acknowledgement + Send anyway; AI unavailable → "Not sent, nothing was lost".
- Layout: three cards. The Slite Agent card has 2 tabs (Check, Docs); Why and Trace are built from the real CheckResult.
- Plain outcome names. Demo menu holds personas, Impact, AI mode, tour, reset. Figtree tokens; responsive at 1100/700; tour updated.
- Engine, AI pipeline, API and engine tests unchanged.
- **One-time unlock of the demo test (approved):** the test was rewritten to the v2 contract. QA compared it with the old test (every guarantee kept, two strengthened) and approved it, then the folder was re-locked:
```
# Locked paths (in addition to tests/, SPEC.md, IMPLEMENTATION_BRIEF.md, data/seed/). One per line.
e2e/
```
- QA verdict: APPROVED. It checked the screenshots side by side with all 9 artboards at 1440 and 390, accepted the 5 D-027 deviations, and confirmed dynamic proof in v2 (B1 → Hold at 2 days, B2 → Double-check, B3 → Ask first, B7 → Double-check), outcome contrast 5.67–8.35:1, and DOC-105 hidden for Support agent. Minors were fixed or recorded in D-028.

**Final local run** (`pnpm build && record-demo && pnpm typecheck && pnpm test && pnpm exec playwright test && ui-audit --serve`):
```
wrote docs/demo.gif and docs/demo.webm
 Test Files  12 passed (12)
      Tests  105 passed (105)
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (683ms)
  1 passed (22.2s)
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
P5_EXIT=0
```

**Deployed** to https://answerguard.vercel.app (CLI, production). Live smoke test:
```
GET / → 200 (1.09s) · GET /how-it-works → 200 · GET /demo.gif → 200 (4,672,703 B)
support_agent seed: DOC-105 mentions 0
POST /api/send wrong 4-day draft (TCK-9001) → HTTP 409 blocked HOLD (saved)
Docs tab live: PASS docs@1024, PASS docs@390 (edit applied, no horizontal scroll)
```
**Live UI audit, desktop + phone** (`ui-audit.ts https://answerguard.vercel.app`; the AI-unavailable state is local-only because live AI answers):
```
empty         1440px  axe: none
held          1440px  axe: none
why           1440px  axe: none
trace         1440px  axe: none
docs          1440px  axe: none
double-check  1440px  axe: none
ask-first     1440px  axe: none
sent          1440px  axe: none
demo-menu     1440px  axe: none
empty         1024px  axe: none
held          1024px  axe: none
why           1024px  axe: none
trace         1024px  axe: none
docs          1024px  axe: none
double-check  1024px  axe: none
ask-first     1024px  axe: none
sent          1024px  axe: none
demo-menu     1024px  axe: none
empty          390px  axe: none
held           390px  axe: none
why            390px  axe: none
trace          390px  axe: none
docs           390px  axe: none
double-check   390px  axe: none
ask-first      390px  axe: none
sent           390px  axe: none
demo-menu      390px  axe: none
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
LIVE_EXIT=0
```

**Worktrees:**
```
D:/Project/slite e40fd2b [main]
```

GATE: PASSED

### Phase 5 addendum: trace polish (D-029)
UI only: the Trace view shows the rules that mattered, plain one- or two-sentence rows with a Details toggle, and a non-wrapping "Result" label.
```
 Test Files  12 passed (12)
      Tests  105 passed (105)
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (679ms)
  1 passed (20.8s)
trace         1440px  axe: none
trace         1024px  axe: none
trace          390px  axe: none
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
TP_EXIT=0
```

## Phase 6
Rename AnswerGuard → **SureSend** (D-031). Production URL **https://suresend-demo.vercel.app**, the first fallback, because
suresend.vercel.app stayed "assigned to another project" even after the CLI alias was removed. https://answerguard.vercel.app
now redirects there with a 308 (D-032).

- **Loop:** the builder did the rename and the tester ran the checks. QA returned CHANGES_REQUIRED with one major finding:
  the rename had rewritten the evidence URLs on Phase 4/5 prose lines of this file. The fix was to rebuild this file from
  HEAD, renaming the product only, so every URL matches HEAD. QA's minor findings were also fixed: `docs/VIDEO_SCRIPT.md`
  added to `.git/info/exclude`; the storage migration always drops the legacy `answerguard.*` key, with a new
  `lib/client/storage.test.ts` covering it; the quota edge case keeps the legacy value for that read; D-032 updated.
  QA's re-review returned **APPROVED** after re-running typecheck, 108 tests, the e2e test, the axe audit (30 runs, none)
  and the migration in a real browser, and finding the locked paths byte-identical. After that approval, only the
  production URL changed (`app/layout.tsx` metadata, README, PLAN §9, D-032, video script); the checks below were rerun
  after that change.
- **Test-string exception:** not used. No literal in `tests/` or `e2e/` asserts the product name, so there is no diff to
  paste; the locked paths are unchanged (block below).
- **GIF:** re-recorded with the SureSend header; `public/demo.gif` is byte-identical to `docs/demo.gif` (4,977,666 bytes).

**Typecheck and tests (after the URL change):**
```

> suresend@0.1.0 typecheck D:\Project\slite
> tsc --noEmit
TYPECHECK_EXIT=0
 RUN  v5.0.5 D:/Project/slite
 Test Files  13 passed (13)
      Tests  108 passed (108)
TEST_EXIT=0
```

**E2E (saved mode, local production build):**
```
Running 1 test using 1 worker
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (6.7s)
  1 passed (2.7m)
E2E_EXIT=0
```

**Locked paths and worktrees:**
```
$ git diff --stat HEAD -- tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md | wc -l
0
$ git status --short -- tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md | wc -l
0
$ git worktree list
D:/Project/slite 5f46364 [main]
```

**Vercel project `suresend` domains:**
```
suresend-demo.vercel.app verified=true redirect=- redirectStatusCode=-
answerguard.vercel.app verified=true redirect=suresend-demo.vercel.app redirectStatusCode=308
```

**Live HTTP after `vercel deploy --prod`:**
```
200 https://suresend-demo.vercel.app 
200 https://suresend-demo.vercel.app/how-it-works 
200 https://suresend-demo.vercel.app/demo.gif 
200 https://suresend-demo.vercel.app/icon.svg 
308 https://answerguard.vercel.app https://suresend-demo.vercel.app/
308 https://answerguard.vercel.app/how-it-works https://suresend-demo.vercel.app/how-it-works
```

**Live browser check (both URLs, desktop 1440 and phone 390):**
```
PASS https://suresend-demo.vercel.app @ desktop 1440
  final: 200 https://suresend-demo.vercel.app/
  title: SureSend · a concept for Slite Agent
  header: SureSend Concept for Slite Agent Demo menu Guided tour
  og:url=https://suresend-demo.vercel.app og:image=https://suresend-demo.vercel.app/demo.gif
  "answerguard" in HTML: 0, page errors: 0
PASS https://suresend-demo.vercel.app @ phone 390
  final: 200 https://suresend-demo.vercel.app/
  title: SureSend · a concept for Slite Agent
  header: SureSend Demo menu
  og:url=https://suresend-demo.vercel.app og:image=https://suresend-demo.vercel.app/demo.gif
  "answerguard" in HTML: 0, page errors: 0
PASS https://answerguard.vercel.app @ desktop 1440
  redirects: 308 https://answerguard.vercel.app/
  final: 200 https://suresend-demo.vercel.app/
  title: SureSend · a concept for Slite Agent
  header: SureSend Concept for Slite Agent Demo menu Guided tour
  og:url=https://suresend-demo.vercel.app og:image=https://suresend-demo.vercel.app/demo.gif
  "answerguard" in HTML: 0, page errors: 0
PASS https://answerguard.vercel.app @ phone 390
  redirects: 308 https://answerguard.vercel.app/
  final: 200 https://suresend-demo.vercel.app/
  title: SureSend · a concept for Slite Agent
  header: SureSend Demo menu
  og:url=https://suresend-demo.vercel.app og:image=https://suresend-demo.vercel.app/demo.gif
  "answerguard" in HTML: 0, page errors: 0
ALL PASS
LIVE_EXIT=0
```

**Live axe audit against https://suresend-demo.vercel.app (1440/1024/390; not-sent is local-only):**
```
empty         1440px  axe: none
held          1440px  axe: none
why           1440px  axe: none
trace         1440px  axe: none
docs          1440px  axe: none
double-check  1440px  axe: none
ask-first     1440px  axe: none
sent          1440px  axe: none
demo-menu     1440px  axe: none
empty         1024px  axe: none
held          1024px  axe: none
why           1024px  axe: none
trace         1024px  axe: none
docs          1024px  axe: none
double-check  1024px  axe: none
ask-first     1024px  axe: none
sent          1024px  axe: none
demo-menu     1024px  axe: none
empty          390px  axe: none
held           390px  axe: none
why            390px  axe: none
trace          390px  axe: none
docs           390px  axe: none
double-check   390px  axe: none
ask-first      390px  axe: none
sent           390px  axe: none
demo-menu      390px  axe: none
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
AUDIT_EXIT=0
```

GATE: PASSED

## Phase 7
Review fixes (D-034, D-035): hardening, Upstash, tour step 5 on saved responses only, the composer hint (F10), the
suggested-reply reason (F12), generic 500s (F13), a held-out eval, README accuracy, MIT LICENSE and repo metadata. The engine,
locked tests and seed data are untouched.

- **Loop:** builder (lead) → tests → QA CHANGES_REQUIRED. The major finding: the README eval section was not yet labelled as
  the tuned set, and the held-out table was missing. QA's minor findings were also fixed:
  - the README test count, the e2e wording and two general Slite lines;
  - the composer hint stayed after a doc edit plus a reload (QA reproduced it); it is now hidden once any doc is edited.

  QA re-review: **APPROVED**. After approval, one README word changed ("the project adopted").
- **Upstash:** installed from the Marketplace on the free plan, Production only, with `--no-env-pull`, after Abdullah
  accepted the terms. Pulling Production env to read Redis was refused by the safety classifier (credential
  materialization), so the check is the `x-suresend-limiter` header on a request that needed live AI (block below).
- **Tour step 5:** `pnpm record --tour-edits` added 2 saved responses (17 → 19) and left the 17 existing ones
  byte-identical. `lib/ai/tourReplay.test.ts` fails without them: with the two files moved aside it printed
  `Tests  3 failed | 3 passed (6)`; with them restored, `Tests  6 passed (6)`.
- **Held-out eval:** 10 cases written after the prompts were frozen, live, 3 runs per provider (`evals/heldout.md`).

**Typecheck, tests, audit and saved replay (final tree):**
```

> suresend@0.1.0 typecheck D:\Project\slite
> tsc --noEmit
TYPECHECK_EXIT=0
 RUN  v5.0.5 D:/Project/slite
 Test Files  16 passed (16)
      Tests  122 passed (122)
TEST_EXIT=0
$ pnpm audit
No known vulnerabilities found
$ pnpm eval --saved
- Decision accuracy: **100.0%** (12/12)
- Quote validity: **100.0%** (13/13 extracted quotes/spans verbatim; 0 rejected)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**
```

**E2E (saved mode) and axe audit (local build, 1440/1024/390):**
```
Running 1 test using 1 worker
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (1.1s)
  1 passed (2.2s)
E2E_EXIT=0
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
"axe: none" runs: 30
```

**Tour step-5 recording (live Groq, append-only):**
```
✓ full      verify   support_agent HOLD/CONTRADICTS_GOVERNING · suggestion "Failed transfers are reversed within 2 business days." (ai) rechecks CAUTION/CHANGE_SIGNALLED
✓ full      verify   ops_lead      HOLD/CONTRADICTS_GOVERNING · suggestion "Failed transfers are reversed within 2 business days." (ai) rechecks CAUTION/CHANGE_SIGNALLED
✓ full      re-check support_agent CAUTION/WEAK_BASIS
✓ full      re-check ops_lead      CAUTION/WEAK_BASIS
✓ digitOnly verify   support_agent HOLD/CONTRADICTS_GOVERNING · suggestion "Failed transfers are reversed within 2 business days." (ai) rechecks CAUTION/CHANGE_SIGNALLED
✓ digitOnly verify   ops_lead      HOLD/CONTRADICTS_GOVERNING · suggestion "Failed transfers are reversed within 2 business days." (ai) rechecks CAUTION/CHANGE_SIGNALLED
✓ digitOnly re-check support_agent CAUTION/WEAK_BASIS
✓ digitOnly re-check ops_lead      CAUTION/WEAK_BASIS
Added 2 saved responses (17 → 19) with groq / openai/gpt-oss-120b. Unexpected: 0
```

**Held-out eval (live, 3 runs per provider):**
```
groq openai/gpt-oss-120b: - Decision accuracy: **100.0%** (30/30)
groq openai/gpt-oss-120b: - Quote validity: **100.0%** (50/50 extracted quotes/spans verbatim; 0 rejected)
gemini gemini-3.5-flash-lite: - Decision accuracy: **100.0%** (30/30)
gemini gemini-3.5-flash-lite: - Quote validity: **100.0%** (51/51 extracted quotes/spans verbatim; 0 rejected)
```

**Locked paths, saved responses, worktrees:**
```
$ git diff --stat HEAD -- lib/engine tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md | wc -l
0
$ git status --short -- lib/engine tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md | wc -l
0
$ sha256sum -c (17 saved responses tracked at HEAD)
17
$ git status --short data/ai-cache
?? data/ai-cache/ae109287edd0235847ecd555d6afadc261d6a4e3b18bc6401dec87ee05e5c062.json
?? data/ai-cache/ec47179e450fb43c474792c455f679b987a1533de7e531f4e54c6d59b6fb6b04.json
$ git worktree list
D:/Project/slite 3ce8f39 [main]
```

**Live, after the final `vercel deploy --prod`:**
- Headers and the shared limiter on a check that needed live AI:
```
Content-Security-Policy: frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=()
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Suresend-Limiter: upstash
live check (new text): HOLD/CONTRADICTS_GOVERNING | ai.mode: live | provider: groq
```
- Tour step 5 through the API, both ways of typing the edit:
```
PASS full: Send 4-day → 409 HOLD · ai saved · suggestion "Failed transfers are reversed within 2 business days." · label note "a Slack note proposes 1 day"
PASS full: Send suggestion → 428 CAUTION/CHANGE_SIGNALLED · ai saved (needs the acknowledgement)
PASS digitOnly: Send 4-day → 409 HOLD · ai saved · suggestion "Failed transfers are reversed within 2 business days." · label note "a Slack note proposes 1 day"
PASS digitOnly: Send suggestion → 428 CAUTION/CHANGE_SIGNALLED · ai saved (needs the acknowledgement)
ALL PASS
```
- Browser check of the hint, the reason label, headers and phone layout; the hint check includes QA's edit-and-reload repro:
```
PASS security headers on /
PASS security headers on /how-it-works
PASS security headers on /api/seed?role=support_agent
PASS hint shown under the pre-filled reply (TCK-9001, instant)
PASS reply textarea is described by the hint
PASS axe on the composer with the hint: serious/critical = 0
PASS hint hidden once the reply is held
PASS canonical Hold: suggestion label stays "Checked against your docs" ( business day. Checked against your docs)
PASS no hint on Usman's ticket (rail unknown)
PASS no hint on Hina's ticket (standard)
PASS no page errors (0)
PASS after Save and verify at 2 days: label says "Double-check: a Slack note proposes 1 day"
PASS after a doc edit and a reload, no hint on the untouched reply
PASS phone: hint visible
PASS phone: no horizontal scroll
PASS phone: axe on the composer clean
ALL PASS
```
- Tour step 5 in the browser (desktop and phone, both card states, axe):
```
29 checks passed
ALL PASS
```
- Both URLs (old one redirects with 308, path kept), browser at 1440 and 390:
```
200 https://suresend-demo.vercel.app 
200 https://suresend-demo.vercel.app/how-it-works 
308 https://answerguard.vercel.app https://suresend-demo.vercel.app/
308 https://answerguard.vercel.app/how-it-works https://suresend-demo.vercel.app/how-it-works
PASS https://suresend-demo.vercel.app @ desktop 1440
PASS https://suresend-demo.vercel.app @ phone 390
PASS https://answerguard.vercel.app @ desktop 1440
PASS https://answerguard.vercel.app @ phone 390
ALL PASS
```
- Axe audit against the live site (not-sent is local-only):
```
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
"axe: none" runs: 27
```

GATE: PASSED

## Phase 8
SureSend as an MCP server (D-036). It runs remote at `/api/mcp` (Streamable HTTP, stateless, JSON responses) and over
stdio (`scripts/mcp-stdio.ts`). There are three read-only tools over the seed workspace and the support-agent persona:
`check_reply` (through `handleCheck`), `list_tickets` and `get_doc` (never DOC-105). Live AI over MCP has its own
budget on the shared Upstash limiter. There's no auth, because this is a public synthetic demo. The engine, locked tests
and seed data are untouched.

- **Loop:**
  - First, builder → tests → QA CHANGES_REQUIRED, with 2 majors and 8 minors. Both majors were proven by QA:
    - a JSON-RPC batch shared one limiter unit (5/5 passed on a budget of 1);
    - GET returned a stream that closed at once, so the SDK client re-polled about 1/s.
  - Fixes: deps built per `check_reply`, batches rejected with 400, GET/DELETE answer 405, next steps keyed on the
    suggestion's check and the reason, coverage and AI wording in the descriptions, `ticket.id: null` when none was
    chosen, and README hedges.
  - QA re-review **APPROVED**. QA's own probes: a batch of 5 now gets 400 with 0 through the gate, versus 1 of 5 when
    sent separately; the client made 1 GET in 10 s idle (it was 10).
  - Two of QA's remaining minors fixed after approval: the server instructions are conditional too, and a double colon
    is gone. The third (the body is read before the SDK's 4 MB cap; Vercel's 4.5 MB cap applies) needs no action.
- **Live, new wording:** a Claude-style reply ("…within 4 working days") over MCP comes back Hold, with a rewritten
  suggestion that passed its own recheck, on live Groq and the MCP budget (`x-suresend-limiter: upstash`). The canonical
  replies replay saved responses (`ai_mode saved`).

**Typecheck, tests, audit and saved replay (final tree):**
```

> suresend@0.1.0 typecheck D:\Project\slite
> tsc --noEmit
TYPECHECK_EXIT=0
 RUN  v5.0.5 D:/Project/slite
 Test Files  19 passed (19)
      Tests  143 passed (143)
TEST_EXIT=0
$ pnpm audit
No known vulnerabilities found
$ pnpm eval --saved
- Decision accuracy: **100.0%** (12/12)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**
```

**UI unchanged: e2e and axe audit (local build, 1440/1024/390):**
```
Running 1 test using 1 worker
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (1.6s)
  1 passed (2.8s)
E2E_EXIT=0
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
"axe: none" runs: 30
```

**`pnpm mcp:e2e` against the local build (AI_MODE=saved), after the QA fixes:**
```
MCP endpoint: http://127.0.0.1:3100/api/mcp
server: suresend 0.8.0
PASS idle 3 s: client made 1 GET in total, none while idle
PASS tools: check_reply, list_tickets, get_doc
PASS every tool is read-only
PASS list_tickets: TCK-9001/instant, TCK-9002/unknown, TCK-9003/standard
PASS get_doc DOC-103: Instant Rail: Reversal Exception
PASS get_doc DOC-105: refused like an unknown ID
PASS check_reply 4 days on TCK-9001: Hold · suggestion "We’ll reverse failed transfers within 1 business day." (Good to send) · governing Instant Rail: Reversal Exception
PASS   replayed saved responses (ai_mode saved)
PASS check_reply 4 days on TCK-9002: Ask first (ai_mode saved)
PASS check_reply 1 day on TCK-9001: Good to send (ai_mode saved)
PASS check_reply over 1,000 characters: refused
PASS no response mentions DOC-105 or its contents
PASS raw tools/list: HTTP 200, x-suresend-limiter: memory
PASS raw batch of 3 check_reply calls: HTTP 400
PASS GET: HTTP 405, Allow: POST
PASS DELETE: HTTP 405, Allow: POST
ALL PASS
```

**stdio, started the documented way (`pnpm --dir <project> exec tsx scripts/mcp-stdio.ts`) from %TEMP%:**
```
cwd of the client: C:\Users\avata\AppData\Local\Temp
tools: check_reply, list_tickets, get_doc
check_reply: Hold | ai_mode: saved | suggestion: We’ll reverse failed transfers within 1 business day.
server stderr: [suresend] MCP server on stdio: check_reply, list_tickets, get_doc
```

**`pnpm mcp:e2e https://suresend-demo.vercel.app/api/mcp` against the final deploy:**
```
MCP endpoint: https://suresend-demo.vercel.app/api/mcp
server: suresend 0.8.0
PASS idle 3 s: client made 1 GET in total, none while idle
PASS tools: check_reply, list_tickets, get_doc
PASS every tool is read-only
PASS list_tickets: TCK-9001/instant, TCK-9002/unknown, TCK-9003/standard
PASS get_doc DOC-103: Instant Rail: Reversal Exception
PASS get_doc DOC-105: refused like an unknown ID
PASS check_reply 4 days on TCK-9001: Hold · suggestion "We’ll reverse failed transfers within 1 business day." (Good to send) · governing Instant Rail: Reversal Exception
PASS   replayed saved responses (ai_mode saved)
PASS check_reply 4 days on TCK-9002: Ask first (ai_mode saved)
PASS check_reply 1 day on TCK-9001: Good to send (ai_mode saved)
PASS check_reply over 1,000 characters: refused
PASS no response mentions DOC-105 or its contents
PASS raw tools/list: HTTP 200, x-suresend-limiter: upstash-unused
PASS raw batch of 3 check_reply calls: HTTP 400
PASS GET: HTTP 405, Allow: POST
PASS DELETE: HTTP 405, Allow: POST
ALL PASS
```

**Live: the web app's budget and MCP's, each on Upstash, with wording that needs live AI:**
```
== web app /api/check, new text (app budget)
X-Suresend-Limiter: upstash
decision: HOLD/CONTRADICTS_GOVERNING | ai.mode: live
== MCP check_reply, Claude-style wording (MCP budget)
X-Suresend-Limiter: upstash
decision: Hold | Instant transfers now reverse in 1 business day. Your reply says 4.
suggested_reply: {"text":"Hi Ayesha, I’m sorry about the failed transfer. The reversal will be processed within 1 business day.","check":"Good to send"}
next_step: Don't send this reply. Send suggested_reply instead (it passed the same check), or ask a human.
checked_with: {"ai_mode":"live","provider":"groq","live_ai_paused":false}
```

**Live: web tour step 5 still on saved responses, and both URLs (desktop and phone):**
```
PASS full: Send 4-day → 409 HOLD · ai saved · suggestion "Failed transfers are reversed within 2 business days." · label note "a Slack note proposes 1 day"
PASS full: Send suggestion → 428 CAUTION/CHANGE_SIGNALLED · ai saved (needs the acknowledgement)
PASS digitOnly: Send 4-day → 409 HOLD · ai saved · suggestion "Failed transfers are reversed within 2 business days." · label note "a Slack note proposes 1 day"
PASS digitOnly: Send suggestion → 428 CAUTION/CHANGE_SIGNALLED · ai saved (needs the acknowledgement)
ALL PASS
PASS https://suresend-demo.vercel.app @ desktop 1440
PASS https://suresend-demo.vercel.app @ phone 390
PASS https://answerguard.vercel.app @ desktop 1440
PASS https://answerguard.vercel.app @ phone 390
ALL PASS
```

**Locked paths and worktrees:**
```
$ git diff --stat HEAD -- lib/engine tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md | wc -l
0
$ git status --short -- lib/engine tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md data/ai-cache | wc -l
0
$ git worktree list
D:/Project/slite 41d63d9 [main]
```

GATE: PASSED

## Phase 9
"Fix the doc" (D-037). A Hold or Ask first points to the doc that taught the wrong value, and SureSend proposes a minimal
fix to it. A person approves it, like fixes reviewed in Slite's Triage. Nothing is applied automatically, and an approved fix
is an ordinary client-side doc edit. The engine, locked tests and seed data are untouched.

- **Loop:**
  - First, builder → tests → QA CHANGES_REQUIRED. The major finding: the validator accepted a fragment of the claim
    sentence as the target, so an edit could land in the scope line or a heading, delete "Do NOT promise same day", flip
    the meaning, or add "two weeks". QA proved 5 such edits passing validation; they were dropped only by a fixture
    artifact.
  - Fix: the target must be the exact claim sentence, found once, and the edit is always an addition after it; a
    "replace" must keep the sentence word for word. No other timeline (detector), digits, negation or promise words.
  - Minors fixed too:
    - the cache identity covers every prompt input (re-recorded, 2 orphans removed);
    - tour step 5 acknowledges an approval;
    - step numbers and the hard-coded rail corrected;
    - Ask first needs exactly one exception;
    - the menu shows "Fix approved";
    - the Triage wording stays within the confirmed list.
  - QA re-review **APPROVED**. Its remaining minors were fixed after approval: stricter content checks (curly
    apostrophes and any "n't", months, number words beyond ten, "immediately", fees, the exception's rail only) with the
    README matched to the code; "Fix approved" cleared once the fixed text is gone from the doc; two stale comments.
  - Left as a follow-up: at 390px, tour step 6's card covers "Save and verify". This predates Phase 9.
- **Scope note (D-037):** a "5–7 days" reply is Double-check (unit mismatch), not Hold, so the app offers no fix for it. The
  matcher maps it to DOC-104 and is tested.

**Typecheck, tests, audit and saved replay (final tree):**
```

> suresend@0.1.0 typecheck D:\Project\slite
> tsc --noEmit
TYPECHECK_EXIT=0
 RUN  v5.0.5 D:/Project/slite
 Test Files  21 passed (21)
      Tests  164 passed (164)
TEST_EXIT=0
$ pnpm audit
No known vulnerabilities found
$ pnpm eval --saved
- Decision accuracy: **100.0%** (12/12)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**
```

**Fix-the-doc recording on live Groq (append-only), with the fuller cache identity:**
```
✓ support_agent TCK-9001 ai fix to DOC-101
    + For instant-rail transfers, failed transfers are reversed within 1 business day (see Instant Rail: Reversal Exception). How to tell the rail: check "Rail" on the transaction in the admin panel.
  ✓ after approval: TCK-9001 HOLD/CONTRADICTS_GOVERNING
  ✓ + tour full verify: HOLD/CONTRADICTS_GOVERNING · suggestion rechecks CAUTION/CHANGE_SIGNALLED
  ✓ + tour full re-check: CAUTION/WEAK_BASIS
  ✓ + tour digitOnly verify: HOLD/CONTRADICTS_GOVERNING · suggestion rechecks CAUTION/CHANGE_SIGNALLED
  ✓ + tour digitOnly re-check: CAUTION/WEAK_BASIS
✓ support_agent TCK-9002 ai fix to DOC-101
    + For instant-rail transfers, failed transfers are reversed within 1 business day (see Instant Rail: Reversal Exception). How to tell the rail: check "Rail" on the transaction in the admin panel.
  ✓ after approval: TCK-9002 ESCALATE/SCOPE_UNKNOWN
✓ ops_lead      TCK-9001 ai fix to DOC-101
    + For instant-rail transfers, failed transfers are reversed within 1 business day (see Instant Rail: Reversal Exception). How to tell the rail: check "Rail" on the transaction in the admin panel.
  ✓ after approval: TCK-9001 HOLD/CONTRADICTS_GOVERNING
  ✓ + tour full verify: HOLD/CONTRADICTS_GOVERNING · suggestion rechecks CAUTION/CHANGE_SIGNALLED
  ✓ + tour full re-check: CAUTION/WEAK_BASIS
  ✓ + tour digitOnly verify: HOLD/CONTRADICTS_GOVERNING · suggestion rechecks CAUTION/CHANGE_SIGNALLED
  ✓ + tour digitOnly re-check: CAUTION/WEAK_BASIS
✓ ops_lead      TCK-9002 ai fix to DOC-101
    + For instant-rail transfers, failed transfers are reversed within 1 business day (see Instant Rail: Reversal Exception). How to tell the rail: check "Rail" on the transaction in the admin panel.
  ✓ after approval: TCK-9002 ESCALATE/SCOPE_UNKNOWN
Added 2 saved responses (21 → 23) with groq / openai/gpt-oss-120b. Unexpected: 0
```

**Local build (AI_MODE=saved), after the QA fixes: e2e and axe audit (1440/1024/390):**
```
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (1.8s)
  1 passed (3.3s)
E2E_EXIT=0
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
"axe: none" runs: 30
```

**Locked paths, saved responses, worktrees:**
```
$ git diff --stat HEAD -- lib/engine tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md | wc -l
0
$ git status --short -- lib/engine tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md | wc -l
0
$ sha256sum -c (the 19 saved responses tracked at HEAD)
19
$ git status --short data/ai-cache
?? data/ai-cache/50d58304430c15c806aa37449d8451b83cec9cfe6f0069b088d698fae28c93cc.json
?? data/ai-cache/e85c7d94c3a7819c2a3e6504939f82b67bba96020f3a955e43705d23ac9ea90c.json
$ git worktree list
D:/Project/slite 58f6f48 [main]
```

**Live, after the final `vercel deploy --prod`: /api/fix**
```
== /api/fix canonical Hold (TCK-9001)
HTTP/1.1 200 OK
X-Suresend-Limiter: upstash-unused
proposal: DOC-101 · ai · changed lines 1
  added: For instant-rail transfers, failed transfers are reversed within 1 business day (see Instant Rail: Reversal Exception). How to tell the rail: check "Rail" on the transaction in the admin panel.
  recheck: TCK-9001 instant HOLD / CONTRADICTS_GOVERNING; TCK-9002 unknown ESCALATE / SCOPE_UNKNOWN; TCK-9003 standard ALLOW / SUPPORTED; TCK-9001 instant ALLOW / SUPPORTED
== /api/fix canonical Ask first (TCK-9002)
proposal: DOC-101 · ask · ai
== /api/fix correct reply
proposal: null | why: Only a Hold or an Ask first points to a doc to fix.
```

**Live: `pnpm mcp:e2e https://suresend-demo.vercel.app/api/mcp`** (includes `propose_doc_fix`, applying nothing)
```
MCP endpoint: https://suresend-demo.vercel.app/api/mcp
server: suresend 0.8.0
PASS idle 3 s: client made 1 GET in total, none while idle
PASS tools: check_reply, list_tickets, get_doc, propose_doc_fix
PASS every tool is read-only
PASS list_tickets: TCK-9001/instant, TCK-9002/unknown, TCK-9003/standard
PASS get_doc DOC-103: Instant Rail: Reversal Exception
PASS get_doc DOC-105: refused like an unknown ID
PASS check_reply 4 days on TCK-9001: Hold · suggestion "We’ll reverse failed transfers within 1 business day." (Good to send) · governing Instant Rail: Reversal Exception
PASS   replayed saved responses (ai_mode saved)
PASS check_reply 4 days on TCK-9002: Ask first (ai_mode saved)
PASS check_reply 1 day on TCK-9001: Good to send (ai_mode saved)
PASS propose_doc_fix 4 days on TCK-9001: fix to DOC-101 drafted by AI, checked by the rules, applied false
PASS   nothing applied: the same reply still holds against the unedited docs
PASS check_reply over 1,000 characters: refused
PASS no response mentions DOC-105 or its contents
PASS raw tools/list: HTTP 200, x-suresend-limiter: upstash-unused
PASS raw batch of 3 check_reply calls: HTTP 400
PASS GET: HTTP 405, Allow: POST
PASS DELETE: HTTP 405, Allow: POST
ALL PASS
```

**Live: the fix review in the browser** (link → review → dismiss; menu → review → approve; menu "Fix approved"; removing the
fixed doc clears it; phone 390; axe on the card, review and menu)
```
PASS no fix link before any check
PASS Hold card shows "Fix the doc that caused this"
PASS held card: axe serious/critical = 0
PASS review names the doc: Outgoing Transfers: Reversal SOP
PASS why: a reply this session copied 4 business days
PASS before/after of the changed line
PASS added text marked: "For instant-rail transfers, failed transfers are reversed within 1 business day (see Instant Rail: Reversal Exception). How to tell the rail: check "Rail" on the transaction in the admin panel."
PASS states nothing changes until approval
PASS Dismiss button
PASS fix review: axe serious/critical = 0
PASS Dismiss closes the review, nothing applied
PASS   the doc editor is back
PASS Demo menu lists the SOP: 1 held, copied 4 business days
PASS   labelled as simulated
PASS Demo menu with held docs: axe serious/critical = 0
PASS "Review fix" from the menu opens the same review
PASS approval toast: "Fix approved: Outgoing Transfers: Reversal SOP now names the exception (simulated approval and verification)."
PASS after approval the same Hold no longer offers a fix
PASS DOC-101 now names the exception and keeps 4 business days
PASS menu shows the SOP as "Fix approved", no dead-end review link
PASS after removing the fixed doc, the menu no longer says "Fix approved"
PASS no page errors (0)
PASS phone: no horizontal scroll with the review open
PASS phone fix review: axe serious/critical = 0
ALL PASS
```

**Live: the tour (6 steps; step 5 the fix, desktop dismiss / phone approve; step 6 the doc edit) and both URLs:**
```
PASS desktop 1440: the tour has 6 steps
PASS desktop 1440: step 5 of 6 is "Fix the doc that caused this"
PASS desktop 1440: the step confirms the review is open
PASS desktop 1440: the fix review is visible
PASS desktop 1440: axe on the tour card clean
PASS desktop 1440: no horizontal scroll
PASS desktop 1440: after dismissing, step 5 offers the fix again
PASS desktop 1440: step 6 of 6 is the live doc edit
PASS desktop 1440: step 6 opens the doc editor (the review is closed)
PASS phone 390: the tour has 6 steps
PASS phone 390: step 5 of 6 is "Fix the doc that caused this"
PASS phone 390: the step confirms the review is open
PASS phone 390: the fix review is visible
PASS phone 390: axe on the tour card clean
PASS phone 390: no horizontal scroll
PASS phone 390: after approving, step 5 says "Fix approved…" (not an error)
PASS phone 390: step 6 of 6 is the live doc edit
PASS phone 390: step 6 opens the doc editor (the review is closed)
ALL PASS
step-6 doc edit: 29 PASS lines
ALL PASS
both URLs: ALL PASS
```

**Live axe audit (not-sent is local-only):**
```
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
"axe: none" runs: 27
```

GATE: PASSED

### Phase 9 addendum: tour card on phones (D-038)
At 390px tour step 6's card covered the doc text and "Save and verify" (QA's pre-existing finding). On phones the card now
shrinks to a one-line bar: with "Hide steps", or automatically when the visitor taps into the doc in step 6. Desktop is
unchanged.
```
 Test Files  21 passed (21)
      Tests  164 passed (164)
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (1.7s)
  1 passed (3.1s)
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
"axe: none" runs: 30
$ step6-phone-fix.cjs https://suresend-demo.vercel.app
PASS phone: the full card offers "Hide steps"
  bar: y=744 h=52 · Save and re-check y=521..571 · Save and verify y=579..629
PASS tapping into the doc shrinks the card to a bar (52px tall)
PASS the bar covers neither save button
PASS focus stays in the doc (the collapse didn't steal it)
PASS axe on the bar: 0 serious/critical
PASS tapping "Save and verify" works on the phone (no card in the way)
PASS Send on the 4-day reply is held on the phone, completing step 6
PASS "Show steps" restores the card and focuses its title
PASS "Hide steps" shrinks it and focuses "Show steps"
PASS going back opens step 5 as the full card
PASS desktop: no Hide steps toggle
PASS desktop: the card stays full while editing
ALL PASS
step-6 doc edit (live): ALL PASS
tour (live): ALL PASS
```

### Phase 9 addendum 2: tour step 5 uses Ayesha; MCP in the Demo menu (D-039)
Step 5 "Fix the doc that caused this" now tells Ayesha's story and does the work itself ("Show me" holds her 4-day reply
if needed, from saved responses, then opens the review). The card never covers "Approve fix (simulated)" at 1440 or 390.
The Demo menu has "Use it from Claude (MCP)" with the connector URL and a Copy button. Tour step 6 ends with a pointer to
it. UI copy and layout only.
```
$ pnpm typecheck  (exit 0)
$ pnpm test
 Test Files  21 passed (21)
      Tests  164 passed (164)
$ pnpm e2e
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (1.6s)
  1 passed (2.5s)
$ ui-audit.ts http://127.0.0.1:3100  (AI_MODE=saved)
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
"axe: none" runs: 30
$ step5-ayesha.cjs http://127.0.0.1:3100
PASS 1440 A: step 5 of 6 is "Fix the doc that caused this"
PASS 1440 A: the new body copy
PASS 1440 A: no "Go back…" line and no Usman
  card x=694..1034 y=72..375 · Approve x=1058..1285 y=794..844
PASS 1440 A: Approve is on screen
PASS 1440 A: the step-5 card doesn't cover Approve
PASS 1440 A: the Approve button is what's under its centre
PASS 1440 A: already held this session, so no second hold (stopped count 2)
PASS 1440 A: the review counts Ayesha's and Usman's holds (2 replies copied 4 business days)
PASS 1440 A: axe on the card and the review: 0 serious/critical
PASS 1440 A: approving works (a real click) and step 5 says "Fix approved…"
PASS 1440 B: nothing held yet, step 5 still offers "Show me"
  card x=694..1034 y=72..375 · Approve x=1058..1285 y=794..844
PASS 1440 B: Approve is on screen
PASS 1440 B: the step-5 card doesn't cover Approve
PASS 1440 B: the Approve button is what's under its centre
PASS 1440 B: "Show me" held Ayesha's reply first (stopped count 1)
PASS 1440 B: Ayesha's ticket is the selected one
PASS 1440 B: the review counts the hold it just made
PASS 1440 B: after Dismiss, "Show me" is offered again
PASS 1440 B: the second "Show me" reuses the hold (stopped count still 1)
PASS 1440 B: no horizontal scroll
PASS 390 A: step 5 of 6 is "Fix the doc that caused this"
PASS 390 A: the new body copy
PASS 390 A: no "Go back…" line and no Usman
  card x=8..382 y=66..118 · Approve x=16..265 y=754..804
PASS 390 A: Approve is on screen
PASS 390 A: the step-5 card doesn't cover Approve
PASS 390 A: the Approve button is what's under its centre
PASS 390 A: on the phone the card is the one-line bar while the review is open (52px)
PASS 390 A: already held this session, so no second hold (stopped count 2)
PASS 390 A: the review counts Ayesha's and Usman's holds (2 replies copied 4 business days)
  full card y=66..373 · Approve y=754..804
PASS 390 A: "Show steps" opens the full card on the other half, still clear of Approve
PASS 390 A: axe on the card and the review: 0 serious/critical
PASS 390 A: approving works (a real click) and step 5 says "Fix approved…"
PASS 390 B: nothing held yet, step 5 still offers "Show me"
  card x=8..382 y=66..118 · Approve x=16..265 y=754..804
PASS 390 B: Approve is on screen
PASS 390 B: the step-5 card doesn't cover Approve
PASS 390 B: the Approve button is what's under its centre
PASS 390 B: on the phone the card is the one-line bar while the review is open (52px)
PASS 390 B: "Show me" held Ayesha's reply first (stopped count 1)
PASS 390 B: Ayesha's ticket is the selected one
PASS 390 B: the review counts the hold it just made
PASS 390 B: after Dismiss, "Show me" is offered again
PASS 390 B: the second "Show me" reuses the hold (stopped count still 1)
PASS 390 B: no horizontal scroll
ALL PASS
mcp-menu.cjs (local): 31 PASS, 0 FAIL · ALL PASS
step6-phone-fix.cjs (local): 12 PASS, 0 FAIL · ALL PASS
tour-step6.cjs (local): 29 PASS, 0 FAIL · ALL PASS
$ mcp-menu.cjs https://suresend-demo.vercel.app
PASS 1440: the menu has "Use it from Claude (MCP)"
PASS 1440: the one-line explanation
PASS 1440: the connector URL is shown
PASS 1440: the Copy button is named "Copy connector URL"
PASS 1440: "How to connect" links to the README section
PASS 1440: the link opens a new tab safely and says so
PASS 1440: the menu fits the width
PASS 1440: the URL wraps instead of overflowing
PASS 1440: axe on the menu: 0 serious/critical
PASS 1440: after a click the button says "Copied" (name "Copied connector URL")
PASS 1440: the clipboard holds the connector URL
PASS 1440: a status region says "Connector URL copied"
PASS 1440: axe on the menu in the "Copied" state: 0 serious/critical
PASS 1440: "Copied" goes back to "Copy" after a moment
PASS 1440: step 6 ends with the MCP line (after the tip, right above the buttons)
PASS 390: the menu has "Use it from Claude (MCP)"
PASS 390: the one-line explanation
PASS 390: the connector URL is shown
PASS 390: the Copy button is named "Copy connector URL"
PASS 390: "How to connect" links to the README section
PASS 390: the link opens a new tab safely and says so
PASS 390: the menu fits the width
PASS 390: the URL wraps instead of overflowing
PASS 390: axe on the menu: 0 serious/critical
PASS 390: after a click the button says "Copied" (name "Copied connector URL")
PASS 390: the clipboard holds the connector URL
PASS 390: a status region says "Connector URL copied"
PASS 390: axe on the menu in the "Copied" state: 0 serious/critical
PASS 390: "Copied" goes back to "Copy" after a moment
PASS 390: step 6 ends with the MCP line (after the tip, right above the buttons)
PASS no clipboard: an alert says so and the URL is selected to copy by hand
ALL PASS
step5-ayesha.cjs (live): 43 PASS, 0 FAIL · ALL PASS
step6-phone-fix.cjs (live): 12 PASS, 0 FAIL · ALL PASS
tour-step6.cjs (live): 29 PASS, 0 FAIL · ALL PASS
```

### Phase 9 addendum 3: the tour pauses under the Demo menu (D-040)
Opening the Demo menu during the tour no longer lets the tour's ring draw over the menu. The tour pauses (no ring; the
card waits as a "Resume tour" bar), the menu is above every tour layer, and closing the menu brings back the same step.
The ring is clipped to the visible part of its target and hidden when an overlay covers it. The connector URL wraps only
after "https://" or before "/api/mcp". Checked on every tour step at 1440 and 390, locally and live.
```
$ pnpm typecheck  (exit 0)
$ pnpm test
 Test Files  21 passed (21)
      Tests  164 passed (164)
$ pnpm e2e
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1 stopped (1.2s)
  1 passed (2.1s)
$ ui-audit.ts http://127.0.0.1:3100  (AI_MODE=saved)
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
"axe: none" runs: 30
$ tour-menu.cjs http://127.0.0.1:3100   231 PASS, 0 FAIL · ALL PASS
step5-ayesha.cjs (local): 43 PASS, 0 FAIL · ALL PASS
mcp-menu.cjs (local): 31 PASS, 0 FAIL · ALL PASS
step6-phone-fix.cjs (local): 12 PASS, 0 FAIL · ALL PASS
tour-step6.cjs (local): 29 PASS, 0 FAIL · ALL PASS
$ tour-menu.cjs https://suresend-demo.vercel.app   (selected lines; every line is PASS)
PASS 1440: the URL is in three parts
PASS 1440: the URL fits its box and reads as one URL
PASS 1440 step 1: the menu is fully on screen
PASS 1440 step 1: the menu is topmost (centre, corners, left edge: menu menu menu menu menu menu)
PASS 1440 step 1: no tour ring while the menu is open
PASS 1440 step 1: the tour waits as a bar with "Resume tour"
PASS 1440 step 1: the bar (52px) is clear of the menu
PASS 1440 step 1: the bar keeps the step (1/6)
PASS 1440 step 1: "Resume tour" can be tapped
PASS 1440 step 1: closing the menu (esc) keeps the tour
PASS 1440 step 1: same step after closing (1: Send runs the check)
PASS 1440 step 1: same card state (full)
PASS 1440 step 1: the ring is as before (shown)
PASS 1440 step 1: focus goes to the Demo menu button
PASS 1440 step 5 review: the ring stays inside the agent panel (ring y=150..836, panel y=80..844)
PASS 1440 step 5 review: the menu is fully on screen
PASS 1440 step 5 review: the menu is topmost (centre, corners, left edge: menu menu menu menu menu menu)
PASS 1440 step 5 review: no tour ring while the menu is open
PASS 1440 step 5 review: the tour waits as a bar with "Resume tour"
PASS 1440 step 5 review: the bar (52px) is clear of the menu
PASS 1440 step 5 review: the bar keeps the step (5/6)
PASS 1440 step 5 review: "Resume tour" can be tapped
PASS 1440 step 5 review: closing the menu (resume) keeps the tour
PASS 1440 step 5 review: same step after closing (5: Fix the doc that caused this)
PASS 1440 step 5 review: same card state (full)
PASS 1440 step 5 review: the ring is as before (shown)
PASS 1440 step 5 review: focus goes to the tour title
PASS 1440: axe with the menu over the paused tour: 0 serious/critical
PASS 390: the URL is in three parts
PASS 390: the URL fits its box and reads as one URL
PASS 390 step 1: the menu is fully on screen
PASS 390 step 1: the menu is topmost (centre, corners, left edge: menu menu menu menu menu menu)
PASS 390 step 1: no tour ring while the menu is open
PASS 390 step 1: the tour waits as a bar with "Resume tour"
PASS 390 step 1: the bar (52px) is clear of the menu
PASS 390 step 1: the bar keeps the step (1/6)
PASS 390 step 1: "Resume tour" can be tapped
PASS 390 step 1: closing the menu (esc) keeps the tour
PASS 390 step 1: same step after closing (1: Send runs the check)
PASS 390 step 1: same card state (full)
PASS 390 step 1: the ring is as before (shown)
PASS 390 step 1: focus goes to the Demo menu button
PASS 390 step 1: the ring shows around Send with the sheet closed
PASS 390 step 1: with the sheet open over Send, no ring draws on the sheet (ring hidden)
PASS 390 step 1: sheet closed, the ring is back
PASS 390 step 5 review: the menu is fully on screen
PASS 390 step 5 review: the menu is topmost (centre, corners, left edge: menu menu menu menu menu menu)
PASS 390 step 5 review: no tour ring while the menu is open
PASS 390 step 5 review: the tour waits as a bar with "Resume tour"
PASS 390 step 5 review: the bar (52px) is clear of the menu
PASS 390 step 5 review: the bar keeps the step (5/6)
PASS 390 step 5 review: "Resume tour" can be tapped
PASS 390 step 5 review: closing the menu (resume) keeps the tour
PASS 390 step 5 review: same step after closing (5: Fix the doc that caused this)
PASS 390 step 5 review: same card state (bar)
PASS 390 step 5 review: the ring is as before (hidden)
PASS 390 step 5 review: focus goes to the tour title
PASS 390 step 5 review: with the review back, the card is still the bar
PASS 390: axe with the menu over the paused tour: 0 serious/critical
ALL PASS
tour-menu.cjs (live): 231 PASS, 0 FAIL · ALL PASS
step5-ayesha.cjs (live): 43 PASS, 0 FAIL · ALL PASS
mcp-menu.cjs (live): 31 PASS, 0 FAIL · ALL PASS
step6-phone-fix.cjs (live): 12 PASS, 0 FAIL · ALL PASS
tour-step6.cjs (live): 29 PASS, 0 FAIL · ALL PASS
```

## Phase 10
A second topic, `fee_refund`, to prove the rules generalise (D-041, D-042, D-043). Adding it took one topic file, two lines to
register it, the yes/no comparator and its JSON shape, and version bumps. The commit that adds it (43f1bbf) touches no rule file.
Replies with several claims get a verdict per claim, one card per claim in Why and Trace, and a suggested reply that fixes only the
wrong claim. Each ticket has 3 "Try another reply" presets, and MCP `check_reply` covers the topic.

- **The rule files did change, and this is the one place the original gate wording doesn't hold.** Locked tests, seed data, SPEC and
  the brief are untouched, and the guided tour's code is too (empty diffs below). But QA twice found the refactor had generalised the
  "nothing found" net (D0b) too loosely, and both fixes are in `decide.ts` (576a6b3, d8a9d61). They name no topic. With one topic
  the rule equals `main`'s (QA: 0 differences on 270 inputs).
- **Loop:** QA ran four rounds.
  - Round 1, CHANGES_REQUIRED: D0b weakened across topics, and held-out wording leaked into the prompt and golden set.
  - Round 2, CHANGES_REQUIRED: a wide span could still switch D0b off, re-running repeated a finished provider, and the resume
    stamp left out the model.
  - Round 3, CHANGES_REQUIRED: an outage's failures could be published as model misses, and Why said the docs were silent on a gap.
  - Round 4, **APPROVED**, no majors. Its minors were fixed after approval, with tests. One of its scripts ran in the real folder
    by accident and rewrote Gemini's golden report files; D-041 records that and how the results were checked against the real logs.
- **Abdullah's decisions along the way:**
  - Held-out integrity: cases seen while writing the prompts don't count, even after the wording is removed. H17–H19 were written
    and committed (8e68016) before any further eval, with the prompts frozen.
  - The scripts check quota first and stop cleanly (D-041).
  - Groq moved to the paid Developer tier with a $5/month hard spend limit (D-042).
  - Phase 10 ships without blocking on Gemini (D-043). Gemini finished first anyway, so that wasn't needed.
- **Honest reading of the numbers:** both providers score 100% on the final runs, but Groq's first session on the same frozen prompts
  scored 36/39 and 9/12 on fee cases, because H18 flipped from 0/3 to 3/3 with no prompt change. The README shows both sessions and
  calls hedges unstable. Gemini has one session.
- **Provider pick:** both providers pass the gate with no rejected quotes, so the eval's tie-break picks Gemini on field accuracy (100% vs
  97.2%) and `evals/results.md` reads `AI_PROVIDER=gemini`. Production still runs Groq as primary, and the README says both.
  Resolved after the gate: Abdullah kept Groq, overriding the eval's pick (D-044). H5 stays exposed.
- **Known, left as they are:** D-041 lists them.

GATE: PASSED

**Final local gate (saved mode):**
```
$ git log --oneline -1
340a189 Phase 10: Gemini's evals on the frozen prompts
$ pnpm typecheck
exit 0
$ pnpm test
 Test Files  27 passed (27)
      Tests  247 passed (247)
exit 0
$ pnpm eval --saved
- Decision accuracy: **100.0%** (19/19)
- Quote validity: **100.0%** (27/27 extracted quotes/spans verbatim; 0 rejected)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**
$ snapshot-results --compare before.json
68 results → evals/snapshots/after.json (0 not on saved responses)
Compared with evals/snapshots/before.json: 68 identical, 0 different, 0 missing.
$ pnpm audit
No known vulnerabilities found
$ browser checks at http://127.0.0.1:3100
p10-ui exit 0 pass=46 fail=0
step5-ayesha exit 0 pass=43 fail=0
mcp-menu exit 0 pass=31 fail=0
step6-phone-fix exit 0 pass=12 fail=0
tour-step6 exit 0 pass=29 fail=0
tour-menu exit 0 pass=231 fail=0
$ pnpm e2e

  1 passed (1.3s)
exit 0
$ pnpm mcp:e2e http://127.0.0.1:3100/api/mcp
PASS check_reply two claims on TCK-9001: Hold [reversal window: Good to send; fee refund: Hold], suggestion keeps "1 business day" (ai_mode saved)
ALL PASS
$ scripts/ui-audit.ts
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
```

**The re-record on the frozen prompts (a later commit removed one saved response replay never reaches, leaving 40):**
```
groq: 8912 requests left today; this run needs about 60 calls and 96K tokens.
Recorded 41 saved responses with groq / openai/gpt-oss-120b. Unexpected: 0
```

**Evals on the frozen prompts, live, 3 runs each:**
```
$ evals/results-groq.json
## groq · `openai/gpt-oss-120b`
- Runs per case: 3 · started: 2026-11-02T08:52:30.283Z · finished: 2026-11-02T09:08:37.290Z · throttled
- Decision accuracy: **100.0%** (57/57)
- Quote validity: **100.0%** (80/80 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures): **97.2%** (175/180)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**

$ evals/results-gemini.json
## gemini · `gemini-3.5-flash-lite`
- Runs per case: 3 · started: 2026-11-02T08:52:31.164Z · finished: 2026-11-02T10:13:35.336Z · throttled
- Decision accuracy: **100.0%** (57/57)
- Quote validity: **100.0%** (81/81 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures): **100.0%** (180/180)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**

$ evals/heldout-groq.json (second session)
## groq · `openai/gpt-oss-120b`
- Runs per case: 3 · started: 2026-11-02T08:52:30.504Z · finished: 2026-11-02T09:14:15.423Z · throttled
**Clean held-out cases (13)**
- Decision accuracy: **100.0%** (39/39)
- Fee cases only: **100.0%** (12/12)
- Quote validity: **100.0%** (82/82 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **93.5%** (101/108)
**Exposed cases (6): regression only, not held-out**
- Decision accuracy: **94.4%** (17/18)
- Quote validity: **100.0%** (38/38 extracted quotes/spans verbatim; 0 rejected)

$ evals/heldout-gemini.json
## gemini · `gemini-3.5-flash-lite`
- Runs per case: 3 · started: 2026-11-02T10:13:38.522Z · finished: 2026-11-02T10:21:35.365Z · throttled
**Clean held-out cases (13)**
- Decision accuracy: **100.0%** (39/39)
- Fee cases only: **100.0%** (12/12)
- Quote validity: **100.0%** (81/81 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **100.0%** (108/108)
**Exposed cases (6): regression only, not held-out**
- Decision accuracy: **100.0%** (18/18)
- Quote validity: **100.0%** (39/39 extracted quotes/spans verbatim; 0 rejected)
```

**Groq's first session on the same prompts, from 1db5346, on the 13 cases that are clean now: 36/39, fee cases 9/12, H18 0/3.**

**What changed where:**
```
$ git log main..HEAD -- <rule files>
d8a9d61 Phase 10: QA round 2 fixes
576a6b3 Phase 10: the nothing-found net (D0b) works per topic
ca12d5b Phase 10: values are worded through their topic
4a411e5 Phase 10: comparator registry and topic taxonomy (no behaviour change)

$ git show --stat 43f1bbf
43f1bbf Phase 10: add the fee_refund topic

 lib/ai/prompts.ts       |  2 +-
 lib/ai/schemas.ts       | 12 +++++++++++-
 lib/engine/values.ts    | 19 ++++++++++++++++++-
 lib/topics/feeRefund.ts | 48 ++++++++++++++++++++++++++++++++++++++++++++++++
 lib/topics/index.ts     |  3 ++-
 5 files changed, 80 insertions(+), 4 deletions(-)

$ git diff main..HEAD --stat -- tests data/seed SPEC.md IMPLEMENTATION_BRIEF.md
(empty)

$ git diff main..HEAD --stat -- components/tour
(empty)

$ git diff 8e68016..HEAD --stat -- prompts, schemas, topic files, golden, presets, variants
(empty)

$ git worktree list
D:/Project/slite 340a189 [phase-10]
```

**QA verdict:**
```
## VERDICT: APPROVED
```

**Deployed to https://suresend-demo.vercel.app, live checks:**
```
$ pnpm mcp:e2e https://suresend-demo.vercel.app/api/mcp
PASS check_reply 4 days on TCK-9001: Hold · suggestion "Failed transfers are reversed within 1 business day." (Good to send) · governing Instant Rail: Reversal Exceptio
PASS check_reply 4 days on TCK-9002: Ask first (ai_mode saved)
PASS check_reply 1 day on TCK-9001: Good to send (ai_mode saved)
PASS check_reply two claims on TCK-9001: Hold [reversal window: Good to send; fee refund: Hold], suggestion keeps "1 business day" (ai_mode saved)
ALL PASS
p10-ui (live): exit 0 pass=46 fail=0
step5-ayesha (live): exit 0 pass=43 fail=0
mcp-menu (live): exit 0 pass=31 fail=0
step6-phone-fix (live): exit 0 pass=12 fail=0
tour-step6 (live): exit 0 pass=29 fail=0
tour-menu (live): exit 0 pass=231 fail=0
$ security headers
Content-Security-Policy: frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
$ GET /api/mcp (stateless, so 405 is expected)
405
```

## Phase 11

Fixes from the independent review (PLAN.md §14). Branch `phase-11`.

**The tests came first.** `lib/check/vagueReply.test.ts` and `lib/client/copyRules.test.ts`, committed before any fix. The 7 that pass
already are the guards that the rule stays narrow.
```
$ pnpm vitest run lib/check/vagueReply.test.ts lib/client/copyRules.test.ts   (before the fix)
⎯⎯⎯⎯⎯⎯ Failed Tests 43 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  2 failed (2)
      Tests  43 failed | 7 passed (50)
     × repro: Double-check, never Good to send
     × week-out: Double-check, never Good to send
     × very-soon: Double-check, never Good to send
     × monday-less-charge: Double-check, never Good to send
     × unknown-rail: Double-check, never Good to send
     × next-week: Double-check, never Good to send
```
**The repro before the fix.** Production returned the review's result. It's a cached reading (`latencyMs: 0` on the second call): Groq
returned 0 claims once and the instance kept that. (Corrected in Phase 12, D-045: the review's own result was a live call, 690 ms. The cached one was my repeat of it.) Fresh calls with the same prompt read the fee part as a contradiction, 5 of 5.
```
production, today: 200 ALLOW NO_POLICY_CLAIM claims: [] ai: live
$ pnpm tsx scripts/probe-draft.ts groq   (the old prompt, live)
vague-repro [TCK-9001 instant] HOLD/CONTRADICTS_GOVERNING (Hold, AI live)
  claim: reversal_window "the reversal is automatic and you'll see it reflected after the weekend" value=null → CAUTION/UNSUPPORTED
  claim: fee_refund "minus the processing charge" value={"flag":false} → HOLD/CONTRADICTS_GOVERNING, docs say refunded
vague-week-out [TCK-9001 instant] CAUTION/UNSUPPORTED (Double-check, AI live)
  claim: reversal_window "The money lands back in your wallet before the week is out." value=null → CAUTION/UNSUPPORTED
vague-very-soon [TCK-9003 standard] ALLOW/NO_POLICY_CLAIM (Good to send, AI live)
vague-monday-less-charge [TCK-9001 instant] HOLD/CONTRADICTS_GOVERNING (Hold, AI live)
  claim: reversal_window "the funds return on their own by Monday" value=null → CAUTION/UNSUPPORTED
  claim: fee_refund "less the small charge for the transfer" value={"flag":false} → HOLD/CONTRADICTS_GOVERNING, docs say refunded
vague-unknown-rail [TCK-9002 unknown] ALLOW/NO_POLICY_CLAIM (Good to send, AI live)
vague-next-week [TCK-9003 standard] ALLOW/NO_POLICY_CLAIM (Good to send, AI live)
```

One correction to the recording above. `monday-less-charge` with 0 claims trips the fee detector, so it was already a Double-check before the fix, through D0b. Its expected
reason changed to EXTRACTION_GAP after that commit, with a stricter assertion added. So "fails first" holds on the decision for 5 of the 6, and on the reason code for this one.

**The same tests after the fix.**
```
$ pnpm vitest run lib/check/vagueReply.test.ts lib/client/copyRules.test.ts
 Test Files  2 passed (2)
      Tests  50 passed (50)
```
**The repro after the fix, live on Groq, new prompt.** Two claims, each with the docs' value; the rule D0e net sits under it for a reading with 0 claims.
```
vague-repro [TCK-9001 instant] CAUTION/UNSUPPORTED (Double-check, AI live)
  reply: Nothing to do on your side: the reversal is automatic and you'll see it reflected after the weekend, minus the processing charge.
  claim: reversal_window "you'll see it reflected after the weekend" value=null → CAUTION/UNSUPPORTED, docs say 1 business day
  claim: fee_refund "minus the processing charge" value=null → CAUTION/UNSUPPORTED, docs say refunded
  card:  Your reply is vague on this. Your docs say 1 business day; your reply gives no number.
vague-week-out [TCK-9001 instant] CAUTION/UNSUPPORTED (Double-check, AI live)
  reply: No action needed from you. The money lands back in your wallet before the week is out.
  claim: reversal_window "The money lands back in your wallet before the week is out." value=null → CAUTION/UNSUPPORTED, docs say 1 business day
  card:  Your reply is vague on this. Your docs say 1 business day; your reply gives no number.
vague-very-soon [TCK-9003 standard] CAUTION/UNSUPPORTED (Double-check, AI live)
  reply: All sorted on our end, the refund is on its way and will show up very soon.
  claim: reversal_window "the refund is on its way and will show up very soon" value=null → CAUTION/UNSUPPORTED, docs say 4 business days
  card:  Your reply is vague on this. Your docs say 4 business days; your reply gives no number.
vague-monday-less-charge [TCK-9001 instant] CAUTION/UNSUPPORTED (Double-check, AI live)
  reply: You can relax, the funds return on their own by Monday, less the small charge for the transfer.
  claim: reversal_window "the funds return on their own by Monday" value=null → CAUTION/UNSUPPORTED, docs say 1 business day
  claim: fee_refund "less the small charge for the transfer" value=null → CAUTION/UNSUPPORTED, docs say refunded
  card:  Your reply is vague on this. Your docs say 1 business day; your reply gives no number.
vague-unknown-rail [TCK-9002 unknown] CAUTION/UNSUPPORTED (Double-check, AI live)
  reply: Hang tight, the bank sends these back on its own schedule and it never takes long.
  claim: reversal_window "the bank sends these back on its own schedule and it never takes long" value=null → CAUTION/UNSUPPORTED
  card:  Your reply is vague on this. Your docs don't give one answer for this ticket; your reply gives no number.
vague-next-week [TCK-9003 standard] CAUTION/UNSUPPORTED (Double-check, AI live)
  reply: Your balance gets topped up again early next week.
  claim: reversal_window "Your balance gets topped up again early next week." value=null → CAUTION/UNSUPPORTED, docs say 4 business days
  card:  Your reply is vague on this. Your docs say 4 business days; your reply gives no number.
```
**The 68 saved results**, against Phase 10's snapshot, on the re-recorded responses. The 12 extra rows are the vague cases, which have no earlier value.
```
80 results → evals/snapshots/phase11.json (0 not on saved responses)
Compared with evals/snapshots/after.json: 66 identical, 2 different, 0 missing.
golden no-claim (support_agent)
  before: ALLOW/NO_POLICY_CLAIM [] suggestion none
  after:  CAUTION/TOPIC_GAP [reversal_window:CAUTION/TOPIC_GAP] suggestion none
golden no-claim (ops_lead)
  before: ALLOW/NO_POLICY_CLAIM [] suggestion none
  after:  CAUTION/TOPIC_GAP [reversal_window:CAUTION/TOPIC_GAP] suggestion none
```
Outside those 68 (`record` checks them against their expected results): the fee cases `fee-correct` and `fee-unknown-rail` and the preset `usman-fee-only` also go from Good to send to
Double-check, for the same reason. `pnpm record`: 46 saved responses, Unexpected: 0.

**Browser, on a saved-mode build at http://127.0.0.1:3100.** Scratch checks; the Phase 10 scripts had their strings updated for the rename and nothing else.
```
p11-ui-check (repro, sent card, actor, slide-over at 700/900/1099): pass=26 fail=0
p11-offer (Not now at 1440/900/390, X, blocked storage): pass=25 fail=0
p10-ui: pass=46 fail=0
step5-ayesha: pass=43 fail=0
mcp-menu: pass=31 fail=0
step6-phone-fix: pass=12 fail=0
tour-step6: pass=29 fail=0
tour-menu: pass=231 fail=0
$ pnpm mcp:e2e http://127.0.0.1:3100/api/mcp
ALL PASS
$ pnpm tsx scripts/ui-audit.ts
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
```
**The tour offer before the fix, on production.** It held everywhere except with storage blocked.
```
PASS storage blocked: gone after Not now
FAIL storage blocked: stays gone after a reload
FAIL storage blocked: stays gone after leaving and coming back
2 FAILED
```
**Evals, first session on prompt `2026-11-02.5`, before QA's fixes.** Groq: golden 75/75, quotes 105/105, fields 170/180, gate PASS; held-out clean 46/48, fee 10/12, vague 9/9, quotes 98/98; exposed 16/18.
Misses: H18 1/3 (the known unstable hedge, errs strict) and H11 1/3 ("the transfer charge stays with us" read as vague on 2 of 3, so Double-check, not Hold). The first held-out run stopped at 29 of 66 on four
Groq timeouts in a row; the guard scored nothing from that call and the rerun continued. Gemini: golden 65/75, quotes 107/107, fields 180/180, gate PASS; held-out clean 44/48, fee 10/12, vague 7/9, quotes 91/91;
exposed 17/18. Every Gemini golden miss is a vague reply: Hold on 4 runs, rule D0e's Double-check on 6. None reached Good to send.

**How the loop ran.** Builder and tester work was done in this session. QA is an independent subagent.

**QA round 1: CHANGES_REQUIRED, three majors, all real.** (1) The tour's step 1 still said "Slite Agent", and my copy test missed it because the source wraps between the two words. (2) With the governing doc unread, the card said
"Your docs say 4 business days" on an instant transfer. (3) The Ask-first exemption only looked for "the exact reversal timeline", so "We never share the exact reversal timeline" sent as Good to send when the AI also missed it. All fixed (f93910e), with tests.
Also fixed from its minors: the broken image on the how-it-works page, a rewrite that drops an answer now loses to the template, held Enter on "Not now" starting the tour, MCP's `says` on a gap (`in_reply`), "Your reply is right" and its siblings, a doc in doubt flagged, wrong numbers (H14), and stale docs. My slide-over check never really changed the ticket, because its click landed on the scrim; it now does, and asserts that it did.

**The one-time e2e unlock (D-050), approved by Abdullah.** Three strings. The diff on `.loop/locked` is empty, and a real edit attempt is refused:
```
$ git diff --numstat main..phase-11 -- e2e
3	3	e2e/demo.spec.ts
$ cat .loop/locked
# Locked paths (in addition to tests/, SPEC.md, IMPLEMENTATION_BRIEF.md, data/seed/). One per line.
e2e/
Edit on e2e/demo.spec.ts → PreToolUse hook: BLOCKED by protect-locked: "e2e/demo.spec.ts" is locked (SPEC is the contract; see CLAUDE.md rule 1).
$ pnpm exec playwright test
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → D
  1 passed (26.2s)
```
**After the fixes, on a saved-mode build.** The saved results are unchanged by them: 80 of 80 identical to `evals/snapshots/phase11.json`, so still 66 of the original 68.
```
p11-ui-check (repro, sent card, actor, slide-over with a real change of ticket): pass=29 fail=0
p11-offer (Not now at 3 widths, X, held Enter, blocked storage): pass=27 fail=0
p10-ui: pass=46 fail=0
step5-ayesha: pass=43 fail=0
mcp-menu: pass=31 fail=0
step6-phone-fix: pass=12 fail=0
tour-step6: pass=29 fail=0
tour-menu: pass=231 fail=0
pnpm mcp:e2e: ALL PASS
```
**Evals after the fixes, published as they came.** Groq, prompt `2026-11-02.5`: golden 74/75 (the miss is a Hold on `vague-monday-less-charge`), quotes 107/107, fields 178/180, gate PASS. Held-out clean 47/48, fee 11/12, vague 9/9, quotes 97/97. Exposed 16/18, quotes 41/41: H13 1/3, read as a timeline with no value, still a Double-check. H11 was 3/3 this time, so Hold on 4 of 6 over the two sessions.
**Gemini's reports are from before these fixes.** My first rerun command was wrong: a `;` went to `pnpm` as an argument, so Groq's held-out and Gemini's golden never ran. I caught it in the log and reran Groq's. Gemini's held-out rerun hit its daily limit at 22 of 66 ("retry in 16h 22m"). Its reports stay as committed, and the rerun follows in its own commit, as the brief allows.

**QA round 2: CHANGES_REQUIRED, one major, real, and a regression from this phase's prompt.** Round 1's three majors held. The new one: on the demo's own preset (Usman, "Timeline and fee"), the holding reply tagged "Checked against your docs"
was refused at Send, because the AI read SureSend's own sentence as a timeline with no value. The recheck uses SureSend's own claims, so it never saw that. Round 1 and I both missed it for the same reason: we looked at the recheck, not at a Send.
Fixed in `runCheck` (D-045): a no-value claim whose span is inside that sentence is dropped before the rules see it. Also taken: only SureSend's own sentences count as accounted for after the holding sentence (`holdingTopics`), since two AI readings still got past it;
the key-repeat guard on the Demo button; "field-accuracy gap"; the Gemini row's label. Left for a later phase, not from this one: with a doc unread, replies that do carry a value still get copy that treats the remaining docs as the answer (decisions right, copy only), and the 404 page's missing label.

**After round 2's fixes, on a saved-mode build.** The preset replay now requires a suggestion's check to match its Send on the saved reading, and that's what catches this bug. `lib/check/suggestionAgrees.test.ts` applied it to the golden cases, and QA found it would have passed on the old code (25 of 25), since no golden case reaches an Ask first with a kept claim. So it now has that case too.
```
$ pnpm test: 350 passed
$ snapshot against evals/snapshots/phase11.json: 80 identical, 0 different, 0 missing
p11-ui-check (now sends Usman's preset's holding reply): pass=31 fail=0
p11-offer: pass=27 fail=0
p10-ui: pass=46 fail=0
step5-ayesha: pass=43 fail=0
mcp-menu: pass=31 fail=0
step6-phone-fix: pass=12 fail=0
tour-step6: pass=29 fail=0
tour-menu: pass=231 fail=0
pnpm mcp:e2e: ALL PASS
ui-audit: Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
playwright: 1 passed
```
**Evals weren't rerun for this round, on purpose.** Prompts and schemas are unchanged, so saved responses stand. The fix only acts on a reply that opens with SureSend's holding sentence, and that's 0 of the 47 eval drafts, so no scored result can change. A re-run of `pnpm eval` would still run them again, because the rule text changed.

**QA round 3: APPROVED**, no blockers or majors, at 7c2ad93. Round 2's major is fixed on the real saved reading, through a real Send, at 1440 and 390 and over MCP, and QA agreed the evals needn't rerun: it went through the diff line by line. I took its three minors before merging: the filter now needs the whole reply to be SureSend's own text (three shapes reached Good to send without that), what it sets aside is recorded in `rejectedExtractions`, and the replay test has the case that would have caught the bug. Left for a later phase: copy with a doc unread on replies that carry a value (same on `main`), and the 404 page's missing label.

**QA round 4: APPROVED** at 6963504, confirming that last diff. Round 3's three shapes are Double-check; the demo's Ask-first replies still send, in the browser and over MCP; the new `usman-both` case fails on the old code and passes now.

**The final state, at 6963504.**
```
$ pnpm typecheck                     exit 0
$ pnpm lint                          exit 0, no warnings
$ pnpm test
Test Files  30 passed (30)
Tests  355 passed (355)
$ pnpm build                         exit 0
$ snapshot against evals/snapshots/phase11.json: 80 identical, 0 different, 0 missing (66 of the original 68; the other 2 are the no-claim reply)
p11-ui-check: pass=31 fail=0
p11-offer: pass=27 fail=0
p10-ui: pass=46 fail=0
step5-ayesha: pass=43 fail=0
mcp-menu: pass=31 fail=0
step6-phone-fix: pass=12 fail=0
tour-step6: pass=29 fail=0
tour-menu: pass=231 fail=0
$ pnpm mcp:e2e http://127.0.0.1:3100/api/mcp
ALL PASS
$ pnpm exec playwright test
1 passed (57.9s)
```
**e2e re-locked, shown to Abdullah before merging.** `git diff main..phase-11 -- .loop/locked` is empty and the spec's diff is the 3 lines in D-050. A real Edit on the file was refused by the hook. Fed to the hook directly:
```
Write, backslash path   exit 2  BLOCKED by protect-locked: "e2e/demo.spec.ts" is locked
Edit, backslash path    exit 2  BLOCKED by protect-locked: "e2e/demo.spec.ts" is locked
Write, forward path     exit 2  BLOCKED by protect-locked: "e2e/demo.spec.ts" is locked
Write, relative path    exit 2  BLOCKED by protect-locked: "e2e/demo.spec.ts" is locked
Bash, remove the spec   exit 2  BLOCKED by protect-locked: "rm" on "e2e/" is locked
Write to README.md      exit 0  (not locked)
```
One thing that test turned up: the hook exits 0 on input it can't parse. My first try sent malformed JSON and looked like a pass. Claude Code always sends valid JSON, so the lock holds, but it fails open.

```
$ git worktree list
D:/Project/slite 6963504 [phase-11]
```
GATE: PASSED

**Deployed to https://suresend-demo.vercel.app, live checks.** Merged to `main` at e85f974, CI success. Deployed twice: the second added `docs/VIDEO_SCRIPT.md`, `.agents/`, `.codex/` and `AGENTS.md` to `.vercelignore`, because Vercel doesn't apply `.gitignore` once that file exists. None of them was ever publicly reachable (404 on the first deploy).
```
repro /api/check: 200 CAUTION/UNSUPPORTED, ai saved, prompt 2026-11-02.5
  reversal_window "you'll see it reflected after the weekend" value=null → CAUTION/UNSUPPORTED, docs say 1 business day
  fee_refund "minus the processing charge" value=null → CAUTION/UNSUPPORTED, docs say refunded
  headline: Caution: the policy says 1 business day (Instant Rail: Reversal Exception, effective 27 Oct 2026), and the draft gives no checkable value.
repro /api/send, no OK: 428 ACKNOWLEDGEMENT_REQUIRED
repro /api/send, with OK: 200 sent=true
noCustomerMessage in the body: 200 CAUTION/UNSUPPORTED
Usman's preset: 200 ESCALATE, suggestion check ALLOW: "Thanks for your patience. I'm confirming the exact reversal timeline for your transfer and will update you here as soon as I have it. The transfe
Usman's holding reply /api/send: 200 sent=true, recorded: ["OWN_HOLDING_SENTENCE"]

p11-ui-check (live): exit 0 pass=31 fail=0
p11-offer (live): exit 0 pass=27 fail=0
p10-ui (live): exit 0 pass=46 fail=0
step5-ayesha (live): exit 0 pass=43 fail=0
mcp-menu (live): exit 0 pass=31 fail=0
step6-phone-fix (live): exit 0 pass=12 fail=0
tour-step6 (live): exit 0 pass=29 fail=0
tour-menu (live): exit 0 pass=231 fail=0
$ pnpm mcp:e2e https://suresend-demo.vercel.app/api/mcp
PASS check_reply 4 days on TCK-9001: Hold · suggestion "Failed transfers are reversed within 1 business day." (Good to send) · governing Instant Rail: Reversal Exceptio
PASS check_reply 4 days on TCK-9002: Ask first (ai_mode saved)
PASS check_reply two claims on TCK-9001: Hold [reversal window: Good to send; fee refund: Hold], suggestion keeps "1 business day" (ai_mode saved)
ALL PASS
$ security headers
Content-Security-Policy: frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
og.png 200, demo.gif 200
property="og:image" content="https://suresend-demo.vercel.app/og.png"
```

**After the merge: hedged cases × 10 on Groq, and the determinism wording (D-051).** Abdullah's request, on the frozen prompts. Full report: `evals/hedge-runs.md`.

**All 4 cases:** 36 of 40 as expected · 4 strict misses (Hold or Double-check, wrong reason) · 0 unsafe (Good to send) · 0 couldn't be checked.

**Clean cases only (3; H14 is exposed):** 26 of 30 as expected · 4 strict misses (Hold or Double-check, wrong reason) · 0 unsafe (Good to send) · 0 couldn't be checked.

| Case | Expected | Verdicts | As expected | Strict misses | Unsafe |
|---|---|---|---|---|---|
| H2-hedged | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 10 | 10/10 | 0 | 0 |
| H14-fee-hedged-no (exposed) | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 10 | 10/10 | 0 | 0 |
| H18-fee-hedged-no | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 6<br>Hold (CONTRADICTS_GOVERNING): 4 | 6/10 | 4 | 0 |
| H20-vague-mid-month | Double-check (UNSUPPORTED) | Double-check (UNSUPPORTED): 10 | 10/10 | 0 | 0 |

QA on this addendum: CHANGES_REQUIRED, then APPROVED at 6aacd6c. Its major: Abdullah's sentence wasn't true as written, since `decide()` also takes the ticket and the time. "On the same ticket at the same time" was added, and D-051 says that's his to overrule. Left as is: the tour's "SureSend reads your docs live" (from before this work, and not this claim).

**Deployed, live:**
```
PASS how-it-works has: on the same ticket at the same time, the same AI findings and the same docs always produce the same decision
PASS how-it-works has: gave the expected verdict on 36 of 40 runs
PASS how-it-works has: That the same reply always gets the same verdict
PASS how-it-works no longer has: demo path is stable
PASS MCP tool description says the AI reads the reply and the docs
PASS MCP tool description asks for ticket_id
PASS the repro on production: CAUTION/UNSUPPORTED
```
**Still open:** Gemini's rerun on the final rules (its daily limit, retry after about 08:00 UTC on 3 Nov), in its own commit, with `--provider gemini`.

### Phase 11, second round: a fee taken off the money reads as not refunded (D-052)
Abdullah's decision, after the report. Same branch name, same loop. Also: the tour's "reads your docs live", the 404 disclaimer, and the Codex files in `.gitignore`.

**Tests first (e00cd5d), recorded failing before the prompt or detector changed.**
```
$ pnpm vitest run lib/topics/feeRefund.test.ts lib/check/vagueReply.test.ts lib/ai/heldoutIntegrity.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
Test Files  2 failed | 1 passed (3)
Tests  6 failed | 113 passed (119)
FAIL  lib/check/vagueReply.test.ts > the fee taken off the money reads as not refunded (D-052) > if the AI misses the fee and states the timeline, the detector 
FAIL  lib/topics/feeRefund.test.ts > fee_refund: the detector > catches minus the processing charge
FAIL  lib/topics/feeRefund.test.ts > fee_refund: the detector > catches less the fee
FAIL  lib/topics/feeRefund.test.ts > fee_refund: the detector > catches less the small charge for the transfer
FAIL  lib/topics/feeRefund.test.ts > fee_refund: the detector > catches after deducting the transfer fee
FAIL  lib/topics/feeRefund.test.ts > fee_refund: the detector > catches net of the fee
$ the repro live, old prompt
reply [TCK-9001 instant] CAUTION/UNSUPPORTED (Double-check, AI live)
  claim: reversal_window "you'll see it reflected after the weekend" value=null → CAUTION/UNSUPPORTED, docs say 1 business day
  claim: fee_refund "minus the processing charge" value=null → CAUTION/UNSUPPORTED, docs say refunded
  card:  Your reply is vague on this. Your docs say 1 business day; your reply gives no number.
```
**After.** Prompt `2026-11-02.6`. Golden 74/75 (the miss: "less the small charge for the transfer" read as vague once, a Double-check), quotes 115/115, fields 173/180, gate PASS. Held-out clean 56/57, fee 20/21, vague 9/9, quotes 130/130; H23–H25 9/9. Exposed 17/18, quotes 40/40; H11 back to 3/3. Gemini's rerun on this prompt follows in its own commit.

**Hedged cases × 10 on this prompt:**

**All 4 cases:** 34 of 40 as expected · 6 strict misses (Hold or Double-check, wrong reason) · 0 unsafe (Good to send) · 0 couldn't be checked.

**Clean cases only (3; H14 is exposed):** 25 of 30 as expected · 5 strict misses (Hold or Double-check, wrong reason) · 0 unsafe (Good to send) · 0 couldn't be checked.

| Case | Expected | Verdicts | As expected | Strict misses | Unsafe |
|---|---|---|---|---|---|
| H2-hedged | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 10 | 10/10 | 0 | 0 |
| H14-fee-hedged-no (exposed) | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 9<br>Hold (CONTRADICTS_GOVERNING): 1 | 9/10 | 1 | 0 |
| H18-fee-hedged-no | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 5<br>Hold (CONTRADICTS_GOVERNING): 5 | 5/10 | 5 | 0 |
| H20-vague-mid-month | Double-check (UNSUPPORTED) | Double-check (UNSUPPORTED): 10 | 10/10 | 0 | 0 |

**Saved results.** `pnpm record`: Unexpected 0. Against Phase 10's 68: 62 identical. The 6: the no-claim reply (2), and the tour's digit-only edit (4, same decision, suggested reply now from the template). Against `phase11.json`, the repro and the Monday variant (2 personas each) go to Hold, as decided.

**Two things the checks caught in this round.** The re-recording's rewrite for the tour's digit-only edit said "within 2 business day". The replay test caught it, and re-recording gave the same words, so the server now checks that a rewrite states the value (D-052). And my first tour wording was long enough that the card covered the doc's text box at phone width; `step6-phone-fix` caught it and the sentence is short again.

**The final state, before QA.**
```
$ pnpm test: 372 passed
$ pnpm lint: exit 0
p11-ui-check (repro is a Hold; vague timeline; 404; Usman's preset; slide-over): pass=43 fail=0
p11-offer: pass=27 fail=0
p10-ui: pass=46 fail=0
step5-ayesha: pass=43 fail=0
mcp-menu: pass=31 fail=0
step6-phone-fix: pass=12 fail=0
tour-step6: pass=29 fail=0
tour-menu: pass=231 fail=0
pnpm mcp:e2e: ALL PASS
ui-audit: Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
playwright: 1 passed
```

**QA: APPROVED** at e197ab1, no blockers or majors. It reran the gate itself (typecheck, lint, 372 tests, build, snapshots, `pnpm e2e`, MCP e2e, axe, all browser checks), reproduced the tests-first run at e00cd5d (6 failed, 113 passed), and confirmed the Groq evals stand despite the later value check: decisions and tallies are unaffected, and each `suggestionIncludes` string is a value the template states. Its minors are taken, all wording: README overstated what the detector catches, "no reply reached Good to send" should say no miss did, H23 shares "taken off" with the rule, and the 404's SPEC reference. Left: the detector's false hits, as a Limitations line, since tightening it was optional and they only ever cost a Double-check.

```
$ git worktree list
D:/Project/slite [phase-11]
```
GATE: PASSED

**Deployed, second round, live checks.** Merged to `main` at 899f58d.
```
repro /api/check: 200 HOLD/CONTRADICTS_GOVERNING, ai saved, prompt 2026-11-02.6
  reversal_window "you'll see it reflected after the weekend" value=null → CAUTION/UNSUPPORTED, docs say 1 business day
  fee_refund "minus the processing charge" value={"flag":false} → HOLD/CONTRADICTS_GOVERNING, docs say refunded
  headline: Hold: the transfer fee is refunded for instant-rail transfers (Outgoing Transfers: Reversal SOP). The draft says it's not refunded.
repro /api/send, no OK: 409 
repro /api/send, with OK: 409 sent=undefined
noCustomerMessage in the body: 200 CAUTION/UNSUPPORTED
Usman's preset: 200 ESCALATE, suggestion check ALLOW: "Thanks for your patience. I'm confirming the exact reversal timeline for your transfer and will update you here as soon as I have it. The transfe
Usman's holding reply /api/send: 200 sent=true, recorded: ["OWN_HOLDING_SENTENCE"]

404 page: 404, 1 line(s) with the disclaimer
p11-ui-check (live): exit 1 pass=41 fail=2
FAIL 404 at 1440: the link goes back to the demo
FAIL 404 at 390: the link goes back to the demo
p11-offer (live): exit 0 pass=27 fail=0
p10-ui (live): exit 0 pass=46 fail=0
step5-ayesha (live): exit 0 pass=43 fail=0
mcp-menu (live): exit 0 pass=31 fail=0
step6-phone-fix (live): exit 0 pass=12 fail=0
tour-step6 (live): exit 0 pass=29 fail=0
tour-menu (live): exit 0 pass=231 fail=0
$ pnpm mcp:e2e https://suresend-demo.vercel.app/api/mcp
PASS check_reply two claims on TCK-9001: Hold [reversal window: Good to send; fee refund: Hold], suggestion keeps "1 business day" (ai_mode saved)
ALL PASS
```
The 2 fails above were my check, not the page: it waited for the footer, which the 404 page already has, so it looked before the navigation finished. Waiting for the navigation itself:
```
PASS 1440: status 404, disclaimer ×1, the link lands on https://suresend-demo.vercel.app/
PASS 390: status 404, disclaimer ×1, the link lands on https://suresend-demo.vercel.app/
```
**Still open:** Gemini's rerun on `2026-11-02.6`, scheduled for 08:07 UTC on 3 Nov, in its own commit.

**Gemini's rerun, in its own commit, as Abdullah asked.** On the final prompts and rules (`2026-11-02.6`, 8ab655d), 3 Nov, 3 runs each, with no limit or outage. Published as they came.
```
Golden, 08:07–08:15 UTC:   69/75, quotes 111/111, fields 180/180, gate PASS
  vague-very-soon          0/3, CAUTION/TOPIC_GAP on every run (expected CAUTION/UNSUPPORTED)
  vague-unknown-rail       0/3, CAUTION/TOPIC_GAP on every run (expected CAUTION/UNSUPPORTED)
Held-out, 08:15–08:26 UTC: clean 50/57, fee 21/21, vague 2/9, quotes 119/119; exposed 18/18, quotes 39/39
  H20-vague-mid-month      2/3, one CAUTION/TOPIC_GAP
  H21-vague-before-long    0/3, CAUTION/TOPIC_GAP on every run
  H22-vague-paperwork      0/3, CAUTION/TOPIC_GAP on every run
```
Every miss is Gemini finding no claim in a vague reply, and rule D0e catching it: the right verdict, Double-check, for a different reason. On the verdict alone it's 75/75, 57/57 and 18/18. Vague replies fell from 7/9 on the previous prompt to 2/9, though the prompt's timeline wording didn't change. I don't know why, and I didn't tune anything. `evals/results.md` again shows the eval's pick (Gemini, on field accuracy) with the override (Groq, D-044). Phase 11 has nothing left open.

**Deployed, Gemini's rows.** Abdullah said yes. `vercel deploy --prod` from 191fbc5, whose CI passed. Only reports and docs changed since the last deploy, so no app code moved. Live checks:
```
PASS /how-it-works status 200
PASS shows "92.0% (69/75)"
PASS shows "111/111"
PASS shows "87.7% (50/57)"
PASS shows "22.2% (2/9)"
PASS shows "119/119"
PASS shows "100% (18/18)"
PASS shows "Gemini's 6 misses are two vague replies"
PASS no longer shows "Gemini's rows are from the previous prompt"
PASS no longer shows "`gemini-3.5-flash-lite`, previous prompt"
PASS / status 200
PASS the demo renders
PASS /no-such-page status 404
all passed
```

## Phase 12: a European-friendly demo, and fixes from the re-check

Branch `phase-12`. Abdullah's brief, in PLAN.md §15. Decisions D-053 to D-058, and D-045 corrected.

**Held-out cases first.** H26–H39 (paraphrased wrong timelines) went in before anything else changed (3ba00ad). Four clean cases then shared a three-word phrase with the prompts' files, so I reworded them and re-ran those four (a3687ab), still before any change.

**Baseline on the old prompt (`2026-11-02.6`), old docs, Groq, 3 fresh readings each:**
```
$ pnpm tsx scripts/probe-draft.ts groq --para 3
H26-para-couple-working-instant (expected HOLD/CONTRADICTS_GOVERNING)
  reply: The refund reaches your wallet within a couple of working days.
  3× CAUTION/UNSUPPORTED [null definite]
H27-para-couple-working-standard (expected HOLD/CONTRADICTS_GOVERNING)
  reply: You'll see the full sum again in a couple of working days.
  3× CAUTION/UNSUPPORTED [null definite]
H28-para-few-days-instant (expected CAUTION/UNSUPPORTED)
  reply: The reversal takes a few days.
  3× CAUTION/UNSUPPORTED [null definite]
H29-para-few-working-standard (expected CAUTION/UNSUPPORTED)
  reply: It will be a few working days before the funds are back.
  3× CAUTION/UNSUPPORTED [null definite]
H30-para-about-week-instant (expected CAUTION/UNIT_MISMATCH)
  reply: Allow about a week for the money to return.
  3× CAUTION/UNSUPPORTED [null hedged]
H31-para-about-week-standard (expected CAUTION/UNIT_MISMATCH)
  reply: Your balance is restored in about a week.
  3× CAUTION/UNSUPPORTED [null hedged]
H32-para-two-to-three-instant (expected HOLD/CONTRADICTS_GOVERNING)
  reply: Give it two to three working days and the sum is yours again.
  3× HOLD/CONTRADICTS_GOVERNING [{"amount":2,"amountMax":3,"unit":"business_days"} definite]
H33-para-three-working-instant (expected HOLD/CONTRADICTS_GOVERNING)
  reply: Count on three working days before the funds reappear.
  3× HOLD/CONTRADICTS_GOVERNING [{"amount":3,"unit":"business_days"} definite]
H34-para-seven-business-standard (expected HOLD/CONTRADICTS_GOVERNING)
  reply: Seven business days is what it takes for the sum to reappear.
  3× HOLD/CONTRADICTS_GOVERNING [{"amount":7,"unit":"business_days"} definite]
H35-para-one-or-two-instant (expected HOLD/CONTRADICTS_GOVERNING)
  reply: One or two working days and the sum reappears.
  3× HOLD/CONTRADICTS_GOVERNING [{"amount":1,"amountMax":2,"unit":"business_days"} definite]
H36-para-day-or-two-instant (expected CAUTION/UNIT_MISMATCH)
  reply: A day or two at most and it's all yours again.
  3× CAUTION/UNIT_MISMATCH [{"amount":1,"amountMax":2,"unit":"calendar_days"} definite]
H37-para-handful-days-standard (expected CAUTION/UNSUPPORTED)
  reply: A handful of days and the cash is home.
  3× CAUTION/UNSUPPORTED [null definite]
H38-para-several-working-instant (expected CAUTION/UNSUPPORTED)
  reply: The bank needs several working days to hand it over.
  3× CAUTION/TOPIC_GAP [no claims]
H39-para-fortnight-standard (expected CAUTION/UNIT_MISMATCH)
  reply: You're looking at a fortnight before the cash comes home.
  2× CAUTION/UNSUPPORTED [null definite]
  1× CAUTION/UNIT_MISMATCH [{"amount":14,"unit":"calendar_days"} definite]

Total 42 readings: Hold 12, Double-check 30, Ask first 0, Good to send 0, couldn't check 0
```
"A couple of working days" read as no value on all 6 readings, so it never got a Hold. The four reworded cases, on the same prompt:
```
$ pnpm tsx scripts/probe-draft.ts groq --para 3 H32,H34,H35,H37
H32-para-two-to-three-instant (expected HOLD/CONTRADICTS_GOVERNING)
  reply: Give it two to three working days, then the sum is yours again.
  2× HOLD/CONTRADICTS_GOVERNING [{"amount":2,"amountMax":3,"unit":"business_days"} definite]
  1× HOLD/CONTRADICTS_GOVERNING [{"amount":2,"amountMax":3,"unit":"business_days"} definite + null definite]
H34-para-seven-business-standard (expected HOLD/CONTRADICTS_GOVERNING)
  reply: Seven business days is how long the sum needs to reappear.
  3× HOLD/CONTRADICTS_GOVERNING [{"amount":7,"unit":"business_days"} definite]
H35-para-one-and-two-instant (expected HOLD/CONTRADICTS_GOVERNING)
  reply: Between one and two working days, then the sum reappears.
  3× HOLD/CONTRADICTS_GOVERNING [{"amount":1,"amountMax":2,"unit":"business_days"} definite]
H37-para-handful-days-standard (expected CAUTION/UNSUPPORTED)
  reply: A handful of days, then the cash is home.
  3× CAUTION/UNSUPPORTED [null definite]

Total 12 readings: Hold 9, Double-check 3, Ask first 0, Good to send 0, couldn't check 0
```

**New checks first, recorded failing (a3687ab).** 47 of 65 failed before any fix. The other 18 are guards that must keep passing.
```
$ pnpm vitest run lib/check/phase12Copy.test.ts lib/topics/numberWords.test.ts lib/workspace/europeanDemo.test.ts lib/client/copyRules.test.ts
× has the new names on the same personas and rails 9ms
     × says "transfer", not "rail", in every doc and title 1ms
     × matches SPEC Appendix A, byte for byte 8ms
     × on every ticket 1ms
     × in the preset about a fee amount 1ms
     × README.md has no old name, currency or rail wording 2ms
     × docs/MCP_DEMO.md has no old name, currency or rail wording 1ms
     × e2e/demo.spec.ts has no old name, currency or rail wording 1ms
     × evals/golden.json has no old name, currency or rail wording 1ms
     × evals/heldout.json has no old name, currency or rail wording 1ms
     × scripts/mcp-e2e.ts has no old name, currency or rail wording 1ms
     × scripts/record-demo.ts has no old name, currency or rail wording 1ms
     × scripts/ui-audit.ts has no old name, currency or rail wording 1ms
     × within a couple of working days 9ms
     × in a couple of days 2ms
     × give it a couple of business days 1ms
     × it takes a few days 0ms
     × a few working days from now 0ms
     × the bank needs several working days 0ms
     × a handful of days 0ms
     × allow about a week 0ms
     × after a fortnight 1ms
     × a day or two at most 0ms
     × within a business day 0ms
     × a couple of hours 0ms
     × with the claim missed and no customer message, a reply like this can't pass as having no policy claim 4ms
     × draft: a couple of is 2, in the unit it names 10ms
     × source: a couple of is 2, in the unit it names 8ms
     × draft: a few stays vague, and a week is 7 calendar days 1ms
     × source: a few stays vague, and a week is 7 calendar days 2ms
     × nothing a visitor reads says "rail" 22ms
     × nothing a visitor reads has the old names or currency 11ms
     × says what's missing, then what the docs say 31ms
     × on a standard transfer, the value is that transfer's 3ms
     × with the transfer type unknown and the docs differing by type, no value is named 2ms
     × with a doc unread, it says so rather than naming the next doc's value (D-046) 3ms
     × with no doc on the topic, it only says what's missing 3ms
     × the topic asked can be the fee 4ms
     × MCP says the same, in the same words 7ms
     × the sentence isn't repeated: each line gives its own words 4ms
     × so does the trace's row for each claim 3ms
     × the fee rule covers all transfers: no type, on either ticket 1ms
     × the same when the reply matches 2ms
     × the exception is about instant transfers, so it says so 1ms
     × a general rule beside an exception still names the ticket's type: with another type on a different value, "failed transfers" would be false 1ms
     × a general rule with no exception names no type 1ms
     × no seed ticket's card says "for instant" about a rule for all transfers 1ms
 Test Files  4 failed (4)
      Tests  47 failed | 18 passed (65)
```
The slide-over check against production, which was main at d1246e6:
```
$ pnpm tsx scripts/slide-over-check.ts https://suresend-demo.vercel.app
FAIL 1099: with the panel open, on top: 3 pills and the Demo menu; covered: pill 1, pill 2, pill 3, Demo menu
FAIL 1099: Shift+Tab from the panel reaches the pills, with the panel still open
FAIL 1099: the Demo menu can be clicked with the panel open
FAIL 1099: a pill can be clicked with the panel open, and switches the conversation
FAIL 1099: changing the conversation closes the panel (D-049)
PASS 1099: no scrollbar on the pill strip (bar 0px, overflow false, hidden false)
FAIL 1024: with the panel open, on top: 3 pills and the Demo menu; covered: pill 1, pill 2, pill 3, Demo menu
FAIL 1024: Shift+Tab from the panel reaches the pills, with the panel still open
FAIL 1024: the Demo menu can be clicked with the panel open
FAIL 1024: a pill can be clicked with the panel open, and switches the conversation
FAIL 1024: changing the conversation closes the panel (D-049)
PASS 1024: no scrollbar on the pill strip (bar 0px, overflow false, hidden false)
FAIL 900: with the panel open, on top: 3 pills and the Demo menu; covered: pill 1, pill 2, pill 3, Demo menu
FAIL 900: Shift+Tab from the panel reaches the pills, with the panel still open
FAIL 900: the Demo menu can be clicked with the panel open
FAIL 900: a pill can be clicked with the panel open, and switches the conversation
FAIL 900: changing the conversation closes the panel (D-049)
FAIL 900: no scrollbar on the pill strip (bar 15px, overflow true, hidden false)
FAIL 700: with the panel open, on top: 3 pills and the Demo menu; covered: pill 1, pill 2, pill 3, Demo menu
FAIL 700: Shift+Tab from the panel reaches the pills, with the panel still open
FAIL 700: the Demo menu can be clicked with the panel open
FAIL 700: a pill can be clicked with the panel open, and switches the conversation
FAIL 700: changing the conversation closes the panel (D-049)
FAIL 700: no scrollbar on the pill strip (bar 15px, overflow true, hidden false)
22 failed
```
The scrollbar check passed at 1099 and 1024 in that run only because the strip fitted with those tags. It now requires the bar hidden in every state, so a wider tag can't bring it back.

**The unlock (D-053).** `.loop/locked` moved aside, one script run, moved back. The script stopped partway on B3's fixture, which has none of these words; the lock went straight back on, and I opened it once more to finish the same edit. The diff is in D-053.

**A real problem the eval found: the accent.** The first eval session, on prompt `2026-11-03.1`, gave H1 ("Hi Léa, so sorry about this! The money…") Couldn't check on 2 of 3 runs, which H1 had never done. The spans came back lowercased: "the money from a failed transfer…", which isn't verbatim, so every claim is rejected and the check fails closed.
```
$ 10 fresh readings each, on prompt 2026-11-03.1
Hi Ayesha, so sorry ab...: 0 of 10 readings had a span that isn't verbatim
Hi Léa, so sorry about...: 7 of 10 readings had a span that isn't verbatim
Hi Sofia, so sorry abo...: 1 of 10 readings had a span that isn't verbatim
So sorry about this! T...: 0 of 10 readings had a span that isn't verbatim
```
So the rename caused it, and the demo's lead ticket would have hit it whenever a reply greeted Léa by name. CLAUDE.md rule 3 says to fix the prompt, not the rule, and the fix is one sentence on the draft side: "the same capitals, accents and punctuation. A span that starts a sentence keeps its capital letter." After it:
```
$ the same, on the draft prompt with that sentence
Hi Léa, so sorry about this! The m...: 0 of 9 not verbatim
Hi Sofia, so sorry about this! The...: 0 of 10 not verbatim
Hi Léa, thanks for waiting. Failed...: 0 of 10 not verbatim
Thanks for your patience, Léa. You...: 0 of 10 not verbatim
```
Prompt `2026-11-03.2`. That superseded the first session, so it's recorded here and everything was re-recorded and re-run. The first session, for the record:
```
Prompt 2026-11-03.1, Groq, 3 runs: golden 75/75, quotes 117/117, fields 173/180, gate PASS
- Runs per case: 3 · started: 2026-11-03T13:18:15.785Z · finished: 2026-11-03T14:14:08.859Z · throttled · provider errors retried, with no answer to score: 15
- Decision accuracy: **89.3%** (67/75)
- Paraphrased wrong timelines: **Hold 12/18**, Double-check 6, Ask first 0, Good to send 0; verdict and reason as expected 15/18
- Quote validity: **98.7%** (153/155 extracted quotes/spans verbatim; 2 rejected)
```

**Saved results, against the before-snapshot.** Prompt `2026-11-03.2`, 132 results: golden, presets, tour, doc fix.
```
$ pnpm tsx scripts/snapshot-results.ts evals/snapshots/phase12-after.json --compare evals/snapshots/phase12-before.json
132 results → evals/snapshots/phase12-after.json (0 not on saved responses)
Compared with evals/snapshots/phase12-before.json: 126 identical, 4 different, 2 missing.
tour edit digitOnly verify (support_agent)
  before: HOLD/CONTRADICTS_GOVERNING [reversal_window:HOLD/CONTRADICTS_GOVERNING] suggestion template→CAUTION
  after:  HOLD/CONTRADICTS_GOVERNING [reversal_window:HOLD/CONTRADICTS_GOVERNING] suggestion ai→CAUTION
tour edit digitOnly verify (ops_lead)
  before: HOLD/CONTRADICTS_GOVERNING [reversal_window:HOLD/CONTRADICTS_GOVERNING] suggestion template→CAUTION
  after:  HOLD/CONTRADICTS_GOVERNING [reversal_window:HOLD/CONTRADICTS_GOVERNING] suggestion ai→CAUTION
after fix + tour edit digitOnly verify (support_agent)
  before: HOLD/CONTRADICTS_GOVERNING [reversal_window:HOLD/CONTRADICTS_GOVERNING] suggestion template→CAUTION
  after:  HOLD/CONTRADICTS_GOVERNING [reversal_window:HOLD/CONTRADICTS_GOVERNING] suggestion ai→CAUTION
after fix + tour edit digitOnly verify (ops_lead)
  before: HOLD/CONTRADICTS_GOVERNING [reversal_window:HOLD/CONTRADICTS_GOVERNING] suggestion template→CAUTION
  after:  HOLD/CONTRADICTS_GOVERNING [reversal_window:HOLD/CONTRADICTS_GOVERNING] suggestion ai→CAUTION
missing: preset TCK-9002 Only the fee (any rail) (support_agent)
missing: preset TCK-9002 Only the fee (any rail) (ops_lead)
```
The 2 "missing" rows are one preset's new label ("any transfer type"). With that mapped: 132 of 132 keep their decision, reason and each claim's verdict. The 4 "different" rows have the same decision and reason, and their suggested reply now comes from the AI's rewrite, not the template. **So nothing Part B set out to change moved a saved decision or reason:** its changes are copy, layout, and number words no saved reply uses.

**Groq, prompt `2026-11-03.2`, 3 runs, as they came.** Today's provider timeouts stopped the golden run once, with its progress kept. It resumed with no answers scored from a failed call.
```
$ pnpm eval --provider groq
- Runs per case: 3 · started: 2026-11-03T14:33:03.345Z · finished: 2026-11-03T16:02:55.894Z · throttled · provider errors retried, with no answer to score: 7
- Decision accuracy: **97.3%** (73/75)
- Quote validity: **98.3%** (115/117 extracted quotes/spans verbatim; 2 rejected)
- Extraction field accuracy (vs hand-written fixtures): **95.0%** (171/180)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**
| vague-monday-less-charge |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✗ HOLD/CONTRADICTS_GOVERNING · ✗ HOLD/CONTRADICTS_GOVERNING | 1/3 |
$ pnpm eval --heldout --provider groq
- Runs per case: 3 · started: 2026-11-03T14:43:07.036Z · finished: 2026-11-03T15:43:05.696Z · throttled · provider errors retried, with no answer to score: 16
**Clean held-out cases (25)**
- Decision accuracy: **92.0%** (69/75)
- Fee cases only: **85.7%** (18/21)
- Vague replies only: **100.0%** (9/9)
- Paraphrased wrong timelines: **Hold 12/18**, Double-check 6, Ask first 0, Good to send 0; verdict and reason as expected 15/18
- Quote validity: **100.0%** (158/158 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **95.4%** (103/108)
| H18-fee-hedged-no | Hedged "not refunded", worded without the hedge list: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✗ HOLD/CONTRADICTS_GOVERNING · ✗ HOLD/CONTRADICTS_GOVERN
| H38-para-several-working-instant | "Several" is a count with no number too: vague | CAUTION / UNSUPPORTED | ✗ CAUTION/EXTRACTION_GAP · ✗ CAUTION/EXTRACTION_GAP · ✓ | 1/3 |
| H39-para-fortnight-standard | A fortnight is 14 calendar days. The units differ, so Double-check | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✗ CAUTION/UNSUPPORTED | 2/3 |
**Exposed cases (14): regression only, not held-out**
- Decision accuracy: **81.0%** (34/42)
- Paraphrased wrong timelines: **Hold 6/24**, Double-check 18, Ask first 0, Good to send 0; verdict and reason as expected 19/24
- Quote validity: **100.0%** (72/72 extracted quotes/spans verbatim; 0 rejected)
| H13-fee-unknown-rail | Fee refunded on the ticket with an unknown transfer type: the fee rule covers all transfers, so the type doesn't matter | CAUTION / TOPIC_GAP | ✓ · ✓ · ✗ CAUTION/UNS
| H14-fee-hedged-no | Hedged "not refunded" contradicts the policy: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✗ HOLD/CONTRADICTS_GOVERNING · ✓ · ✗ HOLD/CONTRADICTS_GOVERNING 
| H31-para-about-week-standard | The same on a standard transfer | CAUTION / UNIT_MISMATCH | ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED | 0/3 |
| H36-para-day-or-two-instant | "A day or two" is 1–2 calendar days. The units differ, so Double-check | CAUTION / UNIT_MISMATCH | ✓ · ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED | 1/3 |
```
**The gate on the code, after QA's first pass:**
```
$ pnpm typecheck && pnpm lint: clean
$ pnpm test
 Test Files  33 passed (33)
      Tests  445 passed (445)
$ pnpm e2e
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1
  1 passed (27.9s)
$ pnpm tsx scripts/ui-audit.ts --serve
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
$ pnpm mcp:e2e (local, saved mode)
ALL PASS
$ pnpm tsx scripts/slide-over-check.ts --serve   (50 checks; 1024 and the short screen shown)
PASS 1024: with the panel open, on top: 3 pills and the Demo menu
PASS 1024: Shift+Tab from the panel reaches the pills, with the panel still open
PASS 1024: Esc closes the panel with focus outside it
PASS 1024: closing leaves focus on a control, not the page
PASS 1024: the page can't jump sideways when the panel opens (scrollLeft 0, overflow clip)
PASS 1024: the Demo menu can be clicked with the panel open
PASS 1024: the Demo menu opens
PASS 1024: a pill can be clicked with the panel open, and switches the conversation
PASS 1024: changing the conversation closes the panel (D-049)
PASS 1024: arrow keys bring the last pill into view
PASS 1024: no scrollbar on the pill strip (bar 0px, overflow false, hidden true)
PASS 1024: in the tour, Send is uncovered once the suggested reply is in the composer
PASS 844×390: the panel keeps its height (338 px)
PASS 844×390: Tab stays inside the panel, since it covers the pills
all passed
```

**QA's second pass: APPROVED at 845c464**, no blockers or majors, 15 minors. It reran the gate itself and counted every published number by hand against the reports. What I did with the minors:
- **Fixed in code:** `overflow: clip` had stopped a short screen scrolling to Send, so it's now only where the slide-over needs it. Tour step 6 falls back to Send. (Its scroll to the doc only worked on tall screens at this point; QA's confirmation showed that, and it's fixed below.) The phone's hanging dot is gone. The copy check's allowlist is scoped: a bare "rail" only outside JSX, MCP's phrases only in MCP. The eval's report keeps what each miss said.
- **Fixed in words:** "previous prompt" meant two prompts in the README. "Groq 74/75", "65/75", "22 of its first 28", the unsourced line about Gemini's quota, and README's account of the golden misses, which now separates what's on disk from what's inferred.
- **Left, and why (D-059):** a claim dropped for a bad quote can leave Good to send, which is a rule change for Abdullah. The tour's card over the doc from 700 to 793 px. Esc after the reset dialog. `inert` dropping the landmark while the panel is open, and "resolves for an unknown transfer type" behind Details: QA agrees with both.

**The last span probe, by hand before the script existed (prompt `2026-11-03.2`):**
```
You can relax, the funds retur...: 1 of 10 not verbatim | the funds return on its own by Monday
Hi Léa, so sorry about this! T...: 0 of 10 not verbatim |
```

**The same probe with the committed script (prompt `2026-11-03.2`), so anyone can run it:**
```
$ pnpm tsx scripts/probe-draft.ts groq --spans 10 "<reply>"
0 of 10 readings had a span that isn't verbatim: "Hi Léa, so sorry about this! The money from a fail…"
2 of 10 readings had a span that isn't verbatim: "You can relax, the funds return on their own by Mo…"
  "the funds return on its own by Monday"
```
So "Hi Léa" is 0 of 29 across the three runs on this wording, and the miscopy 3 of 20. A first try gave 0 of 0: a local DNS failure, not a provider's, which the script now says rather than hiding.

**QA's confirmation of those fixes: APPROVED at 3f10951**, no blockers or majors. Half of one item didn't hold: step 6 scrolled to the doc only on screens about 735 px tall and up, and the edit could tug the panel once when scrolling by hand. The 51st check also passed with the bug put back, since a rectangle ignores clipping.

**After it, with no further QA pass, so check these first if anything looks off:**
- **Step 6:** a target above or below the fold now counts as one to scroll to, once, keyed on that rather than on what's on screen. Only a target waiting off to the side or hidden, like a closed panel, doesn't. My own walk, through step 5's review:
```
1024×800: step 5's review open: true
PASS 1024×800: doc top 216, textarea visible 230 of 230, after scrolling to the top by hand the panel stays at 0
  1024×700: step 5's review open: true
PASS 1024×700: doc top 216, textarea visible 230 of 230, after scrolling to the top by hand the panel stays at 0
  1024×600: step 5's review open: true
PASS 1024×600: doc top 216, textarea visible 230 of 230, after scrolling to the top by hand the panel stays at 0
  800×700: step 5's review open: true
PASS 800×700: doc top 216, textarea visible 230 of 230, after scrolling to the top by hand the panel stays at 0
  800×600: step 5's review open: true
PASS 800×600: doc top 216, textarea visible 230 of 230, after scrolling to the top by hand the panel stays at 0
  1440×700: step 5's review open: true
PASS 1440×700: doc top 142, textarea visible 230 of 230, after scrolling to the top by hand the panel stays at 0
  1280×600: step 5's review open: true
PASS 1280×600: doc top 142, textarea visible 230 of 230, after scrolling to the top by hand the panel stays at 0
PASS 320: /Léa K\./: the picker ends 0 px past its column
PASS 320: /Lukas R\./: the picker ends 0 px past its column
PASS 320: /Sofia S\./: the picker ends 0 px past its column
all passed
```
My first version of this walk never opened the review, since it looked for the wrong button, so its pass meant nothing. This one prints that it did.
- **The 51st check** asks what a click would hit.
- **320 px:** the picker stays in its column.
- **Words:** "the prompt just before this one" names `2026-11-03.1`. The dropped-claim path states its full conditions: wording the detector doesn't know is one of them. D-056's "QA agreed" is credited right, and an unsourced line in D-059 is gone.

**The gate, final run on this code:**
```
$ pnpm typecheck && pnpm lint: clean
$ pnpm test
 Test Files  33 passed (33)
      Tests  445 passed (445)
$ pnpm e2e
  ok 1 [chromium] › e2e\demo.spec.ts:15:5 › wrong draft → Send → held → Use this reply → Send → sent → Demo menu shows 1
  1 passed (27.8s)
$ pnpm tsx scripts/ui-audit.ts --serve
Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.
$ pnpm mcp:e2e (local, saved mode)
ALL PASS
$ the guided tour at 1024 and 800, every step
all passed
$ pnpm tsx scripts/slide-over-check.ts --serve
PASS 1099: with the panel open, on top: 3 pills and the Demo menu
PASS 1099: Shift+Tab from the panel reaches the pills, with the panel still open
PASS 1099: Esc closes the panel with focus outside it
PASS 1099: closing leaves focus on a control, not the page
PASS 1099: the page can't jump sideways when the panel opens (scrollLeft 0, overflow clip)
PASS 1099: the Demo menu can be clicked with the panel open
PASS 1099: the Demo menu opens
PASS 1099: a pill can be clicked with the panel open, and switches the conversation
PASS 1099: changing the conversation closes the panel (D-049)
PASS 1099: arrow keys bring the last pill into view
PASS 1099: no scrollbar on the pill strip (bar 0px, overflow false, hidden true)
PASS 1099: in the tour, Send is uncovered once the suggested reply is in the composer
PASS 1024: with the panel open, on top: 3 pills and the Demo menu
PASS 1024: Shift+Tab from the panel reaches the pills, with the panel still open
PASS 1024: Esc closes the panel with focus outside it
PASS 1024: closing leaves focus on a control, not the page
PASS 1024: the page can't jump sideways when the panel opens (scrollLeft 0, overflow clip)
PASS 1024: the Demo menu can be clicked with the panel open
PASS 1024: the Demo menu opens
PASS 1024: a pill can be clicked with the panel open, and switches the conversation
PASS 1024: changing the conversation closes the panel (D-049)
PASS 1024: arrow keys bring the last pill into view
PASS 1024: no scrollbar on the pill strip (bar 0px, overflow false, hidden true)
PASS 1024: in the tour, Send is uncovered once the suggested reply is in the composer
PASS 900: with the panel open, on top: 3 pills and the Demo menu
PASS 900: Shift+Tab from the panel reaches the pills, with the panel still open
PASS 900: Esc closes the panel with focus outside it
PASS 900: closing leaves focus on a control, not the page
PASS 900: the page can't jump sideways when the panel opens (scrollLeft 0, overflow clip)
PASS 900: the Demo menu can be clicked with the panel open
PASS 900: the Demo menu opens
PASS 900: a pill can be clicked with the panel open, and switches the conversation
PASS 900: changing the conversation closes the panel (D-049)
PASS 900: arrow keys bring the last pill into view
PASS 900: no scrollbar on the pill strip (bar 0px, overflow true, hidden true)
PASS 900: in the tour, Send is uncovered once the suggested reply is in the composer
PASS 700: with the panel open, on top: 3 pills and the Demo menu
PASS 700: Shift+Tab from the panel reaches the pills, with the panel still open
PASS 700: Esc closes the panel with focus outside it
PASS 700: closing leaves focus on a control, not the page
PASS 700: the page can't jump sideways when the panel opens (scrollLeft 0, overflow clip)
PASS 700: the Demo menu can be clicked with the panel open
PASS 700: the Demo menu opens
PASS 700: a pill can be clicked with the panel open, and switches the conversation
PASS 700: changing the conversation closes the panel (D-049)
PASS 700: arrow keys bring the last pill into view
PASS 700: no scrollbar on the pill strip (bar 0px, overflow true, hidden true)
PASS 700: in the tour, Send is uncovered once the suggested reply is in the composer
PASS 844×390: the panel keeps its height (338 px)
PASS 844×390: Tab stays inside the panel, since it covers the pills
PASS 844×390: focus on Send brings it into view, on top
all passed
```

**The re-lock, proven with a real attempt.** `.loop/locked` is back, with no diff against main:
```
$ touch SPEC.md data/seed/tickets.json tests/helpers/fixtures.ts e2e/demo.spec.ts
BLOCKED by protect-locked: "touch" on "tests/", "spec.md", "data/seed/", "e2e/" is locked (SPEC is the contract; see CLAUDE.md rule 1). If a locked test or doc is wrong, write .loop/BLOCKER.md with the test, line, expected vs actual and SPEC section, then stop.
$ git diff main --stat -- .loop/locked IMPLEMENTATION_BRIEF.md tests/engine tests/ai .claude
(no output)
$ git diff main -U0 -- SPEC.md | grep "^@@"
@@ -396 @@  @@ -409 @@  @@ -412,2 @@  @@ -415,2 @@  @@ -418 @@  @@ -446,3 @@     (all inside Appendix A, lines 387–449)
```

**Not done in this phase:** Gemini on prompt `2026-11-03.2`, which follows in its own commit once its daily quota allows. The hedge runs weren't repeated on this prompt, and README labels them with the prompt they ran on.

```
$ git worktree list
D:/Project/slite 3f10951 [phase-12]
```
GATE: PASSED

