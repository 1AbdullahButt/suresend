# QA findings · Phase 11 · 2026-11-02T16:54:28Z

Round 3. Branch `phase-11`, HEAD 7c2ad93. No live AI call, no `pnpm eval`, no `pnpm record`. Replies with no saved response went through `runCheck` / `handleSend` / `checkReply` with hand-written draft extractions, over the real saved source extractions. Scripts and screenshots: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\qa11r3\`.

## Commands run

**Gate**
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0, no findings.
- `pnpm test` → exit 0. `Test Files 30 passed (30)`, `Tests 350 passed (350)`.
- `pnpm build` → exit 0.
- `AI_MODE=saved AI_PROVIDER=groq AI_FALLBACK_PROVIDER=gemini pnpm start -p 3100`. Stopped at the end; port 3100 is free.
- `pnpm tsx scripts/snapshot-results.ts <temp>/snap.json --compare evals/snapshots/after.json` → exit 1, which this script returns on any difference. `80 results … (0 not on saved responses)`, `66 identical, 2 different, 0 missing`. The 2 are `golden no-claim`, both personas, `CAUTION/TOPIC_GAP`. The output is byte-identical to `evals/snapshots/phase11.json`.
- `pnpm mcp:e2e http://127.0.0.1:3100/api/mcp` → exit 0, `ALL PASS`.
- `pnpm e2e` → exit 0, `1 passed`.
- `pnpm tsx scripts/ui-audit.ts http://127.0.0.1:3100` → exit 0. 30 state and width screens, `Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.` It rewrote 5 PNGs; I read the result and ran `git checkout -- design/audit`.
- `git worktree list` → `D:/Project/slite 7c2ad93 [phase-11]` only.
- `git diff main..HEAD --stat -- tests e2e SPEC.md IMPLEMENTATION_BRIEF.md data/seed` → only `e2e/demo.spec.ts`, the 3 lines in D-050. `git diff main..HEAD -- .loop/locked` → empty. `hook-test.mjs`: 12 of 12 as expected.
- `git diff 6b665bc..HEAD -- data/ai-cache lib/ai evals/golden.json evals/heldout.json e2e` → empty.

**Builder's browser scripts, re-run:** p11-ui-check 31/0, p11-offer 27/0, p10-ui 46/0, step5-ayesha 43/0, mcp-menu 31/0, step6-phone-fix 12/0, tour-step6 29/0, tour-menu 231/0. All as PROGRESS.md says.

**My own**
- New: `paths.cjs` 24/0 (every Ask-first path through a real Send, 1440 and 390), `engine.ts`, `engine2.ts`, `engine3.ts`, `mcp-http.mjs`.
- Re-run: `ui.cjs` 21/0, `slide.cjs` 39/0, `offer.cjs` 64/0, `states.cjs` 30/0.
- Screenshots read: Ask first with the fee kept at 1440, the same reply sent at 390. The rest of the UI I judged from the checks' text.

**Against the old code** (`git archive 6b665bc` in my temp folder, with the new test files copied in):
- `suggestionAgrees.test.ts` → **25 of 25 pass**.
- `presets.test.ts` → **fails**: `usman-both suggestion (support_agent): expected 'CAUTION' to be 'ALLOW'`, 9 of 10 pass.
- `vagueReply.test.ts` → 5 fail: the two readings from round 2, and the three own-sentence readings.
- The same comparison as `suggestionAgrees`, run on `usman-both` in a scratch test → fails on the old code, passes with HEAD's `templates.ts`, `runCheck.ts` and `decide.ts`.

## Findings

### Majors

None. Round 2's major is fixed.

### Minors

