const debug = process.env.DEBUG === "1";

export const log = {
  debug: (...args: unknown[]) => debug && process.stderr.write(`[mcp-focus] ${args.join(" ")}\n`),
  info: (...args: unknown[]) => process.stderr.write(`[mcp-focus] ${args.join(" ")}\n`),
  error: (...args: unknown[]) => process.stderr.write(`[mcp-focus:error] ${args.join(" ")}\n`),
};
