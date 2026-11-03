# UI contract v2: accessible names (shared by the builder and the e2e test)

Replaces `design/UI-CONTRACT.md` for design v2 (Phase 5). The e2e test selects elements **only** by role and accessible
name, using the names below, taken from the v2 artboards in this folder. Text matches are case-sensitive substrings
unless marked "exact".

| Element | Role | Accessible name / text |
|---|---|---|
| Conversations list | `navigation` | "Conversations" |
| Conversation row | `button` (inside Conversations) | contains the customer name, e.g. "Ayesha K." |
| Transfer type picker (customer card pill) | `combobox` | "Transfer type" |
| Composer | `textbox` | "Your reply" |
| Send (ready) | `button` | "Send" (exact). Pressing it runs the server check via `POST /api/send`. |
| Send (held) | `button`, disabled | "Send (held)" (exact) |
| Held tag (composer) | `status` | text contains "Held by SureSend" |
| Sent confirmation (thread) | `status` | text contains "Sent · checked by SureSend" |
| SureSend card | `complementary` | "SureSend" |
| Agent tabs | `tab` | "Check", "Docs" (exact) |
| Outcome card | `region` | "Decision"; its text contains one of "Good to send", "Double-check", "Hold", "Ask first", "Not sent" |
| Suggested reply | `region` | "Suggested reply" |
| Use this reply | `button` | "Use this reply" (exact) |
| Why? | `button` | "Why?" (exact) |
| Double-check acknowledgement | `checkbox` | "I've checked and want to send it" |
| Send anyway | `button` | "Send anyway" (exact) |
| AI unavailable retry | `button` | "Try again" (exact) |
| Header: Demo menu | `button` | "Demo menu" (exact), opens a `dialog` named "Demo menu" |
| Header: Guided tour | `button` | "Guided tour" (exact) |
| Persona switch (in Demo menu) | `radiogroup` | "Viewing as", with `radio` "Support agent" and "Ops lead" |
| Impact tiles (in Demo menu) | `group` | "Replies checked", "Wrong ones stopped", "False alarms"; each contains its value as text |
| AI mode line (in Demo menu) | `status` | name starts with "AI mode:" |
| Reset (in Demo menu) | `button` | "Reset demo" |
| Footer | `contentinfo` | text contains "Independent concept for Slite Agent" |

Behaviour the e2e relies on (SPEC §5, §6.8, §11; REDESIGN_PROMPT items 1, 5, 6):
- Selecting a conversation loads its draft into the composer.
- **Send** runs `POST /api/send` with the exact text. ALLOW sends. HOLD/ESCALATE return 409: the reply is held, the
  composer shows the held tag, the button becomes "Send (held)" (disabled), the Decision region shows the outcome, and one
  "Wrong ones stopped" is counted. CAUTION shows the acknowledgement + "Send anyway". 503 shows "Not sent" + "Try again".
- Changing the composer text (typing, or **Use this reply**) clears the held state and re-enables **Send**.
- Impact numbers live in the browser (localStorage with try/catch and a memory fallback) and start at 0 in a fresh context.
- The "Wrong ones stopped" group's text must not contain digits other than its value.
