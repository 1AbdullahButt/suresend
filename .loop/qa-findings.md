# QA findings · Phase 7 (re-review) · 2026-11-01T10:46Z

Re-review of the fixes for the 2026-11-01T10:40Z findings (1 major, 6 minor). Reviewed tree: `main` @ 3ce8f39 plus
uncommitted changes, `git diff HEAD -- . ':(exclude).loop/qa-findings.md' | sha256sum` = `9cebd5fe952f78dd…`. The hash
was unchanged from the start of this re-review to the end.

## Commands run
- `git diff --stat HEAD -- lib/engine tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md data/ai-cache` → empty (exit 0);
  no untracked files under the locked paths. `data/ai-cache`: 17 tracked (unchanged) + 2 new = 19 on disk.
- `pnpm typecheck` → exit 0.
- `pnpm test` → exit 0, `Test Files 16 passed (16) · Tests 122 passed (122)`.
- `pnpm audit` → `No known vulnerabilities found`, exit 0.
- `pnpm eval --saved` → exit 0, `Decision accuracy 100.0% (12/12)`, `Quote validity 100.0% (13/13)`, `field accuracy
  100.0% (60/60)`, `Gate … PASS`.
- `pnpm e2e` (webServer runs `pnpm build && pnpm start`) → `ok 1 … Demo menu shows 1 stopped`, `1 passed (2.1m)`, exit 0.
- Secrets: precommit-scan patterns over `git diff HEAD` (scratch copy, index untouched) → `clean (23 files)`; all 12
  untracked files → no hits.
- Browser, local (`pnpm start -p 3100`, AI_MODE=saved, Playwright + axe; output to the scratchpad only) →
  - fresh demo: hint visible on untouched TCK-9001, with `aria-describedby=reply-hint`;
  - DOC-103 edited from Hina's ticket with Save and verify → no hint on untouched TCK-9001, and `aria-describedby` is
    removed;
  - reload with the persisted edit → still no hint;
  - Reset demo → hint back; axe finds 0 serious/critical issues.
  - The server was stopped (taskkill) and port 3100 is free.
- Deployed site, read-only, no live AI spent:
  - `curl -I https://suresend-demo.vercel.app/` → `Content-Security-Policy: frame-ancestors 'none'`,
    `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`, `camera=(), microphone=(), geolocation=()`.
  - A canonical `POST /api/check` → `200`, `HOLD CONTRADICTS_GOVERNING`, `ai.mode=saved`,
    `X-Suresend-Limiter: upstash-unused`. That value shows the Upstash URL and token are set in Production; without them
    it would read `memory`. I didn't trigger a live call, so the `upstash` value after a live check is the lead's evidence.
  - `https://answerguard.vercel.app/` → `308`, `Location: https://suresend-demo.vercel.app/`.
- `git worktree list` → `D:/Project/slite 3ce8f39 [main]` only.

## Re-review of the previous findings
- [was major] README eval section → **resolved**.
  - README "Tests and eval": "Regression on the 12-case demo set. The prompts were tuned on these cases, so this shows
    the demo path is stable, not that it generalises."
  - The Gemini caveat sits under that table.
  - A "Held-out set (10 cases, never used for tuning)" table follows. Its numbers match `evals/heldout.md`: Groq 30/30,
    50/50; Gemini 30/30, 51/51.
  - The "Read it for what it is" note names H5, H3 and H7 accurately.
  - D-034's "Docs and repo" line is now true.
- [was minor] README.md test count → resolved ("122 passed", matching this run).
- [was minor] README.md e2e row → resolved (matches e2e/demo.spec.ts:15). The `--heldout` row is added. "10 states ×
  1440/1024/390" matches the 10 states in `scripts/ui-audit.ts`.
- [was minor] Upstash wording → resolved.
  - The README no longer asserts the 20/500 values; it names the env vars and the code defaults.
  - It explains that `x-suresend-limiter` reads `upstash` only after a live check, which is consistent with the
    `upstash-unused` I saw on a saved-replay request.
- [was minor] Slite characterisations at README.md:7 and :23 → resolved (both now refer to drift detection and Triage).
  README.md:30 is unchanged and matches the confirmed list.
- [was minor] Static hint after a persisted doc edit → resolved.
  - `components/shell/App.tsx` passes `docsEdited={Object.keys(ag.overrides).length > 0}`, and `ChatCard.tsx` adds
    `!docsEdited` to the hint condition.
  - Overrides load in the first mount effect, before the async seed fetch renders a ticket, so the hint can't flash.
  - Reset demo clears the overrides and the hint returns.
  - Reproduced fixed in the browser (above).
- [was minor] `x-suresend-limiter` disclosure → accepted and recorded in D-034, together with the reason. The logic was
  already confirmed correct (status read after `await handleCheck`; `lastOk` set only after both Upstash calls succeed).
- [was minor] axe gate note → the lead reports 30 runs (10 states × 3 widths), 0 serious/critical, run from the scratchpad
  so `design/audit` isn't overwritten. My own axe runs on the hint states (above, and at 1440/1024/390 in the first
  review) agree.

## Findings
- [severity: minor] README.md "Tests and eval", "conventions the spec adopted" · H5's calendar-day rule comes from the brief
  (§5) and the extraction prompt, and H3's amount-only comparison from the PLAN §5 Q1 default recorded in DECISIONS.
  "Conventions the project adopted" would be more exact. Wording only; the description of each convention is correct.
- [severity: minor] Pending lead items, not defects: commit and push "Phase 7: gate passed", then redeploy this exact
  tree. The deployed site already has the headers and the limiter header, but the `docsEdited` hint fix must be live
  before the final live check. Paste the gate evidence into PROGRESS.md.

## VERDICT: APPROVED
The major and all 6 minor findings are resolved. typecheck, 122/122 tests, audit, saved-replay eval, the build in e2e,
e2e, axe on the changed UI and the secrets scan all pass on the reviewed tree. The locked paths and the 17 saved
responses are untouched, and the worktree list is clean. The remaining items are the lead's commit, redeploy and
PROGRESS.md evidence.
