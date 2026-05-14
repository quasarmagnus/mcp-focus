import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PROXY = resolve(here, "..", "dist", "index.js");
const CONFIG = `${homedir()}/.claude/.mcp-focus.json`;

let passed = 0;
let failed = 0;

function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) { console.log(`  ❌ ${label}: ${detail}`); failed++; }

async function makeClient(server) {
  const client = new Client({ name: "test", version: "1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: [PROXY, "proxy", "--server", server, "--config", CONFIG],
    env: { ...process.env },
  });
  await client.connect(transport);
  return { client, transport };
}

// ── helpers ────────────────────────────────────────────────────────────────

function getConfig() {
  return JSON.parse(readFileSync(CONFIG, "utf8"));
}

function setToolState(server, tool, state) {
  const cfg = getConfig();
  cfg.servers[server].tools[tool] = state;
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}

function restoreToolState(server, tool, state) {
  setToolState(server, tool, state);
}

// ── Test suite ─────────────────────────────────────────────────────────────

console.log("\nmcp-focus functional test\n");

// ── 1. TAVILY proxy: hidden tool absent, stub tool present ─────────────────
console.log("1. Tavily — hidden + stub filtering");
{
  // Ensure known states: tavily_search=hidden, tavily_extract=stub(false)
  setToolState("tavily", "tavily_search", "hidden");
  setToolState("tavily", "tavily_extract", false);

  const { client } = await makeClient("tavily");
  const { tools } = await client.listTools();

  const names = tools.map(t => t.name);
  if (!names.includes("tavily_search")) ok("hidden tool absent from list");
  else fail("hidden tool absent from list", "tavily_search still present");

  if (names.includes("tavily_extract")) ok("stub tool present in list");
  else fail("stub tool present in list", "tavily_extract missing");

  const stubTool = tools.find(t => t.name === "tavily_extract");
  if (stubTool?.description?.includes("[mcp-focus]")) ok("stub tool has stub description");
  else fail("stub tool has stub description", stubTool?.description);

  // Calling a stub tool should be blocked
  const result = await client.callTool({ name: "tavily_extract", arguments: { urls: ["https://example.com"] } });
  if (result.isError) ok("stub tool call blocked with error");
  else fail("stub tool call blocked", "call succeeded unexpectedly");

  await client.close();
}

// ── 2. TAVILY proxy: enabled tool works ────────────────────────────────────
console.log("\n2. Tavily — enabled tool passes through");
{
  setToolState("tavily", "tavily_search", true);
  setToolState("tavily", "tavily_extract", true);

  const { client } = await makeClient("tavily");
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name);

  if (names.includes("tavily_search")) ok("tavily_search visible when enabled");
  else fail("tavily_search visible when enabled", "missing from list");

  if (names.includes("tavily_extract")) ok("tavily_extract visible when enabled");
  else fail("tavily_extract visible when enabled", "missing from list");

  const st = tools.find(t => t.name === "tavily_search");
  if (!st?.description?.includes("[mcp-focus]")) ok("enabled tool has real description");
  else fail("enabled tool has real description", "got stub description");

  // Restore to original states
  setToolState("tavily", "tavily_search", "hidden");
  setToolState("tavily", "tavily_extract", false);

  await client.close();
}

// ── 3. FILESYSTEM proxy: all enabled, all 14 tools returned ───────────────
console.log("\n3. Filesystem — all tools enabled");
{
  const { client } = await makeClient("filesystem");
  const { tools } = await client.listTools();

  if (tools.length >= 13) ok(`all tools returned (${tools.length} tools)`);
  else fail("all tools returned", `only ${tools.length} tools`);

  const allEnabled = tools.every(t => !t.description?.includes("[mcp-focus]"));
  if (allEnabled) ok("all tools have real descriptions (not stubs)");
  else fail("all tools have real descriptions", "some have stub descriptions");

  await client.close();
}

// ── 4. FILESYSTEM: disable one tool, verify stub appears ──────────────────
console.log("\n4. Filesystem — stub one tool (write_file)");
{
  setToolState("filesystem", "write_file", false);

  const { client } = await makeClient("filesystem");
  const { tools } = await client.listTools();

  const wf = tools.find(t => t.name === "write_file");
  if (wf) ok("write_file present in list (stub visible)");
  else fail("write_file present in list", "missing — should show as stub");

  if (wf?.description?.includes("[mcp-focus]")) ok("write_file has stub description");
  else fail("write_file has stub description", wf?.description);

  const result = await client.callTool({ name: "write_file", arguments: { path: "/tmp/test.txt", content: "hi" } });
  if (result.isError) ok("stub write_file call blocked");
  else fail("stub write_file call blocked", "call succeeded unexpectedly");

  restoreToolState("filesystem", "write_file", true);
  await client.close();
}

// ── 5. FILESYSTEM: hide one tool, verify absent ───────────────────────────
console.log("\n5. Filesystem — hide one tool (write_file)");
{
  setToolState("filesystem", "write_file", "hidden");

  const { client } = await makeClient("filesystem");
  const { tools } = await client.listTools();

  const wf = tools.find(t => t.name === "write_file");
  if (!wf) ok("write_file absent from list (hidden)");
  else fail("write_file absent from list", "still present");

  restoreToolState("filesystem", "write_file", true);
  await client.close();
}

// ── 6. Hot reload ─────────────────────────────────────────────────────────
console.log("\n6. Hot reload — config change picked up within 500ms");
{
  setToolState("filesystem", "write_file", true);

  const { client } = await makeClient("filesystem");

  // Verify write_file is visible first
  const before = await client.listTools();
  const beforeNames = before.tools.map(t => t.name);
  if (beforeNames.includes("write_file")) ok("write_file visible before config change");
  else fail("write_file visible before config change", "missing");

  // Change config while proxy is running
  setToolState("filesystem", "write_file", "hidden");

  // Wait for hot reload (~300ms)
  await new Promise(r => setTimeout(r, 600));

  const after = await client.listTools();
  const afterNames = after.tools.map(t => t.name);
  if (!afterNames.includes("write_file")) ok("write_file hidden after config change (hot reload works)");
  else fail("hot reload", "write_file still visible after 600ms");

  restoreToolState("filesystem", "write_file", true);
  await client.close();
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log("All tests passed ✅");
else console.log("Some tests failed ❌ — see above");
