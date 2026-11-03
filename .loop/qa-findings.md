# QA findings · Phase 12, second round · 2026-11-03T20:24:04Z

Branch `phase-12b`, HEAD 9b15dee. Reviewed `git diff main..phase-12b`, not the whole phase. No live AI: `AI_MODE=saved` or hand-written readings. No env values printed. No source or test file edited. `docs/VIDEO_SCRIPT.md` not opened. Locked files not changed: the only attempt was the `touch` you asked for, and the hook refused it. My server is stopped (no listener on 3100 or 3000). `git status --short` is empty. Scripts, logs and screenshots: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\p12b\`.

## Commands run
- `git worktree list` → `D:/Project/slite 9b15dee [phase-12b]`, the only entry
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0, `--max-warnings 0`
- `pnpm build` → exit 0, 11 static pages generated
- `pnpm test` → exit 0, `Test Files 34 passed (34)`, `Tests 482 passed (482)`
- `pnpm e2e` → exit 0, `1 passed (41.4s)`, wrong draft → held → Use this reply → sent → Demo menu shows 1 stopped
- `SLIDE_OVER_SHOT=<scratch> pnpm exec tsx scripts/slide-over-check.ts --serve` → exit 0, 51 PASS, 0 FAIL, `all passed`
- `pnpm mcp:e2e` against `AI_MODE=saved pnpm start -p 3100` → exit 0, 19 PASS, 0 FAIL, `ALL PASS`, DOC-105 refused
- `pnpm exec tsx scripts/snapshot-results.ts <scratch>/snapshot-qa.json --compare evals/snapshots/phase12-after.json` → exit 0, `132 results (0 not on saved responses)`, `132 identical, 0 different, 0 missing`. My file is byte-identical to the committed `evals/snapshots/phase12b-after.json`
- `tsx scripts/ui-audit.ts http://127.0.0.1:3100`, from a scratch folder so `design/audit` wasn't rewritten → exit 0, `Serious/critical axe violations: 0. Horizontal page scroll: none. States that failed to reach: none.`
- `pnpm hooks:selftest` → exit 0, `ALL PASS`
- `touch SPEC.md`, then `touch data/seed/sources.json tests/helpers/fixtures.ts` → both refused: `BLOCKED by protect-locked: "touch" on "spec.md" is locked`, and the same for `tests/`, `data/seed/`. Not gone around
- `git diff main --stat -- .loop/locked IMPLEMENTATION_BRIEF.md tests/engine tests/ai e2e .claude` → empty
- `git diff main -- lib/ai/prompts.ts lib/ai/schemas.ts` → 0 lines. `lib/ai` and `lib/topics` have no diff at all
- `git log --all -- docs/VIDEO_SCRIPT.md` → empty. `git check-ignore` → `.gitignore:16`
- My harnesses, real `runCheck`, `handleSend`, `handleFix`, `checkReply`, `proposeDocFix` and the copy functions on hand-written readings: `cap.mts`, `hold.mts`, `docs.mts`, `fix.mts`, `last.mts`, 71 cases. All exit 0, output in `*.out` beside them
- My Playwright scripts, `ui.mts`, `ui2.mts` and `names.mts`: the real saved-mode server with `/api/send` mocked by hand-built results, 4 results × 1440, 1024, 390. All exit 0. Browser requests to an AI provider: 0. Axe on each mocked card: no serious or critical
- `numbers.mts`: counts the published numbers from the raw report rows

## Findings

**No blocker. No major. I couldn't get a wrong reply to Good to send through the cap.** All minors below fail in the safe direction: none changes a verdict or lets a reply through.

- [severity: minor] `components/agent/CheckView.tsx:192`, `DECISIONS.md:1082` · **"Not verified" isn't on the card.** Expected, per D-060: "the card's line reads 'Not verified: Part of this reply'". Actual: the card renders only `l.says`, so it reads "Part of this reply · Double-check". The label shows in Why only. On a Double-check the headline explains it. On a Hold nothing does. Repro: `shots/hold-card-390.png`, "You can relax, the funds return on their own by Monday, less the small charge for the transfer", with the timeline span miscopied. Fix the card or D-060's sentence. · D-060

