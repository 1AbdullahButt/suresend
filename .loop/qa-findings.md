# QA findings · Phase 8 (MCP check_reply tool) re-review · 2026-11-01T11:27Z

This re-review checks the fixes for the 2026-11-01T11:15Z findings (2 major, 8 minor). Reviewed tree: `main` @ 41d63d9
plus uncommitted Phase 8 changes. The last file change was at 16:20:01 local, before this re-review started at 16:21. The
hash of `git diff HEAD` (excluding `.loop/qa-findings.md` and `.loop/waiting.json`) plus the untracked files is
`82dc6f4bd87d…`. It didn't change during the review. Gate reference: PLAN.md §11 and D-036.

## Commands run
- Locked paths: `git diff --stat -- lib/engine tests e2e data/seed SPEC.md IMPLEMENTATION_BRIEF.md` is empty, and
  `git status` shows nothing untracked under them.
- `pnpm typecheck` → exit 0.
- `pnpm test` → `Test Files 19 passed (19) · Tests 143 passed (143)`, exit 0. A verbose run of `lib/mcp` and the limiter
  tests gave 23/23, including these new tests:
  - "builds fresh deps for every check_reply…" (3 checks → `depsFor` called 3 times; `list_tickets` → 0)
  - "on Hold, tells the agent to show a human first when the suggested reply itself comes back Double-check" (SRC-202
    fails → SOURCE_UNREAD)
  - `route.test.ts`: batch → 400 `-32600`; malformed → 400 `-32700`; GET and DELETE → 405 with `Allow: POST`.
- `pnpm audit` → `No known vulnerabilities found`.
- `pnpm build` → exit 0, `ƒ /api/mcp` listed.
- `pnpm e2e` → `1 passed (44.1s)`.
- `AI_MODE=saved pnpm start -p 3100`, then `pnpm mcp:e2e` → 16 PASS lines and `ALL PASS`, exit 0:
  - "idle 3 s: client made 1 GET in total, none while idle"
  - Hold with a 1-day suggestion (Good to send), Ask first, Good to send, all with `ai_mode saved`
  - DOC-105 refused
  - raw batch → 400; GET and DELETE → 405 with `Allow: POST`
- Independent probes:
  - **Idle reconnect** (SDK client, 10 s idle): `{"POST":2,"GET":1}`, down from `GET:10` before the fix.
  - **Batch and limiter** (calls the real `app/api/mcp/route.ts` POST with a dummy key, all outbound fetch stubbed,
    `MCP_RATE_LIMIT_PER_10MIN=1`):
    - a batch of 5 → HTTP 400, 0 gate passes, 0 outbound attempts (before the fix: 5/5);
    - 5 separate requests → 1/5 pass, the rest `live_ai_paused=true`.
  - **Raw HTTP:**
    - malformed JSON → 400 `-32700`; `[1,2,3]` → 400 `-32600`;
    - unknown method → `-32601`; unknown tool → `isError`;
    - `doc-105`, `"  DOC-105\n\t"` and `DOC-999` → the identical "No doc with that ID…" error;
    - bad types, lengths and enums → zod `-32602` text only;
    - an injection inside the reply → "Couldn't check", with no echo;
    - extra `role`/`overrides` arguments → stripped;
    - no `accept` → 406; `text/plain` → 415 (the SDK still runs these checks when given `parsedBody`);
    - GET (with any Accept), DELETE and PUT → 405.
  - **Leaks:** a grep of the captured bodies for `DOC-105|FR-HOLD|CMP-7|Fraud|Compliance` found 0 hits, and no response
    contained a stack trace or internal text.
  - **Rail-only call:** returns `ticket: {"id":null,"rail":"standard"}`.
  - The server was stopped and port 3100 is free.
- stdio, started the documented way from `%TEMP%`:
  - raw → 5 stdout lines, all JSON-RPC; stderr carries only the startup line; `doc-105` refused; canonical Hold with
    `ai_mode=saved`;
  - SDK `StdioClientTransport` → 3 tools; Ask first with `{ id: null, rail: 'unknown' }`; 0 client errors.
- Axe audit (`scripts/ui-audit.ts` run from a scratch cwd; the tracked `design/` folder is unchanged) → `Serious/critical
  axe violations: 0. Horizontal page scroll: none`, exit 0.
- Secrets: the precommit-scan patterns plus JWT/OIDC patterns over `git diff` (1,024 added lines) and the 10 untracked
  files → no hits.
- `git worktree list` → only `D:/Project/slite 41d63d9 [main]`.

## Previous findings: status
- [major] Batch requests getting around the MCP budget → **fixed.**
  - `createSureSendMcpServer(depsFor)` calls `depsFor()` inside the `check_reply` handler (lib/mcp/server.ts:70).
  - stdio builds a runtime per check (lib/mcp/stdio.ts:12-13).
  - The route rejects arrays before the transport (app/api/mcp/route.ts:29).
  - Proven by the unit tests and by my probe above.
- [major] GET answering with a closing SSE stream → **fixed.** GET and DELETE return 405 with `Allow: POST` (route.ts:44-49).
  The SDK client makes 1 GET and stops.
- [minor] The Hold next_step ignoring the suggestion's own check → fixed and tested (tools.ts:121-125).
- [minor] Ask first always naming the rail → fixed. SCOPE_UNKNOWN and CONFLICT_UNRESOLVED now get different text
  (tools.ts:126-129).
- [minor] Coverage overclaim → fixed with the COVERAGE sentence in the instructions and the description (server.ts:22-25,
  61).
- [minor] "The AI only reads and quotes" → fixed (server.ts:63).
- [minor] README omitting "Couldn't check" → fixed, and the coverage note was added (README.md:37).
- [minor] README stating the claude.ai menu path as fact → hedged: "at the time of writing; menus move" (README.md:29).
- [minor] A ticket the caller never chose → `ticket.id` is now null, and the text says "No ticket, <rail> rail".
- [minor] README.md:136 "passed (local and live)" → still to be confirmed. The lead reports 13/13 on the previous deploy
  and will rerun on the new deploy before committing (gate item).

## Findings
- [severity: minor] lib/mcp/server.ts:25 · the server `instructions` still say "on Hold or Ask first, send the
  suggested_reply or ask a human" with no condition. The `check_reply` description and `next_step` now make this
  conditional on the suggestion's check. "Follow its next_step" comes first, so an agent that does so behaves correctly.
  For full consistency, add "(when its check is Good to send)".
- [severity: minor] lib/mcp/tools.ts:125 · cosmetic: when the suggestion has a note, the Hold next_step reads "…comes back
  Double-check: a doc couldn't be read: show it to a human…", with two colons.
- [severity: minor] app/api/mcp/route.ts:23 · `req.json()` reads the whole body before the transport, so the SDK's 4 MB
  `maxRequestBodySize` no longer applies. Vercel's 4.5 MB platform cap still bounds it, and the reply is capped at 1,000
  characters after parsing. No action needed for the demo.
- Info: the gate items still open are the lead's: redeploy, `pnpm mcp:e2e https://suresend-demo.vercel.app/api/mcp`
  against the new deploy, and the PROGRESS.md `## Phase 8` evidence block. Everything else in PLAN §11 is proven by the
  output above.

## VERDICT: APPROVED
