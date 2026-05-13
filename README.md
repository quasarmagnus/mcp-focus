# mcp-focus

A TypeScript stdio proxy that sits between Claude Code (or any MCP client) and your upstream MCP servers, giving you live control over which tools Claude sees — without restarting Claude Code or editing config files.

**Three capabilities no existing tool has together:**

1. **Hot reload** — edit `.mcp-focus.json`, Claude re-queries tools within ~300ms
2. **Interactive TUI** — `mcp-focus` launches a keyboard-driven panel in your terminal
3. **Three-state visibility** — `enabled` (full), `disabled` (stub shown, ~20 tokens), `hidden` (0 tokens)

```
Claude Code ←── stdio ──→ mcp-focus proxy ←── stdio ──→ upstream MCP server
                                │
                        ~/.claude/.mcp-focus.json   ← fs.watch (hot reload)
```

---

## Prerequisites

- Node.js 18+
- Claude Code (or any MCP-compatible client)

---

## Install

### Option A — npm global install (once published)

```bash
npm install -g mcp-focus
mcp-focus --version
```

### Option B — Clone and build

```bash
git clone https://github.com/quasarmagnus/mcp-focus
cd mcp-focus
npm install        # runs the TypeScript build automatically via the prepare script
npm link           # makes `mcp-focus` available globally
mcp-focus --version
```

**Windows** — after `npm link`, refresh PATH in your current shell:

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

---

## Configure

### 1. Create `~/.claude/.mcp-focus.json`

This file owns your server registrations, per-tool states, and settings. Start with empty `tools: {}` — the proxy auto-populates them on first connection.

```json
{
  "version": "1.0",
  "servers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/my-server/dist/index.js"],
      "tools": {}
    }
  }
}
```

**Windows paths** use double backslashes:

```json
"args": ["C:\\Users\\you\\projects\\my-server\\dist\\index.js"]
```

For **project-scoped** config (isolated per repo), use `./.mcp-focus.json` in your project root and pass `--scope project` to the proxy command.

### 2. Wire into Claude Code

Claude Code's MCP config lives in `~/.claude.json`. Replace each direct server entry with an mcp-focus proxy entry:

**Before:**
```json
"my-server": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/my-server/dist/index.js"]
}
```

**After:**
```json
"my-server": {
  "type": "stdio",
  "command": "node",
  "args": [
    "/path/to/mcp-focus/dist/index.js",
    "proxy",
    "--server", "my-server",
    "--config", "/Users/you/.claude/.mcp-focus.json"
  ],
  "env": {
    "MY_SERVER_API_KEY": "your-key-here"
  }
}
```

**Windows:**
```json
"args": [
  "C:\\Users\\you\\projects\\mcp-focus\\dist\\index.js",
  "proxy",
  "--server", "my-server",
  "--config", "C:\\Users\\you\\.claude\\.mcp-focus.json"
]
```

### 3. Setup wizard (alternative to manual config)

Run `mcp-focus` after adding a server directly to `~/.claude.json`. The setup wizard detects unregistered servers and offers to:
- Register them in `.mcp-focus.json`
- Automatically patch `~/.claude.json` (with a backup to `~/.claude.json.bak`)

This is the fastest path for onboarding an existing server.

### 4. Reconnect

After wiring the proxy, run `/reconnect` in Claude Code (or restart). mcp-focus auto-populates `.mcp-focus.json` with all tool names set to `enabled` the first time Claude calls `tools/list`.

---

## Use the TUI

```bash
mcp-focus                    # server picker
mcp-focus my-server          # jump straight to a server's tool list
mcp-focus --scope project    # use project-level .mcp-focus.json
```

From inside Claude Code (requires a real TTY):

```
! mcp-focus
! mcp-focus my-server
```

Or use the slash command `/mcp-focus` if installed (see below).

### Main menu

```
  mcp-focus › List of MCP Servers

  ❯ All MCP Servers  (16 tools)

  Configure Individual MCP:
    filesystem  (14 tools)
    tavily  (2 tools)

    ⚙  Settings
    Exit
```

