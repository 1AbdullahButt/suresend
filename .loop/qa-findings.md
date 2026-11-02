# QA findings · Phase 11 addendum · 2026-11-02T17:50:33Z

`git diff f195c37..6aacd6c` on `main`, HEAD 6aacd6c, not pushed. No live AI, no eval, record or hedge-runs run. The earlier checks on f195c37 carry forward (commit 6aacd6c's copy of this file). The diff touches no UI, rules, prompts, reports or locked paths (`git diff --stat` on `components`, `app`, `lib/engine`, `lib/check`, `lib/ai`, `evals`, `SPEC.md`, the brief, `tests`, `e2e`, `data` is empty), so no browser checks and no eval stamp change.

## Commands run

- `pnpm typecheck` → exit 0. `pnpm lint` → exit 0. `pnpm build` → exit 0.
- `pnpm test` → exit 0. `Test Files 30 passed (30)`, `Tests 356 passed (356)`. README says 356.
- `git grep` for the old strings ("same check", "show the Hold every time") in `scripts`, `e2e`, `tests`, `lib`, `docs` and README → none left.

## Findings

### Blockers and majors

None.

### Checked

- **The sentence** appears 4 times, each with the clause: README:27, :119, :404, DECISIONS.md:939. It's accurate at the level of `decide()`'s inputs.
  - "The same ticket" has to mean the ticket with its rail, which is what `decide()` takes. A changed rail picker is a changed input, and the demo shows that one changing the decision.
  - The reply's own text is also an input (the detector, the holding check). The sentence is about one reply, and both paragraphs say so.
  - Neither is worth more words. It's my wording, so I'm not neutral on that.
- **`hedge-runs.ts`, by reading.**
  - Progress is read before anything is deleted. `--fresh` or a different stamp removes the folder and starts new, so old `run-N` answers can't replay as live. The same settings still continue. No progress file with stale folders can't arise in practice, because `main` saves progress before its first run.
  - Only Groq × 10 writes `evals/hedge-runs.*`; other settings write `hedge-runs-<provider>-<runs>.*`. The header and the README's commands row agree.
- **MCP.** "(the rules rechecked it)" is true of an AI rewrite and of a template. `tools.test.ts:20` matches. `docs/MCP_DEMO.md:42`'s quoted prefix is still right.
- **Confidence clause.** README:399 and D-051: about 7% at 95% (exact 7.2%), about 26% for one sentence (exact 25.9%).
- **"What not to claim"** (README:404): fits the section and is accurate.
- **`docs/MCP_DEMO.md:46`:** "much more likely" is what's true.
- **D-051.** It's true: Abdullah's sentence lacked the clause, the 4-day reply and B5 are as I ran them, and "it's his to overrule" is stated.

### Minor, left

[severity: minor] components/tour/GuidedTour.tsx:123 · "SureSend reads your docs live" on a step whose canonical edits replay saved responses is unchanged. It's from before this work and isn't the same-verdict claim, so it's fine to leave for later.

## VERDICT: APPROVED
