import { homedir } from "os";
import { join } from "path";
import { fileExists } from "../../utils/fs";
import { MCP_WELL_KNOWN_CONFIGS } from "../../constants";

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

function platform(): "mac" | "linux" | "windows" | "other" {
  const p = process.platform;
  if (p === "darwin") return "mac";
  if (p === "linux") return "linux";
  if (p === "win32") return "windows";
  return "other";
}

export async function discoverWellKnownMcpConfigPaths(): Promise<string[]> {
  const list =
    platform() === "mac"
      ? MCP_WELL_KNOWN_CONFIGS.mac
      : platform() === "linux"
        ? MCP_WELL_KNOWN_CONFIGS.linux
        : platform() === "windows"
          ? MCP_WELL_KNOWN_CONFIGS.windows
          : [];

  const out: string[] = [];
  for (const raw of list) {
    const p = expandHome(raw);
    if (await fileExists(p)) out.push(p);
  }
  return out;
}