### Tool list controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate tools |
| `Space` | Cycle state: enabled → disabled → hidden |
| `1` | Enable all (or all matching filter) |
| `2` | Disable all (or all matching filter) |
| `3` | Hide all (or all matching filter) |
| Type any letter | Filter tools by name |
| `Esc` | Clear filter / go back |
| `←` | Go back to server picker |
| `Enter` | Save and exit |
| `Ctrl+C` | Cancel without saving |

Changes hot-reload in the proxy within ~300ms. No Claude Code restart needed.

### Tool states

| State | Tokens used | Behaviour |
|-------|-------------|-----------|
| `enabled` ✅ | Full schema | Tool works normally |
| `disabled` ❌ | ~20 tokens | Stub shown to Claude, calls blocked with an error message |
| `hidden` 📌 | 0 tokens | Tool completely invisible to Claude |

---

## Access logging

Enable structured audit logs via **Settings** in the TUI main menu, or permanently via `~/.claude/.mcp-focus.json`:

```json
{
  "version": "1.0",
  "settings": {
    "logging": true,
    "logArgs": false
  },
  "servers": { ... }
}
```

Logs are written to `~/.claude/mcp-focus-logs/{server}-YYYY-MM-DD.jsonl` (one file per server per day):

```jsonl
{"ts":"2026-05-13T10:00:00Z","event":"proxy_start","server":"filesystem"}
{"ts":"2026-05-13T10:00:01Z","event":"tools_list","server":"filesystem","upstream":14,"returned":12,"hidden":1,"disabled":1}
{"ts":"2026-05-13T10:00:02Z","event":"tools_call","server":"filesystem","tool":"read_file","status":"ok","ms":43}
{"ts":"2026-05-13T10:00:03Z","event":"tools_call","server":"filesystem","tool":"write_file","status":"blocked","ms":0,"reason":"disabled"}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `logging` | `false` | Enable/disable access logging |
| `logArgs` | `false` | Include tool arguments in logs (opt-in — may contain file paths, API keys, search queries) |

**CLI override** — force argument logging for a single proxy session without changing the config:

```bash
node dist/index.js proxy --server my-server --config ~/.claude/.mcp-focus.json --log-args
```

Logs are append-only JSONL. Changes take effect after the next proxy restart (`/reconnect` in Claude Code).

---

## Claude Code slash command (optional)

Copy the command file so `/mcp-focus` works inside Claude Code:

**macOS / Linux:**
```bash
mkdir -p ~/.claude/commands
cp /path/to/mcp-focus/commands/mcp-focus.md ~/.claude/commands/
```

**Windows:**
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\commands"
Copy-Item "C:\path\to\mcp-focus\commands\mcp-focus.md" "$env:USERPROFILE\.claude\commands\"
```

Then type `/mcp-focus` (or `/mcp-focus my-server`) inside any Claude Code session.

---

## Scope: project vs global

| Flag | Config file | Use case |
|------|-------------|----------|
| `--scope global` (default) | `~/.claude/.mcp-focus.json` | Shared across all projects |
| `--scope project` | `./.mcp-focus.json` in cwd | Per-repo tool sets |
| `--config <path>` | Explicit path | Override both |

Works identically with Cursor (`.cursor/mcp.json`) and any other MCP-compatible client — only the wrapping config file path differs.

---

## Command reference

```
mcp-focus [server]            Launch TUI (server picker or jump to named server)
  --config <path>             Explicit .mcp-focus.json path
  --scope <global|project>    Config scope (default: global)

mcp-focus proxy               Run as MCP stdio proxy (used in .claude.json)
  --server <name>             Server name from .mcp-focus.json  [required]
  --config <path>             Explicit .mcp-focus.json path
  --scope <global|project>    Config scope (default: global)
  --log-args                  Log tool arguments in access logs
  --debug                     Enable debug logging to stderr
```

---

## How it works

mcp-focus is a **pass-through MCP server**. For each upstream server you register, the proxy:

1. Spawns the upstream server as a child process
2. On `tools/list` — fetches the upstream list, filters by per-tool state, auto-registers new tools
3. On `tools/call` — blocks disabled/hidden tools with a clear error; forwards everything else
4. Watches `.mcp-focus.json` for changes and sends `notifications/tools/list_changed` to Claude within ~300ms

The `.mcp-focus.json` config file is the single source of truth. Edit it directly, use the TUI, or write tooling on top — the proxy picks up any change automatically.
