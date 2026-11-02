# QA findings · Phase 11 · 2026-11-02T14:18:04Z

Branch `phase-11`, HEAD 760ad28. No live AI call, no `pnpm eval`, no `pnpm record`. Replies with no saved response went through `runCheck` / `handleSend` / `checkReply` with hand-written draft extractions, over the real saved source extractions. Scripts and screenshots: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\qa11\`.

## Commands run

**Gate**
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0, no findings. `eslint --print-config lib/engine/decide.ts`: 98 rules active, `no-explicit-any` is an error. CI runs it.
- `pnpm test` → exit 0. `Test Files 29 passed (29)`, `Tests 303 passed (303)`.
- `pnpm build` → exit 0.
- `AI_MODE=saved AI_PROVIDER=groq AI_FALLBACK_PROVIDER=gemini pnpm start -p 3100`. Stopped at the end; port 3100 is free.
- `pnpm tsx scripts/snapshot-results.ts <temp>/snap.json --compare evals/snapshots/after.json` → exit 1, which this script returns on any difference. `80 results … (0 not on saved responses)`, `66 identical, 2 different, 0 missing`. The 2 are `golden no-claim`, both personas, now `CAUTION/TOPIC_GAP`. The 80-row output is byte-identical to `evals/snapshots/phase11.json`.
- `replay.ts` (mine, read-only, every golden case and preset on saved responses): `golden: 25 ok, 0 bad`, presets 9 of 9. Expected results differ from `main` only for `no-claim`, `fee-correct`, `fee-unknown-rail`.
- `data/ai-cache`: 46 files. `source_extraction` 12 and `draft_extraction` 26 at `2026-11-02.5`, `safe_reply` 7, `doc_fix` 1.
- `pnpm mcp:e2e http://127.0.0.1:3100/api/mcp` → exit 0, `ALL PASS`.
- `pnpm tsx scripts/ui-audit.ts http://127.0.0.1:3100` → exit 0. 30 state and width screens, `Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.` It rewrote 3 PNGs; I read the result and ran `git checkout -- design/audit`.
- `pnpm exec playwright test` (the locked spec) → exit 1. The only failure is `e2e/demo.spec.ts:30`, `Held by Slite Agent`.
- `pnpm exec playwright test --config …\p11-e2e\pw.config.ts` → exit 0, `1 passed`. `diff` against the locked spec shows the 3 status strings and the import path, nothing else.
- `git diff main..phase-11 --stat -- tests e2e SPEC.md IMPLEMENTATION_BRIEF.md data/seed` → empty.
- `git worktree list` → `D:/Project/slite 760ad28 [phase-11]` only.

**Tests written first.** `git archive 40878c8` into my temp folder, `vitest run` on the two test files → `Tests 43 failed | 7 passed (50)`, as PROGRESS.md says. Five of the six fail with `expected 'ALLOW' to be 'CAUTION'`. `monday-less-charge` fails with `expected 'EXTRACTION_GAP' to be 'TOPIC_GAP'` (minor below). At HEAD all 50 pass.

**Builder's browser scripts, re-run:** p11-ui-check 26/0, p11-offer 25/0, p10-ui 46/0, step5-ayesha 43/0, mcp-menu 31/0, step6-phone-fix 12/0, tour-step6 29/0, tour-menu 231/0.

**My own:** `slide.cjs` 39 pass, 0 fail. `offer.cjs` 64 pass, 0 fail. `states.cjs` 30 pass, 0 fail (1440, 1024, 390). `misc.cjs`, `ui1.cjs`, `engine.ts`, `engine2.ts`, `engine3.ts`. Screenshots read: `og.png`, GIF contact sheet, tour step 1, repro at 390, sent card at 390, fee-only at 1024, unread-doc Why, slide-over at 900, tour step 5 at 900, `/how-it-works` at 390.

**Other:** `curl` of the source page. Held-out cases compared between 40878c8 and HEAD. Three-word overlap computed independently.

## Findings

### Majors

- [severity: major] components/tour/GuidedTour.tsx:44-45 · expected: "SureSend" as the actor and one tag per screen (brief P0-3, D-047: "the tour … now say SureSend") · actual: step 1 of the guided tour reads "Press Send: Slite Agent checks the reply against your docs first, and holds it if it's wrong."
  - Seen in the browser at 1440 and 390 (`tour1-1440.png`); the page then has `"Slite Agent" count=2`.
  - It got past the guard because the source wraps between "Slite" and "Agent". `lib/client/copyRules.test.ts:33` uses `.includes("Slite Agent")`, and `p11-ui-check` counts only on the home page.
  - Fix: the word, and `/Slite\s+Agent/` in the test.

