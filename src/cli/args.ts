import type { ScanOptions, Severity } from "../scanner/types";
import type { McpCliOptions, ParsedArgs } from "./types";
import { printHelp } from "./help";

/**
 * Extract value from --flag=value, preserving multiple = signs
 */
function extractFlagValue(arg: string): string | undefined {
  const eqIndex = arg.indexOf("=");
  if (eqIndex === -1) return undefined;
  return arg.substring(eqIndex + 1);
}

/**
 * Parse a severity string into a valid Severity type
 */
export function parseSeverity(value?: string): Severity | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === "LOW" || upper === "MEDIUM" || upper === "HIGH" || upper === "CRITICAL") {
    return upper;
  }
  return undefined;
}

/**
 * Parse command-line arguments into structured options
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith("-") ? args.shift()! : "scan";
  const mcp: McpCliOptions = { headers: [] };

  let targetPath = ".";

  if (command === "mcp") {
    const sub = args[0] && !args[0].startsWith("-") ? args.shift()! : "";
    if (sub === "remote" || sub === "static" || sub === "config" || sub === "known-configs") {
      mcp.subcommand = sub;
    }
    if (mcp.subcommand === "remote") {
      const url = args[0] && !args[0].startsWith("-") ? args.shift()! : "";
      if (url) mcp.serverUrl = url;
    }
    if (mcp.subcommand === "config") {
      const path = args[0] && !args[0].startsWith("-") ? args.shift()! : "";
      if (path) mcp.configPath = path;
    }
  } else if (command === "history" || command === "hist") {
    // For history command, the first arg is a subcommand (stats, clear, scan-id, etc.)
    targetPath = args[0] && !args[0].startsWith("-") ? args.shift()! : "";
  } else {
    targetPath = args[0] && !args[0].startsWith("-") ? args.shift()! : ".";
  }

  const options: ScanOptions & { watch?: boolean } = {
    json: false,
    tui: undefined,
    extraSkillDirs: [],
    extraExtensionDirs: [],
    extraIDEExtensionDirs: [],
    tags: [],
    useBehavioral: true,
    format: "table",
  };

  let systemFlagSet = false;

  while (args.length) {
    const arg = args.shift()!;
    if (arg === "--json") {
      options.json = true;
      options.format = "json";
    }
    else if (arg === "--tui") options.tui = true;
    else if (arg === "--no-tui") options.tui = false;
    else if (arg === "--fix") options.fix = true;
    else if (arg === "--system" || arg === "--include-system") {
      options.includeSystem = true;
      systemFlagSet = true;
    }
    else if (arg === "--no-system") {
      options.includeSystem = false;
      systemFlagSet = true;
    }
    else if (arg === "--extensions" || arg === "--include-extensions") options.includeExtensions = true;
    else if (arg === "--no-extensions") options.includeExtensions = false;
    else if (arg === "--ide-extensions" || arg === "--include-ide-extensions") options.includeIDEExtensions = true;
    else if (arg === "--no-ide-extensions") options.includeIDEExtensions = false;
    else if (arg === "--ide-extensions-dir") {
      const value = args.shift();
      if (value) options.extraIDEExtensionDirs?.push(value);
    } else if (arg.startsWith("--ide-extensions-dir=")) {
      const value = extractFlagValue(arg);
      if (value) options.extraIDEExtensionDirs?.push(value);
    }
    else if (arg === "--full-depth" || arg === "--recursive") options.fullDepth = true;
    else if (arg === "--use-behavioral") options.useBehavioral = true;
    else if (arg === "--no-behavioral") options.useBehavioral = false;
    else if (arg === "--enable-meta") options.enableMeta = true;
    else if (arg === "--bearer-token") {
      const value = args.shift();
      if (value) mcp.bearerToken = value;
    } else if (arg.startsWith("--bearer-token=")) {
      const value = extractFlagValue(arg);
      if (value) mcp.bearerToken = value;
    }
    else if (arg === "--header") {
      const value = args.shift();
      if (value) mcp.headers.push(value);
    } else if (arg.startsWith("--header=")) {
      const value = extractFlagValue(arg);
      if (value) mcp.headers.push(value);
    }
    else if (arg === "--scan") {
      const value = args.shift();
      if (value) mcp.scan = value;
    } else if (arg.startsWith("--scan=")) {
      const value = extractFlagValue(arg);
      if (value) mcp.scan = value;
    }
    else if (arg === "--read-resources") {
      mcp.readResources = true;
    }
    else if (arg === "--connect") {
      mcp.connect = true;
    }
    else if (arg === "--mime-types") {
      const value = args.shift();
      if (value) mcp.mimeTypes = value;
    } else if (arg.startsWith("--mime-types=")) {
      const value = extractFlagValue(arg);
      if (value) mcp.mimeTypes = value;
    }
    else if (arg === "--max-resource-bytes") {
      const value = args.shift();
      const num = Number(value);
      if (value && !isNaN(num)) mcp.maxResourceBytes = num;
    } else if (arg.startsWith("--max-resource-bytes=")) {
      const value = extractFlagValue(arg);
      const num = Number(value);
      if (value && !isNaN(num)) mcp.maxResourceBytes = num;
    }
    else if (arg === "--tools") {
      const value = args.shift();
      if (value) mcp.toolsFile = value;
    } else if (arg.startsWith("--tools=")) {
      const value = extractFlagValue(arg);
      if (value) mcp.toolsFile = value;
    }
    else if (arg === "--prompts") {
      const value = args.shift();
      if (value) mcp.promptsFile = value;
    } else if (arg.startsWith("--prompts=")) {
      const value = extractFlagValue(arg);
      if (value) mcp.promptsFile = value;
    }
    else if (arg === "--resources") {
      const value = args.shift();
      if (value) mcp.resourcesFile = value;
    } else if (arg.startsWith("--resources=")) {
      const value = extractFlagValue(arg);
      if (value) mcp.resourcesFile = value;
    }
    else if (arg === "--instructions") {
      const value = args.shift();
      if (value) mcp.instructionsFile = value;
    } else if (arg.startsWith("--instructions=")) {
      const value = extractFlagValue(arg);
      if (value) mcp.instructionsFile = value;
    }
    else if (arg === "--format") {
      const value = args.shift();
      if (value === "json" || value === "table" || value === "sarif") {
        options.format = value;
      }
    } else if (arg.startsWith("--format=")) {
      const value = extractFlagValue(arg);
      if (value === "json" || value === "table" || value === "sarif") {
        options.format = value;
      }
    } else if (arg === "--output") {
      const value = args.shift();
      if (value) options.output = value;
    } else if (arg.startsWith("--output=")) {
      const value = extractFlagValue(arg);
      if (value) options.output = value;
    } else if (arg === "--fail-on-findings") {
      options.failOn = "LOW";
    }
    else if (arg === "--skills-dir") {
      const value = args.shift();
      if (value) options.extraSkillDirs?.push(value);
    } else if (arg.startsWith("--skills-dir=")) {
      const value = extractFlagValue(arg);
      if (value) options.extraSkillDirs?.push(value);
    }
    else if (arg === "--extensions-dir") {
      const value = args.shift();
      if (value) options.extraExtensionDirs?.push(value);
    } else if (arg.startsWith("--extensions-dir=")) {
      const value = extractFlagValue(arg);
      if (value) options.extraExtensionDirs?.push(value);
    }
    else if (arg === "--fail-on") {
      options.failOn = parseSeverity(args.shift());
    } else if (arg.startsWith("--fail-on=")) {
      options.failOn = parseSeverity(extractFlagValue(arg));
    }
    else if (arg === "--save") {
      options.save = true;
    }
    else if (arg === "--tag") {
      const value = args.shift();
      if (value) options.tags?.push(value);
    } else if (arg.startsWith("--tag=")) {
      const value = extractFlagValue(arg);
      if (value) options.tags?.push(value);
    }
    else if (arg === "--notes") {
      const value = args.shift();
      if (value) options.notes = value;
    } else if (arg.startsWith("--notes=")) {
      const value = extractFlagValue(arg);
      if (value) options.notes = value;
    }
    else if (arg === "--compare-with") {
      const value = args.shift();
      if (value) options.compareWith = value;
    } else if (arg.startsWith("--compare-with=")) {
      const value = extractFlagValue(arg);
      if (value) options.compareWith = value;
    }
    else if (arg === "--report-dir") {
      const value = args.shift();
      if (value) options.reportDir = value;
    } else if (arg.startsWith("--report-dir=")) {
      const value = extractFlagValue(arg);
      if (value) options.reportDir = value;
    }
    else if (arg === "--report-format") {
      const value = args.shift();
      if (value) {
        const formats = value.split(",").map((f) => f.trim().toLowerCase()) as ("json" | "html" | "csv")[];
        options.reportFormats = formats;
      }
    } else if (arg.startsWith("--report-format=")) {
      const value = extractFlagValue(arg);
      if (value) {
        const formats = value.split(",").map((f) => f.trim().toLowerCase()) as ("json" | "html" | "csv")[];
        options.reportFormats = formats;
      }
    }
    else if (arg === "--show-confidence") {
      options.showConfidence = true;
    }
    else if (arg === "--min-confidence") {
      const value = args.shift();
      const num = Number(value);
      if (value && !isNaN(num) && num >= 0 && num <= 1) {
        options.minConfidence = num;
        options.showConfidence = true; // Auto-enable confidence display
      }
    } else if (arg.startsWith("--min-confidence=")) {
      const value = extractFlagValue(arg);
      const num = Number(value);
      if (value && !isNaN(num) && num >= 0 && num <= 1) {
        options.minConfidence = num;
        options.showConfidence = true; // Auto-enable confidence display
      }
    }
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { command, targetPath, options, systemFlagSet, mcp };
}
