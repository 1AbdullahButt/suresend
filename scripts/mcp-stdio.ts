// SureSend MCP server over stdio (D-036), for Claude Code or Claude Desktop:
//
//   claude mcp add suresend-local -- pnpm --dir /path/to/suresend exec tsx scripts/mcp-stdio.ts
//
// Start it with `pnpm --dir <project>` as above: tsx reads the project's tsconfig (the "@/" import aliases) from the
// directory it starts in. Seed docs and saved responses are read relative to the project root, and some of those paths
// are fixed when modules load, so this also moves to the root before loading the server.
import path from "node:path";

process.chdir(path.resolve(__dirname, ".."));

import("@/lib/mcp/stdio")
  .then(({ runStdio }) => runStdio())
  .catch((e: unknown) => {
    console.error("[suresend] MCP stdio server failed to start:", e);
    process.exit(1);
  });
