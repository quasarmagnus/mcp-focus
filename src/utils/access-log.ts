import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export type AccessLogger = ReturnType<typeof createAccessLog>;

export function createAccessLog(configPath: string, serverName: string, logArgs: boolean) {
  const logDir = join(dirname(configPath), "mcp-focus-logs");
  mkdirSync(logDir, { recursive: true });

  function write(record: Record<string, unknown>) {
    const date = new Date().toISOString().slice(0, 10);
    const logFile = join(logDir, `${serverName}-${date}.jsonl`);
    appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n", "utf-8");
  }

  return {
    proxyStart: () =>
      write({ event: "proxy_start", server: serverName }),
    toolsList: (upstream: number, returned: number, hidden: number, disabled: number) =>
      write({ event: "tools_list", server: serverName, upstream, returned, hidden, disabled }),
    toolsCall: (tool: string, status: "ok" | "blocked" | "error", ms: number, args?: Record<string, unknown>, reason?: string) =>
      write({
        event: "tools_call", server: serverName, tool, status, ms,
        ...(logArgs && args ? { args } : {}),
        ...(reason ? { reason } : {}),
      }),
  };
}
