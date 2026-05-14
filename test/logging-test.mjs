import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PROXY = resolve(here, "..", "dist", "index.js");
const CONFIG = `${homedir()}/.claude/.mcp-focus.json`;
const LOG_DIR = join(dirname(CONFIG), "mcp-focus-logs");
const TODAY = new Date().toISOString().slice(0, 10);
const LOG_FILE = join(LOG_DIR, `filesystem-${TODAY}.jsonl`);

let passed = 0;
let failed = 0;
function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) { console.log(`  ❌ ${label}: ${detail}`); failed++; }

function getConfig() { return JSON.parse(readFileSync(CONFIG, "utf8")); }
function setSettings(settings) {
  const cfg = getConfig();
  cfg.settings = { ...cfg.settings, ...settings };
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}

async function makeClient(server) {
  const client = new Client({ name: "test", version: "1.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: [PROXY, "proxy", "--server", server, "--config", CONFIG],
    env: { ...process.env },
  });
  await client.connect(transport);
  return { client };
}

function readLog() {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
}

function clearLog() {
  if (existsSync(LOG_FILE)) unlinkSync(LOG_FILE);
}

console.log("\nmcp-focus logging test\n");

// Save original settings
const originalSettings = getConfig().settings;

// ── 1. Logging disabled — no log file created ─────────────────────────────
console.log("1. Logging disabled");
{
  setSettings({ logging: false, logArgs: false });
  clearLog();

  const { client } = await makeClient("filesystem");
  await client.listTools();
  await client.callTool({ name: "list_allowed_directories", arguments: {} });
  await client.close();

  await new Promise(r => setTimeout(r, 200));

  if (!existsSync(LOG_FILE)) ok("no log file created when logging=false");
  else fail("no log file when disabled", "log file exists but shouldn't");
}

// ── 2. Logging enabled — log file created with correct events ─────────────
console.log("\n2. Logging enabled");
{
  setSettings({ logging: true, logArgs: false });
  clearLog();

  const { client } = await makeClient("filesystem");
  await client.listTools();
  await client.callTool({ name: "list_allowed_directories", arguments: {} });
  await client.close();

  await new Promise(r => setTimeout(r, 200));

  const lines = readLog();
  if (lines.length > 0) ok(`log file created (${lines.length} entries)`);
  else fail("log file created", "file empty or missing");

  const proxyStart = lines.find(l => l.event === "proxy_start");
  if (proxyStart) ok(`proxy_start event logged (server: ${proxyStart.server})`);
  else fail("proxy_start logged", "event missing");

  const toolsList = lines.find(l => l.event === "tools_list");
  if (toolsList) ok(`tools_list event logged (upstream: ${toolsList.upstream}, returned: ${toolsList.returned})`);
  else fail("tools_list logged", "event missing");

  const toolsCall = lines.find(l => l.event === "tools_call");
  if (toolsCall) ok(`tools_call event logged (tool: ${toolsCall.tool}, status: ${toolsCall.status}, ms: ${toolsCall.ms})`);
  else fail("tools_call logged", "event missing");

  const hasTs = lines.every(l => l.ts && l.ts.includes("T"));
  if (hasTs) ok("all entries have ISO timestamp");
  else fail("timestamps present", "some entries missing ts");
}

// ── 3. logArgs=false — args not logged ────────────────────────────────────
console.log("\n3. logArgs=false — arguments not included");
{
  setSettings({ logging: true, logArgs: false });
  clearLog();

  const { client } = await makeClient("filesystem");
  await client.listTools();
  await client.callTool({ name: "list_directory", arguments: { path: homedir() } });
  await client.close();

  await new Promise(r => setTimeout(r, 200));

  const lines = readLog();
  const call = lines.find(l => l.event === "tools_call" && l.tool === "list_directory");
  if (call && !call.args) ok("tool call logged without args (logArgs=false)");
  else if (!call) fail("logArgs=false", "no tools_call entry found");
  else fail("logArgs=false", "args field present when it shouldn't be");
}

// ── 4. logArgs=true — args logged ─────────────────────────────────────────
console.log("\n4. logArgs=true — arguments included");
{
  setSettings({ logging: true, logArgs: true });
  clearLog();

  const { client } = await makeClient("filesystem");
  await client.listTools();
  await client.callTool({ name: "list_directory", arguments: { path: homedir() } });
  await client.close();

  await new Promise(r => setTimeout(r, 200));

  const lines = readLog();
  const call = lines.find(l => l.event === "tools_call" && l.tool === "list_directory");
  if (call?.args?.path) ok(`args logged (path: ${call.args.path})`);
  else fail("logArgs=true", "args.path missing from log entry");
}

// ── 5. Blocked call logged with reason ────────────────────────────────────
console.log("\n5. Blocked/stub call logged with reason");
{
  setSettings({ logging: true, logArgs: false });
  clearLog();

  // Set write_file to stub (false)
  const cfg = getConfig();
  cfg.servers.filesystem.tools.write_file = false;
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));

  const { client } = await makeClient("filesystem");
  await client.listTools();
  await client.callTool({ name: "write_file", arguments: { path: "/tmp/x.txt", content: "test" } });
  await client.close();

  await new Promise(r => setTimeout(r, 200));

  const lines = readLog();
  const blocked = lines.find(l => l.event === "tools_call" && l.status === "blocked");
  if (blocked) ok(`blocked call logged (tool: ${blocked.tool}, reason: ${blocked.reason})`);
  else fail("blocked call logged", "no blocked entry found");

  // Restore
  cfg.servers.filesystem.tools.write_file = true;
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}

// ── Restore original settings ──────────────────────────────────────────────
setSettings(originalSettings);
clearLog();

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log("All tests passed ✅");
else console.log("Some tests failed ❌ — see above");
