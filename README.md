# SureSend

SureSend — an independent concept for Slite Agent: check each customer reply against your docs at Send.

**[Live demo](https://suresend-demo.vercel.app).** Not affiliated with Slite. All data is synthetic.

![SureSend demo: a 4-day draft is held because the instant-transfer exception says 1 business day; the safe reply is used and sent; a ticket with an unknown transfer type escalates with a holding reply.](docs/demo.gif)

## The problem

Docs go stale, and between a policy change and the doc fix, someone can still send a customer the old answer. Slite asked
143 founders, operators and engineers about stale documentation: 76% had an AI tool surface a stale doc and produce a wrong
answer, and among them, 41% said that the wrong info has reached a customer
([Slite's survey](https://slite.com/learn/dangers-of-stale-documentation)).

## The idea

Slite Agent already [fact-checks docs claim by claim](https://slite.com/solutions/self-maintaining-documentation), weighs
sources by freshness, authority and verification, and drafts doc fixes for approval. What I didn't find is a gate on the exact
reply about to reach a customer. SureSend demonstrates that gate. The evidence view and doc-fix proposal here exist only so the
flow is complete.

**The key insight:** verification isn't authority. A verified SOP can lose to a newer, more specific exception, so the unit
of trust is the claim, not the doc.

## Try it in 60 seconds

No setup or sign-in. This path replays saved AI responses, so it works even when live AI is rate-limited.

1. Open the [demo](https://suresend-demo.vercel.app). Léa's ticket is open, with a reply that promises 4 business days. Press **Send**.
2. It comes back **Hold**: instant transfers now reverse in 1 business day, and the reply says 4. Press **Why?** to see which
   doc governs and which rules decided.
3. Use the back arrow, press **Use this reply**, then **Send**. The checked reply goes out.

## Use it from Claude

SureSend is also an MCP server, so an agent can check its own reply before sending it.

**Endpoint:** `https://suresend-demo.vercel.app/api/mcp`. There's no sign-in, because it only reads the public, synthetic demo
workspace. Don't send real customer data to it.

- **claude.ai:** add it as a custom connector, under Settings → Connectors (menus move).
- **Claude Code:** `claude mcp add --transport http suresend https://suresend-demo.vercel.app/api/mcp`

Then ask: "Reply to Léa's failed instant transfer. Check it with SureSend before you send." Or call `check_reply` yourself:

```bash
curl -s https://suresend-demo.vercel.app/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"check_reply","arguments":{"ticket_id":"TCK-9001","reply":"Failed transfers are reversed within 4 business days."}}}'
```

The answer starts like this:

```text
SureSend: Hold (HOLD, CONTRADICTS_GOVERNING)
Hold: instant transfers reverse in 1 business day (Instant Transfers: Reversal Exception, effective 27 Oct 2026). The draft says 4 business days.
Next step: Don't send this reply. Send suggested_reply instead (the rules rechecked it), or ask a human.
Suggested reply (Good to send): "Failed transfers are reversed within 1 business day."
```

## How it decides

The AI reads the reply and the docs and quotes them, and every quote has to match word for word. Written rules then make the
decision, and each rule leaves a trace you can read. The AI never decides the outcome.

| Verdict | What it means |
|---|---|
| Good to send | Nothing contradicts it, and it answers. Sends. |
| Double-check | Not backed up, or vague. Sends once confirmed. |
| Hold | Contradicts the doc that governs. Blocked. |
| Ask first | Depends on an unknown or a conflict. Blocked. |

Hold and Ask first each offer a checked reply to use instead. If the AI can't read the reply at all, the result is Couldn't
check, and the send is blocked.

On the same ticket at the same time, the same AI findings and the same docs always produce the same decision. That isn't "same
reply, same verdict": the AI can read the same words differently from one run to the next.

## Limits

- **The gate only works where it controls the send path.** In the demo inbox, Send can't get past a Hold or an Ask first. A
  reply sent any other way isn't checked.
- **Over MCP it's opt-in.** An agent has to choose to call `check_reply`, and nothing stops it sending the reply anyway.
- **It's strict.** An honest reply with no timeline, like "I've passed this to our payments team", gets a Double-check,
  because it leaves the customer's question open.
- **A dropped claim caps the reply at Double-check.** If the AI's quote doesn't match the words, the claim is dropped, and the
  reply can't do better even when it's right. A doc that loses a claim this way can't support Good to send either.
- **The detector knows common English wording only.** If the AI misses a claim in unusual words and the detector doesn't know
  them, a wrong reply can read as Good to send.
- **Scope is one axis today:** the transfer type. A topic that varies by plan or country needs more than a new topic file.
- **The eval set is small, and scores vary between sessions.** The same prompt has scored differently on different days, so
  treat one session's score as one session's.
- **One demo scenario.** Two topics around failed transfers, on synthetic docs, with no real Slite or help-desk integration.
  It isn't production-ready.

## How it was built

I'm Abdullah. I most recently led complaints operations at a fintech, where a reply quoting an outdated policy is an everyday
risk. That's the problem I picked.

I designed the problem, the spec and the rules, and built it with Claude Code running builder, tester and QA agents behind
locked tests and gates; every commit is co-authored with Claude.

Three things the agents got wrong, and how they were caught:

- **The safety-net bug.** A refactor weakened the net for missed claims, so a fee claim could let a missed 4-day promise
  through as Good to send. QA caught it with a repro, and the net now works per topic.
- **The held-out leak.** While writing the prompts, the builder reused wording from held-out eval cases, so they weren't held
  out any more. QA caught it: those cases are now reported apart, and a test fails if a newer held-out case shares a
  three-word phrase with the prompts.
- **The QA script that overwrote eval files.** One of QA's own scripts ran in the real project folder instead of its scratch
  copy and overwrote eval report files during a run. QA reported it, and the files were then compared with the run's own log
  rather than taken on its word.

## More

- [Evals and results](https://github.com/1AbdullahButt/suresend/blob/main/docs/evals.md)
- [Decisions](https://github.com/1AbdullahButt/suresend/blob/main/DECISIONS.md), and the [build log](https://github.com/1AbdullahButt/suresend/blob/main/PROGRESS.md)
- [Architecture](https://github.com/1AbdullahButt/suresend/blob/main/docs/architecture.md), including doc fixes and more to try in the demo
- [Adding a topic](https://github.com/1AbdullahButt/suresend/blob/main/docs/adding-a-topic.md)
- [Tests, and running it locally](https://github.com/1AbdullahButt/suresend/blob/main/docs/tests.md)
- [Limitations in full](https://github.com/1AbdullahButt/suresend/blob/main/docs/limitations.md)
- [MCP demo steps and tools](https://github.com/1AbdullahButt/suresend/blob/main/docs/MCP_DEMO.md)
- [Source](https://github.com/1AbdullahButt/suresend)
