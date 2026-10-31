# Decisions

> SureSend was called AnswerGuard in SPEC v2.2 and the brief.

Each entry: date, decision, reason. SPEC.md is never edited; amendments to it are recorded here.

## 2026-10-30

### D-001 · AI provider is Groq (amendment to SPEC §10)
- Requested by Abdullah after plan approval. All AI calls (source extraction, draft extraction, safe reply) go
  through `lib/ai/client.ts`, a provider adapter. `AI_PROVIDER=groq` (default) uses Groq's OpenAI-compatible
  API with JSON-schema structured output. `AI_PROVIDER=anthropic` keeps an Anthropic adapter, off by default.
- Env: `GROQ_API_KEY`, `GROQ_MODEL`, `AI_PROVIDER` (plus `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` for the off-by-default adapter).
- Unchanged: zod validation, retry once, quote validation, saved fallback, eval gate 3/3.
- Cache identity adds `provider` next to `model` (SPEC §10 lists `model`; provider is added so two providers serving
  a model with the same name can never share an entry).
- Groq 429 → treated like a limiter hit: that request uses saved responses and shows "Live AI paused".
- Model choice: recorded in D-010 once verified against Groq's live model list.

### D-002 · Spec ambiguity defaults (plan §5)
1. **"Contradicts" across units.** D11(b) compares amount ranges only; a unit-only difference is written to the trace,
   not treated as a contradiction. Reason: Brief §5 makes SRC-202's "1 day" calendar days, and SPEC T6 requires
   "1 business day" on TCK-9001 to be ALLOW. D1/D4 "agree" requires same amount, amountMax and unit.
2. **Quote normalization.** Whitespace collapse + Unicode NFKC + dash variants (– — ‑ ‒ −) → "-" and smart quotes → straight,
   applied to both quote and text. Reason: SPEC says "normalize whitespace"; models routinely swap the en dash in
   "Outgoing Transfers – Reversal SOP", which would silently break D5. Still a strict substring check.
3. **D0b vs D0c overlap.** When there are zero reversal_window claims: if every detector match lies inside the span of an
   extracted `other` claim with a value → D0c `OUTSIDE_COVERAGE`; any uncovered match → D0b `EXTRACTION_GAP`.
4. **Overall reason fields.** `CheckResult` is extended (no existing field changed) with `reasonCode` (overall),
   `caps` (e.g. `SOURCE_UNREAD` naming the source) and `patternMatches` (detector hits for highlighting).
5. **Hedged contradiction** reason code: `HEDGED_CONTRADICTION` (CAUTION).
6. **Supersession target matching.** Normalize by lowercasing and collapsing every non-alphanumeric run to one space,
   then containment of the source title or ID. "Outgoing Transfers: Reversal SOP" thus matches
   "Outgoing Transfers – Reversal SOP".
7. **T5 "no substring of its body".** Tested as: no line of the body ≥ 12 chars, no title, no `DOC-105`, `FR-HOLD`, `CMP-7`.
8. **Locking.** The Phase 2 cache-identity unit test is written in Phase 0 (tests/ locks then). `e2e/` is added to the lock
   list once written in Phase 3.
9. **Next.js 15** pinned, per the brief.

### D-003 · Tooling
- pnpm was not installed; installed via corepack (falls back to `npm i -g pnpm`).
- Next.js scaffolded by hand (create-next-app refuses a non-empty folder).
- Hook matchers include `PowerShell` and `NotebookEdit` in addition to Edit/Write/MultiEdit/Bash, because those tools exist
  in this environment and would otherwise bypass the lock.
- No git worktrees (CLAUDE.md rule 8). `git worktree add` is blocked by the lock hook regardless of lock state.

### D-004 · Test seams
- Tests call `runCheck(input, deps)` and `handleCheck/handleSend(body, deps)` from `lib/check/`. `deps` injects
  `extractDraft`, `extractSource`, optional `suggestReply`, and `now`. Route files are thin wrappers that pass the real
  AI deps. This lets fixtures replace the AI and lets T5 spy on what the AI would receive.
- Phase 0 ships typed stubs that throw `NOT_IMPLEMENTED` so the Phase 0 gate fails on behaviour, not imports.
- All tests use `decisionTime = 2026-10-30T12:00:00Z`.

### D-005 · Safe-reply recheck for templates
- The HOLD template is rechecked through `decide()` with a deterministic draft claim (we authored the text, so the span
  and value are known). No AI call; the recheck still runs the full rule set. AI-written replies are rechecked with a real
  draft extraction.

### D-006 · Golden eval cases (12)
3 canonical tickets + B1–B7 + TCK-9001 "1 business day" (ALLOW) + a draft with no policy claim (ALLOW `NO_POLICY_CLAIM`).

### D-007 · B5 future date
B5 uses "Effective 1 Jan 2030" so the variant stays in the future for the life of the demo.

