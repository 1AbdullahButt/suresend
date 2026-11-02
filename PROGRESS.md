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
returned 0 claims once and the instance kept that. Fresh calls with the same prompt read the fee part as a contradiction, 5 of 5.
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
