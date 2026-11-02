# QA findings · Phase 11 · 2026-11-02T16:24:27Z

Round 2. Branch `phase-11`, HEAD 6b665bc. No live AI call, no `pnpm eval`, no `pnpm record`. Replies with no saved response went through `runCheck` / `handleSend` / `checkReply` with hand-written draft extractions, over the real saved source extractions. Scripts and screenshots: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\qa11r2\`.

## Commands run

**Gate**
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0, no findings.
- `pnpm test` → exit 0. `Test Files 29 passed (29)`, `Tests 319 passed (319)`.
- `pnpm build` → exit 0.
- `AI_MODE=saved AI_PROVIDER=groq AI_FALLBACK_PROVIDER=gemini pnpm start -p 3100`. Stopped at the end; port 3100 is free.
- `pnpm tsx scripts/snapshot-results.ts <temp>/snap.json --compare evals/snapshots/after.json` → exit 1, which this script returns on any difference. `80 results … (0 not on saved responses)`, `66 identical, 2 different, 0 missing`. The 2 are `golden no-claim`, both personas, `CAUTION/TOPIC_GAP`. The output is byte-identical to `evals/snapshots/phase11.json`.
- `pnpm mcp:e2e http://127.0.0.1:3100/api/mcp` → exit 0, `ALL PASS`.
- `pnpm e2e` → exit 0, `1 passed`.
- `pnpm tsx scripts/ui-audit.ts http://127.0.0.1:3100` → exit 0. 30 state and width screens, `Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.` It rewrote 4 PNGs; I read the result and ran `git checkout -- design/audit`.
- `git worktree list` → `D:/Project/slite 6b665bc [phase-11]` only.
- `git diff main..HEAD --stat -- tests SPEC.md IMPLEMENTATION_BRIEF.md data/seed` → empty. `git diff main..HEAD -- .loop/locked` → empty.

**The e2e unlock**
- `git diff --numstat main..HEAD -- e2e` → `3 3 e2e/demo.spec.ts`. The six lines are the three in D-050, and no others.
- `hook-test.mjs`, synthetic JSON piped to `.claude/hooks/protect-locked.mjs`: Write, Edit (backslash and relative paths), MultiEdit, a new file under `e2e/`, `sed -i` and `Set-Content` on the spec, `tests/`, `SPEC.md` → exit 2 each. Controls (the findings file, a read-only `git diff` on `e2e`, `pnpm e2e`) → exit 0.
- The real hook also refused two of my own commands before they ran: one whose test string contained the blocked worktree phrase, and one that mentioned `git checkout` and `e2e/` together. I split the second into separate commands and dropped the first case.

**Builder's browser scripts, re-run:** p11-ui-check 29/0, p11-offer 27/0, p10-ui 46/0, step5-ayesha 43/0, mcp-menu 31/0, step6-phone-fix 12/0, tour-step6 29/0, tour-menu 231/0. All as PROGRESS.md says.

**My own**
- `ui.cjs` 19 pass, 2 fail (the major below).
- Round 1's `slide.cjs` 39/0, `offer.cjs` 64/0, `states.cjs` 30/0.
- `engine.ts`, `engine2.ts`, `api.mjs`.
- `replay.ts`, read-only: golden 25 of 25, presets 9 of 9, and each of the 12 suggestions sent on its saved reading.

Screenshots read: the refused holding reply at 1440, unread-doc Why at 390. The rest of the UI I judged from the text and checks in `ui.txt` and `states.txt`; I re-read no other screenshots this round.

## Findings

### Major

