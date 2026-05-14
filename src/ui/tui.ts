import { createPrompt, useState, useKeypress, isUpKey, isDownKey, isEnterKey, isSpaceKey } from "@inquirer/core";
import type { ConfigManager, Settings, ToolState } from "../config/config-manager.js";
import { runSetupWizard } from "./setup.js";

const ICONS: Record<string, string> = {
  enabled: "✅",
  stub:    "📌",
  hidden:  "❌",
};

const STATE_COLORS: Record<string, string> = {
  enabled: "\x1b[32m",
  stub:    "\x1b[33m",
  hidden:  "\x1b[90m",
};

const PAGE_SIZE = 10;

type StateKey = "enabled" | "stub" | "hidden";

function statBracket(tools: Record<string, ToolState>): string {
  let stub = 0, hidden = 0;
  for (const s of Object.values(tools)) {
    if (s === false) stub++;
    else if (s === "hidden") hidden++;
  }
  const parts: string[] = [];
  if (stub > 0) parts.push(`📌 ${stub}`);
  if (hidden > 0) parts.push(`❌ ${hidden}`);
  return parts.length ? `  \x1b[90m[${parts.join("  ")}]\x1b[0m` : "";
}

function toKey(s: ToolState): StateKey {
  if (s === true) return "enabled";
  if (s === false) return "stub";
  return "hidden";
}

function nextState(s: ToolState): ToolState {
  if (s === true) return false;
  if (s === false) return "hidden";
  return true;
}

type ToolEntry = { name: string; state: ToolState; server?: string };

const toolListPrompt = createPrompt<ToolEntry[] | null, { tools: ToolEntry[]; serverName: string }>(
  (config, done) => {
    const [tools, setTools] = useState<ToolEntry[]>(config.tools);
    const [cursor, setCursor] = useState(0);
    const [scroll, setScroll] = useState(0);
    const [filter, setFilter] = useState("");

    const hasServerLabels = config.tools.some((t) => t.server);
    const nameWidth = hasServerLabels ? 50 : 38;

    const filteredTools = filter
      ? tools.filter((t) => {
          const display = t.server ? `${t.server} › ${t.name}` : t.name;
          return display.toLowerCase().includes(filter.toLowerCase());
        })
      : tools;

    const visibleTools = filteredTools.slice(scroll, scroll + PAGE_SIZE);

    const isInFilter = (t: ToolEntry) => {
      if (!filter) return true;
      const display = t.server ? `${t.server} › ${t.name}` : t.name;
      return display.toLowerCase().includes(filter.toLowerCase());
    };

    useKeypress((key) => {
      if (isUpKey(key)) {
        const c = Math.max(0, cursor - 1);
        setCursor(c);
        if (c < scroll) setScroll(c);
        else if (c >= scroll + PAGE_SIZE) setScroll(c - PAGE_SIZE + 1); // coming down from Back row
      } else if (isDownKey(key)) {
        const c = Math.min(filteredTools.length, cursor + 1); // filteredTools.length = Back row
        setCursor(c);
        if (c < filteredTools.length && c >= scroll + PAGE_SIZE) setScroll(c - PAGE_SIZE + 1);
      } else if (key.name === "left") {
        done(null);
      } else if (key.name === "escape") {
        if (filter) {
          setFilter("");
          setCursor(0);
          setScroll(0);
        } else {
          done(null);
        }
      } else if (key.name === "backspace") {
        if (filter) {
          setFilter(filter.slice(0, -1));
          setCursor(0);
          setScroll(0);
        }
      } else if (isSpaceKey(key)) {
        if (cursor === filteredTools.length) {
          done(null);
        } else {
          const target = filteredTools[cursor];
          if (target) {
            setTools(tools.map((t) =>
              t.name === target.name && t.server === target.server
                ? { ...t, state: nextState(t.state) }
                : t
            ));
          }
        }
      } else if (!key.ctrl && !key.shift && key.name === "1") {
        setTools(tools.map((t) => isInFilter(t) ? { ...t, state: true as ToolState } : t));
      } else if (!key.ctrl && !key.shift && key.name === "2") {
        setTools(tools.map((t) => isInFilter(t) ? { ...t, state: false as ToolState } : t));
      } else if (!key.ctrl && !key.shift && key.name === "3") {
        setTools(tools.map((t) => isInFilter(t) ? { ...t, state: "hidden" as ToolState } : t));
      } else if (isEnterKey(key)) {
        if (cursor === filteredTools.length) done(null);
        else done(tools);
      } else if (!key.ctrl && !key.shift && key.name && key.name.length === 1 && key.name.charCodeAt(0) > 32) {
        setFilter(filter + key.name);
        setCursor(0);
        setScroll(0);
      }
    });

    const scrollIndicator =
      filteredTools.length > PAGE_SIZE || (filter && filteredTools.length !== tools.length)
        ? `  (${scroll + 1}–${Math.min(scroll + PAGE_SIZE, filteredTools.length)} of ${filteredTools.length}${filter && filteredTools.length !== tools.length ? " match" : ""})`
        : "";

    const rowsOutput =
      visibleTools.length === 0
        ? "  (no tools match)"
        : visibleTools
            .map((tool, i) => {
              const absIdx = scroll + i;
              const pointer = absIdx === cursor ? "❯" : " ";
              const k = toKey(tool.state);
              const display = tool.server ? `${tool.server} › ${tool.name}` : tool.name;
              return `  ${pointer} ${ICONS[k]}  ${display.padEnd(nameWidth)} ${STATE_COLORS[k]}${k}\x1b[0m`;
            })
            .join("\n");

    const enabledCount = tools.filter(t => t.state === true).length;
    const stubCount    = tools.filter(t => t.state === false).length;
    const hiddenCount  = tools.filter(t => t.state === "hidden").length;
    const summary = `  \x1b[32m✅ ${enabledCount}\x1b[0m  \x1b[33m📌 ${stubCount}\x1b[0m  \x1b[90m❌ ${hiddenCount}\x1b[0m`;

    const hint =
      "  ↑↓ move  Space cycle  1 ✅ all  2 📌 all  3 ❌ all  type filter  ← back  Enter save";

    const backPointer = cursor === filteredTools.length ? "❯" : " ";
    const backRow = `  ${backPointer} \x1b[91m← Back\x1b[0m`;

    let output = `\n  mcp-focus › ${config.serverName}${scrollIndicator}\n\n${summary}\n\n`;
    if (filter) output += `  / ${filter}█\n\n`;
    output += rowsOutput;
    output += `\n\n${backRow}`;
    output += `\n\n${hint}`;
    return output;
  }
);

