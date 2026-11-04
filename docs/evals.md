# Evals and results

[Back to the README](../README.md)

What the evals measured, as they came, including the misses. For how to run them, see [Tests](tests.md).

**Regression on the 25-case demo set.** The prompts were tuned on these cases, so this shows the demo path works, not
that it generalises. From [evals/results.md](../evals/results.md) (prompt `2026-11-03.2`). Both providers have run this prompt:

| Provider · model | Decision accuracy | Quote validity | Extraction field accuracy | Gate (canonical + B1, B2, B3, B7, 3/3 runs) |
|---|---|---|---|---|
| Groq · `openai/gpt-oss-120b` | 100% (75/75) | 100% (117/117) | 97.2% (175/180) | PASS |
| Groq, the same prompt, an earlier session | 97.3% (73/75) | 98.3% (115/117) | 95.0% (171/180) | PASS |
| Gemini (fallback) · `gemini-3.5-flash-lite` | 88.0% (66/75) | 100% (111/111) | 100% (180/180) | PASS |
| Gemini, previous prompt | 92.0% (69/75) | 100% (111/111) | 100% (180/180) | PASS |
| Groq, previous prompt | 98.7% (74/75) | 100% (115/115) | 96.1% (173/180) | PASS |

Groq's latest session has no misses. An earlier session on the same prompt had two, both `vague-monday-less-charge`: the right Hold and reason, but a suggested reply that didn't say "1 business day". That run also rejected 2 quotes, which its report doesn't tie to a case. The likely story: the AI miscopied the timeline's words, that claim was dropped, and the suggestion stated only the fee. Probes of the same reply gave that miscopy on 3 of 20 readings ("on its own" for "on their own"). A dropped claim's topic now counts for the suggested reply (D-060), so that miss shouldn't recur, though Groq's latest session had no dropped claim to show it. So the same prompt moved from 73/75 to 75/75, with only the doc owners' names different in what the AI read: treat one session's score as one session's. The report now keeps what each miss said.

Groq's field accuracy is below 100% mainly because it reads DOC-101 and DOC-104 as "in force" where the hand-written fixtures say "unstated". On recent prompts it's gone
170, 178, 173, 171, then 175 of 180, with no decision changed.

Gemini's 9 misses on this prompt are three vague replies, 3 of 3 each. On `vague-very-soon` and `vague-unknown-rail` it found no claim, so rule D0e's Double-check caught them, and it read `vague-next-week` as a unit mismatch, also a Double-check. That's the right verdict for a different reason, so on the verdict alone both providers are 75/75 on this prompt. On `2026-11-02.6` its 6 misses were the first two of those; on the verdict alone, Gemini was 75/75 and
Groq 74/75. On `2026-11-02.5` Gemini scored 65/75.

A first Gemini run missed the Slack proposal and rejected two quotes until the prompt said proposals are claims and quotes
exclude markdown labels (the fix was in the prompt, never the rules or tests).

**Held-out set (25 clean cases).** A case whose wording reached the prompts or golden set doesn't count, even after that
wording is removed. The current prompt's rows are from [evals/heldout.md](../evals/heldout.md), and older rows from the report of their day. All live, 3 runs each, with the prompts frozen first:

| Provider · model | All clean cases | Fee cases only (H12, H17–H19, H23–H25) | Vague replies only (H20–H22) | Quote validity |
|---|---|---|---|---|
| Groq · `openai/gpt-oss-120b` | 89.3% (67/75) | 76.2% (16/21) | 100% (9/9) | 100% (158/158) |
| Groq, the same prompt, an earlier session | 92.0% (69/75) | 85.7% (18/21) | 100% (9/9) | 100% (158/158) |
| Gemini (fallback) · `gemini-3.5-flash-lite` | 84.0% (63/75) | 100% (21/21) | 0% (0/9) | 100% (144/144) |
| Groq, previous prompt (`2026-11-02.6`), 19 cases | 98.2% (56/57) | 95.2% (20/21) | 100% (9/9) | 100% (130/130) |
| Gemini, previous prompt (`2026-11-02.6`), 19 cases | 87.7% (50/57) | 100% (21/21) | 22.2% (2/9) | 100% (119/119) |
| Gemini, earlier prompt (`2026-11-02.5`), 16 cases | 91.7% (44/48) | 83.3% (10/12) | 77.8% (7/9) | 100% (91/91) |
| Groq, earlier prompt (`2026-11-02.5`), 16 cases, two sessions | 95.8% (46/48), then 97.9% (47/48) | 83.3% (10/12), then 91.7% (11/12) | 100% (9/9) both | 100% |
| Earlier prompt (`2026-11-02.4`), 13 cases: Groq, two sessions | 92.3% (36/39), then 100% (39/39) | 75% (9/12), then 100% (12/12) | no such cases | 100% |
| Earlier prompt (`2026-11-02.4`), 13 cases: Gemini | 100% (39/39) | 100% (12/12) | no such cases | 100% (81/81) |