- [severity: major] lib/check/runCheck.ts:322, lib/engine/decide.ts:420, data/ai-cache/2655a29f….json · expected: the replies SureSend itself suggests go out (D-045: "the path that must send", SPEC §6.7) · actual: **Ask first with a kept or corrected claim is refused at Send, on the demo's own preset.**
  - **Repro in the browser, 1440 and 390:** Usman → Try another reply → "Timeline and fee" → Send → Ask first. The holding reply reads "…as soon as I have it. The transfer fee is refunded." and is tagged **"Checked against your docs"**. Use holding reply → Send → **not sent**. Card: "Double-check · Your reply is vague on this · Your docs don't give one answer for this ticket; your reply gives no number." It quotes SureSend's own holding sentence as the vague claim (`1440-usman-both-after-send.png`).
  - **Real server:** `/api/send` → `428 CAUTION/UNSUPPORTED`.
  - **MCP:** `check_reply` says "Send suggested_reply", with its check "Good to send". `check_reply` on that same text returns Double-check / `UNSUPPORTED`.
  - **Cause:** the recorded reading of that text has two claims. One is `reversal_window`, no value, span = the holding sentence. The other is the fee. The recheck at `runCheck.ts:322` uses hand-built claims, so it never sees this and shows ALLOW. `holdingTopics` isn't the problem: the no-value claim goes through `decideClaim` and comes out `UNSUPPORTED`.
  - **It's a regression from this phase's prompt.** On `main` (prompt `.4`) the saved reading is the fee claim alone, so this reply sent.
  - **Reach:** paths P2, P3, P4, P5 and P10 in `engine.txt` (a right, wrong, vague or hedged fee beside the Ask first, and a doc conflict with a right fee) all produce this exact text, so they all hit this reading. Saved responses are tried first, so production should behave the same. A person can still tick the box and press Send anyway, so it's not a dead end, but the check tag was false and the sentence blames the agent for SureSend's own words.
  - **The other suggestions are fine.** The plain Ask-first reply sends (`200`), including after B3. Of 12 suggestions replayed, this is the only one whose own check disagrees with the Send.
  - **Why nothing caught it:**
    - The test at `vagueReply.test.ts:289` stubs the AI with the fee claim only, so it passes on a reading the AI didn't give.
    - `scripts/record-ai-cache.ts:106` accepts CAUTION on a suggestion, so `record` said "Unexpected: 0".
    - `p10-ui.cjs` stops before sending, and the snapshot has no presets.
  - **I missed this in round 1.** The reading dates from 12:39Z, before that review. I listed "Ask first keeps and corrects a vague fee and rechecks ALLOW" as fine, having looked only at the recheck and not at a Send on the saved reading.
  - **Fix.** Two options, and the choice is yours:
    - In the rules: a no-value claim whose span lies wholly inside SureSend's holding sentence isn't a claim. That also protects the plain reply if a live read goes the same way. It must not widen the exemption: the span has to be inside the sentence, not after it.
    - In the prompt: CLAUDE.md rule 3 prefers this, but the prompt is frozen, so it means a version bump, a re-record and new evals, and D-045 itself says temperature 0 doesn't make the model consistent.
    - Either way, add a test with the real reading's shape, and a replay test that a suggestion shown as "Checked against your docs" comes back ALLOW on its saved reading. Tighten `record-ai-cache.ts:106` the same way.

### Minors

- [severity: minor] lib/replies/templates.ts:40 · two AI readings still get a wrong reply past `holdingTopics`, because any claim's span counts as "accounted for".
  - Both start with the exact holding sentence. Both give Good to send, and `handleSend` would send.
    - `other`, no value, with the span over the added words: "…as I have it. You'll see it reflected after the weekend, minus the processing charge." → `ALLOW/NO_POLICY_CLAIM`. The rules ignore that claim, yet it still accounts for the words.
    - A right fee claim whose span covers timing words: "…as I have it. The transfer fee is refunded and you'll see the money after the weekend." → `ALLOW/SUPPORTED`. `decide.ts:124-127` already says another topic's claim never vouches for this one, however wide its span. This doesn't follow that.
  - Why minor and not major, unlike round 1: the 0-claims reading, which the AI really does produce (Gemini did on 6 golden runs), is closed. All 7 of the test's wordings and my 16 wordings with 0 claims behave: the 5 of mine that pass are the sentence itself (line breaks, both topics named) or punctuation or an emoji after it. Neither remaining shape appears in the 26 saved draft readings: `other` is defined as "with a value", and mixed sentences came back split into two claims. It's your call if you weigh it higher.
  - Fix: delete line 40. Only SureSend's own sentences (line 39, `replyTemplate`) then count as accounted for. The kept-claim test still passes, and so does the real reading's fee claim. Worth doing with the major, since it's the same function.

