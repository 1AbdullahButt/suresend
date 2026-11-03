# Live-AI eval results

25 golden cases (`evals/golden.json`: the 3 canonical tickets, Appendix B variants B1–B7, a 1-business-day ALLOW,
a no-claim draft, the fee cases and six vague replies), each run 3× per provider, prompt version `2026-11-03.2`. The gate is the canonical tickets plus
B1, B2, B3 and B7 correct on every run. Only complete 3-run reports for this prompt version are listed and used for selection.

**The eval's pick:** `AI_PROVIDER=groq`. Only groq has a complete report on this prompt so far.

Not finished on this prompt: gemini.

## groq · `openai/gpt-oss-120b`

- Runs per case: 3 · started: 2026-11-03T14:33:03.345Z · finished: 2026-11-03T16:02:55.894Z · throttled · provider errors retried, with no answer to score: 7
- Decision accuracy: **97.3%** (73/75)
- Quote validity: **98.3%** (115/117 extracted quotes/spans verbatim; 2 rejected)
- Extraction field accuracy (vs hand-written fixtures): **95.0%** (171/180)
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
| vague-monday-less-charge |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✗ HOLD/CONTRADICTS_GOVERNING · ✗ HOLD/CONTRADICTS_GOVERNING | 1/3 |
| vague-unknown-rail |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| vague-next-week |  | CAUTION / UNSUPPORTED | ✓ · ✓ · ✓ | 3/3 |

Field misses:
- DOC-101/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed other statusWording: want "unstated" got "in_force"
