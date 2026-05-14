import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PROXY = resolve(here, "..", "dist", "index.js");
const CONFIG = `${homedir()}/.claude/.mcp-focus.json`;

const client = new Client({ name: "diag", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [
    PROXY,
    "proxy", "--server", "filesystem",
    "--config", CONFIG,
  ],
});
await client.connect(transport);
const { tools } = await client.listTools();
console.log("Got " + tools.length + " tools:");
tools.forEach(t => console.log("  " + t.name));
await client.close();
