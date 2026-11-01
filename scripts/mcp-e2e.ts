// End-to-end check of the remote MCP endpoint with the official MCP client SDK (D-036), over real HTTP:
//
//   pnpm mcp:e2e                                         against http://127.0.0.1:3100/api/mcp (a local `pnpm start -p 3100`)
//   pnpm mcp:e2e https://suresend-demo.vercel.app/api/mcp
//
// Uses only the demo's canonical replies, so every check_reply replays saved responses and spends no live AI.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = new URL(process.argv[2] ?? "http://127.0.0.1:3100/api/mcp");
const FOUR_DAYS = "Failed transfers are reversed within 4 business days.";
const ONE_DAY = "Failed transfers are reversed within 1 business day.";
const RESTRICTED = /DOC-105|FR-HOLD|CMP-7|Fraud Hold/;

let failures = 0;
const seen: unknown[] = [];
function check(ok: boolean, label: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}

type Structured = Record<string, unknown> & {
  decision?: string;
  suggested_reply?: { text: string; check: string } | null;
  checked_with?: { ai_mode: string };
  governing?: { doc_title: string } | null;
};

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: args })) as CallToolResult;
  seen.push(r);
  return { r, s: (r.structuredContent ?? {}) as Structured };
}

async function main() {
  console.log(`MCP endpoint: ${url.href}`);
  // Count the client's own requests, to prove it doesn't keep reopening a GET stream (405 tells it not to).
  const methods: Record<string, number> = {};
  const counting: typeof fetch = (input, init) => {
    const m = (init?.method ?? "GET").toUpperCase();
    methods[m] = (methods[m] ?? 0) + 1;
    return fetch(input, init);
  };
  const client = new Client({ name: "suresend-e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(url, { fetch: counting }));
  console.log(`server: ${client.getServerVersion()?.name} ${client.getServerVersion()?.version}`);
  const getsBefore = methods.GET ?? 0;
  await new Promise((r) => setTimeout(r, 3000));
  check((methods.GET ?? 0) - getsBefore === 0 && (methods.GET ?? 0) <= 1, `idle 3 s: client made ${methods.GET ?? 0} GET in total, none while idle`);

  const { tools } = await client.listTools();
  check(tools.map((t) => t.name).sort().join(",") === "check_reply,get_doc,list_tickets,propose_doc_fix", `tools: ${tools.map((t) => t.name).join(", ")}`);
  check(tools.every((t) => t.annotations?.readOnlyHint === true), "every tool is read-only");

  const tickets = await call(client, "list_tickets", {});
  const list = (tickets.s.tickets ?? []) as Array<{ id: string; rail: string }>;
  check(list.length === 3, `list_tickets: ${list.map((t) => `${t.id}/${t.rail}`).join(", ")}`);

  const doc = await call(client, "get_doc", { id: "DOC-103" });
  check(!doc.r.isError && doc.s.title === "Instant Rail: Reversal Exception", `get_doc DOC-103: ${String(doc.s.title)}`);
  const hidden = await call(client, "get_doc", { id: "DOC-105" });
  check(hidden.r.isError === true, "get_doc DOC-105: refused like an unknown ID");

  const hold = await call(client, "check_reply", { reply: FOUR_DAYS, ticket_id: "TCK-9001" });
  check(
    hold.s.decision === "Hold" && (hold.s.suggested_reply?.text ?? "").includes("1 business day"),
    `check_reply 4 days on TCK-9001: ${hold.s.decision} · suggestion "${hold.s.suggested_reply?.text}" (${hold.s.suggested_reply?.check}) · governing ${hold.s.governing?.doc_title}`,
  );
  check(hold.s.checked_with?.ai_mode === "saved", `  replayed saved responses (ai_mode ${hold.s.checked_with?.ai_mode})`);

  const ask = await call(client, "check_reply", { reply: FOUR_DAYS, ticket_id: "TCK-9002" });
  check(ask.s.decision === "Ask first" && ask.s.checked_with?.ai_mode === "saved", `check_reply 4 days on TCK-9002: ${ask.s.decision} (ai_mode ${ask.s.checked_with?.ai_mode})`);

  const good = await call(client, "check_reply", { reply: ONE_DAY, ticket_id: "TCK-9001" });
  check(good.s.decision === "Good to send" && good.s.checked_with?.ai_mode === "saved", `check_reply 1 day on TCK-9001: ${good.s.decision} (ai_mode ${good.s.checked_with?.ai_mode})`);

  const fix = await call(client, "propose_doc_fix", { reply: FOUR_DAYS, ticket_id: "TCK-9001" });
  const proposal = fix.s.proposal as { doc_id: string; drafted_by: string; changed_lines: Array<{ after: string }> } | null;
  check(
    proposal?.doc_id === "DOC-101" && fix.s.applied === false && (proposal?.changed_lines[0]?.after ?? "").includes("1 business day"),
    `propose_doc_fix 4 days on TCK-9001: fix to ${proposal?.doc_id} drafted by ${proposal?.drafted_by}, applied ${String(fix.s.applied)}`,
  );
  const after = await call(client, "check_reply", { reply: FOUR_DAYS, ticket_id: "TCK-9001" });
  check(after.s.decision === "Hold" && after.s.governing?.doc_title === "Instant Rail: Reversal Exception", "  nothing applied: the same reply still holds against the unedited docs");

  const bad = await call(client, "check_reply", { reply: "x".repeat(1001) });
  check(bad.r.isError === true, "check_reply over 1,000 characters: refused");

  check(!RESTRICTED.test(JSON.stringify(seen)), "no response mentions DOC-105 or its contents");
  await client.close();

  // The limiter header on the raw endpoint (no keys, IPs or counts in it).
  const raw = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const limiter = raw.headers.get("x-suresend-limiter");
  check(raw.ok && limiter !== null, `raw tools/list: HTTP ${raw.status}, x-suresend-limiter: ${limiter}`);

  // One message per request: a batch is refused before any check runs.
  const batch = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify([1, 2, 3].map((id) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "check_reply", arguments: { reply: FOUR_DAYS } } }))),
  });
  check(batch.status === 400, `raw batch of 3 check_reply calls: HTTP ${batch.status}`);

  for (const method of ["GET", "DELETE"]) {
    const r = await fetch(url, { method, headers: { accept: "application/json, text/event-stream" } });
    check(r.status === 405 && r.headers.get("allow") === "POST", `${method}: HTTP ${r.status}, Allow: ${r.headers.get("allow")}`);
  }

  console.log(failures ? `${failures} FAILED` : "ALL PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
