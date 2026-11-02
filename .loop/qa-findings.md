# QA findings · Phase 11, second round · 2026-11-02T20:12:04Z

Branch `phase-11`, HEAD e197ab1, `git diff main..phase-11`. No live AI, no eval, record or hedge-runs run. Replies with no saved response went through `runCheck` / `handleSend` with hand-written draft extractions, over the real saved source extractions. Scripts and screenshots: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\qa12\`.

## Commands run

- `pnpm typecheck` → exit 0. `pnpm lint` → exit 0. `pnpm build` → exit 0.
- `pnpm test` → exit 0. `Test Files 30 passed (30)`, `Tests 372 passed (372)`. README says 372.
- `snapshot-results.ts --compare evals/snapshots/after.json` → exit 1, which it returns on any difference. `84 results … 0 not on saved responses`, `62 identical, 6 different, 0 missing`. The output is byte-identical to `phase11b.json`.
- `snapshot-results.ts --compare evals/snapshots/phase11b.json` → exit 0, `84 identical`.
- `snapshot-results.ts --compare evals/snapshots/phase11.json` → exit 1, 72 identical, 8 different: the repro and the Monday reply go to Hold (2 personas each), and the 4 digit-only rows go from `ai→CAUTION` to `template→CAUTION`.
- `pnpm e2e` → exit 0, `1 passed`. `pnpm mcp:e2e http://127.0.0.1:3100/api/mcp` → exit 0, `ALL PASS`.
- `pnpm tsx scripts/ui-audit.ts http://127.0.0.1:3100` → exit 0. 30 screens, `Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.` I read it and ran `git checkout -- design/audit`.
- Builder's scripts: p11-ui-check 43/0, p11-offer 27/0, p10-ui 46/0, step5-ayesha 43/0, mcp-menu 31/0, step6-phone-fix 12/0, tour-step6 29/0, tour-menu 231/0. All as PROGRESS.md says.
- My own: `newui.cjs` 70/0 (repro and Monday Hold through a real Send at 1440, 1024, 390; 404; tour line; API routes). `paths.cjs` 24/0, `ui.cjs` 21/0, `states.cjs` 30/0, `slide.cjs` 39/0, `offer.cjs` 64/0. `detector.ts`, `values.ts`, `mcp-http.mjs`.
- `git archive e00cd5d` in my temp folder: the 3 test files → `Tests 6 failed | 113 passed (119)`, the same 6 as PROGRESS.md.
- Locked paths: `git diff main..phase-11 --stat -- tests e2e SPEC.md IMPLEMENTATION_BRIEF.md data/seed` → empty. `.loop/locked` diff empty. Hook test as expected. `git worktree list` → `D:/Project/slite e197ab1 [phase-11]` only.
- Screenshots read: the 404 page at 1440 and 390, the repro's Hold at 390, tour step 6 at 390.

## Findings

### Blockers and majors

None.

### Minors

- [severity: minor] README.md:311 · "The detector catches the same wording too, so if the AI misses it, the reply is a Double-check, not Good to send", straight after H23–H25 · it catches only "minus", "less", "after deducting", "deducting" and "net of" before a fee word.
  - H23–H25 hit nothing, and if the AI reads only their timeline they are `ALLOW/SUPPORTED`. README:377-378 states the general limit, and keeping those words out of the detector is right.
  - The sentence overstates the net in the unsafe direction. Name the words, or point to that limit. Worth fixing before merge.

- [severity: minor] lib/topics/feeRefund.ts:35 · false hits from the new alternation, with no fee claim extracted: "less time and charge nothing", "more or less, says the person in charge", "not deducting the fee", "no less than the fee you paid".
  - Each is `CAUTION/EXTRACTION_GAP`, send 428, with a sentence that quotes the odd words. Never a Hold.
  - With a fee claim extracted, the decision is untouched, as D-052 says.
  - It's the safe direction, but nothing says so: the "leaves alone" test has no fee word in it, and README's Limitations doesn't list this. A `less(?! than)` and no crossing a comma would remove most of them. Optional.

- [severity: minor] README.md:290, DECISIONS.md:953, evals/heldout.md:9 · H23 and the new rule share "taken off" (H23 "with the service cost taken off"; prompt "with the fee taken off it"), below the three-word line, and the two commits are 98 seconds apart. The order is right and the test passes, but "in other words" is a bit generous for H23. A clause would cover it. The prompt is frozen, so don't change it for this.

- [severity: minor] README.md:264-265 · "no reply reached Good to send" is literally false: canon-9003 and allow-1day do, as expected. "No miss did."

- [severity: minor] app/not-found.tsx:1, DECISIONS.md:960 · they cite SPEC §16 and §15. "Every screen" is in §18 (SPEC.md:382).

### Your questions