- [severity: major] lib/engine/decide.ts:339-346, lib/client/outcome.ts:205 and :209 · expected: no value named when the docs can't give one for this ticket (D-046). SPEC §6.6.2, source side: an unread source "might hold the contradiction" · actual: when the doc that governs fails to read, the next doc's value is presented as what the docs say.
  - Real server and real UI at 1440 and 390: DOC-103 edited in the Docs tab (no saved response, so unread), the repro on Ayesha, instant rail. Card: **"Your docs say 4 business days; your reply gives no number."** The true answer is DOC-103's 1 business day. Nothing in the Check view mentions an unread doc.
  - Why (`1440-unread-why.png`) lists the SOP as "Applies" and says "Your docs agree on this." The result is `caps=DOC-103`, `reason UNSUPPORTED`; only the trace names the unread doc.
  - Same wrong value on the other paths: the silent reply ("Your docs say 4 business days; your reply doesn't say."), the engine headline ("the policy says 4 business days"), MCP `governing` and `docs_say`, and a Hold's suggested reply when a vague claim sits beside the wrong one ("…a reversal window of 4 business days. The transfer fee is refunded.").
  - It's a regression. On `main` this state gave no value. 4 days on an instant transfer is exactly the answer this product exists to stop, and P1-1 now offers it to the agent as the docs' answer.
  - Reachable live when one source's extraction fails and the draft's succeeds. Saved mode: any edit to DOC-103.
  - Fix: `docsValue` returns null when any visible, non-excluded source is unread, with a sentence that says so (`outcome.ts:366` already has the wording). `isVague`'s fallback ("Your docs don't give one answer") would be the wrong reason there. Add the repro as a test.

- [severity: major] lib/topics/index.ts:37-39, lib/engine/decide.ts:141 · expected: the exemption covers a reply that "says the answer is being confirmed" (D-045); "Only SureSend's own holding wording … goes through" (README:351) · actual: it's a substring test on the noun phrase, `the exact reversal timeline`, so the words around it don't matter.
  - With the AI reading 0 claims, `handleSend` returns 200 and the card reads "Sent. Nothing in the docs contradicted it." for each of these:
    - "I'm confirming the exact reversal timeline for your transfer, but you'll see it reflected after the weekend, minus the processing charge."
    - "Don't worry about the exact reversal timeline: you'll see it reflected after the weekend, minus the processing charge."
    - "We never share the exact reversal timeline, so please stop asking."
  - "THE EXACT REVERSAL TIMELINE IS AFTER THE WEEKEND." is `ALLOW/NO_POLICY_CLAIM` too. MCP with `ticket_id` returns Good to send.
  - That is P0-1's bug in a narrower form, and rule D0e exists because, per D-045, "the rules must not depend on" the AI.
  - The first sentence is the likely one: an agent editing the holding reply already in the composer. The new prompt line that a promise to follow up isn't a claim ("I'm confirming the timeline and will get back to you") pushes the AI toward 0 claims there.
  - I can't say how often it does without a live call, and a good read gives `CAUTION/UNSUPPORTED` (`engine.txt`). So this needs the AI to miss as well. D0e is the net for exactly that case, and here the net is off.
  - Fix: exempt only SureSend's own holding sentence, with nothing else in the reply outside it and the extracted claims' spans. Add the three sentences as tests.

### Minors

- [severity: minor] lib/client/outcome.ts:142-143, :72; components/tour/GuidedTour.tsx:415 · copy that still claims a reply is right. Your call, Abdullah's brief names only the sent card.
  - "Your reply is right" shows on a re-check with no Send: on Hina, send the 4-day reply, type it again, switch persona (`1440-your-reply-is-right.png`).
  - It can be false. "Your money is back within 1 business day, minus the processing charge." with only the timeline claim extracted is `ALLOW/SUPPORTED`, headline "Your reply is right". The customer didn't ask about the fee, and the fee detector doesn't know those words. README:362 states the limitation but not this headline.
  - Also "Right today, changing soon" and the tour offer's "send the right one".

- [severity: minor] app/how-it-works/page.tsx:41 · expected: the README's image shows · actual: `GET /demo.gif` → 404, `naturalWidth 0`, broken image and alt text at the top of the page. `public/demo.gif` was deleted in ad705bf and the page still maps `docs/demo.gif` to `/demo.gif`. Minor because nothing links to the page (DECISIONS.md:373). One line to fix.

