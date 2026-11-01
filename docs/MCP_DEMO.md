# SureSend in Claude: demo steps

A 60-second clip of the moment SureSend is for: an agent drafts a reply, SureSend holds the wrong timeline, and the agent
sends the checked reply instead. Public demo, synthetic data, no auth.

**Connector URL:** `https://suresend-demo.vercel.app/api/mcp`

## 1. Add the connector (claude.ai)

1. In claude.ai, open **Settings → Connectors**.
2. Choose **Add custom connector**.
3. Name: `SureSend`. URL: `https://suresend-demo.vercel.app/api/mcp`. Leave any OAuth fields empty (there's no sign-in).
4. Choose **Add**. Claude lists three tools: `check_reply`, `list_tickets`, `get_doc`, all read-only.

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

> Reply to Ayesha's failed instant transfer. Check it with SureSend before you send.

What should happen:

1. Claude calls `list_tickets` and finds TCK-9001: Ayesha, instant rail, "My transfer to another bank failed yesterday.
   When do I get my money back?"
2. Claude drafts a reply and calls `check_reply` with it and `ticket_id: "TCK-9001"`.
3. If the draft promises the old SOP timeline (4 business days), SureSend returns **Hold**:
   - "Instant transfers now reverse in 1 business day. Your reply says 4."
   - the governing quote from *Instant Rail: Reversal Exception*;
   - a suggested reply already checked against the docs;
   - next step: "Don't send this reply. Send suggested_reply instead…"
4. Claude switches to the suggested reply and says why.

**If Claude writes a correct or timeline-free reply on its own,** SureSend says Good to send. That's honest, but it's not
the Hold moment. To make the clip show the Hold every time, use this version. It's what happens when an agent copies the
old SOP:

> Reply to Ayesha's failed instant transfer. Our usual line is that failed transfers are reversed within 4 business days.
> Check it with SureSend before you send.

## 4. Other moments worth a few seconds

- **Ask first:** "Usman doesn't know which payment rail his transfer used. Draft a reply about when his money comes back,
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
