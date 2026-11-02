# Held-out eval results

16 clean held-out cases (`evals/heldout.json`), run with prompt `2026-11-02.5`. Each runs 3× per provider, live. Report only: no gate, not used for the provider selection, never recorded into `data/ai-cache`. Failures are reported as they are.

- **The timeline cases** (H1–H4, H6–H10) were written after the prompts were frozen at `2026-10-30.2`: reworded drafts, a reworded SOP on both rails, a reworded Slack proposal, a hedge, an unknown rail, an injection inside the draft and a no-claim reply. They were in the repo, with published results, while the fee prompts were written, and they already passed on earlier prompts. H1 reuses phrases that older prompt already had, so it's easier than it looks.
- **H12** (the fee) was written before any fee prompt text existed. It shares no three-word phrase with the prompts, schema, golden set or presets.
- **H17–H19** (the fee) were written after the prompts were frozen at `2026-11-02.4`, and share no three-word phrase with those files: two claims after a doc edit, a hedge, and an amount outside coverage.
- **H20–H22** (vague replies) were written and committed before any prompt work on valueless claims, and share no three-word phrase with those files (D-045). They're scored against the expected reason, so a reply the AI misses but rule D0e catches is still Double-check, and still counts as a miss here.
- **H10, H12 and H13** changed their expected result when rule D0e arrived (D-045): each is a reply that leaves the customer's question open, so each is now Double-check. The rule changed, not the case.

The four fee cases are the real evidence for the second topic, and the three vague cases for valueless claims; a line below scores each group on its own.

6 exposed cases (H5, H11, H13, H14, H15, H16) no longer count as held-out and are reported separately as regression cases. Their wording reached the prompts or the golden set, or came from them, even where it was later removed (D-041).

Sessions on earlier prompts are in commits 1db5346 and 5a0b026. H18 and H14 have flipped between sessions on one prompt: treat them as unstable, not as fixed (D-041).

## groq · `openai/gpt-oss-120b`

- Runs per case: 3 · started: 2026-11-02T15:39:23.267Z · finished: 2026-11-02T16:03:55.084Z · throttled · provider errors retried, with no answer to score: 1

**Clean held-out cases (16)**

- Decision accuracy: **97.9%** (47/48)
- Fee cases only: **91.7%** (11/12)
- Vague replies only: **100.0%** (9/9)
- Quote validity: **100.0%** (97/97 extracted quotes/spans verbatim; 0 rejected)
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
| H18-fee-hedged-no | Hedged "not refunded", worded without the hedge list: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✗ HOLD/CONTRADICTS_GOVERNING · ✓ | 2/3 |
| H19-fee-plus-weekly-cap | Fee refunded (right) plus a weekly cap amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H20-vague-mid-month | A timeline with no number, standard rail: Double-check, with the docs' value | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H21-vague-before-long | A timeline with no number, instant rail: the docs' value is the exception's | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H22-vague-paperwork-charge | Two claims with no value: timing tied to paperwork, and a fee 'sorted out separately' | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |

**Exposed cases (6): regression only, not held-out**

- Decision accuracy: **88.9%** (16/18)
- Quote validity: **100.0%** (41/41 extracted quotes/spans verbatim; 0 rejected)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H11-fee-charge-stays | Two claims: the timeline is right, the fee is wrong ("the transfer charge stays with us" = not refunded) | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H13-fee-unknown-rail | Fee refunded on the unknown-rail ticket: the fee rule covers all rails, so the rail doesn't matter | CAUTION / TOPIC_GAP | ✗ CAUTION/UNSUPPORTED · ✗ CAUTION/UNSUPPORTED · ✓ | 1/3 |
| H14-fee-hedged-no | Hedged "not refunded" contradicts the policy: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H15-fee-plus-limit | Fee refunded (right) plus a daily limit amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H16-fee-scoped-instant | A verified edit to the instant-rail exception keeps the fee for instant transfers, so "refunded" is wrong on the instant rail | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |

Field misses:
- DOC-101/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed other statusWording: want "unstated" got "in_force"

## gemini · `gemini-3.5-flash-lite`

- Runs per case: 3 · started: 2026-11-02T13:50:37.380Z · finished: 2026-11-02T14:00:12.354Z · throttled · provider errors retried, with no answer to score: 1

**Clean held-out cases (16)**

- Decision accuracy: **91.7%** (44/48)
- Fee cases only: **83.3%** (10/12)
- Vague replies only: **77.8%** (7/9)
- Quote validity: **100.0%** (91/91 extracted quotes/spans verbatim; 0 rejected)
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
| H18-fee-hedged-no | Hedged "not refunded", worded without the hedge list: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✗ HOLD/CONTRADICTS_GOVERNING · ✗ HOLD/CONTRADICTS_GOVERNING | 1/3 |
| H19-fee-plus-weekly-cap | Fee refunded (right) plus a weekly cap amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H20-vague-mid-month |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H21-vague-before-long |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H22-vague-paperwork-charge |  | CAUTION / UNSUPPORTED | ✗ CAUTION/TOPIC_GAP · ✓ · ✗ CAUTION/TOPIC_GAP | 1/3 |

**Exposed cases (6): regression only, not held-out**

- Decision accuracy: **94.4%** (17/18)
- Quote validity: **100.0%** (39/39 extracted quotes/spans verbatim; 0 rejected)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H11-fee-charge-stays | Two claims: the timeline is right, the fee is wrong ("the transfer charge stays with us" = not refunded) | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H13-fee-unknown-rail | Fee refunded on the unknown-rail ticket: the fee rule covers all rails, so the rail doesn't matter | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| H14-fee-hedged-no | Hedged "not refunded" contradicts the policy: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✗ CAUTION/UNSUPPORTED | 2/3 |
| H15-fee-plus-limit | Fee refunded (right) plus a daily limit amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H16-fee-scoped-instant | A verified edit to the instant-rail exception keeps the fee for instant transfers, so "refunded" is wrong on the instant rail | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |

