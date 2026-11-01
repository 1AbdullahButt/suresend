# QA findings · Phase 9 (re-review) · 2026-11-01T14:15:05Z

Scope: Phase 9 "Fix the doc" (PLAN.md §12, D-037) after the coordinator's fixes to my first review. Uncommitted tree on
`main` at 58f6f48.

Not run by QA:
- The deployed app and `pnpm mcp:e2e` against the live URL (the lead's gate items).
- Live eval and `pnpm record`.
- A fresh `pnpm build` (see the build line below).

## Commands run
- `pnpm typecheck` → exit 0
- `pnpm test` → exit 0 · `Test Files 21 passed (21)` · `Tests 163 passed (163)`
- `pnpm audit` → `No known vulnerabilities found`
- `AI_MODE=saved pnpm eval --saved` → `Decision accuracy 100.0% (12/12)` · `Quote validity 100.0% (13/13)` ·
  `Extraction field accuracy 100.0% (60/60)` · `Gate: PASS`
- **Build:**
  - Not rebuilt this round, because the coordinator's server on 3100 was serving from `.next` and a rebuild would have
    disrupted it.
  - `.next/BUILD_ID` is 2026-11-01 17:31:54 local, and `find app components lib scripts data/ai-cache README.md
    DECISIONS.md -newer .next/BUILD_ID` returned nothing.
  - That build served the new behaviour in the browser: the "Fix approved" menu tag, the new review wording, and the
    re-recorded fix text.
  - The first round's `pnpm build` passed (exit 0).
- `AI_MODE=saved AI_PROVIDER=groq AI_FALLBACK_PROVIDER=gemini pnpm start -p 3200` → `✓ Ready`; stopped afterwards.
- e2e/demo.spec.ts against 3200, via a QA-only config (the same spec, with baseURL on 3200) → `1 passed`
- `pnpm mcp:e2e http://127.0.0.1:3200/api/mcp` → `ALL PASS` (18 PASS lines), including `propose_doc_fix … drafted by AI,
  checked by the rules, applied false` and `no response mentions DOC-105`
- `POST /api/fix` on 3200:
  - TCK-9001 as support_agent and as ops_lead → `hold`, DOC-101, `origin ai`, `edit.action add_after`, `exception.rail
    instant`, recheck `HOLD/CONTRADICTS_GOVERNING | ESCALATE/SCOPE_UNKNOWN | ALLOW/SUPPORTED | ALLOW/SUPPORTED`
  - TCK-9002 as ops_lead → `ask`, DOC-101
  - TCK-9003 (Allow) → `proposal: null`
  - missing draft → 400
  - no DOC-105/FR-HOLD/CMP-7/Fraud text anywhere
- **Cache:**
  - 21 files, and every key verifies against its identity (`cacheKey`).
  - The 19 HEAD files are byte-identical (sha256 compare, 19/19).
  - The 2 orphans from the first recording are gone.
  - The new files are `doc_fix` e85c7d94, whose identity carries `sourceId: DOC-101` and `exceptionRail: instant` with
    FIX_PROMPT_VERSION `2026-11-01.1`, and the fixed-DOC-101 `source_extraction` 50d58304 under PROMPT_VERSION
    `2026-10-30.2`.
  - The doc_fix identity now covers every input `fixUserPrompt` sends.
- **Validator probe** (QA-only vitest, calling `validateFix`/`proposeFix` on seed DOC-101):
  - **Original major, fixed:** all five of my first-round edits are rejected (now also locked in lib/fix/fix.test.ts).
  - **Case and whitespace variants of the target:** accepted, but the validated edit is `add_after` at the exact quote,
    so nothing else can change.
  - **Rejected:** "same day", "4-day", "no longer".
  - **Accepted:** see the first minor finding.
- **Playwright browser checks** (`scratchpad/qa/browser3200.cjs`) → `BROWSER FAILS: 0`:
  - **Hold → review → Dismiss (1440):**
    - The link is reachable by Tab, has a visible focus ring, and focus moves to `#fix-title`.
    - The review shows the title, "A reply this session copied 4 business days from this doc.", "…gives instant-rail
      transfers 1 business day…", one Before/After pair, and `<ins>` around "For instant-rail transfers, failed
      transfers are reversed within 1 business day (see Instant Rail: Reversal Exception). How to tell the rail: …".
    - The label reads "Drafted by AI, checked by the rules: it adds one passage after the claim sentence and changes
      nothing else…".
    - Dismiss leaves localStorage byte-identical.
  - **Menu → Review fix → Approve (1440):**
    - The menu shows "2 held · copied 4 business days" before approval and the "2 replies…" why line.
    - Approval shows the toast and stores the DOC-101 override (verified), and the Docs tab shows the text.
    - The same Hold is rechecked and stays Hold with suggestion "We’ll reverse failed transfers within 1 business day.".
      There is no fix link and no AI-unavailable state.
    - Ask first no longer offers a fix.
    - The menu then shows "Fix approved", with no "Review fix" button.
  - **Ask first on TCK-9002 (1024):** the link and the review with the rail hint work.
  - **390:** the review fits (Approve at 16+249 px, card 358/358) and the menu renders.
  - **axe:** 0 violations of any impact on review@1440, ask-review@1024, review@390, menu@1440, menu after approval@1440,
    menu@1024 and menu@390.
  - **Layout:** no horizontal scroll at 1024 or 390, and the disclaimer footer is present.
- **Tour** (`scratchpad/qa/tour3200.cjs`; 1440 approve, 1440 dismiss, 390 approve):
  - "STEP n OF 6" for n = 1…6, ending in "Finish".
  - Step 5 axe: 0 violations.
  - After approve, step 5 shows "Fix approved: Outgoing Transfers: Reversal SOP now names the exception…" with no
    go-back note.
  - After dismiss, "Show me the fix" is offered again.
  - Step 6's DOC-103 edit on top of the approved fix gives Hold with "Failed transfers are reversed within 2 business
    days." (saved replay).
  - 1 FAIL, pre-existing: at 390, step 6's card covers "Save and verify" (see the last finding).
- Secret scan (precommit-scan patterns plus Bearer over `git diff HEAD` and the 10 untracked files, 1,817 lines) →
  `no secret patterns found`. No tracked `.env*` files.
- `git status -- tests e2e data/seed lib/engine SPEC.md IMPLEMENTATION_BRIEF.md CLAUDE.md` → 0 entries.
- `git worktree list` → `D:/Project/slite 58f6f48 [main]` only.

## Findings
First-round major (validator scope): **resolved.**
- The target must be normalized-equal to the claim quote, and the quote must occur exactly once.
- The validated edit is always `add_after` at the exact quote, and a `replace` must keep the sentence word for word.
- Verified by the new tests and by my probe.

First-round minors resolved:
- The doc_fix identity covers every prompt input.
- Tour step 5 acknowledges an approval.
- The step-6 references are fixed in README, record-ai-cache, variantBodies and the tourReplay test names.
- FixReview uses `exception.rail`.
- The source.ts comment is fixed.
- Ask first requires exactly one distinct exception.
- The menu shows "Fix approved".
- The mcp-e2e formatting is fixed.
- The Triage wording is "like fixes reviewed in Slite's Triage".
- The approve guard is now `fixStillApplies`, with a test.

Remaining, all minor:
- [severity: minor] lib/fix/validate.ts:47-48 and 77-84 (the content checks on the added passage)
  - **Expected:** README "From held replies to doc fixes" step 2 says the passage "may contain no other timeline,
    amount, number, negation or promise".
  - **Actual:** my probe got `ok: true` for these additions:
    - "Instant-rail transfers don’t get 1 business day yet." (curly apostrophe, so `don't` doesn't match)
    - "The instant-rail change to 1 business day wasn't approved." and "…didn't move to 1 business day." (contractions not in the list)
    - "Standard-rail transfers are reversed within 1 business day." and "All transfers are reversed within 1 business day." (wrong rail or all rails)
    - "Standard transfers can take two months.", "…can take a month.", "…eleven days." (months and number words beyond ten aren't in the pattern detector)
    - "…usually immediately." and "…the fee is waived."
  - **Why minor:** the edit is now purely additive, shown verbatim to the approver, and rechecked against the canonical
    decisions. The badScope test shows that a mis-scoped claim moves TCK-9003 and is dropped. Nothing is applied without
    approval.
  - **Suggested fix:**
    - Normalize ’ to ' and match any `\w+n't`.
    - Add `month(s)` and `immediately|instantly` to a fix-specific check.
    - Require the exception's rail word and no other rail word.
    - Or soften README step 2 to "no other digits or detected timelines, and no common negation or promise words".
  - (D-037's wording, "the policy-pattern detector… no negation or promise ("not", "never", "guaranteed"…)", is closer to
    what the code does.)
- [severity: minor] lib/client/useSureSend.ts:583-584 with lib/client/metrics.ts:96-99
  - **What happens:** `fixApproved` and `heldByDoc[id].fixed` are set on approve and cleared only by Reset demo (or, for
    `fixed`, by a new hold).
  - **Effect:** if the visitor then restores or deletes DOC-101 in the Docs tab, the menu still says "Fix approved" and
    tour step 5 still says "Fix approved: … now names the exception" even though the doc no longer has the fix.
  - **Severity:** an edge case; clear both when the DOC-101 override is restored or removed.
- [severity: minor] components/tour/GuidedTour.tsx:204 and scripts/record-ai-cache.ts:129
  - **What's left:** two code comments still say "Step 5" for the doc-edit step, now step 6.
  - **Severity:** cosmetic; the user-facing text is correct.
- [severity: minor, pre-existing, not Phase 9] At 390 px, tour step 6's card covers the bottom sheet's "Save and verify".
  The Playwright click was intercepted by the card. The step body and positioning are unchanged from HEAD's step 5. The
  coordinator has logged this as a follow-up.

Accepted as documented scope (D-037):
- A 5–7 day reply is not a Hold, so no fix is offered. The matcher maps it to DOC-104, and that is tested.
- The Ask-first fix is the same DOC-101 edit, with the rail hint.

Checked and fine:
- **DOC-105:** it can never be a target. Only "everyone" docs qualify, visibility comes from the seed, and the prompt only
  receives DOC-101 and the DOC-103 quote, title and hint.
- **Canonical recheck:** it compares decision/reasonCode against a baseline under the same overrides and role, and fails
  safe on a missing extraction.
- **Nothing applied:** neither MCP nor `/api/fix` applies anything.
- **Locked areas:** the engine, tests, e2e, seed data, SPEC.md and IMPLEMENTATION_BRIEF.md are untouched.

## VERDICT: APPROVED
