# Live-AI eval results

25 golden cases (`evals/golden.json`: the 3 canonical tickets, Appendix B variants B1–B7, a 1-business-day ALLOW,
a no-claim draft, the fee cases and six vague replies), each run 3× per provider, prompt version `2026-11-03.2`. The gate is the canonical tickets plus
B1, B2, B3 and B7 correct on every run. Only complete 3-run reports for this prompt version are listed and used for selection.

**The eval's pick:** `AI_PROVIDER=gemini`, `AI_FALLBACK_PROVIDER=groq`. Both passed the gate with 0 quote rejections each; gemini had higher field accuracy.

**Production overrides this:** `AI_PROVIDER=groq`, `AI_FALLBACK_PROVIDER=gemini`. Availability and latency matter more for the live path, and the field-accuracy gap changed no decision. (D-044)

## groq · `openai/gpt-oss-120b`

- Runs per case: 3 · started: 2026-11-03T18:34:09.838Z · finished: 2026-11-03T18:56:26.161Z · throttled
- Decision accuracy: **100.0%** (75/75)
- Quote validity: **100.0%** (117/117 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures): **97.2%** (175/180)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**

| Case |  | Expected | Runs | Correct |
|---|---|---|---|---|
| canon-9001 | gate | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| canon-9002 | gate | ESCALATE / SCOPE_UNKNOWN | ✓ · ✓ · ✓ | 3/3 |
| canon-9003 | gate | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| B1 | gate | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| B2 | gate | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| B3 | gate | ESCALATE / CONFLICT_UNRESOLVED | ✓ · ✓ · ✓ | 3/3 |
| B4 |  | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| B5 |  | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| B6 |  | CAUTION / WEAK_BASIS | ✓ · ✓ · ✓ | 3/3 |
| B7 | gate | CAUTION / WEAK_BASIS | ✓ · ✓ · ✓ | 3/3 |
| allow-1day |  | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| no-claim |  | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| fee-correct |  | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| fee-wrong |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-hedged |  | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| fee-two-claims |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-unknown-rail |  | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| fee-scoped-F1 |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-amount |  | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| vague-repro |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| vague-week-out |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| vague-very-soon |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| vague-monday-less-charge |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| vague-unknown-rail |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| vague-next-week |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |

Field misses:
- DOC-101/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed other statusWording: want "unstated" got "in_force"

## gemini · `gemini-3.5-flash-lite`

- Runs per case: 3 · started: 2026-11-04T08:29:57.655Z · finished: 2026-11-04T08:43:09.163Z · throttled · provider errors retried, with no answer to score: 15
- Decision accuracy: **88.0%** (66/75)
- Quote validity: **100.0%** (111/111 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures): **100.0%** (180/180)
- Gate (canonical tickets + B1, B2, B3, B7 correct on every run): **PASS**

| Case |  | Expected | Runs | Correct |
|---|---|---|---|---|
| canon-9001 | gate | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| canon-9002 | gate | ESCALATE / SCOPE_UNKNOWN | ✓ · ✓ · ✓ | 3/3 |
| canon-9003 | gate | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| B1 | gate | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| B2 | gate | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| B3 | gate | ESCALATE / CONFLICT_UNRESOLVED | ✓ · ✓ · ✓ | 3/3 |
| B4 |  | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| B5 |  | CAUTION / CHANGE_SIGNALLED | ✓ · ✓ · ✓ | 3/3 |
| B6 |  | CAUTION / WEAK_BASIS | ✓ · ✓ · ✓ | 3/3 |
| B7 | gate | CAUTION / WEAK_BASIS | ✓ · ✓ · ✓ | 3/3 |
| allow-1day |  | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| no-claim |  | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| fee-correct |  | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| fee-wrong |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-hedged |  | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| fee-two-claims |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-unknown-rail |  | CAUTION / TOPIC_GAP | ✓ · ✓ · ✓ | 3/3 |
| fee-scoped-F1 |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-amount |  | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |
| vague-repro |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| vague-week-out |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| vague-very-soon |  | CAUTION / UNSUPPORTED | ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP | 0/3 |
| vague-monday-less-charge |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| vague-unknown-rail |  | CAUTION / UNSUPPORTED | ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP · ✗ CAUTION/TOPIC_GAP | 0/3 |
| vague-next-week |  | CAUTION / UNSUPPORTED | ✗ CAUTION/UNIT_MISMATCH · ✗ CAUTION/UNIT_MISMATCH · ✗ CAUTION/UNIT_MISMATCH | 0/3 |
