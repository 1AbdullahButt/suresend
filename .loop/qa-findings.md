# QA findings · Phase 11 · 2026-11-02T17:07:34Z

Round 4, narrow: `git diff 7c2ad93..6963504` on branch `phase-11`. Round 3's results at 7c2ad93 (commit 6963504's copy of this file) carry forward for everything this diff doesn't touch. No live AI call, no `pnpm eval`, no `pnpm record`. Scripts: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\qa11r4\`.

## Commands run

- `pnpm typecheck` → exit 0. `pnpm lint` → exit 0. `pnpm build` → exit 0.
- `pnpm test` → exit 0. `Test Files 30 passed (30)`, `Tests 355 passed (355)`.
- `pnpm tsx scripts/snapshot-results.ts <temp>/snap.json --compare evals/snapshots/after.json` → exit 1, as it returns on any difference. `66 identical, 2 different, 0 missing`, the same two `no-claim` rows. Output byte-identical to `evals/snapshots/phase11.json`.
- `pnpm e2e` → exit 0, `1 passed`. `pnpm mcp:e2e http://127.0.0.1:3100/api/mcp` → exit 0, `ALL PASS`.
- `git diff main..HEAD --numstat -- tests e2e SPEC.md IMPLEMENTATION_BRIEF.md data/seed` → `3 3 e2e/demo.spec.ts` only. `.loop/locked` diff empty. `hook-test.mjs`: as expected. `git worktree list` → `D:/Project/slite 6963504 [phase-11]` only.
- Not re-run, because this diff touches no UI: the axe audit and the builder's browser scripts.
- `paths.cjs` → 24 pass, 0 fail, on a saved-mode server rebuilt at HEAD. `engine.ts`, `engine2.ts`, `mcp-http.mjs`, `rawjson.cjs`.
- Temp copies of 6b665bc and 7c2ad93 with the new test files, removed afterwards.

## Findings

### Blockers and majors

None.

### Checked

1. **The filter.**
   - Round 3's three shapes are now Double-check: the fragment-span fee and the second vague timeline are `CAUTION/UNSUPPORTED`, send 428; MCP with no ticket is Double-check / `UNSUPPORTED`.
   - Every other attack with added words is Double-check or Hold.
   - On the saved readings, P2, P3, P4, P5, P7 and P10 send through `handleSend` (`200`). In the browser at 1440 and 390, the whole P2 flow, the same reply for P3–P5, and P7 and P10 with B3 in the workspace store all send.
   - MCP over HTTP: `suggested_reply` "Good to send"; `check_reply` on that text → Good to send / `SUPPORTED`; the plain reply → Good to send.

2. **The record.**
   - The kept-fee reply carries `{"sourceId":"DRAFT","reason":"OWN_HOLDING_SENTENCE","snippet":"I'm confirming…"}`, visible in Raw JSON.
   - D0a reads as a success: with a reading of only the sentence, the plain reply is `200 ALLOW/NO_POLICY_CLAIM`, because `rejectedCount` is computed separately.
   - Readers: the only code that reads the array is `scripts/eval.ts:359`, a count in the note on a failed case, and no eval draft can add to it. `quoteRejections` comes from its own tally. The Check card, Why and Trace don't mention it, and MCP doesn't expose it. Nothing misreports it.

3. **The new test.**
   - On 6b665bc: `Ask first with a kept claim, on the demo's own preset` fails with `support_agent: expected 'CAUTION' to be 'ALLOW'`; `1 failed | 25 passed`.
   - At HEAD it passes.
   - The other new tests are real too: on 7c2ad93 the record test and the three shapes fail, 4 of 4.

4. **Docs.**
   - D-045's "words after the sentence get no pass from any span" is true now.
   - README's 355 matches the run.
   - What PROGRESS.md states is accurate. It has no evidence block for this commit yet: its last block says 350 and is labelled round 2. Add this round's output with the `GATE: PASSED` line.

5. **Evals.** The reasoning still holds. The filter's conditions only narrowed: for a reply not opening with the holding sentence, `raw` and `rejectedCount` are unchanged and nothing is recorded, and that's still 0 of the 47 drafts. `types.ts` only adds a reason. The diff touches no prompt, schema, saved response or report, and the snapshot is byte-identical. As before, the stamp changed, so use `--provider gemini` for the pending rerun.

6. **Gate.** All above.

### Minors carried from round 3, for a later phase

With a doc unread, replies carrying a value still get copy that treats the remaining docs as the answer (decisions right, same on `main`); the 404 page's missing label (SPEC.md:382).

### Before merge

D-050 quotes Abdullah asking to be shown that `e2e/` is re-locked before merging, so he still needs to see that. README:247's "local and live" holds only once this branch is deployed.

## VERDICT: APPROVED
