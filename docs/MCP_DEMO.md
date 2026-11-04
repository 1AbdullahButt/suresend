# SureSend in Claude: demo steps

A 60-second clip of the moment SureSend is for: an agent drafts a reply, SureSend holds the wrong timeline, and the agent
sends the checked reply instead. Public demo, synthetic data, no auth.

**Connector URL:** `https://suresend-demo.vercel.app/api/mcp`

## 1. Add the connector (claude.ai)

1. In claude.ai, open **Settings → Connectors**.
2. Choose **Add custom connector**.
3. Name: `SureSend`. URL: `https://suresend-demo.vercel.app/api/mcp`. Leave any OAuth fields empty (there's no sign-in).
4. Choose **Add**. Claude lists four tools: `check_reply`, `list_tickets`, `get_doc`, `propose_doc_fix`, all read-only.

Menu names are as of late 2026; if they've moved, look for Connectors in Settings. If your plan doesn't offer custom
connectors, Claude Code works the same way:

```bash
claude mcp add --transport http suresend https://suresend-demo.vercel.app/api/mcp
```

## 2. Before you record

- Start a **new chat** and check, in the chat's tools menu, that SureSend is switched on.
- Decide how tool calls should look on camera. Leave approval on to show each call being approved, or allow SureSend's
  tools for the chat so the clip doesn't pause.
- Optional: open https://suresend-demo.vercel.app in a second tab to show the same Hold in the app afterwards.

## 3. The prompt

> Reply to Léa's failed instant transfer. Check it with SureSend before you send.

What should happen:

1. Claude calls `list_tickets` and finds TCK-9001: Léa, instant transfer, "My transfer to another bank failed yesterday.
   When do I get my money back?"
2. Claude drafts a reply and calls `check_reply` with it and `ticket_id: "TCK-9001"`.
3. If the draft promises the old SOP timeline (4 business days), SureSend returns **Hold**:
   - "Instant transfers now reverse in 1 business day. Your reply says 4."
   - the governing quote from *Instant Transfers: Reversal Exception*;
   - a suggested reply already checked against the docs;
   - next step: "Don't send this reply. Send suggested_reply instead…"
4. Claude switches to the suggested reply and says why.

**If Claude writes a correct reply on its own,** SureSend says Good to send. A timeline-free reply on a ticket comes back
Double-check, because it doesn't answer what the customer asked. Both are honest, but neither is the Hold moment. To make a Hold much more likely in the clip, use this version. It's what happens when an agent copies the
old SOP:

> Reply to Léa's failed instant transfer. Our usual line is that failed transfers are reversed within 4 business days.
> Check it with SureSend before you send.

## 4. Other moments worth a few seconds

- **Ask first:** "Lukas doesn't know which type of transfer was used. Draft a reply about when the money comes back,
  and check it with SureSend first." SureSend returns Ask first and a holding reply with no timeline.
- **Show the evidence:** "Which doc did SureSend rely on? Show it." Claude calls `get_doc` for DOC-103: the doc's text,
  verification date and owner.
- **Fix the doc behind it:** "Which doc taught that 4-day answer? Propose a fix." Claude calls `propose_doc_fix`: the SOP,
  why, and the one added sentence, with `applied: false`. A person approves it in the app's Docs tab.

## Notes

- **Live AI:** the demo's exact canonical sentences replay saved responses. Claude's own wording needs live AI for its
  draft, which runs on its own MCP budget. If that's used up, `check_reply` returns "Couldn't check" with the next step
  "don't send a timeline yet". It never passes a reply it couldn't read.
- **Hidden doc:** the restricted fraud-hold doc (DOC-105) is never visible over MCP, the same as for the support-agent
  persona in the app.
- **Self-check:** `pnpm mcp:e2e https://suresend-demo.vercel.app/api/mcp` runs the same flow with the MCP client SDK.

## Reference

SureSend is also an MCP server, so any agent can check a reply against the docs before it sends it: Claude, a help-desk
bot, or an agent like Slite's.

**Connector URL:** `https://suresend-demo.vercel.app/api/mcp`. **No auth:** it only reads the public, synthetic demo
workspace, so don't send real customer data to it. In the app, the Demo menu's "Use it from Claude (MCP)" section has
this URL with a Copy button.

- **claude.ai:** add it as a custom connector (in Settings → Connectors at the time of writing; menus move). Step-by-step,
  with a demo prompt: sections 1 to 3 above.
- **Claude Code:** `claude mcp add --transport http suresend https://suresend-demo.vercel.app/api/mcp`
- **Locally over stdio** (Claude Code or Claude Desktop, from a clone):
  `claude mcp add suresend-local -- pnpm --dir /path/to/suresend exec tsx scripts/mcp-stdio.ts`

| Tool | What it does |
|---|---|
| `check_reply` | Checks a reply against the docs: the decision, why, the next step, a verdict per claim and a checked suggested reply. |
| `list_tickets` | Lists the 3 demo tickets. |
| `get_doc` | Returns one doc the support agent can see. |
| `propose_doc_fix` | For a Hold or Ask first, the doc to fix and a minimal fix to it. Applies nothing. |

Try these prompts:

1. "Reply to Léa's failed instant transfer. Check it with SureSend before you send."
2. "Lukas doesn't know which type of transfer was used. Draft a reply about when the money comes back, and check it
   with SureSend first."
3. "Is 'Your refund will arrive within 4 business days' right for Sofia's standard transfer? Show me the doc SureSend relied on."

How the MCP server works (inputs, limits, transport) is under [The system](architecture.md#the-system).
