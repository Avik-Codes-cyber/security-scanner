/**
 * CLI Module Entry Point
 * 
 * Provides all exports for the CLI functionality.
 */

// Types
export type { McpSubcommand, McpCliOptions, ParsedArgs } from "./types";
export { SKIP_DIRS, SCAN_EXTENSIONS, SPECIAL_FILES, BINARY_EXTENSIONS } from "./types";

// Argument parsing
export { parseArgs, parseSeverity } from "./args";

// Help
export { printHelp } from "./help";

// Utilities
export { collectFiles, loadCompiledRules, parseHeaderList, parseMcpScanList } from "./utils";

// Output handling
export { handleScanOutput, generateReportFiles, saveScanResults, checkFailCondition } from "./output";

// Commands
export {
  runScan,
  watchAndScan,
  runHistoryCommand,
  runInteractiveScan,
  runMcpRemoteScan,
  runMcpStaticScan,
  runMcpConfigScan,
  runMcpKnownConfigsScan,
} from "./commands";

// Interactive mode
export {
  runInteractiveSession,
  promptScanPath,
  promptScanType,
  selectTargets,
  configureScanOptions,
  selectPrompt,
  multiselectPrompt,
  confirmPrompt,
  inputPrompt,
} from "./interactive";
