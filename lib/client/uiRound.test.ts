// UI round, 2026-11-09 (D-065): the copy behind items 3 and 5, on the AI's saved readings of the golden cases. The page itself
// (Reset with no refresh, the wrapping tag, the counter that opens the list) is checked in a browser by scripts/ui-round-check.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { runCheck } from "@/lib/check/runCheck";
import { shortDate } from "@/lib/client/format";
import { emptyMetrics, loadMetrics, recordCheck } from "@/lib/client/metrics";
import { flagReason, summarize } from "@/lib/client/outcome";
import type { CheckInput, CheckResult } from "@/lib/engine/types";
import { variantOverrides, type VariantId } from "@/lib/workspace/variants";

const golden = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "golden.json"), "utf8")) as {
  decisionTime: string;
  saveTime: string;
  cases: Array<{ id: string; ticketId: string; rail: CheckInput["rail"]; draft: string; variant?: VariantId | null }>;
};
const deps = aiDeps(createRuntime({ liveGate: async () => false }));

async function run(id: string): Promise<{ result: CheckResult; rail: CheckInput["rail"] }> {
  const c = golden.cases.find((x) => x.id === id);
  if (!c) throw new Error(`no golden case ${id}`);
  const overrides = c.variant ? variantOverrides(c.variant, golden.saveTime) : [];
  const result = await runCheck({ ticketId: c.ticketId, rail: c.rail, draft: c.draft, role: "support_agent", overrides, decisionTime: golden.decisionTime }, deps);
  return { result, rail: c.rail };
}

/** The evidence that signals the change, as the sentence should name it. */
function signal(result: CheckResult) {
  const ev = result.claims.flatMap((c) => c.evidence).find((e) => (e.standing === "PROPOSAL" || e.standing === "NOT_YET_EFFECTIVE") && e.relation === "contradicts");
  if (!ev) throw new Error("no signal");
  return ev;
}

describe('item 3: "Matches today, changing soon" names where the change comes from', () => {
  it("a Slack proposal: its channel and date, from the source itself", async () => {
    const { result, rail } = await run("B4");
    expect(result.reasonCode).toBe("CHANGE_SIGNALLED");
    const s = summarize(result, rail);
    expect(s.headline).toBe("Matches today, changing soon");
    expect(s.sentence).toBe("A Slack note in #ops-announcements (Oct 24) proposes 1 day, pending sign-off.");
  });

  it("nothing is hard-coded: another channel and date come through as they are", async () => {
    const { result, rail } = await run("B4");
    const edited = structuredClone(result);
    const ev = signal(edited);
    ev.source.title = "Slack #payments-ops · 2026-11-02";
    ev.source.signals.updatedAt = "2026-11-02";
    expect(summarize(edited, rail).sentence).toBe("A Slack note in #payments-ops (Nov 2) proposes 1 day, pending sign-off.");
    ev.source.title = "Slack DM with Matteo";
    expect(summarize(edited, rail).sentence).toBe("A Slack note (“Slack DM with Matteo”, Nov 2) proposes 1 day, pending sign-off.");
  });

  it("a doc turned proposal names the doc by its title and the date it changed", async () => {
    const { result, rail } = await run("B2");
    const ev = signal(result);
    expect(summarize(result, rail).sentence).toBe(`${ev.source.title} (${shortDate(ev.source.signals.updatedAt)}) proposes 1 business day, pending sign-off.`);
  });

  it("a change not in force yet says when it starts", async () => {
    const { result, rail } = await run("B5");
    const ev = signal(result);
    expect(summarize(result, rail).sentence).toBe(
      `${ev.source.title} (${shortDate(ev.source.signals.updatedAt)}) changes this to 1 business day from ${shortDate(ev.claim.effectiveFrom)}. It isn't in force yet.`,
    );
  });
});

describe("item 5: each flagged reply carries its reason in one line", () => {
  it.each([
    ["canon-9001", "Instant transfer: docs say 1 business day, reply said 4"],
    ["B1", "Instant transfer: docs say 2 business days, reply said 4"],
    ["fee-wrong", "Fee: docs say refunded, reply said not refunded"],
    ["fee-scoped-F1", "Instant transfer fee: docs say not refunded, reply said refunded"],
    ["B4", "Matches today, changing soon"],
    ["canon-9002", "Depends on the transfer"],
    ["B3", "Your docs disagree"],
  ])("%s → %s", async (id, line) => {
    const { result, rail } = await run(id);
    expect(flagReason(result, rail)).toBe(line);
  });

  it("recordCheck stores it with the flag; a flag saved before it existed still loads", async () => {
    const { result, rail } = await run("canon-9001");
    const m = recordCheck(emptyMetrics(), "TCK-9001", "Léa K.", "Failed transfers are reversed within 4 business days.", result, "2026-11-09T10:00:00Z", flagReason(result, rail));
    expect(m.flags[0]?.reason).toBe("Instant transfer: docs say 1 business day, reply said 4");
    expect(m.flags[0]?.ticketId).toBe("TCK-9001");
    const old = { ...m.flags[0]!, reason: undefined };
    localStorageStub({ "suresend.metrics.v2": JSON.stringify({ ...m, flags: [old] }) });
    expect(loadMetrics().flags[0]?.reason).toBeUndefined();
    expect(loadMetrics().flags[0]?.draft).toBe("Failed transfers are reversed within 4 business days.");
  });
});

/** A minimal window.localStorage for the node test environment. */
function localStorageStub(items: Record<string, string>) {
  const store = new Map(Object.entries(items));
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
}
