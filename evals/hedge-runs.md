# Hedged replies, run many times

Every held-out case with hedged wording, 10 runs each on groq `openai/gpt-oss-120b`, live, prompt `2026-11-02.6`, temperature 0. 2026-11-02T19:13:14.909Z to 2026-11-02T19:29:50.736Z. Each round reads the docs and the replies again. Provider errors were retried and not scored (0). Report only: `pnpm tsx scripts/hedge-runs.ts`.

A **miss** is any run that doesn't get the expected verdict and reason. **Strict** means it still can't go out unchecked: Hold or Double-check, for another reason. **Unsafe** means Good to send.

**All 4 cases:** 34 of 40 as expected · 6 strict misses (Hold or Double-check, wrong reason) · 0 unsafe (Good to send) · 0 couldn't be checked.

**Clean cases only (3; H14 is exposed):** 25 of 30 as expected · 5 strict misses (Hold or Double-check, wrong reason) · 0 unsafe (Good to send) · 0 couldn't be checked.

| Case | Expected | Verdicts | As expected | Strict misses | Unsafe |
|---|---|---|---|---|---|
| H2-hedged | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 10 | 10/10 | 0 | 0 |
| H14-fee-hedged-no (exposed) | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 9<br>Hold (CONTRADICTS_GOVERNING): 1 | 9/10 | 1 | 0 |
| H18-fee-hedged-no | Double-check (HEDGED_CONTRADICTION) | Double-check (HEDGED_CONTRADICTION): 5<br>Hold (CONTRADICTS_GOVERNING): 5 | 5/10 | 5 | 0 |
| H20-vague-mid-month | Double-check (UNSUPPORTED) | Double-check (UNSUPPORTED): 10 | 10/10 | 0 | 0 |

How the AI read each reply. The rules are the same on every run, so a different verdict always comes from a different reading here:

- **H2-hedged**: "Refunds for failed transfers usually take around 4 business days."
  - 10×: reversal_window {"amount":4,"unit":"business_days"} hedged
- **H14-fee-hedged-no**: "I don't think the transfer fee can be refunded, but let me double check that for you."
  - 9×: fee_refund {"flag":false} hedged
  - 1×: fee_refund {"flag":false} definite
- **H18-fee-hedged-no**: "As far as I can tell, you won't recover the service charge on this one, but I'd want to confirm that."
  - 5×: fee_refund {"flag":false} hedged
  - 5×: fee_refund {"flag":false} definite
- **H20-vague-mid-month**: "It normally clears up around mid-month and the amount reappears in your balance."
  - 10×: reversal_window null hedged

Runs close together at temperature 0 may not be independent samples: earlier sessions on one prompt gave the same answer on all 3 runs and a different one in the next session.