### D-008 · Toolchain pins and subagent invocation
- `corepack enable` failed with EPERM (Program Files); pnpm 9.15.9 installed with `npm i -g pnpm@9` instead.
- TypeScript pinned to 5.9 (pnpm resolved 7.0, which Next 15's type-check integration doesn't support); `@next/env` pinned to 15 to match `next@15.5`.
- Line endings forced to LF via `.gitattributes` so seed docs stay byte-exact on Windows.
- Project subagents in `.claude/agents/` load only when a Claude Code session starts. In the session that created them,
  each role runs as a general-purpose agent instructed to read and follow its `.claude/agents/<role>.md` file. Future
  sessions (and `/build`) use the named agents directly.

### D-009 · Groq structured output mode
Groq supports `response_format: {type: "json_schema", strict: true}` (constrained decoding) only on a few models, and
not together with tool use or streaming. Strict mode requires every property in `required`, `additionalProperties: false`
and nullable unions for optional values, so the JSON schemas sent to Groq make `amountMax` nullable and zod maps
`null` → absent before validation.

### D-010 · ESCALATE template recheck is deterministic too
Extends D-005: the ESCALATE template is asserted timeline-free (no digits, no day/hour words, no detector hit) and rechecked
through `decide()` with zero draft claims (→ ALLOW `NO_POLICY_CLAIM`). No AI call. (QA Phase 0 finding #5.)

### D-011 · Sequencing note
While QA reviewed the Phase 0 tests, the orchestrator drafted the Phase 1 engine in `lib/engine/` (files QA was not reviewing).
To keep the Phase 0 evidence honest, the stubs were temporarily restored to capture the failing test run, then the engine was
put back. Phase 1 still goes through its own tester run and independent QA review.

### D-012 · Phase 1 QA fixes (spec gaps closed conservatively)
1. **D1 also fires when every candidate is SCOPE_UNRESOLVED** (unknown rail, only rail-specific rules apply). SPEC's D1
   needs two differing values; without this, D4 would set V from an instant-only rule on a ticket whose rail is unknown
   and HOLD with a timeline. Escalating is the conservative reading of "escalate when unsure" (SPEC §17).
2. **Duplicate claims collapse**: candidates from the same source with the same value count once (the one carrying a
   supersedes sentence wins), so an extractor that splits one doc into two claims can't make it fail D5/D6 "exactly one".
   Claims from the same source with *different* values still conflict: a source can't supersede its own claim (D5 condition 3 fails).
3. **A source whose every extracted claim fails quote validation counts as unread** (`ALL_CLAIMS_REJECTED` → the
   SOURCE_UNREAD cap), mirroring D0a on the draft side. "The AI found nothing usable" is never treated as "safe".
4. **A draft claim with no value** records D1/D2 as skipped and D3 fired ("unsupported"), so the trace never jumps.
5. **Top-level trace**: `CheckResult.trace` (extension) holds D0a/D0b/D0c/D0d, the SOURCE_UNREAD cap and the roll-up.
6. **AI safe replies**: accepted only when the recheck is ALLOW, or CAUTION for WEAK_BASIS / CHANGE_SIGNALLED /
   SOURCE_UNREAD. A CAUTION meaning "couldn't understand the reply" (EXTRACTION_GAP, OUTSIDE_COVERAGE, …) falls back to
   the template. SPEC §6.7's "ALLOW or CAUTION" is the outer bound.
7. Provider/API errors are listed as `EXTRACTION_ERROR`; `INVALID_OUTPUT` is reserved for output that failed validation.
8. D5's fired trace lists conditions 1–4 explicitly; condition 2 (supersedes quote verbatim) is re-checked in the engine.

### D-013 · Groq model: `openai/gpt-oss-120b`
Groq's live model list for this key (2026-10-30): allam-2-7b, gpt-oss-20b, gpt-oss-120b, gpt-oss-safeguard-20b,
qwen3.8-27b, whisper, prompt-guard, orpheus. Strict JSON-schema mode (constrained decoding) is documented for gpt-oss-20b,
gpt-oss-120b and qwen3.8-27b; Groq's own comparison table lists only the gpt-oss models as strict. gpt-oss-120b is the
largest of these, a reasoning model, and passed a smoke test with the exact schema shape (nullable nested objects, enums).
Settings: temperature 0, `reasoning_effort: "medium"`. Override with `GROQ_MODEL`.
Findings from the smoke test that shaped the schema layer: the model sometimes returns "27 Oct 2026" for an ISO field and an
empty supersedes quote, so zod normalizes dates (unparseable → null) and keeps an empty supersedes quote for quote validation
to drop (listed as a rejected extraction) instead of failing the whole output.

### D-014 · Anthropic adapter details (off by default)
The current `@anthropic-ai/sdk` Messages API rejects `temperature` for current models, so the adapter omits it and relies on a
forced tool call + zod validation. Default model `claude-haiku-5-5` per SPEC §10.

### D-015 · Fallback order and the eval
- Runtime order per AI task: in-memory cache → saved response file (exact identity) → live provider (if configured and the
  limiter allows) → AI unavailable. Saved files are checked before live, so unedited seed docs never call the model (SPEC §10.5).
- A provider 429 or a limiter denial marks the run `paused` ("Live AI paused, showing saved responses"); it is not retried.
- The eval bypasses saved files and starts each run with an empty in-memory cache; within one run identical inputs are
  extracted once and shared across cases (keeps the run inside Groq free-tier token limits). Eval-only backoff on 429.

### D-016 · Groq tier limits observed (deploy consideration)
The key's limits (response headers, 2026-10-30): 1,000 requests/day and **8,000 tokens/minute** for gpt-oss-120b. One
extraction costs ~1–1.5k tokens including reasoning, and a check runs the draft and every source in parallel, so bursts hit
the TPM limit. Effects: the eval runs slowly (with backoff), and on the public demo concurrent live checks fall back to
saved responses with the "Live AI paused" badge (the designed behaviour, SPEC §10). Unedited seed docs never call the model.
A paid Groq tier would raise this; flagged for the Phase 4 deploy checkpoint, not changed here.

### D-017 · Two providers: Groq + Gemini, with a fallback (amends D-001 and SPEC §10)
Requested by Abdullah during Phase 2.
- `lib/ai/client.ts` has three adapters: **groq** (`openai/gpt-oss-120b`, strict JSON schema), **gemini**
  (`gemini-3.5-flash-lite` via the official `@google/genai` SDK, native `responseJsonSchema` + `application/json`),
  and **anthropic** (off by default). `gemini-3.8-flash` is deliberately not used (its free daily quota is too small for the eval).
- Env: `AI_PROVIDER` (groq|gemini), `AI_FALLBACK_PROVIDER`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GROQ_MODEL`, `GEMINI_MODEL`
  (plus `ANTHROPIC_*` for the off-by-default adapter).
- Runtime chain per AI task: memory cache → saved response (primary identity, then the fallback's) → live primary →
  on 429/quota (or a provider/network error) the fallback **once** → saved/unavailable with "Live AI paused". Invalid output
  after the retry is reported, not masked by the other provider. `AiRunInfo` gains `provider` and `fellBack`.
- Provider and model stay in the cache identity, so each provider's saved responses are separate.
- The eval runs on both providers (3/3 each) and writes `evals/results.md`; whichever passes the gate becomes
  `AI_PROVIDER`, the other `AI_FALLBACK_PROVIDER`; if both pass, fewer quote rejections wins.
- Eval and recorder are throttled per provider (`throttled()`, Groq ≥12 s between calls for ~8K TPM, Gemini ≥4.5 s; Gemini
  Flash-Lite ~500 requests/day) so they stay under free tiers instead of failing on 429s; backoff remains only as a safety net.
- Unthrottled Groq eval run before this amendment (old script): 36/36 decisions, gate PASS, quote validity 38/38,
  field accuracy 179/180 (one miss: supersedes not extracted from B2, which doesn't affect the decision).

### D-018 · Phase 2 QA fixes
1. **Saved responses replay whatever the configured provider.** Besides the primary/fallback chain, the runtime consults the
   identities of every other known provider for saved lookups only (never live). A CI run or deploy whose `AI_PROVIDER` differs
   from the recording still replays it. Each lookup is still an exact identity match (SPEC §10). CI also sets the selected
   providers explicitly.
2. **The recorder records the suggested reply's recheck.** After each golden case it reruns the full check on the suggestion
   text (what `/api/send` does after "Use safe reply"), so the draft extraction for template replies is saved too and asserted
   to recheck ALLOW/CAUTION. `pnpm record` now checks for a live provider before clearing `data/ai-cache`.
3. If any provider in the chain was rate-limited, the task ends "paused" ("Live AI paused"), even if the fallback then failed
   for another reason.
4. `CheckResult.ai` carries `provider` and `fellBack`.
5. A provider-side schema rejection (Groq 400 `json_validate_failed`) counts as invalid output: retried once on the same
   provider, never handed to the fallback.
6. User-editable text has closing `</document>` / `</reply>` tags neutralized before it goes into the prompt envelope.
7. Per-call timeout 9 s and route `maxDuration` 60 s, so the worst case (extract → reply → reply recheck, each with one
   fallback) returns the designed AI_UNAVAILABLE/paused state instead of a platform 504.
8. Eval selection only counts complete 3-run reports for the current prompt version; `pnpm eval --combine` rebuilds
   `evals/results.md` from the per-provider JSON without model calls.
9. Structure: PLAN listed `extractSource.ts`, `extractDraft.ts`, `suggestReply.ts`, `validateQuote.ts`. They are consolidated:
   the three AI tasks live in `lib/ai/aiDeps.ts` (one task runner, three thin task definitions) and quote validation in
   `lib/check/runCheck.ts` + `lib/engine/normalize.ts`, because the engine (rules side) must validate quotes itself.

### D-019 · Provider selection result and tie-break
Full eval (prompt `2026-10-30.2`, 3 runs per provider, throttled): Groq `openai/gpt-oss-120b` and Gemini
`gemini-3.5-flash-lite` both passed the gate with identical scores: decisions 36/36, quote rejections 0, field accuracy
180/180. D-017's rule (fewer quote rejections wins) doesn't separate them, so the tie-breaks are field accuracy, then the
incumbent primary. Result: `AI_PROVIDER=groq`, `AI_FALLBACK_PROVIDER=gemini` (set in `.env.local`, `.env.example`, CI).
The two `results-<provider>.json` files from that run predate the `runs`/`promptVersion`/`fieldsCorrect` fields; those values
were backfilled from each report's own markdown (same run), and `results.md` was rebuilt with `pnpm eval --combine`.
The prompt fix that got Gemini there (v2: proposals are claims; quotes exclude markdown labels) didn't change Groq's
results (Groq also 36/36 on v1).

### D-020 · Stop-hook waiting marker (approved by Abdullah, narrow)
The Stop hook also allows stopping while `.loop/waiting.json` names a background PID that is still running **and** the file
is less than 30 minutes old. A missing, malformed, stale or dead-PID marker changes nothing; the hook then behaves exactly as
before. `scripts/waiting.mjs start "<what>"` records the PID of the shell running a long background command (its first step)
and `scripts/waiting.mjs stop` removes it (its last step). Background *subagents* have no PID and are not covered. Self-test:
4 new cases in `scripts/hook-selftest.mjs` (running PID allows; dead PID, stale file, malformed file block).

### D-021 · Phase 3 design approval and changes
Mockups approved with changes: (1) the Sources editor has no horizontal overflow at 400 px; Cancel, the character counter and
the "Flagged outdated" label stay fully visible (the action row wraps); (2) decision banner titles stay on one line, truncated
with an ellipsis if needed, and raw reason codes (e.g. CONTRADICTS_GOVERNING) appear only in the Reasoning tab and raw JSON,
never on Check-tab banners; (3) ticket ID and rail chips in the inbox never wrap (nowrap + ellipsis); (4) the Impact tab is
built in the DESIGN.md visual language without a separate mockup. The four defaults in the checkpoint were approved: the
illustrative rejected-extraction row lives only in the mockup; the AI run block shows the real provider/model; a CAUTION
recheck shows "Rechecked · Caution" with its reason; a Rail change marks the result stale instead of rerunning.

### D-022 · Phase 3 UI build choices
1. **Accessible names follow design/UI-CONTRACT.md over DESIGN.md copy where they differ.** The Send button always reads
   "Send" (DESIGN.md's "Send with caution" would break the exact-name contract); CAUTION shows a triangle icon on Send and the
   acknowledgement row "I've checked this and want to send it anyway." (contains the contract's checkbox name). The inline
   button in the blocked-send alert is "Insert safe reply" / "Insert holding reply", so "Use safe reply" stays unique (the panel card).
2. **One contentinfo landmark.** The disclaimer is a full-width page footer under the inbox and panel, visible on every screen and
   state. The slide-over and bottom sheet stop above it, so the panel needs no second copy (DESIGN.md's panel footer).
3. **Impact tiles.** Each metric `group` contains only its value (named by the visible label through `aria-labelledby`); the
   definitions and the false-alarm n sit outside the group. Drafts checked counts distinct (ticket, FNV-1a draft hash) pairs from
   any check that returned a decision other than AI_UNAVAILABLE (checks and send rechecks); past flags are deduped by `checkHash`.
4. **Sources editor saves.** Save draft bumps `version` and sets `updatedAt` only when the text changed; toggles alone (flagged,
   owner active) are saved without touching `updatedAt`, so flipping a toggle doesn't silently add EDITED_AFTER_VERIFICATION. Choosing
   "Verified" in the status select sets `verifiedAt = now` (a simulated governance toggle, like Save and verify). Save and verify sets
   `version + 1`, `verification = verified`, `verifiedAt = updatedAt = now`. A source can also be removed from (and restored to) the
   workspace, which sends `deleted: true` (B4).
5. **Staleness.** A result is stale when the draft, rail, persona or workspace differs from the request it came from. Rail and draft
   changes never rerun automatically (D-021); persona switches and source saves rerun the current ticket's check (DESIGN.md).
   A fresh check clears an earlier blocked/ack/unavailable send state for that ticket.
6. **Progress steps** are an honest client-side sequence (the server runs the steps inside one request): "Reading draft" →
   "Reading N sources" (N = visible, non-removed sources) → "Applying rules", advanced at 350 ms and 900 ms; the result renders as
   soon as it arrives.
7. **Hidden HTML comments** in an excluded source (DOC-104's injection line) are shown in the evidence row in mono as
   "Hidden comment in this doc (data, no effect)", never yellow.
8. **Fonts.** Inter is self-hosted by `next/font/google` at build time (CSS variable `--font-inter`), falling back to the system stack.
9. **e2e Impact regex.** (Orchestrator correction.) The builder read an intermediate version of the e2e line where a shell
   escaping slip had produced `/(^|D)1(D|$)/`. That was fixed to `/(^|\D)1(\D|$)/` before `e2e/` was re-locked; the locked file
   has the correct regex. The Impact group contains only the value, so it passes either way.

### D-020a · Waiting-marker helper correction
On Windows/Git Bash the parent PID seen by `start` is a short-lived wrapper, so the marker named a
   dead PID and never applied. The helper now has `run "<what>" -- <command>`, which records its own PID, runs the command,
   waits, and removes the marker on exit. The approved rule (running PID + under 30 minutes) is unchanged.

### D-023 · Guided demo tour (Phase 4, SPEC §15 P1, §16)
1. **Five steps following SPEC §16:** (1) Catch: TCK-9001, canonical draft, Check → Hold, anchored to the Decision banner;
   (2) Why: Reasoning tab, anchored to the claim's evidence card (DOC-103 quote, governs via D5); (3) Recover: buttons
   "Try to send the wrong draft" (409, one intercept) and "Use the safe reply and send it" (200), anchored to the composer;
   (4) Ambiguity: TCK-9002 → Escalate, anchored to the holding reply; (5) Live proof: Sources tab, button "Apply the edit
   (2 business days, Save draft)" applies B7 and reruns → Caution "edited after verification"; the copy states that Save and verify
   gives Hold at 2 days. Step 5 first reruns the canonical check so the change chip reads "Hold → Caution".
2. **Driving the app.** Steps 1, 2, 4 and 5 set up on entry (select ticket with its seed rail, fill the canonical draft, check,
   switch tab). The two side-effecting moments (sending, editing a source) need an explicit button, so the tour never sends or
   edits behind the user's back. New hook actions: `prepareTicket(id, draft?)` and `applyB7()`; `setDraft` also updates the state
   ref so an immediate send uses the new text.
3. **Exact variant bodies.** The Appendix B replacements moved to a pure module, `lib/workspace/variantBodies.ts`, used by both
   `lib/workspace/variants.ts` (scripts) and the browser. B7 is always applied from the seed version (v1 → v2, updatedAt now,
   verification untouched), identical to `variantOverrides("B7")`, so the saved responses replay.
4. **Non-modal coach mark.** `role="dialog"` without `aria-modal`, named by the step title and described by its body, with a
   visible "Step n of 5" counter. No scrim; a highlight ring (accent outline + halo) follows the anchor, which is scrolled into view
   once per step. Placement: left of the anchor, else right, below or above. Under 700 px it is a bottom card above the footer,
   flipped to the top when the anchor is in the lower half (the composer). Focus moves to the step title on open and on each step;
   Skip, ×, Finish and Esc close it, and focus returns to the "Guided tour" button.
5. **Offer once.** On first visit a small offer card ("Start tour" / "Not now") anchors to the top-bar "Guided tour" button;
   `suresend.tour.seen.v1` is stored via the try/catch storage wrapper as soon as it is offered or started. No auto-offer when
   `navigator.webdriver` is true. Tour button and action labels ("Guided tour", "Start tour", "Next", "Back", "Skip tour",
   "Try to send the wrong draft", "Use the safe reply and send it", …) don't collide with any UI-contract name, and the tour renders
   no `status`, `alert`, `region` or `group` roles.
6. **Phone top bar.** To fit the new button at 390 px, the decorative brand mark is hidden at ≤420 px and icon-only top-bar
   buttons use tighter padding.

### D-024 · Phase 4 pre-deploy QA fixes
- Stale inbox pills keep full text contrast; staleness is a dashed outline + title + sr-only "(stale)" (axe serious → fixed).
  `scripts/ui-audit.ts` gained a "stale" state so this stays covered.
- `scripts/precommit-scan.mjs` also blocks Google/Gemini `AIza…` keys and env-style `NAME_API_KEY|_TOKEN|_SECRET|PASSWORD=value`
  assignments; verified with runtime-generated fake keys in a throwaway repo (and no false positives on the real files).
- Tour step 5 never replays over an existing DOC-103 edit; it offers a user-pressed "Restore DOC-103 to its seed version".
- Esc closes only the innermost control: the Reset dialog and persona tooltip mark Esc as handled (`preventDefault`), and the
  tour ignores handled events. Verified in a browser (4/4 cases).
- The phone top bar keeps the product mark; the README states the spend limit is confirmed at deploy.

### D-025 · Deploy setup (approved by Abdullah)
- **Vercel:** project `answerguard` (renamed `suresend` in D-031), linked and deployed with the CLI under the account's default team (`youth-pay`, team name
  "Abdullah Butt", hobby plan). Linking the private GitHub repo failed (the Vercel GitHub app has no access to it), so
  deploys go through the CLI; the repo stays private. Node pinned to 22.x (the version everything was tested on).
  `.vercelignore` keeps `.env*`, `.loop/`, `.claude/` and local screenshots out of uploads.
- **Env vars (Production):** AI_PROVIDER, AI_FALLBACK_PROVIDER, AI_MODE, GROQ_API_KEY, GEMINI_API_KEY, RATE_LIMIT_PER_10MIN,
  GLOBAL_LIVE_CHECKS_PER_DAY, added with `vercel env add` from `.env.local` via stdin; values never printed.
- **Spend limits:** both keys are free tier with no billing account linked, so there is nothing to spend. When the quota
  runs out, requests are refused (429). That's a hard stop at $0. (SPEC §10.1's "confirm in the console" is answered by this.)
- **Upstash: skipped.** `vercel integration add upstash/upstash-kv` needs marketplace terms accepted in a browser. With no money
  at risk (only quota), the in-memory per-instance limiter + the providers' free-tier quotas + the saved-response fallback are
  enough for this demo. The Upstash code path stays and activates if the two UPSTASH_* vars are ever added. Documented as a
  limitation: the in-memory limiter isn't shared across serverless instances (SPEC §10.3).
- The Gemini key on this account uses a newer non-`AIza` format; the pre-commit scan still catches it via the env-style
  `GEMINI_API_KEY=` pattern, but a bare value of that format in code wouldn't be recognised by prefix.

### D-026 · Phase 5: Design v2 restyle (approved by Abdullah)
- **Why:** the v1 UI did too much at once. Design v2 (`design/v2/*.dc.html`, 9 artboards) simplifies it; the rules engine,
  AI pipeline, API and engine tests are unchanged.
- **Send runs the check.** The separate "Check answer" button and Ctrl+Enter hint are gone; Send calls the existing
  `/api/send` integrity path (ALLOW sends; HOLD/ESCALATE are held and counted as intercepts; CAUTION needs the
  acknowledgement + "Send anyway"; AI unavailable shows "Not sent, nothing was lost" + "Try again").
- **Two tabs:** Check and Docs. "Why?" and the full rule trace open inside Check (with a back button); Reasoning and
  Impact are no longer tabs; Impact, personas, reset and the AI mode line live in the Demo menu.
- **Plain outcome names in the UI:** ALLOW "Good to send", CAUTION "Double-check", HOLD "Hold", ESCALATE "Ask first".
  Engine names and reason codes appear only in the Trace and Raw JSON.
- **One-time unlock of the demo test (approved by Abdullah):** the UI flow changed (Send is now the check), so the demo
  test folder was removed from `.loop/locked`, its spec is rewritten to cover the same journey (wrong draft → Send → held,
  counted as an intercept → Use this reply → Send → sent → Demo menu shows 1 stopped) against `design/v2/UI-CONTRACT.md`,
  reviewed by QA against the old test, and then re-locked. The engine tests, SPEC.md, the brief and the seed stay locked.

### D-027 · Phase 5 build choices (design v2)
1. **Structure.** v1 panel components are removed (Reasoning/Impact tabs, banner, chips, evidence rows, side panel, ticket list,
   thread, composer, top bar, role switch, mode badge). New: `components/inbox/{LeftColumn,ChatCard,RailSelect}`,
   `components/agent/{AgentCard,CheckView,WhyView,TraceView,DocsView}`, `components/shell/{Header,DemoMenu,App}`. The client
   state hook, overrides/metrics storage, persona filter, saved-response behaviour and stale marking are kept.
2. **All v2 copy is generated from the real `CheckResult`** in `lib/client/outcome.ts` (pure): outcome names, headlines, the one
   sentence, the Why model and the trace rows. Nothing is hard-coded per scenario. Engine names and reason codes only appear in
   the Trace view (decision pill, reason-code chip, rule IDs, rule details) and Raw JSON.
3. **Headlines** follow item 7. Two cases the prompt doesn't name get their own plain line instead of a misleading one: ESCALATE
   `CONFLICT_UNRESOLVED` (B3) reads "Your docs disagree" (not "Depends on the transfer", which would be false when the rail is known),
   and CAUTION reasons other than `CHANGE_SIGNALLED` use a short reason line (e.g. B7 `WEAK_BASIS`: "The doc behind this changed").
   The generated sentence names the ticket's own transfer type when the rail is known ("Standard transfers reverse in 4 business days").
4. **Send runs the check.** `send()` shows the three progress steps while `/api/send` runs. 409 → held (tag "Held by Slite Agent:
   see the panel" as a `status`, disabled "Send (held)", intercept counted); 428 → "I've checked and want to send it" + "Send anyway"
   (disabled until ticked; also shown when a Docs re-check returns CAUTION); 503 → "Not sent, nothing was lost" + "Try again"
   (re-sends; after a Docs re-check it re-checks). Any composer edit, including "Use this reply", clears the held state. Only the
   latest sent bubble carries the `status` "Sent · checked by Slite Agent", so the confirmation is unique and announced once.
5. **Sent payoff** uses the real customer first name and the held draft's value as a compound adjective ("Ayesha got the right
   answer" / "The 4-business-day reply never reached Ayesha.") — the name instead of a pronoun. Shown only when the successful send
   followed a held draft on that ticket; otherwise "Sent to <Name>". "Wrong replies stopped today" shows `metrics.intercepts`.
6. **ALLOW card has no in-card Send button** (the States artboard shows one): a second button named "Send" would make the contract's
   exact "Send" ambiguous. Users send from the composer. ESCALATE uses "Use holding reply" (States artboard); HOLD "Use this reply".
7. **Demo menu** is a non-modal popover `dialog` named "Demo menu" (focus moves to its title, Esc and outside clicks close it, focus
   returns to the trigger). It also holds "Review flagged replies" (Correct catch / False alarm), since SPEC §11's false-alarm rate
   needs reviews and the Impact tab is gone. The persona note keeps SPEC §8's meaning in shorter words. "How it works · GitHub" opens
   `/how-it-works`, a static page that renders README.md at build time (the repo is private, so it isn't linked).
8. **Docs tab** keeps SPEC §9's toggles (verification, owner active, flagged outdated) and remove/restore inside a collapsed "Doc
   settings", so the artboard's layout stays clean. "Save and re-check" = old Save draft (disabled until something changes).
9. **Responsive.** One DOM, CSS-driven. Under 1100 px the left column becomes a row (compact customer card + conversation pills)
   and the agent card a slide-over that opens when Send starts a check; a "Slite Agent" pill in the chat header reopens it. Under
   700 px: the dark title card (with the rail picker), conversation pills, chat, and the agent card as a bottom sheet above the
   footer; the held draft also shows as a dashed bubble (Mobile artboard). "Use this reply" closes the sheet so the composer and
   Send are in view. The header's Demo menu reads "Demo" on phones (accessible name stays "Demo menu"); the Guided tour pill is
   hidden there and the tour starts from the Demo menu.
10. **Tour (5 steps, Send is the check):** Send (button "Press Send for me") → Why (opens Why?) → Use this reply and send → Ask first
    (TCK-9002, "Press Send for me") → Docs B7 edit (button "Apply the edit (2 business days)"; step 5 re-checks the canonical draft
    first, which is a check, not a send). Nothing sends or edits without a button press; no auto-offer under `navigator.webdriver`.
11. **Fonts and tokens:** Figtree 400–700 and JetBrains Mono (trace rule IDs only) via `next/font/google`. Focus is an ink ring with a
    white gap, never the accent. Contrast ratios: `design/v2/DESIGN-NOTES.md`.
12. `scripts/ui-audit.ts` now uses the v2 contract and states: empty, held, why, trace, docs, double-check, ask-first, not-sent,
    sent, demo-menu (and fails if a state can't be reached).

### D-028 · Phase 5 QA minors and spec deltas from design v2
- **SPEC §11 amendment (design v2, approved via the DemoMenu artboard):** Impact now lives in the Demo menu as three tiles
  ("Replies checked", "Wrong ones stopped", "False alarms (need 3 reviews)") with the line "Simulated in your browser, not
  real Slite data." The per-metric one-line definitions and the explicit n are no longer shown; the n<3 guard remains (the
  tile shows "–" until 3 flags are reviewed). Metric semantics are unchanged.
- **SPEC §7 delta:** rejected extractions, the prompt version and per-source standing rules/relations are in the Trace view's
  Raw JSON rather than as separate rows; the fired rule is highlighted. Accepted as part of the "less at once" brief.
- Composer boundary uses `--field-line` #8B9099 (3.21:1 on white, WCAG 1.4.11) instead of the artboard's #E8E3DB (1.28:1).
- The Demo menu link reads "How it works" (it opens the in-app README page; the repo is private). `/how-it-works` renders
  README images from `public/` (the GIF is mirrored to `public/demo.gif`).
- README: "Reasoning tab" → Why and Trace views; `docs/demo.gif` re-recorded for the v2 flow.
- Known, not fixed: at 390 px the open bottom sheet's scrim covers the header, so "Demo" needs the sheet closed first (×/Esc).

### D-029 · Trace view polish (requested by Abdullah; UI only)
- The Trace view lists only the rules that mattered by default: every rule that fired or failed, plus passed checks that
  ruled a path out (the reply's claim D0, the rail check D1, "docs disagree" D4, D5/D6 when D7 fired, the no-downgrade
  check D11a after D9 and the proposal check D11b after D10, and the source-standings row when a doc was ruled out). The
  rest sit under "Show all N steps". Skipped rules, which only repeat another rule's result ("V settled by explicit
  supersession", "D9 fired"), are never listed; the complete engine trace stays in Raw JSON.
- Each row is one or two plain sentences generated from the real result (`traceRows` in `lib/client/outcome.ts`); the
  engine's verbatim detail (quotes, D5's four conditions) is behind a per-row "Details" toggle.
- The ID column is 64 px and non-wrapping, and the roll-up row is labelled "Result" (engine rule "Overall" in its title).
- No engine, API or test changes.

### D-030 · Repo made public; Demo menu links to GitHub (requested by Abdullah)
- Before switching visibility, the full git history (14 commits, all branches) was scanned for secrets: key patterns
  (Groq, Gemini/Google, Anthropic, OpenAI, GitHub, Vercel/OIDC, JWT, AWS, private keys, env-style assignments) and the exact
  values in `.env.local`. No hits; no `.env` file other than `.env.example` was ever committed; commit author emails are the
  GitHub noreply address (or a placeholder). Then `gh repo edit --visibility public`.
- The Demo menu's "How it works · GitHub" link (the artboard's label) now opens https://github.com/1AbdullahButt/suresend
  in a new tab (`rel="noopener noreferrer"`, with "(opens in a new tab)" for screen readers). This supersedes the private-repo
  notes in D-025, D-027 and D-028. The in-app `/how-it-works` page stays as an offline copy of the README but is no longer linked.
- Vercel deploys still go through the CLI (the Vercel GitHub app isn't connected).

### D-031 · Rename to SureSend (requested by Abdullah, Phase 6)
- Product renamed AnswerGuard → **SureSend** everywhere user-facing or public: header, page title and metadata
  ("SureSend · a concept for Slite Agent"), Open Graph/Twitter tags, a new favicon (`app/icon.svg`, the same shield mark),
  Demo menu, guided tour, engine/UI headlines ("SureSend couldn't confirm…"), aria text, `/how-it-works`, README,
  `package.json` name, design docs and artboards, agent definitions, and `docs/VIDEO_SCRIPT.md`. The side panel keeps "Slite Agent".
- Code identifiers follow (`useSureSend`, type `SureSend`); localStorage keys are now `suresend.*`, with a one-time read
  fallback that migrates `answerguard.*` so returning visitors keep their workspace, metrics and tour state. Rate-limit
  prefixes are `suresend:*`. No AI prompt mentions the name, so saved AI responses (cache identities) are unaffected.
- **Not renamed (intentional):** SPEC.md and IMPLEMENTATION_BRIEF.md (historical contract; README and DECISIONS carry the
  note "SureSend was called AnswerGuard in SPEC v2.2 and the brief."); `tests/`, `e2e/` and `data/seed/` (no test asserts
  the product name, so the approved string-only exception was not needed and the folders are byte-identical); fenced
  evidence blocks in PROGRESS.md (real output at the time; the old URLs still resolve); historical records of the original
  names (the `gh repo create answerguard` command in KICKOFF_PROMPT/PLAN, the Vercel project's original name, annotated).
- **GitHub:** `gh repo rename suresend` (public; the old URL 301-redirects). Remote updated; `user.email` for this repo set
  to the GitHub noreply address.
- **Vercel:** project renamed `answerguard` → `suresend` (CLI). See D-032 for the production domain.
- `docs/VIDEO_SCRIPT.md` was updated but is left untracked: it names Abdullah's employer and the repo is public; it is
  committed only if he asks.

### D-032 · Production domain: suresend-demo.vercel.app (Phase 6)
- **Production URL: https://suresend-demo.vercel.app**, the first fallback Abdullah named. It is a project production
  domain of `suresend` (`vercel domains add suresend-demo.vercel.app suresend`), not a manual alias, so it is public and
  not behind Deployment Protection.
- **Why not suresend.vercel.app:** the name was free, and `vercel alias set` reserved it for this account. But a manually
  set alias counts as a preview URL, so visitors were sent to Vercel SSO. Registering it as a project domain failed from the
  CLI and the API (`409 alias_conflict: already assigned to another project`), even right after removing the alias;
  `vercel domains add --force` was refused by the session's safety classifier. The dashboard refused it too. At Abdullah's
  request the alias was removed (`vercel alias rm suresend.vercel.app --yes`; `vercel alias ls` no longer lists it and the
  URL returns 404), and the dashboard still said "assigned to another project". He then asked for the fallback. The name
  was not re-reserved, so this account no longer holds suresend.vercel.app.
- **Old URL:** `answerguard.vercel.app` stays a domain of the project and now redirects with **308** to
  suresend-demo.vercel.app, keeping the path (`PATCH /v9/projects/suresend/domains/answerguard.vercel.app` with `redirect`
  and `redirectStatusCode: 308`), so links already shared keep working.
- The live URL was updated in README, `app/layout.tsx` (metadataBase and og:url, so og:image too), PLAN.md §9 and
  `docs/VIDEO_SCRIPT.md`. The Demo menu links to GitHub, not to the live URL, so it did not change.

### D-033 · Tour step 5: the visitor makes the edit (requested by Abdullah)
- Step 5 is now "Change the policy, watch the answer change": a short intro, three numbered actions (change 1 business
  day to 2, Save and verify, Send the 4-day reply), the outcome (still held, suggested reply says 2 days), and a tip that
  Save and re-check gives Double-check. The "Apply the edit (2 business days)" shortcut is gone: it ran Save and re-check,
  which now contradicts the numbered steps. `applyB7` stays in the hook but the tour no longer calls it.
- If DOC-103 is already edited when the step opens, the card shows only "This doc was already changed. Restore it to start
  fresh." and [Restore the doc]; the numbered steps appear once it is restored and stay while the visitor edits the doc.
- The "Esc to close" footer hint is removed; Esc still closes the tour (D-024).