- [severity: minor] `lib/client/outcome.ts:233`, `lib/topics/feeRefund.ts:16` · **"Your docs say it's refunded" has nothing for "it" to refer to.** `stated` was written for a sentence that has already named the fee (D-055's "their question about the fee"). Here nothing has, and the reply is about the money coming back, so "it" reads as the money. This is the one hint on the card about what to check by hand. Repro: QA's repro, `shots/cap-card-1440.png`. The engine's headline has the same gap: "The policy says refunded". D-060 and `droppedClaim.test.ts:93` pin this exact wording, so a fix changes both. · D-060

- [severity: minor] `lib/engine/decide.ts:166`, `decide.ts:367` · **A dropped `other` claim names an unrelated docs value.** `other` isn't a topic (`lib/topics/index.ts`), but `docsSay("other")` treats it as one. Repro: `last.mts` R1, DOC-104 unflagged in Doc settings and "Your daily limit is 5,001 EUR" as the miscopied span: "Your docs say 24 hours, but that doc is in doubt", and Why's "Your docs agree on this". With DOC-101 holding an `other` claim, MCP also returns `governing: {doc_id: "DOC-101", value: "24 hours"}`. Not reachable on the seed as it stands: the only `other` claim with a value in the saved readings is DOC-104's, which is excluded while flagged. It takes a doc edit or an unflag, plus a live miscopy. The verdict stays Double-check. One-line fix: name a value only for a covered topic. · D-046, D-060

- [severity: minor] `lib/client/outcome.ts:234`, `outcome.ts:313`, `decide.ts:365` · **Several dropped topics read badly.** The sentence says "one part", beside three identical lines "Part of this reply · Double-check", and names only the first topic's value. Repro: `cap.mts` 1b, `shots/three-card-1024.png`. Why has three identical card titles, and MCP's `says` repeats, though its `topic` tells them apart. The trace quotes the pseudo-span ("Claim 2 of 2: “Part of this reply”"), as if those were the reply's words. It takes three miscopies in one reply. · D-060

- [severity: minor] `lib/engine/decide.ts:166`, `DECISIONS.md:1084` · **"A Hold's suggested reply states that topic's value too" isn't true when the detector also hits that topic.** The entry is left out for D0b's, which has no governing value. Repro: `hold.mts` C2, "Failed transfers are reversed within 4 business days, less the small charge for the transfer", timeline span miscopied: suggested "The transfer fee is refunded.", amber "Double-check: it doesn't answer what the customer asked". That's the miss the README describes, on a digit timeline rather than "by Monday". The tag is honest, so this is a weak suggestion, not a wrong one. README line 267 says "that miss shouldn't recur" about `vague-monday-less-charge`, which holds (no detector hit). D-060's sentence is the broader one. The same path shows the older quirk of a gap line reading “within” (`decide.ts:322`, not in this diff). · D-060

- [severity: minor] `lib/client/outcome.ts:393` · **Why can omit "Part of DOC-103 couldn't be read".** A cap's line is skipped when that doc is already listed as evidence. An unread doc never was, so a partial doc is the first case this can happen. Repro: `docs.mts` P11, the fee claim lost and a right timeline reply: the card says it, Why doesn't, and "So" says only "The rules can't confirm it". Everywhere else the wording is right: card, trace (fired and pass rows), Raw JSON, MCP (headline, reason, rules), recheck note ("part of Instant Transfers: Reversal Exception couldn't be read"). The trace names docs by short title or ID depending on what's in the evidence ("Part of Reversal SOP and Part of DOC-103", P9), as it already did for unread docs. · D-060

- [severity: minor] `lib/check/runCheck.ts:242`, `runCheck.ts:306`, `lib/ai/prompts.ts:112` · **The AI rewrite with a pseudo-span is sound where tested, but has never run on a real model.** The fall-through is right: rewrite omits the value (B2), rereads with a miscopy (B3), adds a wrong value (B4), throws (B5, B8), empty (B6): all give the template, recheck ALLOW. Three edges remain. (1) No guard against the words echoing: B7 "Part of this reply: your money is back…" comes back as origin `ai`, ALLOW. (2) The AI can't be told which words were wrong, so it can keep them: B9 keeps "by Monday" beside the right value and passes if the reread misses it too, which needs two misses. (3) An invented claim adds a sentence: R2, a reply with no fee in it and a hallucinated span gets "The transfer fee is refunded." in its suggested reply. That's true per the docs and rechecked, but the agent never raised it. Marking a dropped claim WRONG does no harm when it was right: the value given is the docs' own. No session in PROGRESS exercised this path live ("this session had no dropped claim"), and I'm not allowed to. · §6.7, D-060

- [severity: minor] `README.md:267` · **The 73/75 → 75/75 sentence leaves out what else changed.** "With no prompt change" is true, but the seed docs' owner names changed between those sessions, and held-out H6–H8 with them. The README's own Limitations says a name can move the AI's reading ("Léa"). I don't think it explains the gain, but one clause would close it. The same goes for the 69 → 67 row. Line 332's "read as a timeline with no value" for H13 is an inference: `CAUTION/UNSUPPORTED` would also fit a fee read with no value, and the held-out report doesn't keep the words (golden's does). · §15

- [severity: minor] `design/mockup-*.html`, `design/v2/Docs.dc.html:38`, `lib/check/phase12Copy.test.ts:114` · **Old names remain outside what the app shows.** These are mockups and a test fixture: not served, but the repo is public. D-061 discloses SPEC's §4, §7 and Appendix B, not these. Nothing to do unless Abdullah wants the repo clean too. · D-061

### 1. The cap, D-060
Everything here is from the harnesses.

| Tried | Result |
|---|---|
| QA's repro | CAUTION / CLAIM_UNVERIFIED. With the right span, HOLD |
| Two dropped on one topic; on several; beside a valid one on the same topic | CAUTION, one entry per topic |
| Wrong "9 weeks" dropped beside a right timeline | CAUTION, not Good to send |
| Dropped `other` with a null value, beside a right reply | CAUTION. Conservative: the rules ignore that claim when it's kept. It's what "any claim" says |
| Every claim dropped | AI_UNAVAILABLE, 503 |
| Only `other` null claims plus a dropped one | CAUTION, not D0d's Allow, with a topic gap beside it |
| Unknown type, kept 4 days plus dropped fee | ESCALATE stands; holding reply states the fee, recheck ALLOW |
| Unknown type, kept fee plus dropped timeline | CAUTION, no value named |
| MCP with no `ticket_id` | CAUTION, `in_reply: false`, no AI words |
| Ask-first reply alone, or plus a kept fee, with the inside claim verbatim | Set aside as before: ALLOW |
| The same with the inside claim miscopied | CAUTION, or Couldn't check when nothing is left. A miscopy isn't "inside", so this follows the rule |
| Ask-first plus a wrong fee that's miscopied | Couldn't check or Double-check, never Allow |
| Ops persona | Same results; DOC-105's own lost claim caps ops only |

- **No path to Allow.** `unverified` can only be empty with a dropped claim when that topic is flagged, and then D0b gives CAUTION. `rejectedCount` always equals `dropped.length` in `runCheck`. The engine's `dropped: []` with a count above 0 isn't reachable from it.
- **Send:** 428 without the OK, 200 with it. Hold with a dropped timeline 409, every claim dropped 503. In the UI, Send anyway stays disabled until ticked, works by keyboard, and the sent card says "Sent with your OK."
- **Metrics:** checked 1, stopped 0, flagged 1 with its headline; a Hold counts as stopped 1. Every claim dropped counts nothing. "Review flagged replies (1)" lists it.
- **Stale,** by the human path at all three widths: note shown, OK and Send anyway hidden, back when the text is restored. (While the panel is open at 1024 or 390 the composer is `inert`, by design.)
- **Rule 4.** No AI words from a dropped claim in the card, Why, trace, MCP (`checkReplyText` too) or the suggested reply. Raw JSON test: outside `rejectedExtractions`, none. The AI's `topic` is used, as D-060 says. I agree with keeping the snippet in `rejectedExtractions`: SPEC.md line 134 requires it, it shows only in Raw JSON, labelled as rejected, and MCP's `present` doesn't return it.
- **Fix the doc.** `findFixSource` isn't confused: the entry is CAUTION, so it's never the lead. Hold on the timeline with a dropped fee gets the proposal; Hold on the fee with a dropped timeline gets none; a capped Double-check gets none. `propose_doc_fix` the same, `applied: false`.
- **UI at 1440, 1024, 390.** No layout break, no horizontal scroll. Status is icon or dot plus label. Disclaimer on every screen I checked, including Why and Trace. Focus goes to the back button on Why (measured at each width) and Trace (from the code, `TraceView.tsx`). The "Show all 19 steps" toggle works. The D0a row reads "Failed. …" with its Details.

### 2. The docs' side
**My judgement: it goes past Abdullah's copy, it's flagged honestly, and it does no harm on the demo's paths. It's his call, and it doesn't block.**
- **Honest:** D-060 says "my reading of any claim", and says how to take it out. That description matches the code: the `dropped` count and the `partial` flag.
- **Normal paths:** every saved reading is verbatim (16 doc quotes, 38 reply spans, 0 not verbatim), so it can't trigger in saved mode, and 132 of 132 are identical. Holds stand (`docs.mts` P3, P4, P10), and the cap only ever touches an ALLOW (`decide.ts:264`), so Ask first can't move. I ran no Ask-first case with a partial doc.
- **Triggers:** flagged-outdated doc, no (P13, P14). Hidden doc, no: the support agent's reads were DOC-101, DOC-103, SRC-202, DOC-104 (9b). The persona filter still runs first (`runCheck.ts:130`). A kept claim that lost only its `supersedes` quote doesn't count as dropped (P15) and falls to D6.
- **`docsSay`:** only `dropped > 0` hides a value, so no normal path changes. A flagged doc's loss hides nothing.
- **The live cost, which D-060 understates:** the cap isn't per topic, so a lost fee claim caps a right timeline reply (P11), and a lost Slack claim caps too (P12). A live reading is cached in memory whether its quotes pass or not (`lib/ai/aiDeps.ts:168`), with no expiry (500 entries, `lib/ai/cache.ts`), so on that instance the same doc text keeps the Double-check on every reply until it's re-edited, evicted or the instance restarts. Only edited docs go live, since the seed docs always hit saved readings. Worth a line if he keeps it.

### 3. The rename, D-061
- **Lock:** the stat above is empty, the SPEC diff is 5 lines, all in Appendix A, and the hook refused real attempts.
- **D-061's diff:** 22 changed lines across SPEC, seed and helper, 0 missing from D-061's block. The tests diff is 4 lines changed, each identical once the name is masked.
- **What a visitor reads:** no old name in `/api/seed`, the Docs tab (list, owner line, each doc), Why, the trace, Raw JSON, MCP `get_doc`, `/how-it-works`, or anywhere in `.next/static` and `.next/server`. New names show: Marie Dubois, Jonas Weber, Elena, Matteo.
- **Images:** the GIF contact sheet shows no owner names, and `public/demo.gif` is identical to `docs/demo.gif`. `public/og.png` has no owner name and isn't in this diff.
- **For Abdullah to know:** moving `.loop/locked` aside was inferred from his instruction, not stated by him. His instruction can't be done any other way, and it's recorded and re-locked. Your hand-off should say so.

### 4. The published numbers
Counted from the raw report rows.
- **Golden:** 25 cases, 75/75, fields 175/180, 0 rejected, gate true.
- **Held-out clean:** 25 cases, 67/75. Fee 16/21 (H12, H17–19, H23–25). Vague 9/9. Quote counts as reported: 158/158.
- **Exposed:** 14 cases, 33/42, quotes 72/72.
- **Paraphrases:** Hold 18, Double-check 24, Good to send 0. The six that can Hold: 18 of 18. Nine readings by another reason: H31, H36, H38, 3 each. Eight clean misses and nine exposed misses, as the README lists them. Only H23's two are less strict than expected. No miss reached Good to send, and the only ALLOW readings are H3 and H6, which expect it.
- **Earlier-session rows** match `main`'s reports: 73/75, 115/117, 171/180; 69/75, 18/21, 34/42.
- **Gemini:** labelled "previous prompt" in every table, and its reports aren't in this diff. `pnpm test` 482 matches the README.
- **Freeze:** `evals/heldout.json`'s `frozen` block is unchanged (only 3 lines changed, all doc bodies) and matches the current fingerprint `0f7d0d0a…`. `heldoutIntegrity.test.ts` passes. Prompts and schemas have no diff.
- **Saved readings:** 50 files re-recorded; 43 outputs are identical to `main`'s and 7 differ in the AI's wording (spans, value text, a status word, one extra null claim). All are still verbatim, and the 132 results are identical.
- **Limitations:** the dropped-claim bullet is now right. Nothing stale beyond the README finding above.

## VERDICT: APPROVED