type PickerItem = { value: string; label: string } | { header: string } | null; // null = blank line

const PAGE_SIZE_PICKER = 10;

const serverPickerPrompt = createPrompt<string, { items: PickerItem[] }>(
  (config, done) => {
    const selectable = config.items.reduce<number[]>((acc, item, i) => {
      if (item !== null && "value" in item) acc.push(i);
      return acc;
    }, []);

    const [selIdx, setSelIdx] = useState(0);
    const [scroll, setScroll] = useState(0);
    const currentItemIdx = selectable[selIdx] ?? 0;

    useKeypress((key) => {
      if (isUpKey(key)) {
        const newSelIdx = Math.max(0, selIdx - 1);
        const newIdx = selectable[newSelIdx] ?? 0;
        setSelIdx(newSelIdx);
        if (newIdx < scroll) setScroll(Math.max(0, newIdx));
      } else if (isDownKey(key)) {
        const newSelIdx = Math.min(selectable.length - 1, selIdx + 1);
        const newIdx = selectable[newSelIdx] ?? 0;
        setSelIdx(newSelIdx);
        if (newIdx >= scroll + PAGE_SIZE_PICKER) setScroll(newIdx - PAGE_SIZE_PICKER + 1);
      } else if (isEnterKey(key) || key.name === "right") {
        const item = config.items[currentItemIdx];
        if (item && "value" in item) done(item.value);
      }
    });

    const visibleItems = config.items.slice(scroll, scroll + PAGE_SIZE_PICKER);
    const rows = visibleItems.map((item, i) => {
      const absIdx = scroll + i;
      if (item === null) return "";
      if (!("value" in item)) return `  ${item.header}`;
      const pointer = absIdx === currentItemIdx ? "❯" : " ";
      return `  ${pointer} ${item.label}`;
    });

    return `\n  mcp-focus › List of MCP Servers\n\n${rows.join("\n")}\n`;
  }
);

const settingsPrompt = createPrompt<Settings | null, Settings>(
  (config, done) => {
    const [logging, setLogging] = useState(config.logging);
    const [logArgs, setLogArgs] = useState(config.logArgs);
    const [cursor, setCursor] = useState(0);

    useKeypress((key) => {
      if (isUpKey(key)) setCursor(Math.max(0, cursor - 1));
      else if (isDownKey(key)) setCursor(Math.min(1, cursor + 1));
      else if (isSpaceKey(key)) {
        if (cursor === 0) {
          const next = !logging;
          setLogging(next);
          if (!next) setLogArgs(false);
        } else if (cursor === 1 && logging) {
          setLogArgs(!logArgs);
        }
      } else if (key.name === "escape" || key.name === "left") {
        done(null);
      } else if (isEnterKey(key)) {
        done({ logging, logArgs });
      }
    });

    const logRow    = `  ${cursor === 0 ? "❯" : " "} ${logging ? "✅" : "⬜"}  Logging`;
    const argsLabel = logging ? "Log arguments (paths, queries — sensitive)" : "\x1b[90mLog arguments (paths, queries — sensitive)\x1b[0m";
    const argsRow   = `  ${cursor === 1 ? "❯" : " "} ${logArgs ? "✅" : "⬜"}  ${argsLabel}`;
    return `\n  mcp-focus › Settings\n\n${logRow}\n${argsRow}\n\n  ↑↓ navigate  Space toggle  Enter save  ← / Esc back\n`;
  }
);