1. **The prompt: fine.**
   - `draftRule` and `vagueRule` are used only in the draft prompt (`prompts.ts:76-77`). The `values` and source notes are unchanged, as are the reply, fix and schema versions.
   - "we'll look at the fee as well" shares only "the fee" with H12, and no three-word phrase with any held-out case.
   - H23–H25 are byte-identical at e00cd5d and HEAD, and e00cd5d (18:09:58Z) comes before cd7abe1 (18:11:36Z).
   - The test is real. In a temp copy, words from H23 in the prompt fail both the overlap and the freeze; a prompt change with no shared phrase fails the freeze; an H23 edit that reuses prompt words fails the overlap. It doesn't pin a held-out draft against a harmless edit, so git is the proof there, as for every case.

2. **The detector: fine, apart from the first two minors.** It doesn't fire on any SureSend template. Across 59 eval drafts and presets it fires only on `vague-repro` and `vague-monday-less-charge`. A false hit costs a Double-check.

3. **`statesValues`: it's fine, and the evals stand.**
   - It refuses some good rewrites: "one business day", "1 Business Day", "1 working day", "Refunded:" with a capital, "you get the fee back", "isn't refunded" where the docs say "not refunded", and a fee-only fix that leaves a hedged or vague timeline. Each falls back to the template, which states the right values and rechecks the same. The only loss is wording.
   - Saved suggestions: all golden and preset ones, both personas, tag = Send, 0 disagree. `tourReplay.test.ts` and `vagueReply.test.ts` fail with the check removed, so it's guarded.
   - Evals: scoring is `decision && reasonCode && suggestionOk` (`eval.ts:353-354`). Decisions are set before `holdSuggestion`, and tallies count the rewrite's extraction, which comes before the check.
   - The 9 `suggestionIncludes` strings are all governing values, which the template states, so none can flip to a fail. In the reports they pass, apart from one Monday run that missed on the decision and got no suggestion. Hedge runs read no suggestion. The stamp changed, so use `--provider gemini` for the 08:07 rerun.

4. **Numbers: all match the reports.**
   - Groq golden 74/75, 115/115, 173/180, PASS. Held-out 56/57, fee 20/21, vague 9/9, 130/130. Exposed 17/18, 40/40, the miss H13 on 1 of 3. Hedge 34/40, 6 strict, 0 unsafe.
   - H18 Holds across sessions: 3, 0 | 2, 1, 4 | 1, 5 = **16 of 35**.
   - H14: 3/3, 2/3, 3/3, 3/3, 10/10, 3/3, 9/10.
   - "62 of 68": the 6 are the no-claim reply on 2 personas and the digit-only edit on 4 rows, as stated. 170, 178, 173 are right.
   - Gemini's rows are labelled as the previous prompt and match 9d13a70. The provider bullet is true of `.5`, and `results.md` says "Only groq has a complete report on this prompt so far" and "Not finished on this prompt: gemini".

5. **The tour: accurate.** A replayed step's reading is keyed to that exact doc text, so the answer does come from the doc and the rules still compute it. A saved reading isn't a hard-coded answer. The text is shown on screen at 1440 and 390, and step6-phone-fix passes.

6. **The 404 page: fine.**
   - At 1440 and 390 on `/nope`, `/foo/bar/baz`, `/how-it-works/x`, `/api-nope`: status 404, disclaimer once, one heading, no page errors. On `/nope`: the back link works by keyboard, axe is clean, no horizontal scroll, and the CSS applies.
   - API routes answer as before: `/api/seed` 200; `/api/check`, `/api/send`, `/api/fix` GET 405; `/api/mcp` GET and DELETE 405 with Allow POST; POST `/api/check` with a bad body 400. Unknown `/api/*` is 404 HTML, now this page.
   - Other pages carry this text only in Next's script payload, not on screen.

7. **`.gitignore`: right.** All four paths are ignored. `.vercelignore` has the three Codex paths and `.claude/`, as D-052 says.

8. **The same-decision sentence:** it has the clause everywhere (README:27, :119, :405, DECISIONS.md:939, and PROGRESS's evidence line).

### Also checked

- **The repro, through a real Send at 1440, 1024 and 390:** Hold, naming the fee, "Held by SureSend", 409. The suggestion states both values and is tagged checked, and it sends. The Monday reply is the same. A vague timeline keeps "Your docs say 1 business day; your reply gives no number."
- **MCP over HTTP:** the repro is Hold, and its `suggested_reply` checks Good to send. Usman's preset still sends. So round 2's fix survived the re-recording.
- **Expected results changed:** only `vague-repro` and `vague-monday-less-charge`, by Abdullah's decision. The `vagueReply.test.ts` edits are forced by the detector and add an assertion that the timeline's gap entry stays.

### Before merge

README:249's "passed (local and live)" holds only once this branch is deployed. Gemini's rows change with its own commit.

## VERDICT: APPROVED
