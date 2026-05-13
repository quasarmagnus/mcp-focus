import { watch, type FSWatcher } from "node:fs";
import { log } from "../utils/logger.js";

export function startWatcher(configPath: string, onReload: () => void): FSWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(configPath, (eventType) => {
    if (eventType !== "change") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      log.debug("Config file changed, reloading...");
      onReload();
    }, 300);
  });

  watcher.on("error", (err) => log.error(`Watcher error: ${err}`));
  log.debug(`Watching ${configPath} for changes`);
  return watcher;
}
