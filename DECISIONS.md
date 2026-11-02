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

### D-034 · Phase 7: fixes from the pre-sharing review (approved by Abdullah)
An independent-style review before sharing with Slite (security, correctness, UX, pitch) produced these fixes. The engine
(`lib/engine/`), the locked tests and the seed data are untouched.
- **Security headers** (`next.config.ts`): `Content-Security-Policy: frame-ancestors 'none'` plus `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a Permissions-Policy that turns
  off camera, microphone and geolocation. A full script CSP needs per-request nonces in Next; framing was the risk worth
  closing, so the CSP stops there.
- **Dependencies:** `pnpm audit` reported 2 high and 2 moderate advisories, all in `postcss 8.4.31`, which `next 15.5.28`
  (the latest 15.5.x) pins. A pnpm override lifts it to `^8.5.32`; the audit is clean, and build, tests and e2e pass.
- **CI:** `permissions: contents: read`, a concurrency group per ref, and the three actions pinned to the commit SHAs of
  their `v4` tags.
- **Errors:** an unexpected failure returns a generic 500 body (`CHECK_FAILED`, "Something went wrong…"); the detail goes
  to the server log only. Input errors (unknown ticket, invalid time) keep their message.
- **Limiter:** the in-memory fallback drops IPs with no hit in the window once a minute, so its map no longer grows for the
  instance's lifetime. It also reads the Marketplace's `KV_REST_API_URL`/`KV_REST_API_TOKEN` names as well as
  `UPSTASH_REDIS_REST_*`.
- **Upstash (supersedes the "skipped" part of D-025):** Upstash for Redis from the Vercel Marketplace, free plan, connected
  to Production only, installed with `--no-env-pull` so the local `.env.local` is never overwritten. Abdullah accepted the
  Marketplace terms in the browser (the one step the CLI can't do). The Marketplace added `KV_REST_API_URL` /
  `KV_REST_API_TOKEN` (not `UPSTASH_*`), hence the fallback names above.
- **Verifying it without credentials:** pulling the Production env to read Redis directly was refused by the session's
  safety classifier (credential materialization), so `/api/check` and `/api/send` now return `x-suresend-limiter`: what the
  last live-check gate on that instance used (`upstash`, `upstash-unreachable`, `upstash-unused` or `memory`). No keys, IPs
  or counts. After deploy, a check that needed live AI returned `upstash`. QA noted that `upstash-unreachable` tells a caller
  the limits have dropped to per-instance; with free-tier quotas and the saved fallback behind it, that's accepted for the
  value of letting a reviewer confirm the shared limiter.
- **Tour step 5 never needs live AI:** the visitor may type the edit as "2 business days" (the B1 body, already recorded) or
  change only the digit ("2 business day"). `pnpm record --tour-edits` added the second (2 files: the DOC-103 extraction and
  its safe reply) without clearing anything; the 17 existing saved responses are byte-identical. `lib/ai/tourReplay.test.ts`
  runs both edits through Save and verify, the Send that follows and the tip's re-check with the live gate refusing, and
  fails if a recording is missing (checked by moving the two files aside: 3 of 6 cases failed).
- **Composer hint (F10):** under the pre-filled reply on Ayesha's ticket, "This reply promises 4 days. The docs say 1. Press
  Send.", shown only while the reply is untouched on the instant rail, no doc has been edited in this demo (an edit can
  make "the docs say 1" untrue, and edits outlive a reload) and nothing has been checked or sent. It lives in `ticketMeta`
  like the other synthetic ticket details, and the textarea points at it with `aria-describedby`.
- **Suggested-reply reason (F12):** when the safe reply's recheck is Double-check, the label says why, e.g. "Double-check: a
  Slack note proposes 1 day". `lib/check/recheckNote.ts` reads the recheck's own output (reason code, governing value,
  evidence); it never re-decides. Results saved before this change have no note and keep the old label.
- **Docs and repo:** README eval table labelled as the tuned demo set with the held-out results beside it (D-035); the
  video placeholder removed; Slite claims limited to the confirmed list (cited, permission-aware answers; drift detection
  with fixes reviewed in Triage; Ask Insights; a Slack bot; MCP; a Chrome extension); the send-integrity limitation stated;
  MIT LICENSE; repo description, homepage and topics; `docs/VIDEO_SCRIPT.md` in `.gitignore`.

### D-035 · Held-out eval (Phase 7)
- The 12 golden cases are the ones the prompts were tuned on, so their 100% is a regression check, not evidence of
  generalisation. `evals/heldout.json` adds 10 cases written after the prompts were frozen at `2026-10-30.2`: reworded
  drafts ("working days", a number word, calendar days, a hedge), the unknown-rail ticket, a reworded SOP on both rails, a
  reworded Slack proposal, an injection inside the draft, and a no-claim reply. Expected outcomes follow SPEC §6 unchanged.
- They live in their own file (not a `heldOut` flag in `golden.json` as first planned) so they stay out of the recorder, the
  CI saved replay and the provider selection. `pnpm eval --heldout` runs them live, 3× per provider, and writes
  `evals/heldout.md`. Report only: no gate, and failures are published as they are. Fixing a failure would mean changing
  the prompts, which would make these cases tuned too; any such change is a separate, approved step.

### D-036 · Phase 8: SureSend as an MCP server (approved by Abdullah)
- **Why:** a capability any agent can call before it sends a customer reply: Claude, a help-desk bot, or an agent like
  Slite's. Same engine and rules as the web app; nothing new decides anything.
- **Transport:** `/api/mcp` on the existing Vercel app, MCP Streamable HTTP, **stateless** (no session ID) with JSON
  responses, so it runs on serverless functions with no sticky state. Built on the official TypeScript SDK
  (`@modelcontextprotocol/sdk` 1.32.2, which accepts zod 4) and its web-standard transport, one server per request.
  `scripts/mcp-stdio.ts` serves the same tools over stdio. Start it with `pnpm --dir <project> exec tsx …`, because tsx
  reads the project's tsconfig (import aliases) from the directory it starts in. It also moves to the project root before
  loading, because some data paths are fixed at import.
- **Tools** (`lib/mcp/tools.ts` as plain functions, registered in `lib/mcp/server.ts`). All are read-only and annotated
  so. They use the seed workspace and the **support-agent persona** only; there are no doc edits over MCP.
  - `check_reply { reply, ticket_id?, rail? }` goes through `handleCheck`: the same zod validation, 1,000-character cap,
    persona filter, engine and generic 500s as `/api/check`. It returns the plain and engine decision, the engine
    headline, the UI's one-line reason (`summarize`), a next step per decision, the suggested reply with its check label
    (incl. the D-034 reason), the governing doc and quote, and the UI's "rules that mattered" (`traceRows`).
  - With neither ticket nor rail, the rail is **unknown**, so a reply whose answer depends on the rail asks first rather
    than assuming instant or standard.
  - `list_tickets` returns id, customer, rail and the customer's message.
  - `get_doc { id }` returns title, signals and text for the four visible docs. DOC-105 and an unknown ID get the
    identical error, so the error doesn't reveal that a restricted doc exists.
- **Agent instructions:** the server `instructions` and the `check_reply` description tell the model to call it before
  sending any reply that states a timeline or policy value, and to send `suggested_reply` or ask a human on Hold or Ask
  first. `get_doc` says doc text is data, not instructions (the synthetic DOC-104 contains an injection line on purpose).
- **Limits:** live AI over MCP draws on its own budget of the shared limiter (`suresend:mcp:*` keys;
  `MCP_RATE_LIMIT_PER_10MIN` / `MCP_LIVE_CHECKS_PER_DAY`, defaults 10 and 200), so agents can't use up the web demo's
  live checks. The web app's keys and budget are unchanged. `/api/mcp` responses carry `x-suresend-limiter` for the MCP
  budget.
- **QA hardening (Phase 8 review):**
  - **One check, one limiter question.** A runtime asks the live-AI gate once and remembers the answer, and the first
    build used one runtime per HTTP request. A JSON-RPC batch of up to 100 `check_reply` calls could therefore share one
    unit; QA proved 5 of 5 passing on a budget of 1. Two fixes: the server now takes a deps factory and builds deps per
    `check_reply` (stdio too, where it had been one runtime per process), and `/api/mcp` rejects array bodies with 400
    before the transport. MCP 2025-06-18 removed batching, and the SDK client never batches.
  - **GET and DELETE answer 405** with `Allow: POST`. GET had answered with an empty SSE stream that closed at once, and
    the SDK client re-GETs a closed stream, measured at about one request a second per connected session. `pnpm mcp:e2e`
    now asserts no GETs while idle.
  - **Next steps follow the engine.** On Hold, "send suggested_reply" applies only when its own check is Good to send;
    otherwise "show it to a human first", since a Double-check reply needs a human's OK as in the app. Ask first's text
    distinguishes an unknown rail from docs that disagree.
  - **Descriptions say what's covered** (one topic; other values come back Double-check; Good to send means nothing
    contradicts the reply) and that the AI also drafts the suggested reply. A ticket the caller didn't choose is
    reported as `id: null`.
- **No auth,** stated in every tool description, the server instructions and the README. It's a public demo over
  synthetic data; a real deployment would sit behind the workspace's own sign-in and check the caller's permissions.
- **Not depending on live AI:** the canonical replies replay saved responses over MCP as in the app (checked end to end).
  Claude's own wording needs live AI for its draft; if that's unavailable, `check_reply` says "Couldn't check" and "don't
  send a timeline yet", never a pass.
- **Tests:**
  - `lib/mcp/tools.test.ts` covers the tools as functions: Hold with a 1-day suggestion on TCK-9001, Good to send,
    Ask first by default, a rail override, DOC-105 never sent to the AI or returned, input caps, and Couldn't check.
  - `lib/mcp/server.test.ts` covers the real server over the SDK's in-memory transport: tool list, annotations,
    descriptions and output schema.
  - `scripts/mcp-e2e.ts` (`pnpm mcp:e2e <url>`) uses the official MCP client over HTTP. It isn't in the locked `e2e/`
    folder; it runs against the local build and the deployed URL in the gate.
- **Demo:** `docs/MCP_DEMO.md` gives the claude.ai connector steps and the prompt, with a variant that always shows the
  Hold. Claude may write a correct or timeline-free reply on its own, which SureSend honestly passes.

### D-037 · Phase 9: Fix the doc (approved by Abdullah)
- **Idea:** a Hold or Ask first is a signal that a doc taught the agent the wrong value. SureSend proposes a fix to that doc,
  and a person approves it, like Slite's Triage. Nothing is ever applied automatically. The engine, locked tests and seed
  data are untouched; an approved fix is an ordinary client-side doc edit (an override), as before.
- **Which doc (`lib/fix/source.ts`, pure, shared by browser and server).** The demo fixes one pattern:
  - A visible, in-force doc scoped to all rails states exactly the held reply's value.
  - An in-force, rail-specific exception in another doc gives that rail a different value. On Hold that's the governing
    claim; on Ask first (unknown rail) it's the disagreeing rail-specific claim.

  No proposal otherwise: no matching doc; a rail-specific doc the agent misapplied (e.g. 1 business day on a standard
  transfer); docs that disagree; the general doc already stating the exception (so an approved fix isn't proposed twice);
  or a restricted doc (only "everyone" docs, so DOC-105 can't be a target, even for the ops lead).
  `matchingSourceEvidence` also maps other values to their doc (5–7 days → the outdated DOC-104 macro). That reply is
  Double-check, not Hold (calendar vs business days, D8), so the app doesn't offer a fix for it.
- **The fix (`lib/fix/validate.ts`, `lib/fix/propose.ts`).**
  - The AI drafts one edit (`add_after` or `replace` of the claim sentence) from the exception's own quote, the doc, and
    the exception doc's "How to tell the rail" line.
  - Validation, tightened after QA showed a fragment target could land in the scope line or a heading, and a rewrite
    could delete or flip text:
    - The target must be the claim sentence, normalized-equal to its quote and found exactly once in the doc. The edit is
      always an addition right after it, so nothing else in the doc can change.
    - A `replace` counts only if it starts with the claim sentence word for word; the rest is then the addition.
    - The added passage is one short plain paragraph and states the exception's value exactly.
    - It contains no other timeline or amount, no other digits, and no negation, promise or fee wording.
      - The timeline check is the policy-pattern detector ("two weeks") plus months, number words beyond ten and
        "immediately".
      - The negation check folds curly apostrophes and covers any "n't".
    - It names the exception's rail and no other, and never "all transfers". This was added after QA's second round.
    - An approved fix stops counting as approved once that doc is edited, restored or removed.
    - The cache identity covers every prompt input, including the doc ID and the exception's rail.
  - Then the 4 canonical replies (TCK-9001 instant, TCK-9002 unknown, TCK-9003 standard with 4 business days; TCK-9001
    with 1 business day) are rechecked with the fix applied as a verified edit. If any decision or reason changes, the fix
    is dropped. None is intended to change: the fix teaches agents, it doesn't change policy.
  - The template (the exception's sentence + "See <title>." + the rail hint) is the fallback.
  - The `doc_fix` AI task has its own prompt version (`FIX_PROMPT_VERSION`) in its cache identity, so adding it didn't
    invalidate any saved extraction or reply.
- **On live Groq,** the AI's fix passed the strict validation and the recheck for the canonical Hold and Ask first, both
  personas: "For instant-rail transfers, failed transfers are reversed within 1 business day (see Instant Rail: Reversal
  Exception). How to tell the rail: check "Rail" on the transaction in the admin panel." After approval, the canonical
  decisions are unchanged, and the tour's step-6 edit still works on top of it.
- **Saved responses:** `pnpm record --fix-edits` (append-only) adds 2 saved responses: the fix and the fixed DOC-101's
  extraction. The 19 existing ones are byte-identical. A first recording (before the identity gained the doc ID and rail)
  left 2 files nothing referenced; they were removed.
- **UI.**
  - "Fix the doc that caused this" (a link) on the Hold/Ask-first card opens a Triage-style review in the Docs tab. It
    shows the doc, why ("N replies this session copied 4 business days from this doc"), only the changed line before and
    after with the added text marked, "Approve fix (simulated)" and "Dismiss".
  - Approving saves the edit, verified (simulated), and rechecks the reply. If the doc changed since the draft, it refuses.
  - The Demo menu lists "Docs causing held replies" with a hold count per doc and "Review fix", simulated per browser. A
    doc whose fix was approved shows "Fix approved" instead, and tour step 5 acknowledges the approval.
  - On Ask first, a fix is proposed only if exactly one exception disagrees (one doc, rail and value); the review names
    that exception's rail.
  - The tour gets step 5 of 6, "Fix the doc that caused this", after Usman's Ask first.
- **API and MCP.** `POST /api/fix` takes the same body, validation and errors as `/api/check`, and uses one limiter unit
  per proposal (its check, draft and recheck share one runtime). The MCP tool `propose_doc_fix` (read-only, MCP budget)
  returns the same proposal with `applied: false`.
- **Tests:**
  - `lib/fix/fix.test.ts`: matching, validation, an unsafe fix dropped, AI vs template, DOC-105, the post-approval guard.
  - `lib/fix/fixReplay.test.ts`: the canonical path on saved responses only.
  - `lib/mcp/server.test.ts`: `propose_doc_fix` applies nothing.

### D-038 · Tour card on phones: shrink to a bar (follow-up to D-037)
- At 390px, tour step 6's card (about 430px tall) covered both the doc text and the "Save and verify" button, so the tap
  landed on the card. QA noted this in Phase 9; it predates Phase 9 (the same card was step 5 before).
- Wherever it sat, a card that size covered half the screen. So on phones (under 700px) the card has a "Hide steps"
  toggle that shrinks it to a one-line bar ("6/6 Change the policy… · Show steps"), docked where the card was.
- In step 6, tapping into the doc to edit it shrinks the card automatically, without moving focus out of the doc. A step
  change always reopens the full card.
- Focus follows the toggle: "Hide steps" focuses "Show steps", and "Show steps" focuses the step title. Desktop is
  unchanged.
- Checked at 390×844: the bar is 52px tall and clear of both save buttons. A real tap on "Save and verify" works and the
  4-day reply is held. axe finds 0 serious or critical issues.

### D-039 · Tour step 5 uses Ayesha; the MCP connector in the Demo menu (follow-up to D-037, D-036)
- **Step 5, "Fix the doc that caused this", now uses Ayesha (TCK-9001), not Usman.** Her Hold is the clearest story: the
  reply copied 4 days from the SOP, and the instant-rail exception says 1. New body: "Ayesha's agent got 4 days from the
  old SOP. SureSend suggests one added line to fix that doc, so the next agent gets it right. Nothing changes until you
  approve it."
- The step does the work itself. Its one button, "Show me", opens the fix review for Ayesha's held 4-day reply. If her
  reply wasn't held this session (the visitor skipped steps 1–3), it holds it first, from saved responses, then opens
  the review. A reply held earlier isn't held again, so the stopped count doesn't grow. The "Go back to step 4…" line
  is gone.
- The app keeps the last held reply per ticket for the session (`heldReplies`: rail, draft, and whether it points to a
  doc to fix), so step 5 knows about step 1's hold after step 3 sends the corrected reply. Reset demo clears it.
- **The card never covers "Approve fix (simulated)".** A tour step can name an element to keep clear. Step 5 names the
  review's buttons: they're scrolled into view, and on phones the card docks on the other half of the screen. On phones,
  the card also shrinks to the one-line bar (D-038) while the review is open, and comes back when it closes. At 1440 the
  card sits left of the agent panel. Checked at 1440×900 and 390×844, on both paths (held earlier, held by "Show me").
- **Demo menu: "Use it from Claude (MCP)".** One line ("Any AI agent can call SureSend before it replies."), the
  connector URL https://suresend-demo.vercel.app/api/mcp with a Copy button, and "How to connect" to the README section.
  - The button's name is "Copy connector URL". After copying it says "Copied" for a moment, and a status region
    announces "Connector URL copied".
  - Without clipboard access, the URL is selected for copying by hand, and an alert says so.
- **Tour step 6 ends with** "AI agents can call the same check: Demo menu → Use it from Claude." On phones, step 6's
  "Tip" line is hidden. Otherwise the taller card would cover the whole doc text (481px), and the doc couldn't be
  tapped to start editing. With the tip hidden the card is 437px, about what it was before.
- UI copy and layout only: no engine, rule, locked-test, seed or saved-response changes. README: the Demo menu entry is
  mentioned, and the test count is corrected to 164.

### D-040 · The tour pauses under the Demo menu; the ring never draws over an overlay; the URL wraps cleanly
- **Bug:** opening the Demo menu during the tour drew the tour's ring on top of the menu and through its left edge, and
  the tour card stayed open beside it. Cause: the menu and the ring were both z-index 70, and the ring comes later in
  the page. At step 5 the ring around the fix review (taller than the agent panel) ran above the panel and through the
  menu.
- **The tour pauses while the Demo menu is open.**
  - The ring is hidden and the card becomes a one-line bar: "n/6", the step title, "Resume tour" and close. The bar
    sits bottom-left on desktop and above the footer on phones.
  - During a tour the menu stops above the bar (`max-height: calc(100dvh - 190px)`; it scrolls), so "Resume tour" stays
    tappable at every width.
  - Nothing about the step changes while paused: the layout loop stops (no scrolling or moving), and no step re-runs.
    Closing the menu any way (Esc, an outside click, the Demo button, "Resume tour") brings back the same step, the
    same card state (full, or the phone bar) and the ring.
  - Focus: "Resume tour" moves it to the step title; the other ways return it to the Demo button, as before. The
    first-visit offer steps aside while the menu is open.
- **Layers:** the menu is z-index 85, above every tour layer (ring 70, card 75) and toasts (80). Only the reset dialog
  (90) goes over it.
- **Ring rules, for every step:**
  - The ring shows only the part of the target that's on screen: it's clipped by each scrolling or clipping ancestor
    and the viewport. A clipped side sits 8px inside, so neither the line nor its halo spills over a panel edge.
  - It's hidden when something else covers the centre of that visible part (checked with `elementsFromPoint`,
    ignoring the tour card). Examples: the phone sheet or its scrim over a chat target, the menu, a dialog.
  - The card is still placed from the whole target, as before.
- **Connector URL:** split into "https://", "suresend-demo.vercel.app" and "/api/mcp", each unbreakable, with `<wbr>`
  between them. It wraps only after "https://" or before "/api/mcp": 2 lines at 1440, 3 at 390. It's monospace, with
  no "://" ligature; a box too narrow for one part scrolls sideways. Copy still copies the full URL.
- **Not changed:** on phones an open agent sheet is modal (its scrim covers the header), so the Demo button is reached
  after closing the sheet, as before.
- UI only: no engine, rule, locked-test, seed or saved-response changes.

### D-041 · A second topic (fee_refund), the comparator registry, and the re-record (Phase 10)
- **Goal.** Show that adding a topic is a taxonomy entry, extraction examples and a comparator, with no change to the
  decision rules S, A, D0–D11. Topic: is the transfer fee refunded when a transfer fails (yes/no, scoped by rail like the
  timeline). The seed already states it (DOC-101 §4), so `data/seed`, `SPEC.md`, the brief and the locked tests are untouched.
- **Comparator registry** (`lib/engine/values.ts`), keyed by value kind. The duration comparison (`sameValue`,
  `amountWithin`, `formatValue`) moved in unchanged. The rules call `sameValue`, `valueWithin`, `unitsMatch` and
  `unitLabel` instead of reading amounts and units. Values of different kinds never match; for D8 that's a unit mismatch.
- **Topic taxonomy** (`lib/topics`): one `TopicDef` per topic holds its value kind, wording, prompt lines, detector patterns,
  hold headline, reply template, card sentence, and Ask-first and coverage phrases. The rules ask the registry whether a
  claim's topic is covered (D0b now counts claims on any covered topic) and never name a topic.
  `lib/engine/topicAgnostic.test.ts` fails if a rule file names a topic or reads amounts or units.
- **Order of commits** (branch `phase-10`, fast-forwarded to main):
  1. Held-out fee cases and the before snapshot.
  2. The registry refactor. Prompts and schemas are byte-identical, and the snapshot is 68/68 identical.
  3. Replies with several claims.
  4. Amounts on other topics.
  5. Topic wording for values.
  6. The fee_refund topic, which touches no rule file.
  7. Tests, presets and evals.
- **SPEC amendments** (the spec can't be edited):
  - `Topic` is `reversal_window | fee_refund | other`.
  - `Value` is a duration, a quantity `{quantity, of}` (amounts on topic "other", so D0c can fire for a fee amount or a
    limit), or a boolean `{flag}` (fee_refund).
  - Non-duration kinds declare the duration fields as absent, so code written against SPEC §6.2 (including the locked
    tests' `governing.value.amount`) still compiles.
- **Replies with several claims.** The engine already decided per claim and rolled up the most severe. The suggested reply
  now fixes only the wrong claims:
  - The AI rewrite gets every governed claim marked RIGHT or WRONG.
  - The template states one sentence per governed claim (with one claim it's exactly SPEC §6.7's).
  - Ask first keeps the claims the reply got right.
  - Why shows one card per claim, Trace a header per claim, and the decision card lists each claim's verdict.
- **Safe-reply prompt version.** The safe-reply prompt has its own version (`REPLY_PROMPT_VERSION`), like `doc_fix`, so
  changing it never invalidates saved extractions. Its cache identity includes the claims it is given.
- **Detector.** `fee_refund` brings a fee pattern, so a fee statement in wording it knows is EXTRACTION_GAP if the AI misses
  it, not "no claims". Other wording gets past it ("we also repay the service charge"); those words aren't added, since they
  come from held-out cases. D0b works per topic (after QA, below).
- **Demo.** "Try another reply" presets in the composer (3 per ticket), recorded and replay-tested. No new tickets, and the
  tour is unchanged.
- **Re-record.** Schema and prompt versions are bumped, so `pnpm record` re-records every saved response: golden, presets,
  tour and Fix the doc, in one run. `scripts/snapshot-results.ts` compares every saved path's decision and reason code
  before and after.
- **QA round 1: CHANGES_REQUIRED, two majors.** Both fixed.
  1. *The "nothing found" net got weaker across topics.*
     - The refactor generalised SPEC D0b ("zero reversal_window claims and the detector fires") as "zero claims on any
       covered topic". With two topics, one fee claim switched the net off for the timeline.
     - Repro: "The transfer fee is refunded with your money, and it will be back in 4 business days" on the instant rail,
       with only the fee claim extracted. It came back Good to send; on main it was Double-check.
     - Fixed in `decide.ts` (576a6b3), a logic change after the refactor. D0b now follows the spec per topic: a
       topic's detector hit counts when no claim on that topic was extracted and no extracted claim's span covers it. A
       currency amount counts only when no covered claim exists, as before. (Round 2 below narrows the span part.)
     - With one topic this is SPEC D0b exactly, and the snapshot stayed 68/68 identical. When covered claims exist, the
       gap is its own Double-check entry.
     - It names no topic, so a third topic needs no rule change. The fee_refund commit itself still touches no rule file.
  2. *Held-out wording leaked into the prompt and the golden set.*
     - H11–H16 were written before any fee prompt text (0d8eb28). Writing the prompt afterwards, I reused their wording:
       - H11's "the transfer charge stays with us" as a fee example;
       - H14's "I don't think …" as a hedge example (caught and removed earlier, in 5a62b4f);
       - H15's "PKR 500,000" as the amount example, in the prompt and the schema description;
       - H16's draft as golden fee-scoped-F1.
     - All replaced with golden or seed wording (prompt 2026-11-02.4, schema 2026-11-02.3) before the published runs.
     - The held-out report header and `heldout.json` say when H11–H16 were written and that the leak was found and
       removed. The earlier header ("written after the prompts were frozen … never used to tune them") was false for them.
  - *Minors fixed:*
    - The MCP next steps and tool text cover both topics, and `governing` comes only from the deciding claim.
    - Ask first corrects a wrong fee claim in the holding reply.
    - A value whose kind doesn't fit its topic carries no value, so there's no bare "yes".
    - Fix the doc is offered only for timeline holds.
    - Yes/no traces read naturally.
    - The presets close on focus leaving; Why uses h5 inside claim cards.
    - AI run info shows the reply prompt's version.
    - The guard test catches more ways of reading a value.
- **Held-out integrity (Abdullah's decision, 2026-11-02).** A case seen while the prompts were being written no longer counts
  as held-out, even after its wording is removed.
  - Exposed: H11, H14, H15 and H16 (the leak above), and H13, which shares "with your money" with a prompt example and golden
    `fee-correct`, both written after it. They stay as regression cases and are reported apart.
  - New: H17, H18 and H19, committed in 8e68016 before any further eval, sharing no three-word phrase with the prompts,
    schema, golden set or presets. Their expected outcomes were checked with hand-written extractions, with no AI call.
  - Clean fee cases: H12, H17, H18, H19.
  - The timeline cases stay clean: they were written after the `2026-10-30.2` freeze. H1 reuses phrases that older prompt
    already had, so it's easier than it looks. The report says so. H5 became exposed in QA round 2 (below).
  - The prompts are frozen at `2026-11-02.4` (reply `2026-11-02.2`, fix `2026-11-01.1`, schema `2026-11-02.3`).
    `lib/ai/heldoutIntegrity.test.ts` fails if those or a fingerprint of the prompts and schemas change, or if a clean fee
    case shares a three-word phrase with those files.
- **Quota (after a re-record and an eval ran out halfway).** Groq's real limit is 200,000 tokens a day, refilling at about
  8,300 an hour. Its headers don't report it, so it stayed hidden behind 900+ requests left. Gemini's is 500 requests a day.
  - `pnpm record` and `pnpm eval` check the provider first and stop on the first daily limit (exit code 3).
  - A full recording is built in `data/.ai-cache-recording` and replaces `data/ai-cache` only if it finishes with nothing
    unexpected. `pnpm record --resume` continues one that stopped.
  - An eval writes its report files only when all its runs finish. Until then its responses and scores stay in
    `evals/.in-progress`. Re-running continues: finished cases keep their results, and only the case that was interrupted
    runs again, reusing the answers it already got. A provider that already finished isn't run again unless `--fresh`.
- **QA round 2: CHANGES_REQUIRED, three majors.** All fixed in d8a9d61.
  1. *D0b could still be switched off by another topic.* Hits inside another covered topic's span were exempt. The model
     often gives a whole sentence as a span, so a claim on one topic could vouch for the other topic in that sentence:
     "Your money will be back in 1 business day, but the transfer fee isn't refundable" with only the timeline extracted came
     back Good to send. Now only an out-of-topic claim's span can account for a hit. With one topic that's SPEC D0b exactly,
     and the snapshot stayed 68/68 identical. Cost: a right fee statement with a timing word in it gets a Double-check, which
     is the safe direction. This is the second and last logic change to the rules after the refactor, and it names no topic. (ca12d5b also touched `decide.ts` and `resolve.ts`, but only to reword values.)
  2. *Re-running after a stop repeated a provider that had finished* and replaced its report. A provider whose report
     matches these prompts, rules, cases and model is now skipped unless `--fresh`.
  3. *The resume stamp left out the model.* It now holds the model, the rule files and a fingerprint of the prompts and
     schemas, so an edit with no version bump also counts as a change.
  - *H5 is exposed too.* It shares "be back within" with golden and preset drafts written after it, the same rule that
    exposed H13. QA called this Abdullah's decision; I applied the rule because it's the cautious reading and it only lowers
    the published score. Abdullah confirmed it: H5 stays exposed (D-044).
  - *Because the rules changed, Groq's evals were rerun from scratch* on the same frozen prompts. Golden stayed 57/57. On the
    same 13 clean cases, held-out went from 36/39 to 39/39 and the fee cases from 9/12 to 12/12, because H18 flipped from 0/3 to
    3/3. The rule fix doesn't touch H18's path and nothing was tuned, so that's model variance. H14 went the other way, 3/3 to
    2/3. The README shows both sessions, not only the better one, and says runs in one session aren't independent samples.
  - *Minors fixed:* the report scores the fee cases on their own; a stop inside the first case keeps its responses; the
    guard stops on a long unnamed wait, a spend limit or 5 provider errors in a row; no organization id in provider errors;
    a missing header isn't read as zero; the integrity test watches `variants.ts`; the guard test catches `.of`; the gap
    card and trace name only what was missed; one unreachable saved response removed (40 now); the recording swap can't leave
    a partial folder; the free-tier note shows only on the free tier.
  - *Left as they are:* a step that failed in the case a stop interrupts gets another attempt on resume (one case at most,
    and the wording above says so). The integrity test checks three-word phrases, not two: two-word terms like "the fee" are
    the domain's own.
- **QA round 3: CHANGES_REQUIRED, two majors.** Neither changed a published number. Rules, prompts, locked tests and seed
  data weren't touched.
  1. *An outage's failures could be published as the model's scores.* A success from the run's cache reset the guard's error
     count, so a late outage never stopped the run, and failures recorded before a stop stayed in the score. Now a provider
     error is retried (30, 60 and 120 s) and then stops the run, and that case is never recorded. Only an answer the model
     gave, even an invalid one, counts. The report says how many provider errors were retried.
  2. *Why said "No doc makes a claim about this" on a gap,* which is false: the docs were never compared. It now says so, and
     an outside-coverage claim says the topic isn't checked.
  - *Gemini's saved progress was repaired by hand once.* Its `fee-amount` run failed during the overload, so it isn't a model
    answer. It came out and reruns, which takes the count from 19 to 18 of 57, all correct. The other 18 are untouched.
  - *Minors fixed:* a spend limit reads as a spend limit; a `--fresh` run that stops can be continued; the recording swap
    survives being killed between its two renames; `heldout.md` states Groq's first session; the gap card matches hits by topic;
    the claims about independence and rule-file changes say only what's shown; the duplicate README row is gone; Limitations
    says an amount isn't flagged once a checked claim exists.
  - *Left as they are:* the stamp and the freeze cover system prompts and schemas, not user-message templates, detector patterns
    or variant docs, so those need `--fresh` after an edit (the eval header and the README wording say so). H6 and H7 share
    "the transfer fee", a plain noun phrase in timeline cases, so they stay clean. A card's quote can be the model's whole-sentence
    span, sitting above the gap entry for the words it missed; the overall result is still Double-check.
- **QA round 4: APPROVED, no majors.** Five minors. Fixed after approval, with tests: Why says a doc couldn't be read rather
  than that the docs are silent; a stop keeps the retry count; fee copy quotes its words ("No doc supports “isn't refundable”");
  README wording. Left: with no gap entry, the card can name an amount a claim already accounted for (narrow, same on main).
  - *An incident during this round, recorded so it's on file.* One of QA's scripts ran in the real project folder instead of its
    scratch copy. It deleted `evals/.in-progress` while Gemini's held-out eval was running, and rewrote Gemini's golden report
    files from a stub. No source, test, seed or doc file changed, and no live AI call came from it. The results stand, and this
    was checked independently of QA: the golden files equal the real run's own log apart from the finish time, which was
    restored, and `heldout.md` equals the held-out run's log exactly, since that process held its scores in memory and finished
    by itself.

### D-042 · Groq moves to the paid Developer tier, with a spend limit (Abdullah's decision, 2026-11-02)
Groq's free tier allows 200,000 tokens a day, so the Phase 10 re-record and 3-run evals would have taken about 2 days. Abdullah
upgraded the account to the Developer tier. Production uses this same key.
- **Spend:** Groq has a $5/month hard spend limit, set by Abdullah in Groq's billing settings, with email alerts. Gemini stays
  free tier with no billing. The app still caps live checks at 500 a day and MCP at 200 a day.
- **Replaces** D-025's "both keys are free tier … a hard stop at $0" for Groq. Money is now at risk up to that limit, which also
  answers SPEC §10.1's provider backstop for this account.
- **Limits read after the upgrade:** 250,000 tokens a minute, from Groq's response headers. The scripts' spacing (12 s per Groq
  call) is unchanged.
- The README's spend line, its rate-limit line and its Limitations line now say this.

### D-043 · Phase 10 ships on Groq's results; Gemini finishes later (Abdullah's decision, 2026-11-02)
Phase 10's gate asked for both providers' evals. On 2 Nov Gemini's free tier was first out of quota, then overloaded (503 errors,
20 to 30 seconds per call against the app's 9-second timeout). Abdullah decided not to block on it.
- Merge, deploy and push go ahead once QA approves, with Groq's results. Gemini's rows in the README read "partial — paused during a
  Google overload on 2 Nov", with the count so far.
- The keep-the-timeout choice stands: Gemini's evals wait until it's fast, not for a longer eval timeout, so its numbers reflect the
  app's real 9 seconds. A small call every 15 minutes checks this; the eval starts only on an answer in under 5 seconds.
- When Gemini finishes, its results and the README update go in a separate commit.
- Limitations says the fallback can't answer within the timeout while Gemini is overloaded.
- **What happened next.** Gemini recovered at 10:09 UTC and finished at 10:21 UTC, before anything shipped, so the "partial" wording
  never went public. Golden 57/57, gate passes, 81/81 quotes, 180/180 fields. Clean held-out 39/39, fee cases 12/12, exposed 18/18.
  That's one session on the same frozen prompts, spread across the overload: the first 18 case runs were 09:07 to 09:10.
- **The selection rule's pick changed.** Both providers pass the gate with 0 quote rejections, so D-019's tie-break goes to field
  accuracy (Gemini 100%, Groq 97.2%), and `evals/results.md` reads `AI_PROVIDER=gemini`. Production still runs Groq as primary. The
  README says both. Abdullah kept Groq (D-044).

### D-044 · Groq stays primary, overriding the eval's pick (Abdullah's decision, 2026-11-02)
On the final prompts both providers pass the gate with 0 quote rejections, so D-019's tie-break goes to field accuracy (Gemini 100%,
Groq 97.2%) and the eval picks Gemini. Abdullah overrode that: Groq stays primary and Gemini stays the fallback.
- **Why:** availability and latency matter more for the live path, and the accuracy gap changed no decision.
- **The rule isn't changed.** D-017 and D-019 still produce the eval's pick, and it stays visible. `evals/results.md` shows the pick
  and the override side by side, from a constant in `scripts/eval.ts`, so a regenerated report can't contradict production.
- **Production doesn't change.** It already runs `AI_PROVIDER=groq` and `AI_FALLBACK_PROVIDER=gemini`.
- **Also confirmed by Abdullah:** H5 stays exposed (D-041, QA round 2), so the clean held-out set stays at 13 cases.

### D-045 · A reply that leaves the customer's question open is a Double-check (Abdullah's brief, P0-1, 2026-11-02). Amends SPEC §6.6
An independent review found a wrong reply passing on the live demo. Ayesha, instant rail: "Nothing to do on your side: the reversal is
automatic and you'll see it reflected after the weekend, minus the processing charge." came back ALLOW / NO_POLICY_CLAIM with 0 claims, and
the sent card said "Ayesha got the right answer."
- **What was really going on.** That result was one reading of Groq's, cached on the instance (`latencyMs: 0` on repeat). Fresh calls on the
  same prompt read the fee part as "not refunded" and gave a Hold, 5 of 5 (PROGRESS.md). Three of the five other wordings did get 0 claims. So
  the reliable fix can't be the prompt alone: temperature 0 doesn't make the model consistent, and the rules must not depend on it.
- **Rule D0e (new), in `decide.ts`, naming no topic.** A covered topic the customer's message asks about, with no claim on it in the reply, is
  CAUTION with the new reason `TOPIC_GAP`. It amends D0d, which now also needs no such topic. Each topic file brings an `asks` pattern, so
  the check is deterministic. The entry carries the docs' value when they have one (D-046). A gap never overrides a more severe result, and
  the existing reason stands when one already applies (D0b, D0c).
- **Three things D0e doesn't flag, and why.**
  - A detector hit on that same topic: that's D0b's, and T8 requires its reason.
  - SureSend's own Ask-first reply. It says the answer is being confirmed, in the topic's `confirming` words. Without this the system would
    Double-check its own holding reply, on the path that must send (SPEC §6.7). An agent typing those same words gets the same pass.
  - Over MCP with no `ticket_id`, where the seed ticket only supplies the rail, so its customer's question isn't this reply's. The flag isn't
    in the API body, so a client can't switch the rule off on `/api/send`.
- **Suggested replies.** A `TOPIC_GAP` recheck is accepted: the AI's rewrite was understood, and the question was missing from the draft too. A
  gap entry is never in the facts a reply is built from. So a corrected fee-only reply on these tickets rechecks as Double-check, and the UI and MCP
  say why ("it doesn't answer what the customer asked").
- **Prompt `2026-11-02.5`, draft side only.** Vague wording on a covered topic is a claim with no value, with the three examples from the brief.
  Follow-up promises stay non-claims even when they name the topic. Rewritten in the topic files; `SOURCE_SYSTEM` is unchanged.
- **Copy.** The sent card says "Sent. Nothing in the docs contradicted it." and "got the right answer" and "never reached" are gone, enforced by
  `lib/client/copyRules.test.ts`. Two additions the brief didn't name, same reason: a send past a Double-check says "Sent with your OK." because the
  docs may well have disagreed (a hedged contradiction is a Double-check), and a no-claim Allow says "No policy promise here", not "Your reply is right".
- **Expected results that changed because of the rule, not the case:** golden `no-claim`, `fee-correct`, `fee-unknown-rail`; held-out H10, H12, H13
  (marked `expectChanged`, all CAUTION / TOPIC_GAP); the preset `usman-fee-only`.
- **Held-out:** H20–H22 (vague replies) were committed before any prompt work (commit 40878c8), since the old set had no case for this. The 6 replies
  in `lib/check/vagueReply.test.ts` and the golden `vague-*` cases aren't held-out: their wording was in view when the prompt was written.
- **Written first:** 43 of 50 new tests failed before the fix (PROGRESS.md); the 7 that passed are the guards that the rule stays narrow.
- **Cost:** more Double-checks on correct but vague replies. README, Limitations.

### D-046 · A claim with no value shows the governing value (Abdullah's brief, P1-1, 2026-11-02)
"No doc backs this up" was false when the docs have a clear answer and the reply just doesn't give it. `decide.ts` now resolves the governing value
for a claim with no value and for a topic gap, using D4 to D7, and returns it on the claim: "Your docs say 1 business day; your reply gives no number."
- **It decides nothing.** D-012.4 stands: a claim with no value is CAUTION / UNSUPPORTED, skipping D1. The value only goes to the reader, the trace
  entry, the headline and MCP's `docs_say`. `resolve()`'s own trace is dropped here, since those rules didn't decide anything; D3's entry names the value.
- **No value named when there isn't one:** an unknown rail with rules that differ by rail, or a conflict, says "Your docs don't give one answer for
  this ticket". With no candidate at all, "No doc backs this up" is still true and still shown.
- **Fee wording:** `noValue` per topic, since "gives no number" is wrong for a yes/no: "Your docs say refunded; your reply doesn't say it plainly."
- **Suggested replies.** On a Hold with a vague claim beside it, the vague claim is marked for fixing, like a wrong one, so the rewrite states the value.

### D-047 · SureSend is the actor, not Slite Agent (Abdullah's brief, P0-3, 2026-11-02)
The panel title, status text ("Held by SureSend", "Sent · checked by SureSend"), landmark and button names, the tour and the empty state now say SureSend.
`copyRules.test.ts` allows "Slite Agent" only in the "independent concept" wording.
- **One tag.** The footer stays ("Independent concept for Slite Agent · synthetic data · not affiliated with Slite"), since the brief requires it on every
  screen. So the header's "Concept for Slite Agent" pill went. The page title reads "SureSend · independent concept for Slite Agent".
- **OG image.** It was the README GIF, which showed the old title and "Held by Slite Agent", and whose first frame is an empty panel, which is what most
  link previews show. It's now a static `public/og.png` of the Hold, and the GIF is re-recorded. `scripts/record-demo.ts` makes both.
- **Locked e2e.** `e2e/demo.spec.ts` asserts the two old status strings. See PROGRESS.md for how that was handled.

### D-048 · ESLint (Abdullah's brief, P1-5, 2026-11-02)
`eslint.config.mjs` uses `next/core-web-vitals` and `next/typescript`, the rules `next lint` sets up. `pnpm lint` allows no warnings and runs in CI. It found
10 things, all fixed by hand, with no mass rewrite: one real `<a>` that should be `<Link>`, two unused names, four `useCallback`s missing the stable `forgetFix`,
and three unused parameters or variables. One rule is set explicitly: `ignoreRestSiblings`, because destructuring a field out to drop it is how
`lib/client/metrics.ts` omits one. The existing disable in `App.tsx` now says why.

### D-049 · The slide-over and the tour offer (Abdullah's brief, P1-3, P1-4, 2026-11-02)
- **P1-3.** Under 1100 px, changing the conversation closes the slide-over. The auto-open effect also watched the send state, which is per ticket, so
  moving to a ticket with a result could reopen it; now a change of ticket only closes it. A running tour opens the panel itself, so it's exempt.
- **P1-4.** I couldn't reproduce this with working storage: on production, "Not now" held at 1440, 900 and 390 px through reload, leaving and coming back, the
  Demo menu, Reset demo and changing the conversation. It does come back when the browser blocks `localStorage`, as some private modes and in-app browsers
  do, because the answer then lives only in memory. So the offer now appears only if the answer can be remembered (`canPersist()`). In those browsers
  there's no first-visit offer, and the tour button and Demo menu still start it. If the review saw it in a normal browser, this hasn't fixed that.

