# Held-out eval results

10 held-out cases (`evals/heldout.json`), written after the prompts were frozen at `2026-10-30.2` and never used
to tune them: reworded drafts, a reworded SOP on both rails, a reworded Slack proposal, a calendar-day reply, a hedge, an
unknown rail, an injection inside the draft and a no-claim reply. Each runs 3× per provider, live. Report only: no gate,
not used for the provider selection, never recorded into `data/ai-cache`. Failures are reported as they are.

## groq · `openai/gpt-oss-120b`

- Runs per case: 3 · date: 2026-11-01T10:27:20.872Z · throttled to stay under the free tier
- Decision accuracy: **100.0%** (30/30)
- Quote validity: **100.0%** (50/50 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **100.0%** (108/108)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H1-working-days | Reworded draft; "working days" means business days | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H2-hedged | Hedged wording that contradicts the governing value | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H3-number-word | Correct value written as a word | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H4-unknown-rail | Reworded draft on the unknown-rail ticket | ESCALATE / SCOPE_UNKNOWN | ✓ · ✓ · ✓ | 3/3 |
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H6-sop-reworded-standard | SOP rewritten in different words (number word, reworded negation), standard rail | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H7-sop-reworded-instant | Same reworded SOP, instant rail: the exception still supersedes it | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H8-slack-reworded | A different Slack proposal (2 business days) signals a change against a correct reply | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| H9-injection-in-draft | The draft itself tries to instruct the checker | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H10-no-claim | A follow-up promise with no value | ALLOW / NO_POLICY_CLAIM | ✓ · ✓ · ✓ | 3/3 |

## gemini · `gemini-3.5-flash-lite`

- Runs per case: 3 · date: 2026-11-01T10:31:41.329Z · throttled to stay under the free tier
- Decision accuracy: **100.0%** (30/30)
- Quote validity: **100.0%** (51/51 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures; seed docs only, the reworded texts have none): **100.0%** (108/108)

| Case | What it probes | Expected | Runs | Correct |
|---|---|---|---|---|
| H1-working-days | Reworded draft; "working days" means business days | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H2-hedged | Hedged wording that contradicts the governing value | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| H3-number-word | Correct value written as a word | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H4-unknown-rail | Reworded draft on the unknown-rail ticket | ESCALATE / SCOPE_UNKNOWN | ✓ · ✓ · ✓ | 3/3 |
| H5-calendar-days | "4 days" without business/working is calendar days | CAUTION / UNIT_MISMATCH | ✓ · ✓ · ✓ | 3/3 |
| H6-sop-reworded-standard | SOP rewritten in different words (number word, reworded negation), standard rail | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| H7-sop-reworded-instant | Same reworded SOP, instant rail: the exception still supersedes it | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H8-slack-reworded | A different Slack proposal (2 business days) signals a change against a correct reply | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| H9-injection-in-draft | The draft itself tries to instruct the checker | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| H10-no-claim | A follow-up promise with no value | ALLOW / NO_POLICY_CLAIM | ✓ · ✓ · ✓ | 3/3 |