- [severity: minor] lib/replies/templates.ts:53-56 · expected: only SureSend's own sentence gets dropped. D-045: "words after the sentence get no pass from any span" · actual: the filter reads only the span's text, as you suspected, so it can drop a claim that's really about added words.
  - **What usually saves it.** With words added and no timeline stated, D0e fires: `your transfer`, `update`, `as soon as I have it`, a one-letter span and the whole sentence all come back `CAUTION/TOPIC_GAP`, send 428. A value-carrying claim is never dropped (Back in 3 days → Hold). A similar sentence, or words before it, gets no filter. A number after the sentence is `EXTRACTION_GAP`.
  - **Three shapes do reach Good to send**, where each would be Double-check without the filter:
    - Right timeline, then a vague fee, with the fee claim's span a fragment of the sentence: "…as I have it. Back within 1 business day, minus the charge for your transfer." with span `for your transfer` → `ALLOW/SUPPORTED`, send 200.
    - Right timeline, then a vague second timeline claim: "…or as soon as I have it." with span `as soon as I have it` → `ALLOW/SUPPORTED`.
    - MCP with no `ticket_id`, words added, the AI reading only the holding sentence: `ALLOW/NO_POLICY_CLAIM`. With a ticket it's Double-check.
  - **How serious: minor.**
    - Each ends where the AI missing those words already ends, and README states all three of those limits (lines 365, 370-371, 372-373). The same fee reply with the fee claim missed gives the same `ALLOW/SUPPORTED`.
    - The first two need an unnatural span. All 26 saved draft readings quote the words that state the claim, and none is a stray fragment like this. A model-like span (`minus the charge for your transfer`) stays Double-check.
    - The third needs a reading that catches the holding sentence and skips the added words, with no ticket.
    - Still, the filter is new code that turns a Double-check into Good to send on these readings.
  - **Fix, two lines, worth doing before merge.** Drop a claim only when the whole reply is SureSend's own text: require `holdingTopics(reply, claims).length > 0` as well. I computed this in memory without touching the repo. It still drops the plain reply's and the saved kept-fee reading's own-sentence claim, and it stops all three shapes. It also makes D-045's sentence true, and it restores `UNSUPPORTED` as the reason where words are added. The same 0-of-47 reasoning covers evals.

- [severity: minor] lib/check/runCheck.ts:144 · expected: "Every rule writes a trace entry" (CLAUDE.md rule 4), and AI output that gets dropped stays visible (SPEC §6.2, §7) · actual: the drop leaves no record.
  - On the saved kept-fee reading the AI returned 2 claims. The trace says "Draft read: 1 claim(s) extracted and quote-validated.", `rejectedExtractions` is `[]`, and Raw JSON doesn't show it.
  - The comment "not a rejection" is right about D0a's count, but quote validation records what it drops and this doesn't.
  - Fix: a line in `rejectedExtractions` with its own reason (`rejectedCount` is computed separately, so D0a stays right), or a line in the D0a detail.

- [severity: minor] lib/check/suggestionAgrees.test.ts · you asked whether it's real. **On its own it would have passed before the fix: 25 of 25 on the old code.**
  - Its logic is sound, as the scratch test above shows, but it walks only golden cases, and no golden case reaches an Ask first with a kept claim.
  - What catches the bug is the preset replay (`presets.test.ts`), plus the 5 new tests in `vagueReply.test.ts`. PROGRESS.md's "`suggestionAgrees.test.ts` and the preset replay" reads as if both would have.
  - Add one golden-independent case for `usman-both` there, or say which test is the catch.
  - `record-ai-cache.ts:106` makes the same comparison. I didn't run it (no record runs), but all 20 suggestion rows in `phase11.json` agree with their Send rows, so it shouldn't raise a false alarm on those.

- [severity: minor] Left for a later phase, and I agree: with a doc unread, replies carrying a value still get copy that treats the remaining docs as the answer (decisions right, same on `main`); the 404 page's missing label (SPEC.md:382).

### Your decisions

- **The filter in `runCheck`, against CLAUDE.md rule 3: the reasoning holds, with one correction.**
  - The prompt already says this isn't a claim, and the saved reading shows the model doing it anyway, so another prompt change isn't reliable. It would also unfreeze the prompt.
  - Nothing in S, A or D0a–D11 changes, and no test was bent. The validation layer is a reasonable home, since `decide()` keeps taking what it's given.
  - The correction: "no rule bends" is fair, but this is still a deterministic rule in effect, because it changes a decision. So it should leave a record (second minor), and the sentence about spans should become true (first minor).