- [severity: minor] lib/check/runCheck.ts:221 · D-045's reason for accepting `TOPIC_GAP` ("the question was missing from the draft too") is false on a timeline Hold. With 4 days on Ayesha and an AI rewrite that drops the timeline, the suggestion is `ai→CAUTION`: "Thanks for your patience, our team is on it." or "The transfer fee is refunded.", where the template rechecks ALLOW with 1 business day. It's more honest than `main`, which called it Good to send, but it offers a non-answer over a right one. Accept the gap only when the draft had no claim on that topic.

- [severity: minor] lib/replies/templates.ts:15-19 · SureSend's own holding reply can be a Double-check, against D-045's "the path that must send". Ask first on the fee alone (a doc edit makes the fee rail-specific, unknown rail): "I'm confirming the transfer fee details…" → `CAUTION`, `handleSend` 428. Only after a doc edit. It's honest, since it doesn't answer the timeline, but D-045 should say so or the template should name the asked topic.

- [severity: minor] lib/engine/decide.ts:339 · no qualifier on a weak basis. B6 and B7 (doc edited after verification, `EDITED_AFTER_VERIFICATION`) give "Your docs say 4 business days" and "Your docs say 2 business days" plainly, where the comparison path says the doc is trusted less. Literally true.

- [severity: minor] lib/check/vagueReply.test.ts:149, :163 · the Monday variant's expected reason changed to `EXTRACTION_GAP` after 40878c8, with the decision unchanged and a stricter assertion added. The correction looks right: before the fix that reply was already Double-check through the detector, so it was never a Good-to-send case. PROGRESS.md doesn't say so. Brief item 1d's "recorded failing" holds for 5 on the decision and for this one only on the reason code.

- [severity: minor] Published numbers:
  - README:244 says `302 passed`; the run gives 303.
  - README:296 says H14 "has gone 3/3, 2/3 and 2/3"; `evals/heldout.md` on this prompt is 3/3, so it's 3/3, 2/3, 3/3.
  - PROGRESS.md Phase 11 lists "H14 2/3" beside "Exposed 16/18", which only adds up with H14 at 3/3.
  - README:383 says "3 of 6" Hold on H18; with this prompt it's 5 of 9.
  - The headline numbers all match (see below).

- [severity: minor] docs/MCP_DEMO.md:45 · "If Claude writes a correct or timeline-free reply on its own, SureSend says Good to send." A timeline-free reply with `ticket_id` is now a Double-check (MCP returns `CAUTION/TOPIC_GAP`). Line 13's "three tools" was already stale; there are four.

- [severity: minor] design/v2/UI-CONTRACT.md:32 · a replace-all error: the footer row now reads "Independent concept for SureSend". The footer says "Slite Agent".

- [severity: minor] `/how-it-works` shows the concept wording twice, README:5 in the body and the footer. In the app it's once at every width (see below). The 404 page has no disclaimer label at all (`GET /nope`, 0 matches); that's not from this phase.

- [severity: minor] lib/mcp/tools.ts:198 · on a gap, `claims[].says` is "Nothing on the reversal timeline", which isn't something the reply said. The web UI handles this with `quoted`; MCP has no equivalent.

- [severity: minor] Builder's `p11-ui-check.cjs` slide-over check doesn't test a change of conversation. `click({force:true})` lands on the scrim, which closes the panel; the ticket never changes. Replay printed `before=Ayesha K. after force click: ticket=Ayesha K. open=false` at 700, 900, 1099. The behaviour itself is right, by my test below. PROGRESS.md's evidence for P1-3 isn't.

- [severity: minor] components/shell/App.tsx:165-170 · Enter on "Not now" moves focus to "Guided tour", so a second Enter or a held key starts the tour (`dialogs open=1`). This is the only path I found back to anything after "Not now" with working storage, and it's the tour, not the offer.

- [severity: minor] Small things: `lib/client/outcome.ts:48` still has "never reached" in a comment (brief: "everywhere"). `evals/heldout.md`'s "What it probes" column is empty for H20–H22. The `eslint-disable` at `GuidedTour.tsx:301` has no reason, unlike the App.tsx one.

### Conditions, not findings

- **The locked e2e.** Confirmed: those strings are the only failure. It needs Abdullah's one-time unlock. `.github/workflows/ci.yml:42` runs `pnpm e2e`, so CI fails on merge until then. README:248's "passed" isn't true of the locked file today.
- README:247's "passed (local and live)": local is proven; live can't be until this branch is deployed.
- Gemini: the five modified files under `evals/` are the Gemini run's, not mine, and I didn't review them. No eval process was running at the end of my review. README's Gemini rows, and "The eval's pick" in `evals/results.md`, go in the separate commit.

