import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ConfigManager } from "../config/config-manager.js";
import { startWatcher } from "../config/watcher.js";
import { log } from "../utils/logger.js";
import { createAccessLog } from "../utils/access-log.js";

const DISABLED_STUB_DESCRIPTION = "[mcp-focus] Disabled. Run 'mcp-focus ui' to enable.";

export async function runProxy(serverName: string, configManager: ConfigManager, flags: { logArgs: boolean } = { logArgs: false }): Promise<void> {
  const serverConfig = configManager.getServerConfig(serverName);
  if (!serverConfig) {
    throw new Error(`No server config found for '${serverName}' in .mcp-focus.json`);
  }

  const settings = configManager.getSettings();
  const loggingOn = settings.logging || flags.logArgs;
  const logArgsOn = settings.logArgs || flags.logArgs;
  const accessLog = loggingOn ? createAccessLog(configManager.getConfigPath(), serverName, logArgsOn) : null;
  accessLog?.proxyStart();

  const upstream = new Client({ name: "mcp-focus-client", version: "0.1.0" });
  const upstreamTransport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args,
  });

  await upstream.connect(upstreamTransport);
  log.debug(`Connected to upstream: ${serverConfig.command}`);

  const serverInfo = upstream.getServerVersion();
  const resolvedName = serverInfo?.name ?? serverName;
  log.debug(`Upstream server: ${resolvedName}@${serverInfo?.version}`);

  const server = new Server(
    { name: "mcp-focus", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const { tools: upstreamTools } = await upstream.listTools();

    const names = upstreamTools.map((t) => t.name);
    configManager.registerTools(serverName, names);

    let hiddenCount = 0;
    let disabledCount = 0;
    const filtered: Tool[] = [];
    for (const tool of upstreamTools) {
      const state = configManager.getToolState(serverName, tool.name);
      if (state === "hidden") { hiddenCount++; continue; }
      if (state === false) {
        disabledCount++;
        filtered.push({
          name: tool.name,
          description: DISABLED_STUB_DESCRIPTION,
          inputSchema: { type: "object" as const, properties: {} },
        });
      } else {
        filtered.push(tool);
      }
    }

    log.debug(`tools/list: ${filtered.length}/${upstreamTools.length} tools returned`);
    accessLog?.toolsList(upstreamTools.length, filtered.length, hiddenCount, disabledCount);
    return { tools: filtered };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const state = configManager.getToolState(serverName, name);
    const start = Date.now();

    if (state === false || state === "hidden") {
      const reason = state === false ? "disabled" : "hidden";
      accessLog?.toolsCall(name, "blocked", 0, args as Record<string, unknown> | undefined, reason);
      return {
        content: [
          {
            type: "text",
            text: `Tool '${name}' is disabled. Run 'mcp-focus ui' to enable it.`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await upstream.callTool({ name, arguments: args ?? {} });
      accessLog?.toolsCall(name, "ok", Date.now() - start, args as Record<string, unknown> | undefined);
      return result;
    } catch (err) {
      accessLog?.toolsCall(name, "error", Date.now() - start, args as Record<string, unknown> | undefined);
      throw err;
    }
  });

  const notifyReload = () => {
    configManager.reload();
    server.notification({ method: "notifications/tools/list_changed" }).catch((err) => {
      log.error(`Failed to send tools/list_changed: ${err}`);
    });
  };

  startWatcher(configManager.getConfigPath(), notifyReload);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(`mcp-focus proxy running for '${serverName}'`);
}
