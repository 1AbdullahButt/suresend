// Builder-owned (D-036): the real MCP server over an in-memory transport, so the registration, schemas and descriptions
// are tested as a client sees them. Fixture deps; no network.
import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CANONICAL_DRAFT, fixtureDeps } from "../../tests/helpers/fixtures";
import { createSureSendMcpServer } from "./server";

async function connected(depsFor?: () => ReturnType<typeof fixtureDeps>["deps"]) {
  const { deps } = fixtureDeps();
  const server = createSureSendMcpServer(depsFor ?? (() => deps));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

const textOf = (r: CallToolResult) => r.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");

describe("SureSend MCP server", () => {
  it("lists 3 read-only tools, and tells agents to check before sending", async () => {
    const client = await connected();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["check_reply", "get_doc", "list_tickets"]);
    for (const t of tools) expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    const check = tools.find((t) => t.name === "check_reply")!;
    expect(check.description).toMatch(/BEFORE you send it/);
    expect(check.description).toMatch(/Hold: .*suggested_reply/);
    expect(check.description).toMatch(/no auth/i);
    expect(check.outputSchema).toBeDefined();
    expect(client.getInstructions()).toMatch(/call check_reply/);
  });

  it("check_reply: a 4-day reply on TCK-9001 holds, with structured content and a readable text", async () => {
    const client = await connected();
    const r = (await client.callTool({ name: "check_reply", arguments: { reply: CANONICAL_DRAFT, ticket_id: "TCK-9001" } })) as CallToolResult;
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ decision: "Hold", engine_decision: "HOLD" });
    expect((r.structuredContent as { suggested_reply: { text: string } }).suggested_reply.text).toContain("1 business day");
    expect(textOf(r)).toMatch(/^SureSend: Hold \(HOLD, CONTRADICTS_GOVERNING\)/);
  });

  it("builds fresh deps for every check_reply, so each check asks the live-AI limiter for itself", async () => {
    const { deps } = fixtureDeps();
    const depsFor = vi.fn(() => deps);
    const client = await connected(depsFor);
    expect(depsFor).not.toHaveBeenCalled();
    for (let i = 0; i < 3; i++) await client.callTool({ name: "check_reply", arguments: { reply: CANONICAL_DRAFT, ticket_id: "TCK-9001" } });
    await client.callTool({ name: "list_tickets", arguments: {} });
    expect(depsFor).toHaveBeenCalledTimes(3);
  });

  it("check_reply: invalid arguments are an error result, not a crash", async () => {
    const client = await connected();
    const r = (await client.callTool({ name: "check_reply", arguments: { reply: CANONICAL_DRAFT, rail: "express" } })) as CallToolResult;
    expect(r.isError).toBe(true);
  });

  it("list_tickets and get_doc work, and DOC-105 never comes back", async () => {
    const client = await connected();
    const tickets = (await client.callTool({ name: "list_tickets", arguments: {} })) as CallToolResult;
    expect((tickets.structuredContent as { tickets: unknown[] }).tickets).toHaveLength(3);
    const doc = (await client.callTool({ name: "get_doc", arguments: { id: "DOC-101" } })) as CallToolResult;
    expect(doc.structuredContent).toMatchObject({ id: "DOC-101", title: "Outgoing Transfers: Reversal SOP" });
    const hidden = (await client.callTool({ name: "get_doc", arguments: { id: "DOC-105" } })) as CallToolResult;
    expect(hidden.isError).toBe(true);
    expect(JSON.stringify([tickets, doc, hidden])).not.toMatch(/DOC-105|FR-HOLD|CMP-7|Fraud Hold/);
  });
});
