import type { ScanOptions, Severity } from "../scanner/types";
import { SKIP_DIRS, SCAN_EXTENSIONS, SPECIAL_FILES, BINARY_EXTENSIONS } from "../constants";

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

// Re-export constants for backward compatibility
export { SKIP_DIRS, SCAN_EXTENSIONS, SPECIAL_FILES, BINARY_EXTENSIONS };