- **Paraphrased wrong timelines are the evidence for number words.** H26–H39, committed before any change for them. On all 14, 42 readings on Groq: **Hold 18, Double-check 24, Good to send 0**, up from Hold 12, Double-check 30 and Good to send 0 on the old prompt and docs. The six that give a number in the docs' unit (H26, H27, H32–H35) are **18 of 18 Hold**, up from 12 of 18. All of that gain is "a couple of working days", from 0 of 6 to 6 of 6, and those two are exposed, since the brief names the wording and the prompt now states it. The four clean ones were 12 of 12 before and after, so nothing held out yet shows the rule reaching further. The other eight can't get a Hold by design (see [Limitations](limitations.md)): "a few", "a handful of" and "several" have no number, and "about a week", "a day or two" and "a fortnight" are calendar days. All 24 of their readings were Double-check. Nine of those 24 got there by another reason than expected: "about a week" read as no value on H31's 3 of 3 (H30's read as 7 calendar days, 3 of 3), "a day or two" on 3 of 3, and "several working days" found no claim on 3 of 3, so the detector caught it. The earlier session on this prompt gave the same 18, 24 and 0. Gemini's 42 readings gave the same **Hold 18, Double-check 24, Good to send 0**, with the same six at 18 of 18. On 39 of its 42 the reason was as expected too: the other 3 are H38, where "several working days" again found no claim and the detector caught it.
- **Why the clean score fell from 56/57 to 67/75.** Eight misses, none Good to send. H18 got a Hold on all 3 runs: a hedge the AI read as definite (below). H38's "several working days" found no claim on 3 of 3, so the detector made it a Double-check. H23's "with the service cost taken off" read as vague on 2 of 3, so **a wrong reply got a Double-check, not a Hold**: the one miss here that's less strict than it should be. Quote validity is 158 of 158, and H1 ("Hi Léa…") is 3 of 3.
- **Gemini's clean score, 63/75.** Twelve misses, none Good to send, and the verdict is right on all 75. On H20–H22 it found no claim on 9 of 9, so rule D0e made them a Double-check (below), and H38 went to the detector, as on Groq. It has no miss on the fee cases: H18's hedge and H23's "with the service cost taken off", Groq's two fee misses, are 3 of 3 each. Quote validity is 144 of 144, and H1 is 3 of 3.
- **The vague replies are the evidence for an earlier prompt change.** H20–H22 were committed before any prompt work on valueless
  claims, and the same test checks them for shared phrases. They're three cases, so it's a first check. They score against the reason, so a
  reply the AI misses and rule D0e catches still counts as a miss here. All 7 of Gemini's misses on `2026-11-02.6` are that: it found no claim on 7 of 9 runs, up from 2 of 9 on `2026-11-02.5`, though the timeline wording
  in the prompt didn't change, and I don't know why. Its verdict was right on all 9, and on all 57 clean readings of that session. So for Gemini on this wording, the rule is doing the work, not the prompt. On this prompt it found no claim on 9 of 9, so that still holds.
