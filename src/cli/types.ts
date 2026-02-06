import type { ScanOptions, Severity } from "../scanner/types";

/**
 * MCP CLI subcommand types
 */
export type McpSubcommand = "remote" | "static" | "config" | "known-configs";

/**
 * MCP-specific CLI options
 */
export type McpCliOptions = {
  subcommand?: McpSubcommand;
  serverUrl?: string;
  configPath?: string;
  bearerToken?: string;
  headers: string[];
  scan?: string;
  readResources?: boolean;
  mimeTypes?: string;
  maxResourceBytes?: number;
  connect?: boolean;
  toolsFile?: string;
  promptsFile?: string;
  resourcesFile?: string;
  instructionsFile?: string;
};

/**
 * Result from parsing command-line arguments
 */
export type ParsedArgs = {
  command: string;
  targetPath: string;
  options: ScanOptions & { watch?: boolean };
  systemFlagSet: boolean;
  mcp: McpCliOptions;
};

/**
 * Constants for file scanning
 */
export const SKIP_DIRS = ["node_modules", ".git", "dist", "build", "__pycache__"];
export const SCAN_EXTENSIONS = new Set([".py", ".ts", ".js", ".mjs", ".cjs", ".sh", ".bash"]);
export const SPECIAL_FILES = new Set(["SKILL.md", "manifest.json", "package.json"]);
export const BINARY_EXTENSIONS = new Set([".exe", ".bin", ".dll", ".so", ".dylib", ".jar", ".crx", ".xpi", ".zip"]);
