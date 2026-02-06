import { homedir } from "os";
import { join } from "path";
import { fileExists } from "../../utils/fs";

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

const MAC_WELL_KNOWN_CONFIGS = [
  "~/.codeium/windsurf/mcp_config.json",
  "~/.cursor/mcp.json",
  "~/.vscode/mcp.json",
  "~/Library/Application Support/Code/User/settings.json",
  "~/Library/Application Support/Code/User/mcp.json",
  "~/Library/Application Support/Claude/claude_desktop_config.json",
  "~/.claude.json",
  "~/.gemini/settings.json",
  "~/.kiro/settings/mcp.json",
  "~/.gemini/antigravity/mcp_config.json",
];

const LINUX_WELL_KNOWN_CONFIGS = [
  "~/.codeium/windsurf/mcp_config.json",
  "~/.cursor/mcp.json",
  "~/.vscode/mcp.json",
  "~/.config/Code/User/settings.json",
  "~/.config/Code/User/mcp.json",
  "~/.claude.json",
  "~/.gemini/settings.json",
  "~/.kiro/settings/mcp.json",
  "~/.gemini/antigravity/mcp_config.json",
];

const WINDOWS_WELL_KNOWN_CONFIGS = [
  "~/.codeium/windsurf/mcp_config.json",
  "~/.cursor/mcp.json",
  "~/.vscode/mcp.json",
  "~/AppData/Roaming/Code/User/settings.json",
  "~/AppData/Roaming/Code/User/mcp.json",
  "~/AppData/Roaming/Claude/claude_desktop_config.json",
  "~/.claude.json",
  "~/.gemini/settings.json",
  "~/.kiro/settings/mcp.json",
  "~/.gemini/antigravity/mcp_config.json",
];

export async function discoverWellKnownMcpConfigPaths(): Promise<string[]> {
  const list =
    platform() === "mac"
      ? MAC_WELL_KNOWN_CONFIGS
      : platform() === "linux"
        ? LINUX_WELL_KNOWN_CONFIGS
        : platform() === "windows"
          ? WINDOWS_WELL_KNOWN_CONFIGS
          : [];

  const out: string[] = [];
  for (const raw of list) {
    const p = expandHome(raw);
    if (await fileExists(p)) out.push(p);
  }
  return out;
}