### Checked and found fine

- **Silent or wrong replies, the rest of D0e.** Silent replies on all three seed tickets, a fee-only reply, an `other` claim with no value, and a claim rejected by quote validation are all Double-check. Right answers still pass: 1 day on Ayesha, 4 on Hina, both claims right, the holding reply. A detector hit stays `EXTRACTION_GAP`.
- **Pure and generic.** Same input gives the same output; `asks` has no `g` flag; `topicAgnostic.test.ts` passes. It's in the trace on every branch past D0a. No hidden source: `DOC-105` isn't in any gap or vague response for the support agent.
- **`noCustomerMessage`.** On the real server, in the body of `/api/check`, `/api/send` and `/api/fix`: stripped. Result `CAUTION/TOPIC_GAP`, send 428. Only `checkReply` sets it, and only with no ticket. An empty `ticket_id` behaves as no ticket, which README:355 discloses.
- **`docsValue` otherwise.** Right on instant, standard, unknown (null, "don't give one answer"), an unknown rail with an any-rail fee ("refunded"), B1, B2, B3 (null), B5, and proposal-only ("No doc backs this up"). It changes no decision.
- **Suggested replies.** Hold with a vague claim beside it states both values and rechecks ALLOW. Ask first keeps and corrects a vague fee and rechecks ALLOW. Gap entries never reach the facts.
- **Sent and Double-check cards**, at 1440, 1024 and 390. "Sent. Nothing in the docs contradicted it." with "The 4-business-day reply was held and not sent." or "SureSend checked it…"; "Sent with your OK." past a Double-check. Each has an icon and a word label, 0 serious or critical axe findings on the screens scanned. The ack checkbox shows a focus ring when reached by Tab, and Space and Enter work. "got the right answer" and "never reached" are on no page.
- **P0-3 elsewhere.** `public/og.png` (1200×630): SureSend, "Held by SureSend", the footer tag. OG and Twitter tags point to it. `<title>` is right. `docs/demo.gif` (sampled every 1.5 s, 12 frames): only the footer tag, and it shows the new sent card. In the app, the tag appears once at each width on every card state I scanned; tour step 1 is the exception above.
- **P1-3, with a real change of ticket.** At 700, 900 and 1099: activating a row closes the panel and it stays closed. Going back to a held ticket doesn't reopen it. Esc returns focus to the toggle. Another ticket's in-flight result doesn't open it, including on a blocked ticket. Tour: step 5 opens it itself on the ticket change; step 4 keeps it closed, as its `enter` says. A resize from 1200 to 900 on a held ticket opens it, which isn't a change of conversation and is unchanged.
- **P1-4: D-049's reasoning holds.** The offer's only setter is one effect, guarded by a key it writes when the offer shows, and no code removes that key (`removeKey` touches only metrics and overrides). It stayed gone at 1440, 900 and 390 through persona switch, Reset demo, reload, a new tab, the client-side back link, history, and a Send. Blocked, null, throwing and silently dropping storage: no offer, the tour still starts, no page errors. One thing D-049 understates: most private windows allow storage for the session, so `canPersist()` is true and each new private window offers again. That can't be detected, and it may be what the review saw.
- **Expected results.** Each change is forced by the rule. The replay shows `fee_refund:ALLOW/SUPPORTED` beside `reversal_window:CAUTION/TOPIC_GAP` on `fee-correct` and `fee-unknown-rail`. `feeRefund.test.ts` keeps the claim-level assertions and the old headline under `noCustomerMessage`, and adds the top-level result, so nothing is weakened. H10, H12, H13 are the only held-out cases changed since 40878c8, each marked `expectChanged`.
- **H20–H22.** Identical at 40878c8 and HEAD. My own overlap against prompts, schemas, golden, presets, variants, templates and topic files: none.
- **Published numbers.** README matches the reports: golden 75/75, 105/105, 170/180, PASS; clean 46/48, fee 10/12, vague 9/9, quotes 98/98; exposed 16/18, 36/36; earlier-prompt rows match `main`'s report. The H11 claim is right: 3/3 on `main`; here ✓ then 2 × `CAUTION/UNSUPPORTED`.
- **The 41% line** matches the source page: "We asked 143 founders, operators, and engineers", "76% had an AI tool surface a stale doc and produce a wrong answer", "Among them", "41% said that the wrong info has reached a customer". No team-size claim about Slite anywhere in the repo. README grew from 362 to 396 lines. P1-2 and item 1e are in.

## VERDICT: CHANGES_REQUIRED
