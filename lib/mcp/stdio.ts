// SureSend MCP over stdio (D-036) for Claude Code and Claude Desktop: the same server and tools as /api/mcp.
// Without AI keys it runs on saved responses (the demo's canonical replies); with GROQ_API_KEY in .env.local it can
// also check new wording live. Nothing may be printed to stdout except MCP messages, so logs go to stderr.
import { loadEnvConfig } from "@next/env";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { aiDeps, createRuntime } from "@/lib/ai/aiDeps";
import { allowLiveCheck } from "@/lib/rateLimit";
import { createSureSendMcpServer } from "./server";

export async function runStdio(): Promise<void> {
  loadEnvConfig(process.cwd(), false, { info: () => {}, error: (...args: unknown[]) => console.error(...args) });
  // A fresh runtime per check, so the MCP budget is asked for every live check, not once per process.
  const depsFor = () => aiDeps(createRuntime({ liveGate: () => allowLiveCheck("stdio", "mcp") }));
  await createSureSendMcpServer(depsFor).connect(new StdioServerTransport());
  console.error("[suresend] MCP server on stdio: check_reply, list_tickets, get_doc");
}