- **H23–H25 are the evidence for reading a fee taken off the money as not refunded.** They say it in other words, though H23 shares "taken off" with the new rule, below the three-word line ("with the service cost taken off", "once we deduct what the send cost you", "short of
  our handling charge"), and were committed before that prompt change (e00cd5d), under the same test for shared phrases. Groq: 9 of 9 on that prompt, and on this one 9 of 9, then 7 of 9, with H23 read as vague on 2 of 3. Gemini: 9 of 9 on this prompt.
- **Three expected results changed with the rule, not the case:** H10, H12 and H13 leave the customer's question open, so they're
  now Double-check where they were Good to send (D-045).

- **The fee cases are the real evidence for the new topic.** H12 was written before any fee prompt text existed. H17–H19 were
  written after the final freeze: two claims after a doc edit, a hedge, and an amount outside coverage.
  [A test](../lib/ai/heldoutIntegrity.test.ts) fails if any of them shares a three-word phrase with the prompts, schema,
  golden set or presets, or if the system prompts or schemas change after the freeze.
- **The timeline cases** (H1–H4, H6–H10) were written after an earlier freeze: reworded drafts ("working days", a number word, a
  hedge), the ticket with an unknown transfer type, a reworded SOP on both transfer types, a reworded Slack proposal, an injection inside the draft and
  a no-claim reply. They were in the repo while the fee prompts were written and already passed on earlier prompts, so they
  show nothing broke, not that the new topic works. H1 reuses phrases that older prompt already had.

**Hedges aren't stable.** H18 is a hedged "not refunded" ("As far as I can tell, you won't recover the service charge…"). On one
frozen prompt, Groq returned Hold on all 3 runs of one session and Double-check on all 3 of the next, and nothing was tuned between them
([first session](https://github.com/1AbdullahButt/suresend/blob/1db5346/evals/heldout.md)). On `2026-11-02.5` it was 1 of 3, 2 of 3, then 6 of 10; on `2026-11-02.6` 2 of 3, then 5 of 10
([hedge runs](../evals/hedge-runs.md)); on this prompt 0 of 3, twice. Gemini got it right on all 3 of its runs on this prompt. H14, its exposed twin, has gone 3/3, 2/3, 3/3, 3/3, 10/10, 3/3, 9/10, 1/3, then 3/3. A miss here errs strict: the reply is stopped, not let through.

**A fee taken off the money reads as not refunded.** Prompt `2026-11-02.5` listed "minus the processing charge" as vague wording, and that had a cost: H11 ("the transfer charge stays with us", a plain "not refunded")
fell from Hold on 3 of 3 to 4 of 6, so a wrong reply sometimes got only a Double-check. Since `2026-11-02.6` the prompt says money back with the fee taken off means the fee isn't refunded. H11 went back to 3 of 3 and H23–H25 to 9 of 9, so
those replies were held. H11 is still 3 of 3 on this prompt, on both providers; H23–H25 are 7 of 9 in Groq's last session and 9 of 9 on Gemini. The detector also catches "minus", "less", "after deducting", "deducting" and "net of" before a fee word, so if the AI misses those, the reply is a Double-check, not Good to send. Other wording, like H23–H25's, rests on the AI alone (see [Limitations](limitations.md)).

**Exposed cases (14): regression only, not held-out.** H5, H11, H13–H16, H26–H31, H36 and H37. Their wording reached the prompts, the detector or the
golden set, or shares a phrase with drafts written after them. H26–H31 were exposed from the start, since the brief names their wording. H38's "several" and H39's "fortnight" are single words the detector also names: below the three-word line, and the AI never reads the detector, so they stay clean. Where it could be removed, it was, and they still don't count
(D-041). They're shown so nothing is hidden, not as evidence. H14 tests the same behaviour as H18 and was the one that leaked.

| Provider · model | Decision accuracy | Quote validity |
|---|---|---|
| Groq · `openai/gpt-oss-120b` | 78.6% (33/42) | 100% (72/72) |
| Groq, the same prompt, an earlier session | 81.0% (34/42) | 100% (72/72) |
| Gemini (fallback) · `gemini-3.5-flash-lite` | 97.6% (41/42) | 98.6% (68/69) |
| Groq, previous prompt, 6 cases | 94.4% (17/18) | 100% (40/40) |
| Gemini, previous prompt, 6 cases | 100% (18/18) | 100% (39/39) |

Groq's nine misses: H31 (3) and H36 (3) above, and H13 (3), whose "It is returned along with your money" it read as a timeline with no value. All nine are still a Double-check, for a different reason. None reached Good to send.

Gemini's one miss: H14 on run 1. The reply says "I don't think the transfer fee can be refunded", and Gemini quoted it as "transfer fee can't be refunded". That was its only claim, so every claim was dropped and the reply came back Couldn't check, with the send blocked. That fails closed. It's rule D0a as before, not D-060's cap, which is for when only some claims are dropped.

Read it for what it is: 25 cases around one scenario, a first check on generalisation, not proof. Three expectations rest on
conventions the project adopted: "4 days" without "business" means calendar days (H5, now exposed); a signalled change is compared on the
amount only, so a proposed "1 day" doesn't contradict "1 business day" (H3); and the exception supersedes the SOP by naming
its title, even after the SOP is reworded (H7).