export async function runTui(serverName: string, configManager: ConfigManager): Promise<"back" | void> {
  const serverConfig = configManager.getServerConfig(serverName);
  if (!serverConfig) {
    console.error(`  No config found for server '${serverName}'`);
    process.exit(1);
  }

  const toolEntries = Object.entries(serverConfig.tools);
  if (toolEntries.length === 0) {
    console.log(`  No tools registered for '${serverName}'. Connect via Claude Code first to auto-populate.`);
    return;
  }

  const initialTools: ToolEntry[] = toolEntries.map(([name, state]) => ({ name, state }));

  let result: ToolEntry[] | null;
  try {
    result = await toolListPrompt({ tools: initialTools, serverName });
  } catch {
    console.log("\n  Cancelled.\n");
    return;
  }

  if (result === null) return "back";

  let changed = 0;
  for (const { name, state } of result) {
    if (configManager.getToolState(serverName, name) !== state) {
      configManager.setToolState(serverName, name, state);
      changed++;
    }
  }

  if (changed > 0) {
    console.log(`\n  Saved ${changed} change(s). Proxy hot-reloads within 300ms.\n`);
  } else {
    console.log("\n  No changes.\n");
  }
}

export async function runTuiAllServers(configManager: ConfigManager): Promise<void> {
  // Always check for servers in ~/.claude.json not yet registered with mcp-focus
  await runSetupWizard(configManager);

  const config = configManager.getAll();
  const serverNames = Object.keys(config.servers);

  if (serverNames.length === 0) return;

  const ALL = "__all__";
  const SETTINGS = "__settings__";
  const EXIT = "__exit__";

  while (true) {
    const totalTools = serverNames.reduce((sum, name) => sum + Object.keys(config.servers[name]!.tools).length, 0);
    const allToolsValues = serverNames.flatMap(n => Object.values(config.servers[n]!.tools));
    const allBadge = statBracket(Object.fromEntries(allToolsValues.map((v, i) => [i, v])));
    const items: PickerItem[] = [
      { value: ALL, label: `\x1b[94mAll MCP Servers  (${totalTools} tool${totalTools !== 1 ? "s" : ""})\x1b[0m${allBadge}` },
      null,
      { header: "\x1b[94mConfigure Individual MCP:\x1b[0m" },
      ...serverNames.map((name) => {
        const tools = config.servers[name]!.tools;
        const count = Object.keys(tools).length;
        const badge = statBracket(tools);
        return { value: name, label: `${name}  (${count} tool${count !== 1 ? "s" : ""})${badge}` };
      }),
      null,
      { value: SETTINGS, label: "\x1b[90m⚙  Settings\x1b[0m" },
      null,
      { value: EXIT, label: "\x1b[91mExit\x1b[0m" },
    ];

    let picked: string;
    try {
      picked = await serverPickerPrompt({ items });
    } catch {
      console.log("\n  Cancelled.\n");
      return;
    }

    if (picked === EXIT) {
      console.log("\n  mcp-focus — bye!\n");
      return;
    }

    if (picked === SETTINGS) {
      const s = configManager.getSettings();
      let result: Settings | null;
      try {
        result = await settingsPrompt({ logging: s.logging, logArgs: s.logArgs });
      } catch {
        console.log("\n  Cancelled.\n");
        return;
      }
      if (result !== null) {
        configManager.setSettings(result);
        console.log(`\n  Settings saved. Restart the proxy (/reconnect in Claude Code) to apply.\n`);
      }
      continue;
    }

    if (picked === ALL) {
      const allTools: ToolEntry[] = serverNames.flatMap((name) =>
        Object.entries(config.servers[name]!.tools).map(([toolName, state]) => ({
          name: toolName,
          state,
          server: name,
        }))
      );

      let result: ToolEntry[] | null;
      try {
        result = await toolListPrompt({ tools: allTools, serverName: "All MCP Servers" });
      } catch {
        console.log("\n  Cancelled.\n");
        return;
      }

      if (result === null) continue;

      let changed = 0;
      for (const { name, state, server } of result) {
        if (!server) continue;
        if (configManager.getToolState(server, name) !== state) {
          configManager.setToolState(server, name, state);
          changed++;
        }
      }
      if (changed > 0) {
        console.log(`\n  Saved ${changed} change(s). Proxy hot-reloads within 300ms.\n`);
      } else {
        console.log("\n  No changes.\n");
      }
      return;
    }

    const back = await runTui(picked, configManager);
    if (back === "back") continue;
    return;
  }
}
