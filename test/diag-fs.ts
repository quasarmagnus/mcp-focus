import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "diag", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [
    "d:\\Rye\\claude_code\\projects\\mcp-focus\\dist\\index.js",
    "proxy", "--server", "filesystem",
    "--config", "C:\\Users\\rmgca\\.claude\\.mcp-focus.json",
  ],
});
await client.connect(transport);
const { tools } = await client.listTools();
console.log("Got " + tools.length + " tools:");
tools.forEach(t => console.log("  " + t.name));
await client.close();