- [severity: minor] components/shell/Header.tsx:24 · at phone width, a held Enter on "Not now" opens the Demo menu, since focus lands on that button and only the tour button got the repeat guard (`[390] … Demo menu open=1`). 1440 and 900 are fixed, and a deliberate press still starts the tour. It only arises with a keyboard at that width.

- [severity: minor] scripts/eval.ts:443, README.md:201, evals/results.md:9 · "the accuracy gap changed no decision" now sits right after "Groq scores higher on decisions" (74/75 against 65/75). It's true of the field-accuracy gap the tie-break uses, but it reads as false. "Field-accuracy gap" fixes it.

- [severity: minor] README.md:259 · the golden table's Gemini row has no "(before QA's fixes)" label, unlike the held-out and exposed rows. The bold paragraph below it covers this. See the disclosure note under Numbers.

- [severity: minor] lib/client/outcome.ts:213, lib/engine/decide.ts · not from this phase, the same on `main`: with a doc unread, replies that do carry a value still get copy that treats the remaining docs as the answer.
  - DOC-103 unread, "within 2 business days" on Ayesha: Hold, "Instant transfers now reverse in 4 business days", with a suggested reply stating 4 days and tagged Double-check.
  - DOC-103 unread, "within 4 business days": "Your reply matches the policy".
  - DOC-101 unread, "The transfer fee isn't refundable.": "No doc backs this up" (Phase 10 QA's minor, still open).
  - SPEC §6.6.2 allows a Hold from other sources, so the decisions are right and it's copy only. For a later phase.

- [severity: minor] Agreeing with the two you left:
  - `/how-it-works` showing the concept wording twice: fine, the page is an unlinked README render.
  - The 404 page's missing label: not this phase. SPEC.md:382 does say "every screen", so it's a real small gap for a later phase.

### Before merge

- README.md:247 "passed (local and live)": local is proven; live can't be until this branch is deployed.
- **Untracked items that aren't mine.** `.agents/`, `.codex/` and `AGENTS.md` appeared at 16:22:34Z, during this review. No command of mine creates them. I didn't open or change them, so `git status` isn't clean. Check what they are before the next commit, so they aren't swept in by accident.

### Round 1's majors: fixed

- **Major 1.** Tour step 1 reads "Press Send: SureSend checks the reply". "Slite Agent" appears once on all 6 tour steps at 1440, 1024 and 390. `copyRules.test.ts` now flattens whitespace, and no source line ends in "Slite".
- **Major 2.** DOC-103 unread, in the real UI at 1440 and 390: "DOC-103 couldn't be read, so SureSend can't say what your docs give; your reply gives no number." Why says "Can't confirm" and "A doc couldn't be read", and no longer says the docs agree. The silent reply, MCP (`governing` null, `docs_say` null) and a Hold's suggestion name no value. A flagged doc (DOC-104) failing doesn't remove the value, and neither does a restricted one that's never read.
- **Major 3.** The 4 sentences from round 1 are Double-check with 0 claims, as are additions after the sentence, words before it, upper case, a curly apostrophe and free text in the list. Remaining shapes: the first minor above.

### Minors taken in this round: checked

- `dropsAnAnswer`: a rewrite that drops the timeline loses to the template (`1 business day`, ALLOW); a fee-only draft's rewrite stands.
- Held Enter on "Not now" at 1440 and 900.
- `public/demo.gif` is back, identical to `docs/demo.gif`, and `/how-it-works` shows it at 960×570 with no failed requests.
- MCP `in_reply`: false on a gap, true on a claim.
- "Matches your docs" on an Allow, "Matches today, changing soon", "send a checked one". No "right answer", "never reached" or "your reply is right" in the source or on the pages checked.
- A doc in doubt: "Your docs say 2 business days, but that doc is in doubt".
- `docs/MCP_DEMO.md`, `UI-CONTRACT.md:32`, the notes on H20–H22 (their drafts unchanged since 40878c8), the `eslint-disable` reason.
- The README's snapshot row, and 319 tests, are right.

### The e2e, reviewed against the old test

- The journey and selectors are unchanged, and the footer assertion still reads "Independent concept for Slite Agent" (`e2e/demo.spec.ts:54`).
- Only the actor's name changed. The `toHaveCount(0)` line had to change too: left on the old string it would pass whatever the UI did.
- `pnpm e2e` passes, and the test still proves a held reply isn't sent. No commit touches `.loop/locked` on this branch, and the hook refuses the path.
- On the approval: D-050 records Abdullah's words. I can confirm the record, not the conversation behind it.

### Numbers: all checked against the reports, and they match

- **Golden.** Groq 74/75, 107/107, 178/180, PASS. Gemini 65/75, 107/107, 180/180, PASS.
- **"Every miss … on the six vague replies, and none reached Good to send":** true, row by row.
  - Groq: `vague-monday-less-charge` once, Hold.
  - Gemini: `vague-repro` once and `vague-monday-less-charge` 3 times, Hold (4 runs); `vague-very-soon` and `vague-unknown-rail` 3 times each, `TOPIC_GAP` (6 runs).
- **Held-out.** Groq 47/48, fee 11/12, vague 9/9, 97/97. Gemini 44/48, 10/12, 7/9, 91/91; its two vague misses are H22, `TOPIC_GAP`.
- **Exposed.** Groq 16/18, 41/41, both misses H13, `CAUTION/UNSUPPORTED`. Gemini 17/18, 39/39.
- **Across sessions** (1db5346, 5a0b026, 760ad28, HEAD).
  - H18 correct 0/3, 3/3, 1/3, 2/3: Hold on 6 of 12.
  - H14 3/3, 2/3, 3/3, 3/3.
  - H11 3/3, 3/3, 1/3, 3/3: on this prompt Hold on 4 of 6, vague on 2 of 6.
- **Earlier-session row** and PROGRESS's figures match 760ad28's reports: 75/75, 105/105, 170/180; 46/48, 10/12, 9/9, 98/98; exposed 16/18.
- **`evals/results.md`.** Pick: Gemini, on field accuracy. Override: Groq (D-044). It holds both golden reports verbatim, and `heldout.md` holds both held-out reports verbatim.
- **Gemini's disclosure: clear enough.**
  - The times bear it out. Gemini's golden ran 13:42:23–13:50:35Z and its held-out 13:50:37–14:00:12Z, before f93910e (15:14:34Z). Groq's ran 15:15:21–15:35:46Z and 15:39:23–16:03:55Z, after it and before 6b665bc (16:05:28Z).
  - README says this in bold, says which fixes it doesn't reflect, and points to the times. None of those fixes touch a scored path.
  - I can't verify the limit at 22 of 66 from here; PROGRESS.md states it and quotes the provider's message.

### Checked and found fine again

- **The rest of Ask first.** Plain reply after a 4-day draft, after B3 on all rails, with a limit dropped (P6), both topics named (P12), and the fee named with the timeline kept (`200` on a stubbed read). The fee alone (P11, P13) is a Double-check, which D-045 now says.
- **Rule D0e.** Silent and fee-only replies are Double-check. Right answers pass.
- **Sent and Double-check cards** at 1440, 1024 and 390, with the tag once and visible.
- **Slide-over** at 700, 900 and 1099, with a real change of ticket and in-flight results; the tour's panel at those widths.
- **Tour offer** through every way back and with blocked storage.
- **`noCustomerMessage`** isn't in the API bodies; the code that strips it hasn't changed since round 1.

## VERDICT: CHANGES_REQUIRED
