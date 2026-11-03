# QA findings · Phase 12, confirmation of the fixes after the second pass · 2026-11-03T17:22:45Z

Branch `phase-12`, HEAD 3f10951. Reviewed `git diff 845c464..phase-12` only, not the whole phase. No live AI: `AI_MODE=saved` or hand-written readings. Production was loaded read-only for layout, with `/api/check`, `/api/send`, `/api/fix` and `/api/mcp` aborted. No env values printed. No source or test file edited. `docs/VIDEO_SCRIPT.md` and locked files not touched. My server is stopped (no listener on 3100). Scripts, logs and screenshots: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\p3\`.

Uncommitted edits to README.md, DECISIONS.md and PROGRESS.md appeared while I was reviewing: the span probe's new numbers (0 of 29, 3 of 20) and the pasted output behind them. They're docs only and I checked them too. The numbers add up against the paste. The committed copy still says 0 of 19 and one in 10.

## Commands run
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0, `--max-warnings 0`
- `pnpm build` → exit 0, `Compiled successfully`
- `pnpm test` → exit 0, `Test Files 33 passed (33)`, `Tests 445 passed (445)`
- `SLIDE_OVER_SHOT=<scratch> pnpm tsx scripts/slide-over-check.ts --serve` → exit 0, 51 PASS, 0 FAIL, `all passed`
- `pnpm e2e` against a local `AI_MODE=saved` server on 3100 → exit 0, `1 passed`
- `tsx scripts/ui-audit.ts` from a scratch folder, so `design/audit` wasn't rewritten → exit 0, 30 states, all `axe: none`, `Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.`
- `git worktree list` → only `D:/Project/slite 3f10951 [phase-12]`

## What this confirmation covered
**1. `shell.module.css`: confirmed.**
- `.app` computes to `clip` at 1099×800, 1024×800, 1024×561, 900×800, 700×800, 700×561, and to `hidden` at 1440×900, 1100×800, 1024×560, 1024×500, 844×390, 700×560, 699×800, 390×844. Where it's `hidden`, `scrollWidth` equals `clientWidth`, so there's nothing to jump to sideways.
- Jump: 120 opens each, watched every frame, at 1024×800, 700×800, 1024×500, 844×390: max `scrollLeft` anywhere 0, max header shift 0.
- Tab to Send at 844×390: local equals production. Rect 295–351, 56 px visible, clickable, `.app` scrolled by 104.
- Tour step 1 at 844×390: local equals production. Ring `717,330 64×64`, Send clickable.
- Resize from 844×390 to 844×700 and back: scroll resets to 0 under clip and returns to 104, nothing stuck.
- Where clip applies at its shortest (700 to 1099 × 561, all three tickets), Send is at 399–455, clickable, no overflow.

**2. `GuidedTour.tsx`: half confirmed.**
- Send is free in step 6 once the panel is closed: covered 0%, clickable, ring on it at 1024×700, 1024×600, 800×700, 800×600, also 1024×800, 1024×768, 768×1024.
- "After step 5's review, step 6 scrolls to the doc" holds only on tall screens. See the first finding.
- Walk at 1024×800, 800×800, 390×844, diffed line by line against the last pass's logs: only step 6 changed (and 1 px at 390 in step 2). 0 page errors. The only failed clicks are the same 3 as before, Send under an open panel, which the script expects. At 1024×800 and 800×800, step 6 is better on the review path: ring on the doc, textarea fully visible.
- On the phone, the ring now shows after the review, and the card covers 91% of the textarea, where it covered 8%. That's the direct path's own layout (97%), "Hide steps" is there, and typing collapses the card. Not a new kind of problem.

**3. `ChatCard.tsx`: confirmed.** No dot at any width. 390: "Léa K." over the picker, reads fine, still 25 px taller than one line. 430 and 699: one line. 700 and up: this head is hidden and the pill bar shows the name, so nothing changed. See the 320 px finding.

**4. `copyRules.test.ts`: confirmed.** I sliced the real `texts` and `allowed` out of the test file at run time and ran them on scratch sources outside the repo. Today's tree: 74 files, found 0. Fail as required: `<span>rail</span>`, `{"rail"}`, `aria-label="rail"`, "Pick the transfer type (rail) first" in a component and in `lib/`, "pass rail" outside `lib/mcp/`, "Bypass rail checks" even inside it, `title="Rail"`, a bare `"Rail"`. Pass as intended: both phrases inside `lib/mcp/`, a bare `"rail"` in code. 19 cases, 0 mismatches. Still passing, left open below: `const label = "rail"` used later in JSX, `{ label: "rail" }` in a data table, and `rail_type` or `RAIL_UNKNOWN`.

**5. `eval.ts` and `probe-draft.ts`: confirmed.** In `eval.ts`, `ok` is computed before `note` and doesn't read it. `note` reaches only stderr and the new `notes` text, which follows the table after a blank line. Scores come from `.ok`. The `--spans` probe uses the same `isVerbatim(span, reply)` as `validateDraftClaims` (`runCheck.ts:82`), and a fresh memory-only cache per reading, so it can't replay a saved answer. With `AI_MODE=saved` it printed `no reading: Live AI is not configured…` and `0 of 0`, not a false zero of N.

**6. Docs: every stale item from my list is right now, with four small inaccuracies below.** Checked against git: "Groq 74/75" is `.6` (e197ab1, the miss is `CAUTION/UNSUPPORTED`). "65/75" is `.5` (f93910e). `.1` is 75/75 and 117/117 (PROGRESS.md:2066). The only prompt difference from `.1` to `.2` is the span line and the version. "Since `2026-11-02.6`" is right for the fee wording (cd7abe1, `lib/topics/feeRefund.ts`). `suggestionIncludes: "1 business day"` is in `golden.json`. "22 of the 24 that ran" and "Gemini has run the 19 and 6" hold. The quota sentence is gone.

**D-059 and Limitations, rerun with `p2/drop.mts`:** the fee span off by one letter gives `ALLOW/SUPPORTED`, "Matches your docs", `rejected: [SPAN_NOT_FOUND]`. The right span gives Hold. The timeline span miscopied on a Hold gives "Not answered: Nothing on the reversal timeline". Both as stated. "The check stops only if every claim is dropped" matches `decide.ts:77` and SPEC D0a: both dropped gives `AI_UNAVAILABLE/EXTRACTION_FAILED`. One condition is missing; see below.

## Findings
- [severity: minor] components/tour/GuidedTour.tsx:356–361, PROGRESS.md:2157 · expected step 6 to scroll to the doc after step 5's review · actual **it only does while the doc's rectangle is still on screen, so about 735 px tall and up.** `findTarget` skips a doc above the viewport and returns the panel, so the new per-element key scrolls the panel, not the doc. 1024×740: doc at 216, textarea all visible. **1024×730, 1024×700, 1024×600, 900×700, 800×700, 800×600, 1440×700, 1366×650, 1280×600, 1100×700, 390×700: doc off screen, 0 to 25 of the textarea's 230 px visible, ring on the whole panel.** 1024×600 is the exact case in my second pass, unchanged (`p3/shots/s6-review-1024x600.png`), and 1366×650 is a common laptop. Going straight to step 6 without the review is right at all of them. No regression, and scrolling the panel still gets there, so it stays minor, but PROGRESS's "scrolls to a doc that renders late" overstates it. Log: `p3/s6.log`.
- [severity: minor] components/tour/GuidedTour.tsx:358 · expected scrolling by hand to be left alone · actual new with this edit: on short screens, scrolling the panel back up past the doc's title pulls it once, by 224 px (`asked 240, is 16`), at 1024×600, 800×600, 390×660, 1440×650. Production: 0 pulls. Steps 1 to 5: 0 pulls. Scrolling down: 0 pulls. It lands on the doc, so it's harmless. A fix for the finding above could cover it. Log: `p3/flip2.log`.
- [severity: minor] scripts/slide-over-check.ts:173–178 · expected the 51st check to fail if the short screen's bug returns · actual **it passes with the bug back.** With `overflow: clip` forced on `.app` at 844×390, the same sequence gives rect 333–389, so `r.top >= 0 && r.bottom <= innerHeight` is true, while 0 px are visible and `elementFromPoint` hits `HTML`. A rectangle ignores clipping. Test what a click would hit, as `onTop` in the same file does. The behaviour itself is right today, by my own measurement. Log: `p3/guard.mjs`.
- [severity: minor] README.md:404, DECISIONS.md:1067 · expected the dropped-claim path's conditions in full · actual "It takes a miscopy on the one wrong claim" leaves out that the wording must also be unknown to the detector. "minus the processing charge" and "less the transfer fee" with a miscopied span give `CAUTION/EXTRACTION_GAP`, "Couldn't confirm the fee refund", not Good to send. The error overstates the risk, so nothing unsafe follows. Log: `p3/drop2.mts`.
- [severity: minor] DECISIONS.md:1050 · expected the right attribution · actual "QA's second pass agreed with keeping it." It was the first pass (`git show 845c464:.loop/qa-findings.md`, line 27). The second pass's file doesn't mention D-056. Say "QA agreed".
- [severity: minor] DECISIONS.md:1067 · expected something traceable · actual "said that if he disagrees, its verdict flips" isn't in any findings file. It follows from the rule that a major blocks approval, but I can't source the sentence on disk.
- [severity: minor] README.md:266 · expected "previous" to read one way · actual "the prompt just before this one… golden was 75/75" sits two lines below the row "Groq, previous prompt, 74/75". Both are true, of different prompts (`2026-11-03.1`, `2026-11-02.6`), and they read as a contradiction. Name `2026-11-03.1`.
- [severity: minor] PROGRESS.md:2151–2153, README.md:248 · expected the evidence pasted (CLAUDE.md rule 6) · actual README says 51 passed, and the last run pasted in PROGRESS.md is the 50. My run shows 51.
- [severity: minor] components/inbox/inbox.module.css:485 · expected the picker to stay in its column · actual at 320 px "Instant transfer" runs 33 px past `.chatWho`, and the SureSend pill covers its chevron (`p3/shots/head-local-320.png`). Production fits. It's a cost of the rename, not of removing the dot. 360 and up are fine.
- [severity: minor] scripts/probe-draft.ts:28, 71 · expected `throttle: true` to space readings · actual a new runtime per reading means a new `throttled` with `last = 0`, so readings aren't spaced. A rate limit shows as `no reading`, not a false count, so the result stays sound. Also, `--spans` with no reply probes an empty string.

## Left open from the second pass
- **For Abdullah (D-059):** `lib/check/runCheck.ts:80–86`, `lib/engine/decide.ts:77`: a claim dropped for a bad quote can leave Good to send. `lib/engine/decide.ts:150, 317`, `lib/client/outcome.ts:301`: a dropped timeline on a Hold shows "Not answered". Both disclosed in Limitations. D0a's row and MCP still don't mention the rejection.
- `components/tour/GuidedTour.tsx:219–223`: the card covers the doc from 700 to 793 px wide (D-059). Not in D-059: at 800×800 it covers 84% of the decision after saving, and step 3's card hides the end of the composer.
- Step 4 with the panel closed by hand: the card covers Send at 1024×800 and 800×800. The step asks for nothing more by then.
- `components/shell/App.tsx:338`: Esc after closing the reset dialog leaves focus on BODY and the menu open (D-059).
- `lib/client/copyRules.test.ts`: `const label = "rail"` outside JSX, `{ label: "rail" }` in a data table, `rail_type` and `RAIL_UNKNOWN` still pass.
- `evals/heldout.md:17`, `scripts/eval.ts:530`: the list of earlier sessions leaves out e197ab1 and 191fbc5 for `.6`.
- `DECISIONS.md:968`, `README.md:266`: the wording is now honest, and golden's fall from 75/75 to 73/75 between `.1` and `.2` still isn't ruled out. 20 readings on `.2` give the miscopy on 3, and there's no matching run on `.1`. The first 39 readings' raw spans aren't saved.
- Tab alone at 700 leaves the last pill 76% visible, still clickable.
- A wrong "about a week" is a Double-check (D-058), for Abdullah.
- `inert` dropping the landmark and heading, and "resolves for an unknown transfer type" behind Details: left on purpose, and I agree.
- **Second-pass items now closed:** README 271–272, 285–295 and 315, 248, and 252–253, 258 and 278. README 266's account. `overflow: clip`. Step 6's card over Send. The dot.

## Not covered
No live AI, so the probe's readings (0 of 29, 3 of 20, 0 of 30) are checked for arithmetic against the paste, not reproduced. Production comparisons cover layout and focus only. At 844×390, cards taller than the screen run off the bottom. Going to step 2 without pressing Send, Next is at 398 on a 390 px screen, the same on local and production. With Send pressed, my forward walk reached step 6, whose card is 496 px tall, and the walk back stopped there because Back is out of reach. Card placement isn't in this diff, and the Limitations say the demo isn't built for that height. I didn't test tapping the picker at 320 px.

## VERDICT: APPROVED
