#!/usr/bin/env node
import { program } from "commander";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { ConfigManager } from "./config/config-manager.js";
import { runProxy } from "./proxy/focus-proxy.js";
import { runTui, runTuiAllServers } from "./ui/tui.js";
const GLOBAL_CONFIG = resolve(homedir(), ".claude", ".mcp-focus.json");
const PROJECT_CONFIG = resolve(process.cwd(), ".mcp-focus.json");
function resolveConfig(opts) {
    if (opts.config)
        return resolve(opts.config);
    if (opts.scope === "project")
        return PROJECT_CONFIG;
    return GLOBAL_CONFIG;
}
program
    .name("mcp-focus")
    .description("MCP tool visibility manager — run with no args to open the TUI")
    .version("0.1.0")
    .argument("[server]", "Server name to jump straight to (omit for server picker)")
    .option("--config <path>", "Explicit path to .mcp-focus.json (overrides --scope)")
    .option("--scope <scope>", "Config scope: global (default) or project", "global")
    .action(async (server, opts) => {
    const config = new ConfigManager(resolveConfig(opts));
    config.load();
    if (server) {
        await runTui(server, config);
    }
    else {
        await runTuiAllServers(config);
    }
});
program
    .command("proxy")
    .description("Run as MCP stdio proxy for a named server (used in .claude.json)")
    .requiredOption("--server <name>", "Server name from .mcp-focus.json")
    .option("--config <path>", "Explicit path to .mcp-focus.json (overrides --scope)")
    .option("--scope <scope>", "Config scope: global (default) or project", "global")
    .option("--debug", "Enable debug logging")
    .option("--log-args", "Log tool arguments in access logs (opt-in — may include sensitive data)")
    .action(async (opts) => {
    if (opts.debug)
        process.env.DEBUG = "1";
    const config = new ConfigManager(resolveConfig(opts));
    config.load();
    await runProxy(opts.server, config, { logArgs: !!opts.logArgs });
});
program.parse();
//# sourceMappingURL=index.js.map