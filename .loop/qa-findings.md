# QA findings · Phase 10 · 2026-11-02T10:37:00Z

Round 4. Narrow review of `git diff 7ad117f..1bb098f` on branch `phase-10` at 1bb098f. No Groq or Gemini call was made by me: every run used fake keys and the `fetch` stub. I didn't restart the server on :3100 or run `pnpm build`.

Repro scripts are in `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\qa\`. New this round: `r4-poison.sh`, `r4-matrix.sh`, `r4-misc.sh`, `r4-rec.sh`, `r4-rec2.sh`, `r4-r3-swap.sh`, `r4-r3-outage.sh`, `r4-gem-replay.sh`, `r4-gem-heldout.sh`, `r4-repair.sh`, `r4-ui-why.cjs`, `r4-ui-noclaim.cjs`. Saved output: `r4-poison.txt`, `r4-matrix.txt`, `r4-misc.txt`, `r4-rec.txt`, `r4-rec2.txt`, `r4-swap.txt`, `r4-outage.txt`, `r4-ui-why.txt`. The other scripts print to the console and can be re-run. Screenshots are in `shots-r4\`.

## My error: I changed files you told me not to touch

**What happened.** At 10:19:01Z a script of mine ran in `D:\Project\slite` instead of its scratch copy. I started it in parallel with the command creating that copy, the `cd` failed, and the script had no `|| exit`. It then did this in the real folder:
- It deleted `evals/.in-progress`, while Gemini's held-out eval was running.
- It deleted `evals/results-gemini.json` and `evals/results-gemini.md`, which Gemini's golden run had finished writing 5 minutes earlier.
- It ran `scripts/eval.ts --provider gemini` over the stub, which wrote those two files and `evals/results.md` again.

No live call came from this, because `fetch` was the stub. No source, test, seed or doc file was touched.

**What changed as a result.**
- `evals/results-gemini.json`, `evals/results-gemini.md`, `evals/results.md`: the only difference is Gemini's finish time, `10:19:01.073Z` where the real one is `10:13:35.336Z`.
  - Checked against the real run's log (`%TMP%\p10-eval-gemini.txt`): with the real time, `results.md` equals the log's text, and the report text appears in it verbatim. `results-gemini.json` is 2142 bytes, the real file's size.
  - One answer in the stub run came from the stub (fee-amount, run 3). The totals match the real report anyway.
- Held-out eval: the running process survived, because its next save recreated the folder. It finished by itself at 10:21:35Z.
  - Its answers for runs 1 and 2 and the start of run 3 were deleted from disk while it ran. It no longer needed runs 1 and 2, it holds run 3's in memory, and it would have needed the deleted run-3 answers on disk only if it had stopped.
  - A clean replay matches the real run's clean-case scores at all 57 saved points, 39 before the deletion and 18 after. Its report differs only where H16's third run feeds in: the exposed section's accuracy, quote count and H16 row. My snapshots lacked that case's answers, and the stub got it wrong.

**Not restored.** You told me not to touch these files, so that's your call. To put the real finish time back:

```
node "C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\qa\r4-restore-gemini-finish-time.mjs" "D:/Project/slite" --apply
```

Without `--apply` it only reports. I dry-ran it: 1 replacement in each of the 3 files. Do this before committing Gemini's results. Copies of Gemini's in-progress folders from 10:12:47Z on are in `scratchpad\qa\r4-gem\watch\`.

## Commands run

**Gate basics**
- `pnpm typecheck` → exit 0.
- `pnpm test` → exit 0. `Test Files 27 passed (27)`, `Tests 245 passed (245)`.
- `pnpm eval --saved` → exit 0. `Decision accuracy 100.0% (19/19)`, `Quote validity 100.0% (27/27)`, `Extraction field accuracy 98.3% (59/60)`, `Gate PASS`.
- `pnpm exec tsx scripts/snapshot-results.ts <scratch> --compare evals/snapshots/before.json` → exit 0. `68 identical, 0 different, 0 missing`, `0 not on saved responses`.
- `pnpm mcp:e2e http://127.0.0.1:3100/api/mcp` → exit 0, `ALL PASS`, including `check_reply two claims on TCK-9001: Hold [reversal window: Good to send; fee refund: Hold]`.
- `git diff main..HEAD --stat -- tests data/seed SPEC.md IMPLEMENTATION_BRIEF.md` → empty.
- `git worktree list` → `D:/Project/slite 1bb098f [phase-10]` only.
- `git diff 7ad117f..1bb098f` on `lib/engine`, `lib/check`, prompts, schemas and `lib/workspace` → empty. In `lib/topics` only a test file changed.

**1. Outage scenarios (`r4-poison.sh`, baseline 57/57)**

