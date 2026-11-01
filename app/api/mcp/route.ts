// Remote MCP endpoint (D-036): Streamable HTTP, stateless, JSON responses. Add https://<host>/api/mcp to Claude as a custom
// connector. One server and transport per request; each check_reply builds its own deps, so every live check asks the MCP
// budget of the shared limiter.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { routeFixDeps } from "@/lib/check/deps";
import { createSureSendMcpServer } from "@/lib/mcp/server";
import { limiterStatus } from "@/lib/rateLimit";

export const runtime = "nodejs";
// A check that needs live AI (the draft, then a safe reply and its recheck) can take a few seconds on a cold start.
export const maxDuration = 60;

function jsonRpcError(status: number, code: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", "x-suresend-limiter": limiterStatus("mcp"), ...extra },
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(400, -32700, "Parse error: Invalid JSON");
  }
  // One message per request: batching was removed from MCP (2025-06-18), and a batch would otherwise share one request's
  // limiter context. The SDK client never batches.
  if (Array.isArray(body)) return jsonRpcError(400, -32600, "Batch requests are not supported. Send one JSON-RPC message per request.");

  const server = createSureSendMcpServer(() => routeFixDeps(req.headers, "mcp"));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req, { parsedBody: body });
    const headers = new Headers(res.headers);
    headers.set("x-suresend-limiter", limiterStatus("mcp"));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } finally {
    await server.close();
  }
}

/** Stateless: no server-to-client stream and no session to end. 405 tells the SDK client not to retry (QA, D-036). */
function methodNotAllowed(): Response {
  return jsonRpcError(405, -32000, "Method not allowed. This MCP endpoint is stateless: send JSON-RPC messages with POST.", { allow: "POST" });
}

export { methodNotAllowed as GET, methodNotAllowed as DELETE };
