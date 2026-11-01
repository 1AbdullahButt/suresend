// Builder-owned tests for the MCP tools as plain functions (D-036), on the locked extraction fixtures (read-only).
import { describe, expect, it } from "vitest";
import { CANONICAL_DRAFT, ONE_DAY_DRAFT, fixtureDeps } from "../../tests/helpers/fixtures";
import { checkReply, getDoc, listTickets, visibleDocIds } from "./tools";

const RESTRICTED = /DOC-105|FR-HOLD|CMP-7|Fraud Hold/;

describe("check_reply", () => {
  it("a 4-day reply on TCK-9001 is Hold, with a checked 1-day suggestion and the exception as the governing doc", async () => {
    const { deps } = fixtureDeps();
    const out = await checkReply({ reply: CANONICAL_DRAFT, ticket_id: "TCK-9001" }, deps);
    if (!out.ok) throw new Error(out.error);
    const r = out.value;
    expect(r.decision).toBe("Hold");
    expect(r.engine_decision).toBe("HOLD");
    expect(r.reason_code).toBe("CONTRADICTS_GOVERNING");
    expect(r.suggested_reply?.text).toContain("1 business day");
    expect(r.suggested_reply?.check).toBe("Good to send");
    expect(r.governing).toMatchObject({ doc_id: "DOC-103", doc_title: "Instant Rail: Reversal Exception", value: "1 business day" });
    expect(r.next_step).toBe("Don't send this reply. Send suggested_reply instead (it passed the same check), or ask a human.");
    expect(r.rules_that_mattered.some((x) => x.startsWith("D5 (fired)"))).toBe(true);
    expect(r.ticket).toEqual({ id: "TCK-9001", rail: "instant" });
  });

  it("the correct 1-day reply on TCK-9001 is Good to send, with no suggestion", async () => {
    const { deps } = fixtureDeps();
    const out = await checkReply({ reply: ONE_DAY_DRAFT, ticket_id: "TCK-9001" }, deps);
    if (!out.ok) throw new Error(out.error);
    expect(out.value.decision).toBe("Good to send");
    expect(out.value.suggested_reply).toBeNull();
  });

  it("with no ticket and no rail, the rail is unknown, so a 4-day promise is Ask first with a timeline-free holding reply", async () => {
    const { deps } = fixtureDeps();
    const out = await checkReply({ reply: CANONICAL_DRAFT }, deps);
    if (!out.ok) throw new Error(out.error);
    expect(out.value.decision).toBe("Ask first");
    expect(out.value.ticket).toEqual({ id: null, rail: "unknown" });
    expect(out.value.next_step).toMatch(/depends on the payment rail/);
    expect(out.value.suggested_reply?.text).not.toMatch(/\d|\bdays?\b|\bhours?\b/i);
  });

  it("a rail overrides the ticket's: TCK-9001 checked as standard allows 4 business days", async () => {
    const { deps } = fixtureDeps();
    const out = await checkReply({ reply: CANONICAL_DRAFT, ticket_id: "TCK-9001", rail: "standard" }, deps);
    if (!out.ok) throw new Error(out.error);
    expect(out.value.decision).toBe("Good to send");
    expect(out.value.ticket).toEqual({ id: "TCK-9001", rail: "standard" });
  });

  it("on Hold, tells the agent to show a human first when the suggested reply itself comes back Double-check", async () => {
    // SRC-202 unreadable: the Hold stands, but the 1-day suggestion is capped at CAUTION (SOURCE_UNREAD).
    const { deps } = fixtureDeps({ failSources: ["SRC-202"] });
    const out = await checkReply({ reply: CANONICAL_DRAFT, ticket_id: "TCK-9001" }, deps);
    if (!out.ok) throw new Error(out.error);
    expect(out.value.decision).toBe("Hold");
    expect(out.value.suggested_reply?.check).toMatch(/^Double-check: /);
    expect(out.value.next_step).toMatch(/show it to a human before sending/);
    expect(out.value.next_step).not.toMatch(/Send suggested_reply instead/);
  });

  it("never sends DOC-105 to the AI and never mentions it in the result", async () => {
    const { deps, extractSource } = fixtureDeps();
    const out = await checkReply({ reply: CANONICAL_DRAFT, ticket_id: "TCK-9001" }, deps);
    expect(extractSource.mock.calls.map(([s]) => s.id)).not.toContain("DOC-105");
    expect(JSON.stringify(out)).not.toMatch(RESTRICTED);
  });

  it("rejects bad input with the same validation and caps as /api/check", async () => {
    const { deps } = fixtureDeps();
    const empty = await checkReply({ reply: "   " }, deps);
    expect(empty).toEqual({ ok: false, error: "Invalid input: reply: Draft is empty." });
    const long = await checkReply({ reply: "x".repeat(1001) }, deps);
    expect(long.ok).toBe(false);
    const ticket = await checkReply({ reply: CANONICAL_DRAFT, ticket_id: "TCK-0000" }, deps);
    expect(ticket).toEqual({ ok: false, error: "Unknown ticket. Tickets: TCK-9001, TCK-9002, TCK-9003 (see list_tickets)." });
  });

  it("reports Couldn't check, not a pass, when the reply can't be read", async () => {
    const { deps } = fixtureDeps({ failDraft: true });
    const out = await checkReply({ reply: CANONICAL_DRAFT, ticket_id: "TCK-9001" }, deps);
    if (!out.ok) throw new Error(out.error);
    expect(out.value.decision).toBe("Couldn't check");
    expect(out.value.next_step).toMatch(/don't send a timeline/);
  });
});

describe("list_tickets", () => {
  it("returns the 3 tickets with customer message and rail", () => {
    const { tickets } = listTickets();
    expect(tickets.map((t) => [t.id, t.rail])).toEqual([
      ["TCK-9001", "instant"],
      ["TCK-9002", "unknown"],
      ["TCK-9003", "standard"],
    ]);
    expect(tickets.every((t) => t.customer_message.length > 10)).toBe(true);
  });
});

describe("get_doc", () => {
  it("returns title, signals and text for a visible doc", () => {
    const out = getDoc("DOC-103");
    if (!out.ok) throw new Error(out.error);
    expect(out.value).toMatchObject({ id: "DOC-103", title: "Instant Rail: Reversal Exception", verification: "verified", flagged_outdated: false });
    expect(out.value.text).toContain("1 business day");
  });

  it("never returns DOC-105, and answers it exactly like an unknown ID", () => {
    const hidden = getDoc("DOC-105");
    const unknown = getDoc("DOC-999");
    expect(hidden.ok).toBe(false);
    expect(hidden).toEqual(unknown);
    expect(JSON.stringify(hidden)).not.toMatch(RESTRICTED);
    expect(visibleDocIds()).toEqual(["DOC-101", "DOC-103", "SRC-202", "DOC-104"]);
  });
});
