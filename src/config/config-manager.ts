import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { log } from "../utils/logger.js";

const ToolStateSchema = z.union([z.boolean(), z.literal("hidden")]);
export type ToolState = z.infer<typeof ToolStateSchema>;

const ServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  tools: z.record(z.string(), ToolStateSchema).default({}),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

const SettingsSchema = z.object({
  logging: z.boolean().default(false),
  logArgs: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

const FocusConfigSchema = z.object({
  version: z.string().default("1.0"),
  settings: SettingsSchema.default({}),
  servers: z.record(z.string(), ServerConfigSchema).default({}),
});
export type FocusConfig = z.infer<typeof FocusConfigSchema>;

export class ConfigManager {
  private config: FocusConfig = { version: "1.0", settings: { logging: false, logArgs: false }, servers: {} };

  constructor(private readonly configPath: string) {}

  load(): void {
    try {
      const raw = readFileSync(this.configPath, "utf-8");
      this.config = FocusConfigSchema.parse(JSON.parse(raw));
      log.debug(`Loaded config from ${this.configPath}`);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        log.debug("Config not found, starting with empty config");
        this.config = { version: "1.0", settings: { logging: false, logArgs: false }, servers: {} };
      } else {
        log.error(`Failed to parse config: ${err}`);
      }
    }
  }

  reload(): void {
    log.debug("Reloading config...");
    this.load();
  }

  getServerConfig(serverName: string): ServerConfig | undefined {
    return this.config.servers[serverName];
  }

  getToolState(serverName: string, toolName: string): ToolState {
    return this.config.servers[serverName]?.tools[toolName] ?? true;
  }

  setToolState(serverName: string, toolName: string, state: ToolState): void {
    if (!this.config.servers[serverName]) return;
    this.config.servers[serverName].tools[toolName] = state;
    this.save();
  }

  registerServer(serverName: string, command: string, args: string[]): void {
    if (!this.config.servers[serverName]) {
      this.config.servers[serverName] = { command, args, tools: {} };
      this.save();
    }
  }

  registerTools(serverName: string, toolNames: string[]): void {
    if (!this.config.servers[serverName]) return;
    let changed = false;
    for (const name of toolNames) {
      if (!(name in this.config.servers[serverName].tools)) {
        this.config.servers[serverName].tools[name] = true;
        changed = true;
      }
    }
    if (changed) this.save();
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getSettings(): Settings {
    return this.config.settings;
  }

  setSettings(s: Settings): void {
    this.config.settings = s;
    this.save();
  }

  getAll(): FocusConfig {
    return this.config;
  }

  private save(): void {
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2) + "\n", "utf-8");
    log.debug(`Saved config to ${this.configPath}`);
  }
}
