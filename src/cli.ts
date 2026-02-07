#!/usr/bin/env bun
/**
 * Security Scanner CLI Entry Point
 * 
 * This file has been refactored into modular components:
 * - cli/types.ts       - Type definitions and constants
 * - cli/args.ts        - Command-line argument parsing
 * - cli/help.ts        - Help text
 * - cli/utils.ts       - Shared utility functions
 * - cli/output.ts      - Output handling and report generation
 * - cli/commands/      - Individual command handlers
 *   - scan.ts          - Core scan command
 *   - watch.ts         - Watch mode
 *   - history.ts       - History management
 *   - mcp.ts           - MCP-related commands
 */

import {
  parseArgs,
  printHelp,
  runScan,
  watchAndScan,
  runHistoryCommand,
  runInteractiveScan,
  runMcpRemoteScan,
  runMcpStaticScan,
  runMcpConfigScan,
  runMcpKnownConfigsScan,
} from "./cli/index";

// Parse command-line arguments
const { command, targetPath, options, systemFlagSet, mcp } = parseArgs(process.argv.slice(2));

// In watch mode, include system skill folders by default unless explicitly set.
if (command === "watch" && !systemFlagSet && options.includeSystem === undefined) {
  options.includeSystem = true;
}

// Execute the appropriate command
if (command === "scan") {
  await runScan(targetPath, options);
} else if (command === "scan-all") {
  options.fullDepth = true;
  await runScan(targetPath, options);
} else if (command === "interactive" || command === "i") {
  // Interactive mode - path is optional, will be prompted if not provided
  await runInteractiveScan(targetPath === "." ? undefined : targetPath, options);
} else if (command === "watch") {
  await watchAndScan(targetPath, options);
} else if (command === "history" || command === "hist") {
  await runHistoryCommand(targetPath, options);
} else if (command === "mcp") {
  if (mcp.subcommand === "remote") {
    await runMcpRemoteScan(mcp.serverUrl ?? "", options, mcp);
  } else if (mcp.subcommand === "static") {
    await runMcpStaticScan(options, mcp);
  } else if (mcp.subcommand === "config") {
    await runMcpConfigScan(options, mcp);
  } else if (mcp.subcommand === "known-configs") {
    await runMcpKnownConfigsScan(options, mcp);
  } else {
    printHelp();
    process.exitCode = 1;
  }
} else {
  printHelp();
  process.exitCode = 1;
}
