# QA findings · Phase 12, second round, final confirmation · 2026-11-03T20:54:09Z

Branch `phase-12b`, HEAD 7d6d801. Reviewed `git diff 9b15dee..phase-12b`, ignoring `design/audit`. No live AI: `AI_MODE=saved` or hand-written readings. No env values printed. No source or test file edited. `docs/VIDEO_SCRIPT.md` not opened. No locked file touched. Not merged, pushed or deployed. No server left running (no listener on 3000, 3100 or 3101). One thing outside the scratch folder: running the app rewrote `.next`, which is gitignored. Run `pnpm build` before any local `pnpm start`. Scripts, output and screenshots: `C:\Users\avata\AppData\Local\Temp\claude\D--Project-slite\607cb1d3-d036-40a6-a4f5-f5b7e826e10a\scratchpad\p12c\`.

## Commands run
- `git worktree list` → `D:/Project/slite 7d6d801 [phase-12b]`, the only entry
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0, `--max-warnings 0`
- `pnpm test` → exit 0, `Test Files 34 passed (34)`, `Tests 484 passed (484)`
- `pnpm exec vitest run lib/engine/topicAgnostic.test.ts lib/check/droppedClaim.test.ts` → exit 0, 37 passed. All 11 in `topicAgnostic.test.ts` passed, and so did the two new tests
- `pnpm tsx scripts/snapshot-results.ts <scratch>/snapshot-qa.json --compare evals/snapshots/phase12b-after.json` → exit 0, `132 results (0 not on saved responses)`, `132 identical, 0 different, 0 missing`. My file is byte-identical to the committed snapshot
- `git diff 9b15dee..phase-12b -- lib/ai` → 0 lines
- `git diff 9b15dee..phase-12b --stat -- SPEC.md IMPLEMENTATION_BRIEF.md tests data/seed .loop/locked e2e .claude evals` → empty
- `pnpm build` → exit 0
- `q.mts`, `q2.mts`: the real `runCheck`, `decide`, `checkReply` and copy functions on hand-written readings → exit 0
- `ui.mts` against `AI_MODE=saved next start`, 1440, 1024, 390 → exit 0. Browser requests to an AI provider: 0. Lukas's preset is real, `ai.mode` saved. The other 7 results come from the real `runCheck` on hand-written readings, replayed through a mocked `/api/send`, because no saved path drops a claim
- `ui.mts` against `AI_MODE=saved next dev`, the one case with a repeated doc, 3 widths → exit 0, React's duplicate-key error at each width

## Findings

**No blocker. No major.** Three new minors, none of which changes a verdict or lets a reply through. All three are small enough to fix before the freeze, but none has to be.

- [severity: minor] `README.md:246` · expected the test count to match · actual "482 passed", while `pnpm test` gives 484, since this diff adds two tests · §15. One number to change.

- [severity: minor] `lib/client/outcome.ts:376`, `lib/engine/decide.ts:376`, `DECISIONS.md:1082` · **The guard works on the card, MCP and the trace, but Why still names a value, and calls it "Disagrees".** Expected, per D-060's new sentence: "A claim outside the topics names no value from the docs at all". Actual: `governing` is null, but the entry keeps the doc's `other` claim as evidence. The "Not verified" card in Why reads "Outgoing Transfers: Reversal SOP | 24 hours, all transfers | Disagrees" (seen in the DOM at all three widths). That also hides `noDocs`, "SureSend didn't compare this part with your docs", which is the true statement. The rules never compared them. Repro: `droppedOther` in `make-results.mts`, and R1 and R2 in `q.out`. It needs a doc edit or DOC-104 unflagged, plus a live miscopy. On the seed as it stands DOC-104 is flagged, so Why lists it only as "flagged outdated", names no value and shows `noDocs` (`q2.out`). The verdict stays Double-check. Either skip these rows in Why, or leave this entry's evidence empty, or soften D-060's "at all". · D-046, D-060

- [severity: minor] `lib/client/outcome.ts:394`, `components/agent/WhyView.tsx:72`, `WhyView.tsx:76` · **A partly read doc can repeat a React key, and the count under Why says "sources".** Before this diff `seen` kept `didntCount` to one line per doc. Now a doc already listed there gets a second line with the same `id`. Repro: a standard ticket with DOC-103's fee claim lost, P-c in `q.out`, and the Slack note losing a claim, P-d. `next dev` logs "Encountered two children with the same key" at each width. The production build shows both lines, and the list doesn't reorder, so nothing visibly breaks. The copy: "2 sources didn't count" for one doc, and "1 source didn't count" under the doc marked Applies (`partialGoverning-why-1440.png`). "DOC-103" appears nowhere else on that screen, which names the doc by title, so a reader can't tell it's the same doc. It's collapsed until opened. Using the title in the line and `` `${d.id}-${i}` `` as the key would close most of this. · D-060

### 1. `CheckView.tsx`: yes, it looks right
| Width | Card width | "Not answered: Nothing on the reversal timeline" | "Not verified: Part of this reply" |
|---|---|---|---|
| 1440 | 336 | 2 lines | 2 lines ("reply" alone on the second) |
| 1024 | 376 | 2 lines | 1 line |
| 390 | 358 | 2 lines | 1 line |

No overlap with the tag, nothing past its row, no overflow on the card, page scroll 0, on every result at every width. Saved mode, Lukas, "Only the fee (any transfer type)": "Your transfer fee…" Good to send, then "Not answered: Nothing on the reversal timeline" Double-check. The Hold at 390 now explains its second line ("Not verified: Part of this reply", Double-check). Tags keep dot plus label, the outcome tag keeps icon plus label. Disclaimer on the card and Why at every width. Axe: no serious or critical. Focus lands on the back button in Why. Why's card titles read the same as these lines.

### 2. `feeRefund.ts`: yes, on all three paths
- Dropped fee: "…didn't check that part. Your docs say the transfer fee is refunded. Check it by hand."; in doubt: "…is refunded, but that doc is in doubt. Check it by hand."
- Vague fee: "Your docs say the transfer fee is refunded; your reply doesn't say it plainly."; in doubt: "…is refunded, but that doc is in doubt; your reply doesn't say it plainly."
- Fee left open: "Your reply doesn't answer their question about the fee. Your docs say the transfer fee is refunded."; in doubt: "…is refunded, but that doc is in doubt."; docs say no: "…the transfer fee is not refunded."
- `stated` is read in one place, `docsSayWords`, and those are its three callers. MCP's `reason` is this sentence. No "it's refunded" is left outside DECISIONS.md's history line. No seed ticket asks about the fee, so that gap reading calls `decide` directly with a custom message, as `phase12Copy.test.ts` does.

### 3. `decide.ts`: true on the card, MCP and trace; not in Why (minor above). I agree no decision can change
No rule reads an entry's `governing`: in `decide.ts` it's read only for the headline's words (`decide.ts:635`). A suggestion takes only covered topics (`runCheck.ts:247`), so the guard can't reach it, and the trace line's words are the only other thing it changes. MCP on the same reading: `governing: null`, `docs_say: null`, `says: "Part of this reply"`, `in_reply: false`, `topic: "outside coverage"`. A dropped covered topic keeps its value (R3). `topicAgnostic.test.ts` passes.

### 4. `runCheck.ts`: yes, it loses to the template, and only those words can be refused
| Rewrite | Origin | Recheck |
|---|---|---|
| Control: same reread, "This says 1 business day, and…" | ai | ALLOW |
| "Part of this reply says…", "As part of this reply…", "PART OF THIS REPLY…" | template | ALLOW |
| Nothing dropped, "As part of this reply I can confirm… 1 business day" | template | ALLOW |
| Nothing dropped, the same without those words | ai | ALLOW |
| The agent's own draft has the words and the rewrite keeps them | template | ALLOW |

The control shows the placeholder is the only thing refusing. The check doesn't ask whether a claim was dropped, so a legitimate reply with those words does lose its rewrite, but the template still gives a correct, rechecked reply. Not worth changing. It only matches exact words: "Part of  this reply" with two spaces came back as `ai`. I wouldn't fix that either.

### 5. `outcome.ts`: the line is now there, and the two listings don't contradict each other
"Applies" with the quote says what the doc did say, and "Part of DOC-103 couldn't be read." says what it lost. The confusing parts are the count and the ID (minor above), not the repetition. Seen on the card's Why in `partialGoverning-why-1440.png`; same text at 1024 and 390, and on a Hold.

### 6. DECISIONS.md and README.md: true, except one sentence
- D-055's fee wording: true.
- D-060: `says` and `in_reply`, true. The echo, true. The new copy, true word for word. The detector exception, true: a miscopied timeline with a detector hit gives `EXTRACTION_GAP` with no value, suggested "The transfer fee is refunded.", note "it doesn't answer what the customer asked". Cap per doc rather than per topic, true (P-a). Cached with no expiry, true: only a 500-entry limit in `lib/ai/cache.ts`.
- D-060, "names no value from the docs at all": not true in Why (minor above).
- D-060, "No real model has yet been given the placeholder": true of what I can see. The golden and held-out reports both have `quoteRejections: 0`, and the phrase is nowhere in `data/` or `evals/`. I can't see unrecorded probes.
- README:267, "with only the doc owners' names different in what the AI read": true. `git diff 5762c33..9b15dee` over `lib/ai`, `lib/topics`, `data/seed`, `evals/golden.json`: two doc lines and three owner fields, all names.

### The freeze: I agree, with one correction
Prompts stand: `lib/ai` has no diff, the topic's `prompt` block is untouched, `stated` isn't read by the prompts, and `heldoutIntegrity.test.ts` passes. **The correction:** the scorer doesn't only read the decision. A case passes on decision, reason and `suggestionIncludes` (`scripts/eval.ts:353-354`), so the placeholder check does touch something scored, the suggestion's text. It still can't move a published number: no session rejected a quote, so no rewrite was given the placeholder; no draft in the sets has the words; and if a rewrite did, the template states every value it would need. The `governing` guard isn't read by the scorer at all. So Groq's published evals still describe this code.

### What's left open from the previous pass
The 9 minors recorded at 9b15dee, as they stand now.

| # | Finding | Status |
|---|---|---|
| 1 | "Not verified" isn't on the card | **Fixed** |
| 2 | "Your docs say it's refunded" | **Fixed** on the card and MCP's `reason`. **Open:** the engine's headline and trace still say "The policy says refunded (…)", "The docs say refunded (DOC-101)". MCP's `headline` returns the first. The sentence is about the fee there only by context |
| 3 | A dropped `other` claim names an unrelated value | **Fixed** on the card, MCP and trace. **Open** in Why (new minor above) |
| 4 | Several dropped topics read badly | **Partly.** "one part" is gone. **Open:** three identical lines "Not verified: Part of this reply", three identical Why titles, MCP's `says` repeats though `topic` differs, only the first topic's value is named, and the trace quotes the pseudo-span ("Claim 1 of 3: “Part of this reply”") as if they were the reply's words. It takes three miscopies in one reply. `lib/client/outcome.ts`, `lib/engine/decide.ts` |
| 5 | "A Hold's suggested reply states that topic's value too" | **Fixed** in D-060's words. **Open, by design:** the behaviour is the same, a weak suggestion with an honest tag. So is the older quirk of a gap line reading “within” (`decide.ts:322`) |
| 6 | Why can omit "Part of DOC-103" | **Fixed.** New nits above |
| 7 | The AI rewrite with a pseudo-span has never run on a real model | Edge (1), the echo, **fixed**. **Open:** (2) the AI can't be told which words were wrong, so it can keep them: "by Monday" beside the right value passes if the reread misses it too, which takes two misses. (3) An invented claim adds a sentence: a reply with no fee in it and a hallucinated span gets "The transfer fee is refunded." True per the docs and rechecked, but the agent never raised it. D-060 now says no real model has run this; I'm not allowed to test it live |
| 8 | README's 73/75 → 75/75 leaves out what else changed | **Fixed** for that sentence. **Open:** the same clause would fit the 69 → 67 row (`README.md:284`). `README.md:332`'s "read as a timeline with no value" for H13 is an inference: `CAUTION/UNSUPPORTED` would also fit a fee read with no value, and the held-out report doesn't keep the words |
| 9 | Old names outside what the app shows: `design/mockup-*.html`, `design/v2/Docs.dc.html:38`, `lib/check/phase12Copy.test.ts:114` | **Open.** Not served, but the repo is public, and D-061 doesn't list them. Nothing to do unless Abdullah wants the repo clean too |

Also still open from that pass:
- **The docs' side of the cap is Abdullah's call.** It goes past his copy, which was about the reply. D-060 flags that and says how to take it out. D-060 now also states the live cost: the cap isn't per topic, and a cached live reading keeps that doc's Double-check until it's edited, evicted or the instance restarts. No saved path triggers it.
- **The hand-off should say** moving `.loop/locked` aside for the rename (D-061) was inferred from his instruction, not stated by him. It's recorded and re-locked.

## VERDICT: APPROVED
