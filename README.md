# mcp-focus

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![GitHub issues](https://img.shields.io/github/issues/quasarmagnus/mcp-focus)](https://github.com/quasarmagnus/mcp-focus/issues)

> **Tags:** `mcp` `mcp-proxy` `model-context-protocol` `tool-filtering` `claude-code` `cursor` `codex` `antigravity` `tui` `hot-reload`

A TypeScript stdio proxy that sits between your AI coding assistant and any upstream MCP server, giving you live control over which tools the model sees — without restarting your IDE or editing config files manually.

```
Claude Code / Cursor / Codex CLI / Antigravity
        ↓ stdio
   mcp-focus proxy          ← filters tools, hot-reloads on config change
        ↓ stdio
  upstream MCP server       ← filesystem, tavily, your custom server, etc.
```

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [.mcp-focus.json](#mcp-focusjson)
  - [Claude Code](#claude-code)
  - [Cursor](#cursor)
  - [Codex CLI](#codex-cli-openai)
  - [Antigravity](#antigravity-google)
- [TUI Usage](#tui-usage)
- [Access Logging](#access-logging)
- [Slash Command](#claude-code-slash-command)
- [Scope: Global vs Project](#scope-global-vs-project)
- [Command Reference](#command-reference)
- [How It Works](#how-it-works)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Support](#support)
- [License](#license)

---

## Features

- **Hot reload** — change `.mcp-focus.json`, the model sees updated tools within ~300ms
- **Three-state tool visibility** — `enabled` ✅ (full), `disabled` ❌ (stub, ~20 tokens), `hidden` 📌 (0 tokens)
- **Interactive TUI** — keyboard-driven panel: search, bulk ops, per-tool toggles
- **Access logging** — structured JSONL audit trail of every tool call (args opt-in)
- **Setup wizard** — auto-detects unregistered servers and patches your config with consent
- **Multi-client** — works with Claude Code, Cursor, Codex CLI, Antigravity, or any MCP-compatible client

---

## Installation

### From GitHub (recommended — works today)

```bash
npm install -g github:quasarmagnus/mcp-focus
mcp-focus --version
```

This clones the repo, builds TypeScript via the `prepare` script, and links the `mcp-focus` binary globally.

**Windows** — if the command isn't found after install, refresh PATH in your shell:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### Clone and build

```bash
git clone https://github.com/quasarmagnus/mcp-focus
cd mcp-focus
npm install   # builds automatically via the prepare script
npm link      # makes mcp-focus available globally
```

---

## Quick Start

1. Install mcp-focus (above)
2. Run `mcp-focus` — the setup wizard detects servers already in your IDE config and offers to register and proxy them automatically
3. `/reconnect` in your IDE — mcp-focus is now sitting between your client and each server
4. Run `mcp-focus` again to open the TUI and toggle tools live

---

## Configuration

### `.mcp-focus.json`

mcp-focus reads from `~/.claude/.mcp-focus.json` by default (global scope). Each server entry points to the upstream command. The `tools` object starts empty — the proxy auto-populates it on first connection.

```json
{
  "version": "1.0",
  "settings": {
    "logging": false,
    "logArgs": false
  },
  "servers": {
    "my-server": {
      "command": "node",
      "args": ["/absolute/path/to/my-server/dist/index.js"],
      "tools": {}
    }
  }
}
```

**Windows paths** use double backslashes:
```json
"args": ["C:\\Users\\you\\projects\\my-server\\dist\\index.js"]
```

> **Note:** The `tools` object is populated automatically — you don't need to list tool names manually.

---

### Claude Code

Edit `~/.claude.json` → `mcpServers`. Replace each direct server entry with the mcp-focus proxy:

```json
"my-server": {
  "type": "stdio",
  "command": "node",
  "args": [
    "/absolute/path/to/mcp-focus/dist/index.js",
    "proxy",
    "--server", "my-server",
    "--config", "/absolute/path/to/.mcp-focus.json"
  ],
  "env": {
    "MY_API_KEY": "your-key-here"
  }
}
```

Run `/reconnect` in Claude Code after saving.

---

### Cursor

Config file: `.cursor/mcp.json` in your project root. Uses the same `mcpServers` format:

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-focus/dist/index.js",
        "proxy",
        "--server", "my-server",
        "--config", "/absolute/path/to/.mcp-focus.json"
      ],
      "env": {}
    }
  }
}
```

---

### Codex CLI (OpenAI)

Config file: `~/.codex/config.toml`

```toml
[mcp_servers.my-server]
command = "node /absolute/path/to/mcp-focus/dist/index.js proxy --server my-server --config /absolute/path/to/.mcp-focus.json"
```

---

### Antigravity (Google)

In the Antigravity IDE: **Agent session → … → MCP Servers → Manage MCP Servers → View raw config**

Add to the `mcpServers` object:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-focus/dist/index.js",
        "proxy",
        "--server", "my-server",
        "--config", "/absolute/path/to/.mcp-focus.json"
      ],
      "env": {}
    }
  }
}
```

Click **Refresh** after saving to activate.

---

## TUI Usage

```bash
mcp-focus                  # open server picker
mcp-focus my-server        # jump straight to a server's tool list
mcp-focus --scope project  # use project-level .mcp-focus.json
```

From inside your IDE terminal:
```
! mcp-focus
! mcp-focus my-server
```

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
| `↑` / `↓` | Navigate |
| `Space` | Cycle state: enabled → disabled → hidden |
| `1` | Enable all (or all matching current filter) |
| `2` | Disable all (or all matching current filter) |
| `3` | Hide all (or all matching current filter) |
| Type any letter | Filter tools by name |
| `Backspace` | Delete last filter character |
| `Esc` | Clear filter / go back |
| `←` | Go back to server picker |
| `Enter` | Save and exit |
| `Ctrl+C` | Cancel without saving |

Changes hot-reload in the proxy within ~300ms. No IDE restart needed.

### Tool states

| State | Icon | Tokens | Behaviour |
|-------|------|--------|-----------|
| `enabled` | ✅ | Full schema | Works normally |
| `disabled` | ❌ | ~20 | Stub shown to model; calls blocked with a descriptive error |
| `hidden` | 📌 | 0 | Completely invisible to the model |

---

## Access Logging

Enable via **Settings** in the TUI, or directly in `.mcp-focus.json`:

```json
"settings": {
  "logging": true,
  "logArgs": false
}
```

Logs are written to `~/.claude/mcp-focus-logs/{server}-YYYY-MM-DD.jsonl` (one file per server per day):

```jsonl
{"ts":"2026-05-14T10:00:00Z","event":"proxy_start","server":"filesystem"}
{"ts":"2026-05-14T10:00:01Z","event":"tools_list","server":"filesystem","upstream":14,"returned":12,"hidden":1,"disabled":1}
{"ts":"2026-05-14T10:00:02Z","event":"tools_call","server":"filesystem","tool":"read_file","status":"ok","ms":43}
{"ts":"2026-05-14T10:00:03Z","event":"tools_call","server":"filesystem","tool":"write_file","status":"blocked","ms":0,"reason":"disabled"}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `logging` | `false` | Enable/disable logging |
| `logArgs` | `false` | Include tool arguments in logs (may contain file paths, queries, API keys — opt-in) |

**CLI override** — force argument logging for one proxy session without changing config:
```bash
mcp-focus proxy --server my-server --config /path/to/.mcp-focus.json --log-args
```

Changes take effect after the next `/reconnect`.

---

## Claude Code Slash Command

Copy the command file to make `/mcp-focus` available inside Claude Code:

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

Then type `/mcp-focus` or `/mcp-focus my-server` inside any Claude Code session.

---

## Scope: Global vs Project

| Flag | Config file | Use case |
|------|-------------|----------|
| `--scope global` (default) | `~/.claude/.mcp-focus.json` | Shared across all projects |
| `--scope project` | `./.mcp-focus.json` in cwd | Per-repo tool sets |
| `--config <path>` | Explicit path | Override both |

---

## Command Reference

```
mcp-focus [server]
  Launch the TUI. Omit server for the picker; pass a server name to jump straight to it.
  --config <path>             Path to .mcp-focus.json
  --scope <global|project>    Config scope (default: global)

mcp-focus proxy
  Run as an MCP stdio proxy. Used in your client's MCP config.
  --server <name>             Server name from .mcp-focus.json  [required]
  --config <path>             Path to .mcp-focus.json
  --scope <global|project>    Config scope (default: global)
  --log-args                  Log tool arguments in access logs
  --debug                     Enable debug logging to stderr
```

---

## How It Works

mcp-focus is a **pass-through MCP server**. For each upstream server you register:

1. Spawns the upstream as a child process over stdio
2. On `tools/list` — fetches upstream tools, filters by per-tool state, auto-registers new tools in `.mcp-focus.json`
3. On `tools/call` — blocks disabled/hidden tools with a descriptive error; forwards everything else upstream
4. Watches `.mcp-focus.json` with `fs.watch` and sends `notifications/tools/list_changed` within ~300ms so your IDE refreshes without a restart

`.mcp-focus.json` is the single source of truth. Edit it directly, use the TUI, or build tooling on top — the proxy picks up any change automatically.

---

## Roadmap

- [ ] Smoke test suite
- [ ] npm registry publish (`npm install -g mcp-focus`)
- [ ] Per-tool argument schema filtering
- [ ] Log viewer in the TUI

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss the approach.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit and push
4. Open a pull request

---

## Support

Open an issue: [github.com/quasarmagnus/mcp-focus/issues](https://github.com/quasarmagnus/mcp-focus/issues)

---

## License

[MIT](LICENSE) © quasarmagnus
