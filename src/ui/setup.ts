import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import checkbox from "@inquirer/checkbox";
import select from "@inquirer/select";
import type { ConfigManager } from "../config/config-manager.js";

const CLAUDE_JSON = resolve(homedir(), ".claude.json");

interface ClaudeServerEntry {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

function isProxyEntry(server: ClaudeServerEntry): boolean {
  return (server.args ?? []).includes("proxy");
}

function proxyBinPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "index.js");
}

function readClaudeJson(): { raw: Record<string, unknown>; mcpServers: Record<string, ClaudeServerEntry> } {
  try {
    const raw = JSON.parse(readFileSync(CLAUDE_JSON, "utf-8")) as Record<string, unknown>;
    const mcpServers = (raw.mcpServers ?? {}) as Record<string, ClaudeServerEntry>;
    return { raw, mcpServers };
  } catch {
    return { raw: {}, mcpServers: {} };
  }
}

export async function runSetupWizard(configManager: ConfigManager): Promise<boolean> {
  const { raw, mcpServers } = readClaudeJson();
  const directServers = Object.entries(mcpServers).filter(([, cfg]) => !isProxyEntry(cfg));

  // Filter out servers already registered in .mcp-focus.json
  const registeredNames = new Set(Object.keys(configManager.getAll().servers));
  const newServers = directServers.filter(([name]) => !registeredNames.has(name));

  if (newServers.length === 0) {
    if (registeredNames.size === 0) {
      console.log(`
  mcp-focus — nothing configured yet

  No MCP servers found in ~/.claude.json to import.
  Add entries to ~/.claude/.mcp-focus.json manually, then wire each
  through the proxy in ~/.claude.json. See README.md for the template.
`);
    }
    return false;
  }

  console.log(`\n  mcp-focus — found ${newServers.length} new server(s) not yet managed\n`);

  let action: "setup" | "skip";
  try {
    action = await select<"setup" | "skip">({
      message: "Set up now or skip?",
      choices: [
        { value: "setup", name: "Set up now" },
        { value: "skip",  name: "Skip — I'll do this later" },
      ],
    });
  } catch {
    return false;
  }

  if (action === "skip") return false;

  let selected: string[];
  try {
    selected = await checkbox<string>({
      message: "Select servers to register with mcp-focus",
      choices: newServers.map(([name, cfg]) => ({
        value: name,
        name: `${name}  →  ${cfg.command ?? "?"} ${(cfg.args ?? []).slice(0, 2).join(" ")}`.trimEnd(),
      })),
      pageSize: 15,
    });
  } catch {
    console.log("\n  Cancelled.\n");
    return false;
  }

  if (selected.length === 0) {
    console.log("\n  Nothing selected.\n");
    return false;
  }

  const names = selected.join(", ");
  const configPath = configManager.getConfigPath();

  console.log(`
  Selected: ${names}

  mcp-focus will:
    • Register in ${configPath}
    • Patch ~/.claude.json — swap direct entries for proxy routes
    • Back up ~/.claude.json → ~/.claude.json.bak first
`);

  let proceed: boolean;
  try {
    proceed = await select<boolean>({
      message: "Proceed?",
      choices: [
        { value: true,  name: "Yes — back up and patch" },
        { value: false, name: "No — I'll edit ~/.claude.json manually" },
      ],
    });
  } catch {
    console.log("\n  Cancelled.\n");
    return false;
  }

  // Register in .mcp-focus.json now that user has confirmed
  for (const name of selected) {
    const cfg = mcpServers[name]!;
    configManager.registerServer(name, cfg.command ?? "", cfg.args ?? []);
  }

  if (!proceed) {
    console.log(`
  Registered in ${configPath}. Patch ~/.claude.json manually:

    "<server>": {
      "type": "stdio",
      "command": "node",
      "args": ["${proxyBinPath()}", "proxy", "--server", "<server>", "--config", "${configPath}"],
      "env": {}
    }

  Then /reconnect in Claude Code.
`);
    return true;
  }

  // Backup
  const backupPath = CLAUDE_JSON + ".bak";
  copyFileSync(CLAUDE_JSON, backupPath);
  console.log(`  ✓ Backed up → ~/.claude.json.bak`);

  // Patch
  const bin = proxyBinPath();
  let patched = 0;
  for (const name of selected) {
    const original = mcpServers[name]!;
    (raw.mcpServers as Record<string, unknown>)[name] = {
      type: "stdio",
      command: "node",
      args: [bin, "proxy", "--server", name, "--config", configPath],
      env: original.env ?? {},
    };
    patched++;
  }

  writeFileSync(CLAUDE_JSON, JSON.stringify(raw, null, 2) + "\n", "utf-8");
  console.log(`  ✓ Patched ${patched} server(s) in ~/.claude.json`);
  console.log(`  → /reconnect in Claude Code to activate\n`);

  return true;
}
