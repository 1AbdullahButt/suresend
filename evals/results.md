# Live-AI eval results

19 golden cases (`evals/golden.json`: the 3 canonical tickets, Appendix B variants B1–B7, a 1-business-day ALLOW,
a no-claim draft and the fee cases), each run 3× per provider, prompt version `2026-11-02.4`. The gate is the canonical tickets plus
B1, B2, B3 and B7 correct on every run. Only complete 3-run reports for this prompt version are listed and used for selection.

**Selection:** `AI_PROVIDER=groq`. Only groq passed the gate.

## groq · `openai/gpt-oss-120b`

- Runs per case: 3 · started: 2026-11-02T07:30:00.953Z · finished: 2026-11-02T07:46:23.494Z · throttled
- Decision accuracy: **100.0%** (57/57)
- Quote validity: **100.0%** (81/81 extracted quotes/spans verbatim; 0 rejected)
- Extraction field accuracy (vs hand-written fixtures): **96.1%** (173/180)
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
| no-claim |  | ALLOW / NO_POLICY_CLAIM | ✓ · ✓ · ✓ | 3/3 |
| fee-correct |  | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| fee-wrong |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-hedged |  | CAUTION / HEDGED_CONTRADICTION | ✓ · ✓ · ✓ | 3/3 |
| fee-two-claims |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-unknown-rail |  | ALLOW / SUPPORTED | ✓ · ✓ · ✓ | 3/3 |
| fee-scoped-F1 |  | HOLD / CONTRADICTS_GOVERNING | ✓ · ✓ · ✓ | 3/3 |
| fee-amount |  | CAUTION / OUTSIDE_COVERAGE | ✓ · ✓ · ✓ | 3/3 |

Field misses:
- DOC-101/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed reversal_window statusWording: want "unstated" got "in_force"
- DOC-104/seed other statusWording: want "unstated" got "in_force"
