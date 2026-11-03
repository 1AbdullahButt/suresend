# Held-out eval results

19 clean held-out cases (`evals/heldout.json`), run with prompt `2026-11-02.6`. Each runs 3× per provider, live. Report only: no gate, not used for the provider selection, never recorded into `data/ai-cache`. Failures are reported as they are.

- **The timeline cases** (H1–H4, H6–H10) were written after the prompts were frozen at `2026-10-30.2`: reworded drafts, a reworded SOP on both rails, a reworded Slack proposal, a hedge, an unknown rail, an injection inside the draft and a no-claim reply. They were in the repo, with published results, while the fee prompts were written, and they already passed on earlier prompts. H1 reuses phrases that older prompt already had, so it's easier than it looks.
- **H12** (the fee) was written before any fee prompt text existed. It shares no three-word phrase with the prompts, schema, golden set or presets.
- **H17–H19** (the fee) were written after the prompts were frozen at `2026-11-02.4`, and share no three-word phrase with those files: two claims after a doc edit, a hedge, and an amount outside coverage.
- **H20–H22** (vague replies) were written and committed before any prompt work on valueless claims, and share no three-word phrase with those files (D-045). They're scored against the expected reason, so a reply the AI misses but rule D0e catches is still Double-check, and still counts as a miss here.
- **H23–H25** (a fee taken off the money) were written and committed before the prompt said that means not refunded (e00cd5d), and share no three-word phrase with those files.
- **H10, H12 and H13** changed their expected result when rule D0e arrived (D-045): each is a reply that leaves the customer's question open, so each is now Double-check. The rule changed, not the case.

The seven fee cases are the real evidence for the second topic, and the three vague cases for valueless claims; a line below scores each group on its own.

6 exposed cases (H5, H11, H13, H14, H15, H16) no longer count as held-out and are reported separately as regression cases. Their wording reached the prompts or the golden set, or came from them, even where it was later removed (D-041).

Sessions on earlier prompts are in commits 1db5346, 5a0b026 and 9d13a70. H18 and H14 have flipped between sessions on one prompt: treat them as unstable, not as fixed (D-041).

## groq · `openai/gpt-oss-120b`

- Runs per case: 3 · started: 2026-11-02T18:43:56.645Z · finished: 2026-11-02T19:13:12.658Z · throttled

**Clean held-out cases (19)**