- **Not rerunning the evals: that holds.** Line by line against the code Groq's reports ran on (f93910e; nothing changed in code before 6b665bc):
  - `runCheck.ts`: the filter returns false unless the reply opens with the holding sentence. 0 of the 47 eval drafts do, and none contains "confirming" or the sentence's ending. So `raw` and `rejectedCount` don't change.
  - `templates.ts`: `holdingSentence` makes the same tests as before, so `holdingTopics` is `[]` on those drafts, before and after.
  - `decide.ts`: only the wording of D0e's pass line, when `holding` isn't empty.
  - Scoring reads the decision, the reason and `suggestionIncludes` (`eval.ts:353-354`), and none of those changes. Ask-first rechecks do reach `holdingTopics`, but with template claims, which were removed the same way before; `phase11.json`'s suggestion column is byte-identical.
  - The other changes are tests, the Header, wording and `record-ai-cache.ts`. Prompts, schemas and saved responses are unchanged.
  - One practical consequence, which PROGRESS states: the stamp changed, so `pnpm eval` would run Groq again. Use `--provider gemini` for the pending rerun unless you mean to.

### Round 2's major: fixed, on the real saved reading

- **Browser, 1440 and 390.** P2, the whole flow: Usman → "Timeline and fee" → Send → Ask first, tagged "Checked against your docs" → Use holding reply → Send → **sent**, with "Sent. Nothing in the docs contradicted it." and "Sent · checked by SureSend". P3, P4 and P5 produce the same text, sent the same way. P10 (B3 in the browser's own workspace store, on Ayesha) and P7, the plain reply → sent.
- **`handleSend` on real saved deps.** P2, P3, P4, P5, P10: `200 ALLOW/SUPPORTED`, `ai=saved`, D0e pass. `runCheck` gives the same on both personas.
- **MCP over HTTP, as raw JSON-RPC.** `check_reply` on the preset → Ask first, `suggested_reply` "Good to send". `check_reply` on that text → Good to send / `SUPPORTED`. The plain reply → Good to send. MCP takes no doc edits, so P10 can't be reached that way.
- **The rest of Ask first.** P1, P6, P7, P8 and P9 send. P11–P13 have no saved reading in saved mode (503, not sent), so I used a stubbed read: P12 sends, and P11 and P13 are a Double-check, as D-045 says.
- **Of the suggestions saved, none now disagrees with its Send:** the 20 rows in `phase11.json`, and the presets on both personas.

### `holdingTopics`: your two readings

Both are now `CAUTION/TOPIC_GAP`, send 428, including with a right fee and `other` together. Nothing SureSend suggests was refused by this: its kept sentences match `replyTemplate` on the saved reading.

### Also checked

- **Demo button.** At 390 a held Enter on "Not now" opens nothing, and a deliberate press opens the menu. 1440 and 900 unchanged.
- **"Field-accuracy gap"** in `eval.ts:443`, README:201 and `results.md:9`, the same words. That's the only change under `evals/` since round 2.
- **Gemini's golden row** now carries "(before QA's fixes)".
- **Numbers.** README's 350 is right. No report changed, so round 2's checks stand.
- **PROGRESS's new evidence block** matches what I ran.

### Checked and found fine again

- **Round 1's majors.** "Slite Agent" once on all 6 tour steps at 1440, 1024 and 390. DOC-103 unread names no value, on the card, Why and MCP. Round 1's wordings with 0 claims are Double-check.
- **Rule D0e.** `lib/engine/decide.ts` still names no topic; `topicAgnostic.test.ts` passes.
- **Sent and Double-check cards**, at all three widths, with the tag once and visible.
- **Slide-over** at 700, 900 and 1099 with a real change of ticket, and the tour's panel.
- **Tour offer** through every way back and with blocked storage.
- **`/how-it-works`'s image**, "Matches your docs", the e2e and the lock.

### Before merge

- D-050 quotes Abdullah asking to be shown that `e2e/` is re-locked before merging. The record and my checks say it is; he still needs to see that.
- README:247's "passed (local and live)": local is proven; live can't be until this branch is deployed.

## VERDICT: APPROVED
