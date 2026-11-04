# Held-out eval results

25 clean held-out cases (`evals/heldout.json`), run with prompt `2026-11-03.2`. Each runs 3× per provider, live. Report only: no gate, not used for the provider selection, never recorded into `data/ai-cache`. Failures are reported as they are.

- **The timeline cases** (H1–H4, H6–H10) were written after the prompts were frozen at `2026-10-30.2`: reworded drafts, a reworded SOP on both transfer types, a reworded Slack proposal, a hedge, an unknown transfer type, an injection inside the draft and a no-claim reply. They were in the repo, with published results, while the fee prompts were written, and they already passed on earlier prompts. H1 reuses phrases that older prompt already had, so it's easier than it looks.
- **H12** (the fee) was written before any fee prompt text existed. It shares no three-word phrase with the prompts, schema, golden set or presets.
- **H17–H19** (the fee) were written after the prompts were frozen at `2026-11-02.4`, and share no three-word phrase with those files: two claims after a doc edit, a hedge, and an amount outside coverage.
- **H20–H22** (vague replies) were written and committed before any prompt work on valueless claims, and share no three-word phrase with those files (D-045). They're scored against the expected reason, so a reply the AI misses but rule D0e catches is still Double-check, and still counts as a miss here.
- **H23–H25** (a fee taken off the money) were written and committed before the prompt said that means not refunded (e00cd5d), and share no three-word phrase with those files.
- **H26–H31** (paraphrased wrong timelines) were committed before any change for them (3ba00ad), but Abdullah's brief names their wording and the prompt's number-word rule now states it, so they're exposed. **H32–H39** were committed at the same time: other number words, other counts with no number. H36 and H37 share a three-word phrase with the detector patterns, though not with the prompt, so they're exposed too; the rest share none. H38's "several" and H39's "fortnight" are single words the detector names too: below the three-word line, and the AI never reads the detector. A line below gives the Hold rate on each group. "A few", "about a week" and other calendar units can't get a Hold by design: a count with no number has nothing to compare, and rule D8 makes a unit mismatch a Double-check.
- **H10, H12 and H13** changed their expected result when rule D0e arrived (D-045): each is a reply that leaves the customer's question open, so each is now Double-check. The rule changed, not the case.

The seven fee cases are the real evidence for the second topic, and the three vague cases for valueless claims; a line below scores each group on its own.

14 exposed cases (H5, H11, H13, H14, H15, H16, H26, H27, H28, H29, H30, H31, H36, H37) no longer count as held-out and are reported separately as regression cases. Their wording reached the prompts or the golden set, or came from them, even where it was later removed (D-041).

Sessions on earlier prompts are in commits 1db5346, 5a0b026 and 9d13a70. H18 and H14 have flipped between sessions on one prompt: treat them as unstable, not as fixed (D-041).

## groq · `openai/gpt-oss-120b`

- Runs per case: 3 · started: 2026-11-03T18:56:40.277Z · finished: 2026-11-03T19:41:32.775Z · throttled

**Clean held-out cases (25)**

