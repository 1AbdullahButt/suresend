// Builder-owned (D-036): the /api/mcp route itself. One JSON-RPC message per POST (a batch would share one request's
// limiter context), and GET/DELETE answer 405 so MCP clients don't keep reopening a stream. No network.
import { describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/api/mcp/route";

const URL_ = "http://localhost/api/mcp";
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

const post = (body: string) => POST(new Request(URL_, { method: "POST", headers: HEADERS, body }));
const rpc = (id: number, method: string, params: Record<string, unknown> = {}) => ({ jsonrpc: "2.0", id, method, params });

describe("/api/mcp", () => {
  it("answers a single tools/list with the 3 tools", async () => {
    const res = await post(JSON.stringify(rpc(1, "tools/list")));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { tools: Array<{ name: string }> } };
    expect(json.result.tools.map((t) => t.name).sort()).toEqual(["check_reply", "get_doc", "list_tickets"]);
    expect(res.headers.get("x-suresend-limiter")).toBeTruthy();
  });

  it("rejects a JSON-RPC batch before it reaches the server, so no check can share another's limiter unit", async () => {
    const call = (id: number) => rpc(id, "tools/call", { name: "check_reply", arguments: { reply: "Refunds take 4 business days.", ticket_id: "TCK-9001" } });
    const res = await post(JSON.stringify([call(1), call(2), call(3), call(4), call(5)]));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32600 }, id: null });
  });

  it("answers malformed JSON with a JSON-RPC parse error", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32700 } });
  });

  it("answers GET and DELETE with 405 and Allow: POST (stateless: no stream, no session)", async () => {
    for (const handler of [GET, DELETE]) {
      const res = handler();
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });
});
