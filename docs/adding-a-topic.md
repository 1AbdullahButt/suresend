# Adding a topic

[Back to the README](../README.md)

The rules don't know which topics exist. A topic is one file in [`lib/topics`](../lib/topics), and its values are compared by
a comparator chosen by value kind ([`lib/engine/values.ts`](../lib/engine/values.ts)). `fee_refund` ("is the transfer fee
refunded when a transfer fails?", yes or no, scoped by transfer type like the timeline) was added in
[one commit](https://github.com/1AbdullahButt/suresend/commit/43f1bbf4970f649a4da6a1271e388e4bc88dc2a6) that changes no decision rule:

| File | What changed |
|---|---|
| `lib/topics/feeRefund.ts` | New: the taxonomy entry. Its value kind, wording, extraction examples, detector pattern, headline, reply template |
| `lib/topics/index.ts` | Two lines to register it (the import and the list) |
| `lib/engine/values.ts` | A boolean comparator, the first yes/no value kind |
| `lib/ai/schemas.ts` | The yes/no value's JSON shape, and the schema version bumped |
| `lib/ai/prompts.ts` | The prompt version bumped (the prompt text comes from the topic file) |

The rule files (`decide.ts`, `resolve.ts`, `standing.ts`, `applicability.ts`, `severity.ts`) are not in that commit.
[`lib/engine/topicAgnostic.test.ts`](../lib/engine/topicAgnostic.test.ts) fails if a rule file names a topic or reads a value's
amount, unit or flag itself.

The groundwork came first. A [refactor](https://github.com/1AbdullahButt/suresend/commit/4a411e55963564e740c8703e1d745fa45b2633ad) moved the duration comparison into the registry unchanged and
made the rules ask the registries; every saved decision stayed the same. Then suggested replies and the UI learned to
handle several claims (the engine already decided per claim), amounts on other topics got a value (so they're outside
coverage, not missed), and values got their topic's wording.

QA then found that the refactor had generalised the "nothing found" net too coarsely: one claim on any topic switched it
off for the others, so a fee claim could let a missed 4-day promise through as Good to send.
[The fix](https://github.com/1AbdullahButt/suresend/commit/576a6b3b50c916eed89e781c9118963c0fd50c50) makes the net per topic, as the spec states it for one topic. That was a logic correction to how
the rules were generalised, in `decide.ts`, and nothing in it names a topic. With one topic it's the old rule exactly. A
second QA round found the same gap in one more place: a claim whose span was the whole sentence still vouched for the
other topic in that sentence. [That fix](https://github.com/1AbdullahButt/suresend/commit/d8a9d61da69be3080ec0c8725f3155d86230bda5) closes it, again in `decide.ts` and again naming no topic.

**Scope is one axis today: the transfer type (`rail` in the code).** A claim says which type it applies to (`instant`, `standard` or `any`), a ticket
says which type it's on, and [`applicability.ts`](../lib/engine/applicability.ts) compares the two. A new topic reuses that axis. A topic
that varies by plan tier or country needs more than a topic file:

- a new field on a claim's `scope`, in the schema and the extraction prompt (both versions bumped), and on the ticket;
- `applicability.ts` comparing every axis, so a claim applies only when all of them match, and "unknown" works per axis;
- `decide.ts` and `resolve.ts` reading "the scope" where they read `rail` today: D1 (ask first when the answer depends on what's
  unknown) and D6 (the one specific claim wins);
- the wording that names the transfer type (headlines, topic sentences, the Ask-first template) and its picker in the UI.

That's a change to the rules' input, unlike a new topic, and nothing here has been built for it.

So the next topic that fits this axis needs a file in `lib/topics` with its examples, two lines to register it, and the prompt and schema
versions bumped. Only a new kind of value (not a duration, an amount or a yes/no) also needs a comparator in `values.ts`
and its JSON shape in `schemas.ts`. Its tests, golden cases and saved responses come on top.