- Decision accuracy: **89.3%** (67/75)
- Fee cases only: **76.2%** (16/21)
- Vague replies only: **100.0%** (9/9)
- Paraphrased wrong timelines: **Hold 12/18**, Double-check 6, Ask first 0, Good to send 0; verdict and reason as expected 15/18
- Quote validity: **100.0%** (158/158 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **95.4%** (103/108)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H1-working-days | Reworded draft; "working days" means business days | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H2-hedged | Hedged wording that contradicts the governing value | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H3-number-word | Correct value written as a word | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H4-unknown-rail | Reworded draft on the ticket with an unknown transfer type | ESCALATE / SCOPE_UNKNOWN | ✓ · ✓ · ✓ | 3/3 |
| H6-sop-reworded-standard | SOP rewritten in different words (number word, reworded negation), standard transfer | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H7-sop-reworded-instant | Same reworded SOP, instant transfer: the exception still supersedes it | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H8-slack-reworded | A different Slack proposal (2 business days) signals a change against a correct reply | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| H9-injection-in-draft | The draft itself tries to instruct the checker | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H10-no-claim | A follow-up promise with no value | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H12-fee-comes-back | Fee refunded, reworded ("comes back together with the transfer amount"), standard transfer | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H17-fee-scoped-two-claims | Two claims after a verified edit to the instant-transfer exception: the timeline is right, the fee is wrong on this type | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H18-fee-hedged-no | Hedged "not refunded", worded without the hedge list: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✗ HOLD/CONTRADICTS_GOVERNING · ✗ HOLD/CONTRADICTS_GOVERNING · ✗ HOLD/CONTRADICTS_GOVERNING | 0/3 |
| H19-fee-plus-weekly-cap | Fee refunded (right) plus a weekly cap amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H20-vague-mid-month | A timeline with no number, standard transfer: Double-check, with the docs' value | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H21-vague-before-long | A timeline with no number, instant transfer: the docs' value is the exception's | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H22-vague-paperwork-charge | Two claims with no value: timing tied to paperwork, and a fee 'sorted out separately' | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H23-fee-cost-taken-off | The timeline is right; the fee is taken off the money, in other words, so it isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED · ✓ | 1/3 |
| H24-fee-we-deduct | The timeline is right; the amount is reduced by what the send cost, so the fee isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H25-fee-short-of-charge | The timeline is right; what lands is short of a charge, so the fee isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H32-para-two-to-three-instant | A wrong range in words: 2–3 business days contradicts 1 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H33-para-three-working-instant | A wrong number in a word: 3 business days contradicts 1 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H34-para-seven-business-standard | A wrong number in a word on a standard transfer: 7 business days contradicts 4 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H35-para-one-and-two-instant | A range that only starts at the right value: 1–2 business days isn't within 1 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H38-para-several-working-instant | "Several" is a count with no number too: vague | CAUTION / UNSUPPORTED | ✗ CAUTION/EXTRACTION_GAP · ✗ CAUTION/EXTRACTION_GAP · ✗ CAUTION/EXTRACTION_GAP | 0/3 |
| H39-para-fortnight-standard | A fortnight is 14 calendar days. The units differ, so Double-check | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |

**Exposed cases (14): regression only, not held-out**

- Decision accuracy: **78.6%** (33/42)
- Paraphrased wrong timelines: **Hold 6/24**, Double-check 18, Ask first 0, Good to send 0; verdict and reason as expected 18/24
- Quote validity: **100.0%** (72/72 extracted quotes/spans verbatim; 0 rejected)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H11-fee-charge-stays | Two claims: the timeline is right, the fee is wrong ("the transfer charge stays with us" = not refunded) | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H13-fee-unknown-rail | Fee refunded on the ticket with an unknown transfer type: the fee rule covers all transfers, so the type doesn't matter | CAUTION / TOPIC_GAP | ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED | 0/3 |
| H14-fee-hedged-no | Hedged "not refunded" contradicts the policy: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H15-fee-plus-limit | Fee refunded (right) plus a daily limit amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H16-fee-scoped-instant | A verified edit to the instant-transfer exception keeps the fee for instant transfers, so "refunded" is wrong on them | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H26-para-couple-working-instant | A wrong timeline in number words: "a couple of" is 2, and 2 business days contradicts 1 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H27-para-couple-working-standard | The same wording on a standard transfer: 2 business days contradicts 4 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H28-para-few-days-instant | "A few" stays vague: no value to compare, so Double-check, with the docs' value | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H29-para-few-working-standard | "A few working days" stays vague too | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H30-para-about-week-instant | "About a week" is 7 calendar days, hedged. The units differ, so rule D8 makes it a Double-check, not a Hold | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H31-para-about-week-standard | The same on a standard transfer | CAUTION / UNIT_MISMATCH | ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED | 0/3 |
| H36-para-day-or-two-instant | "A day or two" is 1–2 calendar days. The units differ, so Double-check | CAUTION / UNIT_MISMATCH | ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED | 0/3 |
| H37-para-handful-days-standard | A count with no number, like "a few", in words the prompt never uses: vague | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |

Field misses:
- DOC-101/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed other statusWording: want "unstated" got "in_force"

## gemini · `gemini-3.5-flash-lite`

- Runs per case: 3 · started: 2026-11-04T08:43:25.321Z · finished: 2026-11-04T08:59:56.232Z · throttled

**Clean held-out cases (25)**

- Decision accuracy: **84.0%** (63/75)
- Fee cases only: **100.0%** (21/21)
- Vague replies only: **0.0%** (0/9)
- Paraphrased wrong timelines: **Hold 12/18**, Double-check 6, Ask first 0, Good to send 0; verdict and reason as expected 15/18
- Quote validity: **100.0%** (144/144 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **100.0%** (108/108)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H1-working-days | Reworded draft; "working days" means business days | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H2-hedged | Hedged wording that contradicts the governing value | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H3-number-word | Correct value written as a word | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H4-unknown-rail | Reworded draft on the ticket with an unknown transfer type | ESCALATE / SCOPE_UNKNOWN | ✓ · ✓ · ✓ | 3/3 |
| H6-sop-reworded-standard | SOP rewritten in different words (number word, reworded negation), standard transfer | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H7-sop-reworded-instant | Same reworded SOP, instant transfer: the exception still supersedes it | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H8-slack-reworded | A different Slack proposal (2 business days) signals a change against a correct reply | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| H9-injection-in-draft | The draft itself tries to instruct the checker | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H10-no-claim | A follow-up promise with no value | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H12-fee-comes-back | Fee refunded, reworded ("comes back together with the transfer amount"), standard transfer | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H17-fee-scoped-two-claims | Two claims after a verified edit to the instant-transfer exception: the timeline is right, the fee is wrong on this type | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H18-fee-hedged-no | Hedged "not refunded", worded without the hedge list: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H19-fee-plus-weekly-cap | Fee refunded (right) plus a weekly cap amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H20-vague-mid-month | A timeline with no number, standard transfer: Double-check, with the docs' value | CAUTION / UNSUPPORTED | ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP | 0/3 |
| H21-vague-before-long | A timeline with no number, instant transfer: the docs' value is the exception's | CAUTION / UNSUPPORTED | ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP | 0/3 |
| H22-vague-paperwork-charge | Two claims with no value: timing tied to paperwork, and a fee 'sorted out separately' | CAUTION / UNSUPPORTED | ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP | 0/3 |
| H23-fee-cost-taken-off | The timeline is right; the fee is taken off the money, in other words, so it isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H24-fee-we-deduct | The timeline is right; the amount is reduced by what the send cost, so the fee isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H25-fee-short-of-charge | The timeline is right; what lands is short of a charge, so the fee isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H32-para-two-to-three-instant | A wrong range in words: 2–3 business days contradicts 1 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H33-para-three-working-instant | A wrong number in a word: 3 business days contradicts 1 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H34-para-seven-business-standard | A wrong number in a word on a standard transfer: 7 business days contradicts 4 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H35-para-one-and-two-instant | A range that only starts at the right value: 1–2 business days isn't within 1 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H38-para-several-working-instant | "Several" is a count with no number too: vague | CAUTION / UNSUPPORTED | ✗ CAUTION/EXTRACTION_GAP · ✗ CAUTION/EXTRACTION_GAP · ✗ CAUTION/EXTRACTION_GAP | 0/3 |
| H39-para-fortnight-standard | A fortnight is 14 calendar days. The units differ, so Double-check | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |

**Exposed cases (14): regression only, not held-out**

- Decision accuracy: **97.6%** (41/42)
- Paraphrased wrong timelines: **Hold 6/24**, Double-check 18, Ask first 0, Good to send 0; verdict and reason as expected 24/24
- Quote validity: **98.6%** (68/69 extracted quotes/spans verbatim; 1 rejected)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H11-fee-charge-stays | Two claims: the timeline is right, the fee is wrong ("the transfer charge stays with us" = not refunded) | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H13-fee-unknown-rail | Fee refunded on the ticket with an unknown transfer type: the fee rule covers all transfers, so the type doesn't matter | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H14-fee-hedged-no | Hedged "not refunded" contradicts the policy: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✗ AI_UNAVAILABLE/EXTRACTION_FAILED · ✓ · ✓ | 2/3 |
| H15-fee-plus-limit | Fee refunded (right) plus a daily limit amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H16-fee-scoped-instant | A verified edit to the instant-transfer exception keeps the fee for instant transfers, so "refunded" is wrong on them | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H26-para-couple-working-instant | A wrong timeline in number words: "a couple of" is 2, and 2 business days contradicts 1 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H27-para-couple-working-standard | The same wording on a standard transfer: 2 business days contradicts 4 | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H28-para-few-days-instant | "A few" stays vague: no value to compare, so Double-check, with the docs' value | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H29-para-few-working-standard | "A few working days" stays vague too | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H30-para-about-week-instant | "About a week" is 7 calendar days, hedged. The units differ, so rule D8 makes it a Double-check, not a Hold | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H31-para-about-week-standard | The same on a standard transfer | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H36-para-day-or-two-instant | "A day or two" is 1–2 calendar days. The units differ, so Double-check | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H37-para-handful-days-standard | A count with no number, like "a few", in words the prompt never uses: vague | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |

What the misses said:
- H14-fee-hedged-no, run 1: rejected 1: "transfer fee can't be refunded"

