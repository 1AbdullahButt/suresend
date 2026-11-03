// Phase 12, part A (D-053), written before the change and recorded failing in PROGRESS.md: European names, euros, and "transfer" where
// the demo said "rail". The personas, each ticket's rail and every policy value stay exactly as they were.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ticketMeta } from "@/components/inbox/ticketMeta";
import { PRESETS } from "./presets";
import { seedSources, seedTickets } from "./seed";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8").replace(/\r\n/g, "\n");

describe("the seed", () => {
  it("has the new names on the same personas and rails", () => {
    expect(seedTickets().map((t) => [t.id, t.customer, t.rail])).toEqual([
      ["TCK-9001", "Léa K.", "instant"],
      ["TCK-9002", "Lukas R.", "unknown"],
      ["TCK-9003", "Sofia S.", "standard"],
    ]);
  });

  it("keeps every message and draft, word for word", () => {
    expect(seedTickets().map((t) => t.message)).toEqual([
      "My transfer to another bank failed yesterday. When do I get my money back?",
      "Transfer failed, money gone from wallet. when will it come back??",
      "Hi, my bank transfer failed this morning. How long until the refund?",
    ]);
    expect(new Set(seedTickets().map((t) => t.draft))).toEqual(new Set(["Failed transfers are reversed within 4 business days."]));
  });

  it("keeps the policy values", () => {
    const body = (id: string) => seedSources().find((s) => s.id === id)!.body;
    expect(body("DOC-101")).toContain("within 4 business days");
    expect(body("DOC-103")).toContain("within 1 business day");
    expect(body("DOC-104")).toContain("refunded in 5-7 days");
    expect(body("SRC-202")).toContain("move instant reversals to 1 day");
    expect(body("DOC-105")).toContain("do not share any reversal timeline");
  });

  it('says "transfer", not "rail", in every doc and title', () => {
    for (const s of seedSources()) {
      expect(s.body, s.id).not.toMatch(/\brails?\b|-rail\b/i);
      expect(s.title, s.id).not.toMatch(/\brails?\b/i);
    }
    expect(seedSources().find((s) => s.id === "DOC-103")!.title).toBe("Instant Transfers: Reversal Exception");
  });

  it("matches SPEC Appendix A, byte for byte", () => {
    const spec = read("SPEC.md");
    const appendix = spec.slice(spec.indexOf("## Appendix A"), spec.indexOf("## Appendix B"));
    for (const s of seedSources()) {
      const at = appendix.indexOf(`**${s.id} ·`);
      const start = appendix.indexOf("\n", appendix.indexOf("```", at)) + 1;
      expect(`${appendix.slice(start, appendix.indexOf("\n```", start))}\n`, s.id).toBe(s.body);
    }
    expect(appendix).toContain("**DOC-103 · Instant Transfers: Reversal Exception**");
    for (const t of seedTickets()) expect(appendix).toContain(`- ${t.id} · ${t.customer} · rail \`${t.rail}\` · "${t.message}"`);
  });
});

describe("the money is in euros", () => {
  it("on every ticket", () => {
    expect(ticketMeta("TCK-9001").transfer).toBe("TX-48213 · €250");
    expect(ticketMeta("TCK-9002").transfer).toBe("TX-48197 · €125");
    expect(ticketMeta("TCK-9003").transfer).toBe("TX-48150 · €400");
  });

  it("in the preset about a fee amount", () => {
    expect(PRESETS["TCK-9003"]!.find((p) => p.label.startsWith("A fee amount"))!.draft).toBe("There's a €2 fee on every transfer.");
  });
});

describe("what people read outside the app", () => {
  const OLD = /Ayesha|Usman|\bHina\b|\bPKR\b|Rs \d|instant[- ]rail|standard[- ]rail|Instant Rail|\ball rails\b|payment rail/i;

  it.each(["README.md", "docs/MCP_DEMO.md", "e2e/demo.spec.ts", "evals/golden.json", "evals/heldout.json", "scripts/mcp-e2e.ts", "scripts/record-demo.ts", "scripts/ui-audit.ts"])("%s has no old name, currency or rail wording", (file) => {
    const lines = read(file).split("\n").filter((l) => OLD.test(l));
    expect(lines).toEqual([]);
  });
});