| Scenario | First run | Report overwritten | Re-run, healthy |
|---|---|---|---|
| 500s from call 30, report present, `--fresh` | exit 3, 19 of 57 saved, 0 not ok | no | continues, identical to uninterrupted |
| 500s from call 30, no report | exit 3, 19 saved, 0 not ok | no | identical |
| Held-out, 500s from call 30 | exit 3 | no | identical to the held-out baseline |
| 500s from call 60 (round 3's late outage) | exit 3, 38 saved, 0 not ok | no | 57/57, identical |
| 500s from call 1 | exit 3, 0 saved | no | identical |
| Only the last call fails | exit 3, 56 saved | no | 1 live call, identical |
| Network failure from call 30 | exit 3, `Connection error.` | no | identical |

- `r4-matrix.sh`, 500s from 18 points, golden and held-out: 36 of 36 lines read `first exit=3 reports-unchanged=yes error-rows-saved=0; resume exit=0; report identical to the uninterrupted run; left=0`.
- Short outages recover with no stop and 57/57. 1, 2 and 3 errors on a call give a line reading 1, 2 and 3. Three separate blips give 6.
- `r4-guard.ts`: `3 errors, then an answer: calls=4 waits(s)=30,60,120 retried=3`; `4 errors: (stopped)`.
- Invalid output stays the model's own result: invalid twice at call 70 → `no-claim 2/3`, 56/57, no stop, no retry line. With an outage after it, the resumed report is still 56/57, `failing: no-claim`.
- An invalid answer followed by a 500 on the inner retry → retried, not recorded, 57/57.
- `r4-rec2.sh`, `pnpm record`, 500s from calls 1, 10, 20, 30, 37: `exit=3 ai-cache-unchanged=yes`, and `--resume` is `same-as-uninterrupted`. Short outage: `Recorded 40 … Unexpected: 0`, same outputs.

**2. Why (`r4-ui-why.cjs`, 1440 and 390, `TOTAL 94 PASS / 0 FAIL`)**
- Real `runCheck` results; only the `/api/send` response is staged. The running build holds the new copy.
- Gap, timeline missed, and gap, fee missed: the missed claim's card reads `SureSend didn't compare this with your docs, because the AI didn't pick it up as a claim. Check it by hand.` The other card lists its docs.
- A gap with no claims: same sentence.
- Outside coverage, alone and with a covered claim: `SureSend doesn't check this topic against your docs. Check it by hand.`
- A topic no doc covers is a real path. On the real server with DOC-101 deleted: `CAUTION/UNSUPPORTED`, `rejected=none`, `No doc makes a claim about this.` That's true, since every doc was read.
- Each of those also passed: a word label on the decision, focus on Back, the disclaimer, axe 0 serious or critical, no horizontal scroll.
- I read screenshots `390-gap-fee-why.png` and `1440-doc-unread-why.png`.
- One path still fails this item: the first minor below.

**3. The repair of Gemini's progress**
- `r4-gem-replay.sh`: a clean pass over Gemini's own saved answers with empty scores, compared with the real resumed run.
  - The stamp matches: `849aba49…`, no `starting over`. The real log reads `continuing an unfinished run (18 of 57 case runs done)`.
  - At 18 case runs: 60/60 fields, 26/26 quotes.
  - Scores at the 8 points I read from the real run (36, 45, 51 to 56): `8 identical, 0 different`.
  - `replay report equals the section in the real run log, apart from times: true`: 57/57, 81/81, 180/180, Gate PASS.
- `r4-repair.sh`: built the bad state on the stub with 7ad117f's guard (`fee-amount AI_UNAVAILABLE`, `run=2`), ran the real `p10-gemini-repair.ts`, resumed with HEAD → `report identical to the uninterrupted run`.
- The script is right only if no run-2 case has finished. With 3 finished, my stub double-counts (`89/89`, `212/216`). That wasn't the real state: D-041 and the log both say 19 going to 18. The script is one-time and not in the repo, so this isn't a finding.

**4. Other round 3 minors**
- Spend limit: `groq: stopped: groq spend limit reached.`, 429 and 400 wordings, 1 call, no retries.
- `--fresh`: the stop text says `Re-run without --fresh to continue`. That continues, with `live calls=35`, and is identical to uninterrupted. The same command with `--fresh` starts over (84). With both providers, the re-run makes `groq 0, gemini 65`.
- Recording swap, killed between the renames then `--resume`: `exit=0 … Recorded 40`, `ai-cache: 40 files, ai-cache.old: none`. The other swap failures still leave a whole folder.
- `gapMatches` by topic: round 3's repro now reads `Couldn't confirm the fee refund`, with only the fee hit named.
- `heldout.md` states Groq's first session, and the numbers match. `eval --heldout --combine` and `eval --combine` rebuild both reports byte for byte at HEAD.
- Doc wording: the duplicate README row is gone. H17 to H19's "three-word phrase" wording is in. The Limitations example reproduces: `ALLOW/SUPPORTED`, with `currency:"PKR 25"` among the hits.
- `r4-rec2.sh` mutations, in a scratch copy: the last provider error returned as a result → `2 failed`; spend reading as daily → `2 failed`; the old gap sentence → `1 failed`; substring matching → `1 failed`. Control: `48 passed`.

**5. README against `evals/results.md`, `evals/heldout.md` at HEAD, and the progress file**
- 245 tests; 68 of 68.
- 57/57, 80/80, 175/180, PASS.
- 39/39, 12/12, 82/82; exposed 17/18, 38/38.
- First session 36/39, 9/12, 89/89 with H5. H18 0/3 then 3/3. H14 3/3 then 2/3.
- Gemini's `18/57 … all correct` was the repaired state (18 of 18 correct), and held-out `not started` was also true at the commit.
- 9-second timeout: `TIMEOUT_MS` is 9,000.
- I couldn't verify "503 errors, and 20 to 30 seconds per call" without a live call. It's from D-043 and is written as what happened on 2 Nov.
- Nothing false or overstated at HEAD. "passed (local and live)" was left out as you asked.

## Findings

### Majors

None.

### Minors

- [severity: minor] lib/client/outcome.ts:324-329; components/agent/WhyView.tsx:68 · Item 2 isn't fully met. On a doc that couldn't be read, Why still says the docs are silent.
  - Expected: "no sentence claims the docs are silent when they weren't compared". SPEC §6.6.2's source side says an unread source "might hold the contradiction".
  - Actual, on the real server with DOC-101 edited, so it has no saved response: `"The transfer fee isn't refundable."` on TCK-9003 → `CAUTION/UNSUPPORTED rejected=DOC-101:EXTRACTION_ERROR caps=DOC-101`. The card reads `No doc backs this up | No doc supports isn't refundable.` Why reads `No doc makes a claim about this.`, above `AI read the docs.` DOC-101 §4 says the fee is refunded. Only the trace says `DOC-101 couldn't be read`. Same at 1440 and 390 (`1440-doc-unread-why.png`).
  - Why it's a minor, and this is a judgement call: it's the same false sentence as round 3's major, but that one fell on every gap with the AI working. This one needs every doc on the topic to fail to read. The decision is right (Double-check, with an acknowledgement), the card says to check with the policy owner, and the trace names the doc. No report or README line is affected. It's the closest thing to a major this round.
  - The fee topic makes it easier to reach than on `main`, because DOC-101 alone carries the fee claim. One failed read is enough, and in saved mode one edit to DOC-101 is enough. On live AI it needs a provider failure, the state the new Limitations line describes.
  - Suggested fix, a few lines in `whyModel`: when `result.caps` is non-empty, say "SureSend couldn't read DOC-101, so it can't say what your docs say here. Check it by hand." I'd do this before merging.

- [severity: minor] scripts/eval.ts:223-236 · The retry line leaves out retries from a case a stop interrupted.
  - Expected: D-041's "The report says how many provider errors were retried".
  - Actual: `p.providerRetries` is saved only when a case finishes, and `stop` doesn't save. `r4-misc.txt`: a blip of 2, then an outage with 3 more retried on one call → report says `2`. The outage alone → report has no line at all. A run an outage stopped and resumed shows no sign of it.
  - No score changes, and an uninterrupted run counts exactly. Suggested fix: write only this counter in `stop`, by re-reading `progress.json`, setting `providerRetries` and writing it back. Don't call `saveProgress()` there: the tallies in memory include the interrupted case, so saving them would double-count it on resume.

- [severity: minor] lib/client/outcome.ts:178-179 · The Unsupported sentence reads badly on fee claims. Real server: `No doc supports refunded with your money.` and `No doc supports isn't refundable.` The cause is `valueText` inside a sentence written for durations. Copy only.

- [severity: minor] lib/client/outcome.ts:14 · Round 3's second `gapMatches` case is still open, since it has no gap entry. `A PKR 25 fee applies and refunds take 4 business days.` with the amount claimed names `“PKR 25”`, which that claim accounted for. Same on `main`, narrow, and the decision is right.

- [severity: minor] README.md:154 · "That was a one-time logic correction" is followed two lines later by "A second QA round found the same gap". D-041:757 says "second and last logic change", which is right. Drop "one-time".

### Left as they are in D-041: I agree

- The stamp doesn't cover user-message templates, detector patterns or variant docs. The eval header says so and says to use `--fresh`, and the README now says "system prompts or schemas".
- H6 and H7 stay clean, for the reason given in round 3.
- A wide quote on a card sits above the gap entry for the words it missed. The result is still Double-check.

### Checked and found fine

- A no-claim reply: `whyModel` returns "No doc makes a claim about this", but it never reaches the screen. `r4-ui-noclaim.cjs`, real server: `send 200`, no decision card, no Why button.
- `AI_UNAVAILABLE` hides the Why button (`CheckView.tsx`, `!off`), so that path's sentence isn't shown either.
- Groq's reports are untouched: `git diff HEAD` on `results-groq.*` and `heldout-groq.json` is empty.

### For the separate Gemini commit (not findings at HEAD)

Gemini finished during this review, uncommitted in the working tree: golden 57/57, 81/81, 180/180, PASS; held-out 39/39, fee 12/12, 81/81; exposed 18/18, 39/39. `evals/results.md` now reads `AI_PROVIDER=gemini` on field accuracy. `.loop/await-human.md`, which isn't mine, asks Abdullah about that. When that commit lands, the Gemini rows change, and so must README.md:183, "The eval picked Groq as primary", unless the selection text explains the choice. Restore the finish time first (see "My error").

## VERDICT: APPROVED
