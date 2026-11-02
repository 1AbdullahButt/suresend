# Held-out eval results

13 clean held-out cases (`evals/heldout.json`), run with prompt `2026-11-02.4`. Each runs 3× per provider, live. Report only: no gate, not used for the provider selection, never recorded into `data/ai-cache`. Failures are reported as they are.

- **The timeline cases** (H1–H4, H6–H10) were written after the prompts were frozen at `2026-10-30.2`: reworded drafts, a reworded SOP on both rails, a reworded Slack proposal, a hedge, an unknown rail, an injection inside the draft and a no-claim reply. They were in the repo, with published results, while the fee prompts were written, and they already passed on earlier prompts. H1 reuses phrases that older prompt already had, so it's easier than it looks.
- **H12** (the fee) was written before any fee prompt text existed. It shares no three-word phrase with the prompts, schema, golden set or presets.
- **H17–H19** (the fee) were written after the prompts were frozen at `2026-11-02.4`, and share no three-word phrase with those files: two claims after a doc edit, a hedge, and an amount outside coverage.

The four fee cases are the real evidence for the new topic; the fee-only line below scores them on their own.

6 exposed cases (H5, H11, H13, H14, H15, H16) no longer count as held-out and are reported separately as regression cases. Their wording reached the prompts or the golden set, or came from them, even where it was later removed (D-041).

Not run yet on this prompt: gemini.

## groq · `openai/gpt-oss-120b`

- Runs per case: 3 · started: 2026-11-02T08:52:30.504Z · finished: 2026-11-02T09:14:15.423Z · throttled

**Clean held-out cases (13)**

- Decision accuracy: **100.0%** (39/39)
- Fee cases only: **100.0%** (12/12)
- Quote validity: **100.0%** (82/82 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **93.5%** (101/108)

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
| H10-no-claim | A follow-up promise with no value | ALLOW / NO_POLICY_CLAIM | ✓ · ✓ · ✓ | 3/3 |
| H12-fee-comes-back | Fee refunded, reworded ("comes back together with the transfer amount"), standard rail | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H17-fee-scoped-two-claims | Two claims after a verified edit to the instant-rail exception: the timeline is right, the fee is wrong on this rail | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H18-fee-hedged-no | Hedged "not refunded", worded without the hedge list: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H19-fee-plus-weekly-cap | Fee refunded (right) plus a weekly cap amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |

**Exposed cases (6): regression only, not held-out**

- Decision accuracy: **94.4%** (17/18)
- Quote validity: **100.0%** (38/38 extracted quotes/spans verbatim; 0 rejected)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H11-fee-charge-stays | Two claims: the timeline is right, the fee is wrong ("the transfer charge stays with us" = not refunded) | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H13-fee-unknown-rail | Fee refunded on the unknown-rail ticket: the fee rule covers all rails, so the rail doesn't matter | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H14-fee-hedged-no | Hedged "not refunded" contradicts the policy: Double-check, not Hold | CAUTION / HEDGED_CONTRADICTION | ✗ HOLD/CONTRADICTS_GOVERNING · ✓ · ✓ | 2/3 |
| H15-fee-plus-limit | Fee refunded (right) plus a daily limit amount, which is outside coverage | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| H16-fee-scoped-instant | A verified edit to the instant-rail exception keeps the fee for instant transfers, so "refunded" is wrong on the instant rail | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |

Field misses:
- DOC-101/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed other statusWording: want "unstated" got "in_force"
