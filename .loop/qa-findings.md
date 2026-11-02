# QA findings · Phase 11 addendum · 2026-11-02T17:46:46Z

`git diff 81e112f..f195c37` on `main`, HEAD f195c37, not pushed. No live AI, no eval, record or hedge-runs run; I read `scripts/hedge-runs.ts` rather than running it. Scripts: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\qa11r5\`.

## Commands run

- `pnpm typecheck` → exit 0. `pnpm lint` → exit 0. `pnpm build` → exit 0.
- `pnpm test` → exit 0. `Test Files 30 passed (30)`, `Tests 356 passed (356)`.
- `pnpm e2e` → exit 0, `1 passed`.
- `tour-menu.cjs` → 231/0. `tour-step6.cjs` → 29/0. Saved-mode build; stopped; port 3100 free.
- `tour2.cjs`: step 2's new text on screen at 1440 and 390, inside the viewport, old phrase gone.
- `same.ts`: the sentence as written, on saved readings.
- `git diff 81e112f..f195c37 --stat -- SPEC.md IMPLEMENTATION_BRIEF.md tests e2e data evals/heldout.json evals/heldout.md lib/ai lib/engine lib/check/runCheck.ts lib/replies` → empty.

## Findings

### Major

- [severity: major] README.md:27, :119, DECISIONS.md:939 · expected: an accurate claim, which is the point of this change · actual: "the same AI findings and the same docs always produce the same decision" isn't true as written, because `decide()` also takes the ticket and the time. README:117, two lines above, names both.
  - The demo's own first screen contradicts it. On the same saved reading and the same docs, the 4-day reply is Hold on Ayesha, Ask first on Usman and Good to send on Hina. The rail picker alone does the same on one ticket.
  - The time does it too: B5 is `CHANGE_SIGNALLED` on 30 Oct 2026 and `HOLD` on 1 Jun 2030, same reply, same reading, same docs.
  - It hides no risk. I rate it major only because this sentence is what the change is for, and "always" is checkably false.
  - Fix, a few words: "On the same ticket at the same time, the same AI findings and the same docs always produce the same decision." That keeps the words Abdullah dictated, so it's his call. If he wants his exact sentence, he can accept it as written and this is closed.

### Minors: wording you missed

- [severity: minor] docs/MCP_DEMO.md:46 · "To make the clip show the Hold every time". Claude writes its own wording, which goes through live AI, so a hedged version gets a Double-check. "Much more likely" is what's true.
- [severity: minor] lib/mcp/tools.ts:138 · "Send suggested_reply instead (it passed the same check)". This tells an agent the Send will agree. A template's recheck uses SureSend's own claims, not an AI reading, which is how round 2's bug happened. "(the rules rechecked it)" is true. `tools.test.ts:20` asserts the string.
- [severity: minor] README.md:402 · optional: "What not to claim" is where "that the same reply always gets the same verdict" belongs.
- [severity: minor] components/tour/GuidedTour.tsx:123 · not this claim, and not new: "SureSend reads your docs live" on the step whose canonical edits replay saved responses (README:220).

### Minors: the rest

- [severity: minor] README.md:399 · "about 7%" is fair: the exact 95% bound on 0 of 40 is 7.2%, and the rule of three gives 7.5%. Two things it leaves out: it doesn't name the 95%, and it pools four sentences. For one sentence, 0 of 10 can't rule out about 26%. A clause would cover both.
- [severity: minor] scripts/hedge-runs.ts:129 · `--provider gemini` or `--runs 20`, which the header documents, overwrites the Groq report README cites. Nothing else is at risk.
- [severity: minor] scripts/hedge-runs.ts:67-70 · after a stopped run, a changed `--runs` without `--fresh` resets the results but keeps the `run-N` folders, so those rounds replay and get scored as live. It doesn't affect the published run: its folder is gone, and H18's readings vary.

### Checked and fine

- **`hedge-runs.ts` classification.** A miss is any verdict or reason off expected; Good to send is unsafe; `AI_UNAVAILABLE` is counted apart; everything else is strict. That matches Abdullah's definition. Ask first would count as strict without the label saying so, but none occurred.
- **Provider errors are never scored.** `createGuard` retries, then stops with exit 3 and the case unsaved. Invalid output stays the model's own answer, as in the eval.
- **Frozen and live.** It refuses to run unless prompt version and fingerprint match the freeze. `only` means no fallback; its own cache folder means `data/ai-cache` is never read. `temperature: 0` is in the client. Runs took 17:22–17:38Z, after 81e112f; `lib/ai` is unchanged.
- **Writes.** Only `evals/hedge-runs.*` and its own ignored folder, never the held-out report or `data/ai-cache`.
- **The cases are the right ones.** I read all 22 held-out drafts. H2, H14, H18 and H20 are the only hedged ones: H1's "about" is "sorry about this", H4's "always" is emphatic, and H21 and H22 are vague, not hedged. None edits a doc.
- **Numbers.** README's Limitations line, tests table, commands table and PROGRESS match `hedge-runs.md` and `.json`: 36/40, 4 strict, 0 unsafe, 0 couldn't check, H18 6/10 with 4 read as definite.
  - H18 Holds across 1db5346, 5a0b026, 760ad28, HEAD and the hedge runs: 3, 0, 2, 1, 4 = **10 of 22**.
  - H14: 3/3, 2/3, 3/3, 3/3, 10/10.
- **Judged fine in context.**
  - "deterministic" of the rules and detector: literal, and SPEC's uses are about the engine.
  - "Fixed rules decide / made the call" and the "Rules decided" tag: each now sits by text saying the AI reads the reply, or by "AI extracted".
  - "replay": saved responses by exact text, where the same verdict is true.
  - "this time the check passes" (tour step 3): it replays there.
  - "The AI never decides the outcome": the new sentence follows it.
  - No "guarantee", and "always" appears only in the sentence above and an unrelated README:17.
  - package.json and the GitHub description make no claim. The private script has 0 hits on the old phrases and says it reads the reply.
- **D-051.** Its claims are true, apart from the sentence above. `SPEC.md` and the brief weren't changed, and they say nothing about the same reply. `copyRules.test.ts` bans the old phrase, whitespace flattened. No eval stamp changes: nothing under `lib/engine` or `lib/check` changed.
- **Left as they are:** `/how-it-works` shows the new text; its link to the report renders as plain text, like its other relative links.

## VERDICT: CHANGES_REQUIRED
