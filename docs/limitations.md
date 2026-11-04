# Limitations in full

[Back to the README](../README.md)

## Limitations

- **The gate only works where it controls the send path.** In the demo inbox, Send can't get past a Hold or an Ask first. A
  reply sent any other way isn't checked.
- **Over MCP it's opt-in.** An agent has to choose to call `check_reply`, and nothing stops it sending the reply anyway.
- **More Double-checks on correct but vague replies.** A reply that gives no value, or leaves the customer's question open, is a
  Double-check even when nothing in it is wrong. "I've passed this to our payments team and will update you" is honest and still
  gets one; so does a correct fee-only reply to someone asking when their money comes back. Only SureSend's own holding wording ("I'm
  confirming the exact reversal timeline…") goes through. Every seed ticket asks about the timeline, so in this demo that covers every
  reply that doesn't state it. That's the price of never calling a silent reply safe (D-045).
- What a customer is asking is keyword matching, per topic (`asks` in each topic file). A question in unusual words doesn't trigger
  the check. Over MCP with no `ticket_id` there's no question to compare with, so a vague reply the AI also misses reads as Good to send.
- Two topics (`reversal_window`, `fee_refund`) plus `other`: any other factual claim, such as a fee amount or a limit, is
  "outside coverage" (Caution). The rules are topic-agnostic; the next topic needs a file in `lib/topics` with its
  examples, and a comparator only for a new kind of value (see [Adding a topic](adding-a-topic.md)).
- The "nothing found" detector works per topic: it flags a topic's pattern when no claim on that topic was extracted, unless
  an out-of-topic claim already covers those words. If a reply makes two claims on the same topic and the AI catches only
  one, the other isn't flagged.
- The detector only knows common wording. A fee statement in unusual words, such as "we also repay the service charge", gets
  past it, so if the AI misses that too and the reply answers what the customer asked, it reads as Good to send. The words the detector does know can misfire: "not deducting the fee", with the fee claim missed, gets a Double-check. That's the safe direction. Its words aren't added, since those come from the
  held-out cases.
- A fee statement with a timing word in it ("refunded within the same transfer") gets a Double-check even when it's right,
  because a claim on one topic never vouches for another. That's the safe direction.
- A currency amount is flagged only when no claim on a checked topic was found. In "The transfer fee is refunded, all €2 of
  it", with only the fee claim extracted, the amount isn't checked.
- The Gemini fallback can't answer within the 9-second timeout while Gemini is overloaded, as on 2 Nov (503 errors, and 20 to 30
  seconds per call). A check that needs the fallback then gets saved responses, or can't be checked until Gemini recovers.
- Fix the doc covers timeline holds. A fee Hold gets no doc fix proposal.
- Send integrity holds against the workspace the client submits. In the demo the docs live in the browser, so a client
  could submit edited docs; in a real deployment the docs would come from Slite, not the browser.
- Personas are simulated: anyone can switch. DOC-105 is synthetic. Never use this design with real restricted data.
- The MCP server has no auth because it only reads this public, synthetic workspace. A real one would sit behind the
  workspace's own sign-in and check the caller's permissions.
- No real Slite or Intercom integration; all data is synthetic.
- Live AI stops at the app's daily caps, Groq's $5/month spend limit or Gemini's free-tier quota. Past those, checks fall
  back to saved responses with a visible badge, and text with no saved response can't be checked until the limit clears.
- Saved responses cover the seeded docs, the Appendix B variants, the canonical drafts, the tour's step-6 edit and the canonical doc fix;
  arbitrary new text needs live AI.
- **A wrong timeline doesn't always get a Hold.** "A couple of working days" does, since it's read as 2. "A few days" has no number to compare, so it's a Double-check with the docs' value. "About a week" and "a fortnight" are calendar days, and rule D8 makes a unit mismatch a Double-check, as it does "within 5 days". None of them is Good to send on a ticket. The AI reads the number words, and the detector is only the net: it says something's there, not what it's worth. Over MCP with no `ticket_id`, wording it doesn't know reads as Good to send if the AI misses it too.
- **A claim dropped for a bad quote costs a Double-check.** If the AI's copy of a reply's words isn't verbatim, that claim is dropped (SPEC §6.2) and the reply can't be better than Double-check: "Couldn't verify part of this reply" (D-060). A doc that loses a claim the same way can't support Good to send either. So a right reply whose quote the AI miscopies gets a Double-check it didn't earn. I measured a miscopy on 3 of 20 readings of one reply. That's one reply, not a rate.
- **The AI's reading can depend on odd things.** The name "Léa" in a greeting made the model lowercase the first letter of what it quoted on 7 of 10 readings, so the check failed closed with Couldn't check. Other names did it on 0 and 1 of 10. A line in the prompt fixed it (0 of 29 on that same reply, and 0 of 30 on three others), but I don't know why that name does it, and another name or a model upgrade could bring it back.
- On a screen under 561 px tall, the slide-over still covers the conversation pills, since there's no room for it below them. Close it to change the conversation. Under about 450 px tall, Send is cut off for a mouse, though Tab still reaches it: that's older than this phase, and the demo isn't built for it.
- The eval is small and built around one scenario; the held-out set (25 clean cases) is a first check on generalisation, not proof.
- **Verdicts on hedged wording vary from run to run.** Run 10 times each on Groq on the previous prompt (`2026-11-02.6`), the four hedged held-out cases gave the expected verdict on 34 of
  40 runs. The other 6 were strict and none was Good to send: each is a hedge the AI read as definite, so it got a Hold, not a Double-check (5 on H18's "As far as I can tell", 1 on H14). H2 and H20
  were right 10 of 10. That's four sentences at temperature 0 in one sitting, so 0 unsafe in 40 doesn't prove never: even if the runs were independent, at 95% confidence a rate up to about 7% could go unseen, or about 26% for any one sentence (0 of 10). See
  [evals/hedge-runs.md](../evals/hedge-runs.md). Over every Groq session on the three prompts before this one, H18 is a Hold on 16 of 35 runs, and on this one on 6 of 6.

## What not to claim

- That the same reply always gets the same verdict. On the same ticket at the same time, the same AI findings and the same docs do; the AI's reading of a reply can vary.
- That Slite lacks this internally.
- That it connects to real Slite or Intercom data.
- That intercepted sends equal prevented customer harm.
- That the AI decides policy. The rules do, and they escalate when unsure.
- That it's production-ready. It still needs real permissions, integrations, security and legal review.
