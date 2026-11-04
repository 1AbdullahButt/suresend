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