- Decision accuracy: **98.2%** (56/57)
- Fee cases only: **95.2%** (20/21)
- Vague replies only: **100.0%** (9/9)
- Quote validity: **100.0%** (130/130 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **95.4%** (103/108)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H1-working-days | Reworded draft; "working days" means business days | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H2-hedged | Hedged wording that contradicts the governing value | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H3-number-word | Correct value written as a word | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H4-unknown-rail | Reworded draft on the unknown-rail ticket | ESCALATE / SCOPE_UNKNOWN | ✓ · ✓ · ✓ | 3/3 |
| H6-sop-reworded-standard | SOP rewritten in different words (number word, reworded negation), standard rail | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H7-sop-reworded-instant | Same reworded SOP, instant rail: the exception still supersedes it | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H8-slack-reworded | A different Slack proposal (2 business days) signals a change against a correct reply | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| H9-injection-in-draft | The draft itself tries to instruct the checker | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H10-no-claim | A follow-up promise with no value | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H12-fee-comes-back | Fee refunded, reworded ("comes back together with the transfer amount"), standard rail | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H17-fee-scoped-two-claims | Two claims after a verified edit to the instant-rail exception: the timeline is right, the fee is wrong on this rail | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H18-fee-hedged-no | Hedged "not refunded", worded without the hedge list: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✗ HOLD/CONTRADICTS_GOVERNING | 2/3 |
| H19-fee-plus-weekly-cap | Fee refunded (right) plus a weekly cap amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H20-vague-mid-month | A timeline with no number, standard rail: Double-check, with the docs' value | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H21-vague-before-long | A timeline with no number, instant rail: the docs' value is the exception's | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H22-vague-paperwork-charge | Two claims with no value: timing tied to paperwork, and a fee 'sorted out separately' | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H23-fee-cost-taken-off | The timeline is right; the fee is taken off the money, in other words, so it isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H24-fee-we-deduct | The timeline is right; the amount is reduced by what the send cost, so the fee isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H25-fee-short-of-charge | The timeline is right; what lands is short of a charge, so the fee isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |

**Exposed cases (6): regression only, not held-out**

- Decision accuracy: **94.4%** (17/18)
- Quote validity: **100.0%** (40/40 extracted quotes/spans verbatim; 0 rejected)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H11-fee-charge-stays | Two claims: the timeline is right, the fee is wrong ("the transfer charge stays with us" = not refunded) | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H13-fee-unknown-rail | Fee refunded on the unknown-rail ticket: the fee rule covers all rails, so the rail doesn't matter | CAUTION / TOPIC_GAP | ✗ CAUTION/UNSUPPORTED · ✓ · ✓ | 2/3 |
| H14-fee-hedged-no | Hedged "not refunded" contradicts the policy: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H15-fee-plus-limit | Fee refunded (right) plus a daily limit amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H16-fee-scoped-instant | A verified edit to the instant-rail exception keeps the fee for instant transfers, so "refunded" is wrong on the instant rail | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |

Field misses:
- DOC-101/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed other statusWording: want "unstated" got "in_force"

## gemini · `gemini-3.5-flash-lite`

- Runs per case: 3 · started: 2026-11-03T08:15:59.156Z · finished: 2026-11-03T08:26:39.044Z · throttled

**Clean held-out cases (19)**

- Decision accuracy: **87.7%** (50/57)
- Fee cases only: **100.0%** (21/21)
- Vague replies only: **22.2%** (2/9)
- Quote validity: **100.0%** (119/119 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **100.0%** (108/108)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H1-working-days | Reworded draft; "working days" means business days | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H2-hedged | Hedged wording that contradicts the governing value | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H3-number-word | Correct value written as a word | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H4-unknown-rail | Reworded draft on the unknown-rail ticket | ESCALATE / SCOPE_UNKNOWN | ✓ · ✓ · ✓ | 3/3 |
| H6-sop-reworded-standard | SOP rewritten in different words (number word, reworded negation), standard rail | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H7-sop-reworded-instant | Same reworded SOP, instant rail: the exception still supersedes it | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H8-slack-reworded | A different Slack proposal (2 business days) signals a change against a correct reply | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| H9-injection-in-draft | The draft itself tries to instruct the checker | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H10-no-claim | A follow-up promise with no value | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H12-fee-comes-back | Fee refunded, reworded ("comes back together with the transfer amount"), standard rail | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H17-fee-scoped-two-claims | Two claims after a verified edit to the instant-rail exception: the timeline is right, the fee is wrong on this rail | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H18-fee-hedged-no | Hedged "not refunded", worded without the hedge list: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H19-fee-plus-weekly-cap | Fee refunded (right) plus a weekly cap amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H20-vague-mid-month | A timeline with no number, standard rail: Double-check, with the docs' value | CAUTION / UNSUPPORTED | ✓ · ✓ · ✗ CAUTION/TOPIC_GAP | 2/3 |
| H21-vague-before-long | A timeline with no number, instant rail: the docs' value is the exception's | CAUTION / UNSUPPORTED | ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP | 0/3 |
| H22-vague-paperwork-charge | Two claims with no value: timing tied to paperwork, and a fee 'sorted out separately' | CAUTION / UNSUPPORTED | ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP | 0/3 |
| H23-fee-cost-taken-off | The timeline is right; the fee is taken off the money, in other words, so it isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H24-fee-we-deduct | The timeline is right; the amount is reduced by what the send cost, so the fee isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H25-fee-short-of-charge | The timeline is right; what lands is short of a charge, so the fee isn't refunded | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |

**Exposed cases (6): regression only, not held-out**

- Decision accuracy: **100.0%** (18/18)
- Quote validity: **100.0%** (39/39 extracted quotes/spans verbatim; 0 rejected)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H11-fee-charge-stays | Two claims: the timeline is right, the fee is wrong ("the transfer charge stays with us" = not refunded) | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H13-fee-unknown-rail | Fee refunded on the unknown-rail ticket: the fee rule covers all rails, so the rail doesn't matter | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H14-fee-hedged-no | Hedged "not refunded" contradicts the policy: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H15-fee-plus-limit | Fee refunded (right) plus a daily limit amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H16-fee-scoped-instant | A verified edit to the instant-rail exception keeps the fee for instant transfers, so "refunded" is wrong on the instant rail | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |

