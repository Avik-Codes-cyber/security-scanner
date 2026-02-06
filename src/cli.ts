#!/usr/bin/env bun
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { watch } from "fs";
import { discoverSkills, getSearchRoots } from "./scanner/discover";
import { discoverBrowserExtensions, discoverBrowserExtensionWatchRoots } from "./scanner/browser-extensions";
import { discoverIDEExtensions, discoverIDEExtensionWatchRoots, type IDEExtensionTarget } from "./scanner/ide-extensions";
import { scanStorage, type StoredScan, type ScanQuery } from "./storage/scan-storage";
import { loadRulesFromFile, loadRulesFromText } from "./scanner/rule-engine";
import { scanFile } from "./scanner/scan-file";
import { scanContentItem } from "./scanner/scan-content";
import type { Finding, Severity, ScanOptions, Target, ScanResult } from "./scanner/types.ts";
import { applyMetaAnalyzer, formatSummary, renderTable, shouldFail, summarizeFindings, toJson } from "./scanner/report";
import { generateReport } from "./scanner/report-generator";
import { applyFixes } from "./scanner/fix";
import { toSarif } from "./scanner/sarif";
import { createTui } from "./utils/tui";
import { dirExists, isInSkippedDir, sanitizePath } from "./utils/fs";
import { signaturesYaml } from "./rules/signatures";
import { collectFromServer } from "./scanner/mcp/collect";
import { loadStaticInputs } from "./scanner/mcp/static";
import { staticLabelFromFiles, virtualizeRemote, virtualizeStatic } from "./scanner/mcp/virtualize";
import { discoverWellKnownMcpConfigPaths } from "./scanner/mcp/known-configs";
import { loadAndExtractMcpServers } from "./scanner/mcp/config";

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", "__pycache__"];
const SCAN_EXTENSIONS = new Set([".py", ".ts", ".js", ".mjs", ".cjs", ".sh", ".bash"]);
const SPECIAL_FILES = new Set(["SKILL.md", "manifest.json", "package.json"]);
const BINARY_EXTENSIONS = new Set([".exe", ".bin", ".dll", ".so", ".dylib", ".jar", ".crx", ".xpi", ".zip"]);

function parseSeverity(value?: string): Severity | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === "LOW" || upper === "MEDIUM" || upper === "HIGH" || upper === "CRITICAL") {
    return upper;
  }
  return undefined;
}

type McpSubcommand = "remote" | "static" | "config" | "known-configs";

type McpCliOptions = {
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

function parseArgs(argv: string[]) {
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
      const value = arg.split("=")[1];
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
      const value = arg.split("=")[1];
      if (value) mcp.bearerToken = value;
    }
    else if (arg === "--header") {
      const value = args.shift();
      if (value) mcp.headers.push(value);
    } else if (arg.startsWith("--header=")) {
      const value = arg.split("=")[1];
      if (value) mcp.headers.push(value);
    }
    else if (arg === "--scan") {
      const value = args.shift();
      if (value) mcp.scan = value;
    } else if (arg.startsWith("--scan=")) {
      const value = arg.split("=")[1];
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
      const value = arg.split("=")[1];
      if (value) mcp.mimeTypes = value;
    }
    else if (arg === "--max-resource-bytes") {
      const value = args.shift();
      if (value) mcp.maxResourceBytes = Number(value);
    } else if (arg.startsWith("--max-resource-bytes=")) {
      const value = arg.split("=")[1];
      if (value) mcp.maxResourceBytes = Number(value);
    }
    else if (arg === "--tools") {
      const value = args.shift();
      if (value) mcp.toolsFile = value;
    } else if (arg.startsWith("--tools=")) {
      const value = arg.split("=")[1];
      if (value) mcp.toolsFile = value;
    }
    else if (arg === "--prompts") {
      const value = args.shift();
      if (value) mcp.promptsFile = value;
    } else if (arg.startsWith("--prompts=")) {
      const value = arg.split("=")[1];
      if (value) mcp.promptsFile = value;
    }
    else if (arg === "--resources") {
      const value = args.shift();
      if (value) mcp.resourcesFile = value;
    } else if (arg.startsWith("--resources=")) {
      const value = arg.split("=")[1];
      if (value) mcp.resourcesFile = value;
    }
    else if (arg === "--instructions") {
      const value = args.shift();
      if (value) mcp.instructionsFile = value;
    } else if (arg.startsWith("--instructions=")) {
      const value = arg.split("=")[1];
      if (value) mcp.instructionsFile = value;
    }
    else if (arg === "--format") {
      const value = args.shift();
      if (value === "json" || value === "table" || value === "sarif") {
        options.format = value;
      }
    } else if (arg.startsWith("--format=")) {
      const value = arg.split("=")[1];
      if (value === "json" || value === "table" || value === "sarif") {
        options.format = value;
      }
    } else if (arg === "--output") {
      const value = args.shift();
      if (value) options.output = value;
    } else if (arg.startsWith("--output=")) {
      const value = arg.split("=")[1];
      if (value) options.output = value;
    } else if (arg === "--fail-on-findings") {
      options.failOn = "LOW";
    }
    else if (arg === "--skills-dir") {
      const value = args.shift();
      if (value) options.extraSkillDirs?.push(value);
    } else if (arg.startsWith("--skills-dir=")) {
      const value = arg.split("=")[1];
      if (value) options.extraSkillDirs?.push(value);
    }
    else if (arg === "--extensions-dir") {
      const value = args.shift();
      if (value) options.extraExtensionDirs?.push(value);
    } else if (arg.startsWith("--extensions-dir=")) {
      const value = arg.split("=")[1];
      if (value) options.extraExtensionDirs?.push(value);
    }
    else if (arg === "--fail-on") {
      options.failOn = parseSeverity(args.shift());
    } else if (arg.startsWith("--fail-on=")) {
      options.failOn = parseSeverity(arg.split("=")[1]);
    }
    else if (arg === "--save") {
      options.save = true;
    }
    else if (arg === "--tag") {
      const value = args.shift();
      if (value) options.tags?.push(value);
    } else if (arg.startsWith("--tag=")) {
      const value = arg.split("=")[1];
      if (value) options.tags?.push(value);
    }
    else if (arg === "--notes") {
      const value = args.shift();
      if (value) options.notes = value;
    } else if (arg.startsWith("--notes=")) {
      const value = arg.split("=")[1];
      if (value) options.notes = value;
    }
    else if (arg === "--compare-with") {
      const value = args.shift();
      if (value) options.compareWith = value;
    } else if (arg.startsWith("--compare-with=")) {
      const value = arg.split("=")[1];
      if (value) options.compareWith = value;
    }
    else if (arg === "--report-dir") {
      const value = args.shift();
      if (value) options.reportDir = value;
    } else if (arg.startsWith("--report-dir=")) {
      const value = arg.split("=")[1];
      if (value) options.reportDir = value;
    }
    else if (arg === "--report-format") {
      const value = args.shift();
      if (value) {
        const formats = value.split(",").map((f) => f.trim().toLowerCase()) as ("json" | "html" | "csv")[];
        options.reportFormats = formats;
      }
    } else if (arg.startsWith("--report-format=")) {
      const value = arg.split("=")[1];
      if (value) {
        const formats = value.split(",").map((f) => f.trim().toLowerCase()) as ("json" | "html" | "csv")[];
        options.reportFormats = formats;
      }
    }
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { command, targetPath, options, systemFlagSet, mcp };
}

function printHelp() {
  const help = `Security Scanner - Skills, Extensions, and MCP Security Scanner

Usage:
  securityscanner scan <path> [options]
  securityscanner scan-all <path> [options]
  securityscanner watch <path> [options]
  securityscanner mcp remote <serverUrl> [options]
  securityscanner mcp static [options]
  securityscanner mcp config <configPath> [options]
  securityscanner mcp known-configs [options]

Options:
  --json            Output JSON report (alias for --format json)
  --format <type>   Output format: table | json | sarif
  --output <file>   Write report to file instead of stdout
  --report-dir <dir>    Generate report files in the specified directory
  --report-format <fmt> Report file formats (comma-separated): json,html,csv (default: html,json)
  --fail-on-findings  Exit non-zero if any findings are detected
  --fail-on <lvl>   Exit non-zero if findings at or above level (LOW, MEDIUM, HIGH, CRITICAL)
  --tui             Force TUI rendering
  --no-tui          Disable TUI rendering
  --fix             Comment out matched lines in supported file types (see README)
  --system          Include common system skill directories (e.g., ~/.codex/skills)
  --no-system       Exclude system skill directories
  --extensions      Include installed browser extensions (Chromium browsers + Firefox unpacked)
  --no-extensions   Exclude browser extensions
  --ide-extensions  Include installed IDE extensions (VS Code, Cursor, JetBrains, etc.)
  --no-ide-extensions  Exclude IDE extensions
  --extensions-dir  Add an extra extensions root to scan (repeatable)
  --ide-extensions-dir  Add an extra IDE extensions root to scan (repeatable)
  --skills-dir      Add an extra skills root to scan (repeatable)
  --save            Save scan results to local storage for later reference
  --tag <tag>       Add a tag to the saved scan (repeatable)
  --notes <text>    Add notes to the saved scan
  --compare-with <id>  Compare results with a previous scan by ID
  --full-depth      Always search recursively for SKILL.md (slower)
  --recursive       Alias for --full-depth
  --use-behavioral  Enable behavioral heuristic engine
  --no-behavioral   Disable behavioral heuristic engine
  --enable-meta     Enable meta-analyzer (false-positive filtering)

MCP Options (mcp remote):
  --bearer-token <t>   Bearer token (Authorization: Bearer <t>)
  --header "K: V"      Custom header (repeatable)
  --scan <csv>         tools,prompts,resources,instructions (default: tools,instructions,prompts)
  --read-resources     Read and scan resource contents (default: off)
  --mime-types <csv>   Allowed resource mime types (default: text/plain,text/markdown,text/html,application/json)
  --max-resource-bytes <n>  Max bytes to read per resource (default: 1048576)

MCP Options (mcp static):
  --tools <file>         Tools JSON file (array or {tools:[...]})
  --prompts <file>       Prompts JSON file (array or {prompts:[...]})
  --resources <file>     Resources JSON file (array or {resources:[...]})
  --instructions <file>  Instructions JSON file (string or {instructions:\"...\"})

MCP Options (mcp config / known-configs):
  --connect         Extract serverUrl entries and run remote scans (default: scan config file text only)

Examples:
  securityscanner scan /path/to/skill
  securityscanner scan /path/to/skill --use-behavioral
  securityscanner scan /path/to/skill --enable-meta
  securityscanner scan /path/to/skill --report-dir ./reports
  securityscanner scan /path/to/skill --report-dir ./reports --report-format html,json,csv
  securityscanner scan-all /path/to/skills --recursive --use-behavioral
  securityscanner scan-all ./skills --fail-on-findings --format sarif --output results.sarif
  securityscanner scan . --extensions
  securityscanner scan . --report-dir /tmp/security-reports --report-format html
  securityscanner scan ./my-project --save --report-dir ./scans --report-format html,json
  securityscanner mcp remote https://your-server/mcp --format json
  securityscanner mcp static --tools ./tools.json --format table
  securityscanner mcp known-configs
  securityscanner mcp known-configs --connect --format json
  securityscanner history                    List recent scans
  securityscanner history --json             Output scan history as JSON
  securityscanner history <scan-id>          Show details of a specific scan
  securityscanner history --stats            Show scan statistics
  securityscanner history --delete <id>      Delete a specific scan
  securityscanner history --clear            Delete all scan history
`;

  console.log(help);
}

async function runHistoryCommand(subcommand: string, options: ScanOptions) {
  const format = options.format ?? (options.json ? "json" : "table");

  if (subcommand === "--stats" || subcommand === "stats") {
    const stats = await scanStorage.getStats();
    if (format === "json") {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log("Scan History Statistics");
      console.log("======================");
      console.log(`Total scans: ${stats.totalScans}`);
      console.log(`Total findings: ${stats.totalFindings}`);
      console.log("\nFindings by severity:");
      console.log(`  CRITICAL: ${stats.findingsBySeverity.CRITICAL}`);
      console.log(`  HIGH: ${stats.findingsBySeverity.HIGH}`);
      console.log(`  MEDIUM: ${stats.findingsBySeverity.MEDIUM}`);
      console.log(`  LOW: ${stats.findingsBySeverity.LOW}`);
      if (stats.dateRange) {
        console.log(`\nDate range: ${stats.dateRange.earliest} to ${stats.dateRange.latest}`);
      }
    }
    return;
  }

  if (subcommand === "--clear" || subcommand === "clear") {
    await scanStorage.deleteAll();
    console.log("All scan history cleared.");
    return;
  }

  if (subcommand?.startsWith("--delete ")) {
    const id = subcommand.slice(9).trim();
    if (await scanStorage.delete(id)) {
      console.log(`Scan ${id} deleted.`);
    } else {
      console.error(`Scan ${id} not found.`);
      process.exitCode = 1;
    }
    return;
  }

  // If subcommand looks like an ID, show details
  if (subcommand && !subcommand.startsWith("--")) {
    const scan = await scanStorage.get(subcommand);
    if (!scan) {
      console.error(`Scan ${subcommand} not found.`);
      process.exitCode = 1;
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(scan, null, 2));
    } else {
      console.log(`Scan Details: ${scan.id}`);
      console.log("=".repeat(50));
      console.log(`Timestamp: ${scan.timestamp}`);
      console.log(`Command: ${scan.command}`);
      console.log(`Target: ${scan.targetPath}`);
      console.log(`Hostname: ${scan.hostname}`);
      console.log(`Platform: ${scan.platform}`);
      if (scan.tags?.length) console.log(`Tags: ${scan.tags.join(", ")}`);
      if (scan.notes) console.log(`Notes: ${scan.notes}`);
      console.log("\nSummary:");
      console.log(`  Files scanned: ${scan.summary.scannedFiles}`);
      console.log(`  Findings: ${scan.summary.findingCount}`);
      console.log(`  Elapsed: ${scan.summary.elapsedMs}ms`);
      console.log("\nFindings by severity:");
      console.log(`  CRITICAL: ${scan.summary.severities.CRITICAL}`);
      console.log(`  HIGH: ${scan.summary.severities.HIGH}`);
      console.log(`  MEDIUM: ${scan.summary.severities.MEDIUM}`);
      console.log(`  LOW: ${scan.summary.severities.LOW}`);
      if (scan.findings.length > 0) {
        console.log("\nFindings:");
        scan.findings.forEach((f, i) => {
          console.log(`  ${i + 1}. [${f.severity}] ${f.ruleId}: ${f.message}`);
          if (f.file) console.log(`     File: ${f.file}:${f.line ?? ""}`);
        });
      }
    }
    return;
  }

  // Default: list recent scans
  const query: import("./storage/scan-storage.ts").ScanQuery = {};

  if (options.targetPath) {
    query.targetPath = options.targetPath;
  }

  const scans = await scanStorage.query(query);

  if (format === "json") {
    console.log(JSON.stringify(scans, null, 2));
  } else {
    if (scans.length === 0) {
      console.log("No scans found in history.");
      return;
    }

    console.log("Recent Scans");
    console.log("============");
    scans.forEach((scan, i) => {
      const date = new Date(scan.timestamp).toLocaleString();
      const tags = scan.tags?.length ? ` [${scan.tags.join(", ")}]` : "";
      console.log(`${i + 1}. ${scan.id}`);
      console.log(`   Date: ${date}`);
      console.log(`   Target: ${scan.targetPath}`);
      console.log(`   Files: ${scan.summary.scannedFiles}, Findings: ${scan.summary.findingCount}${tags}`);
      console.log();
    });
  }
}

async function collectFiles(scanRoots: string[], options?: { includeDocs?: boolean }): Promise<string[]> {
  const fileSet = new Set<string>();

  for (const root of scanRoots) {
    const sanitizedRoot = sanitizePath(root);
    if (!(await dirExists(sanitizedRoot))) {
      continue;
    }
    const glob = new Bun.Glob("**/*");
    for await (const relPath of glob.scan({ cwd: sanitizedRoot, onlyFiles: true })) {
      if (isInSkippedDir(relPath, SKIP_DIRS)) continue;

      const base = relPath.split(/[\\/]/g).pop() ?? relPath;
      const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")).toLowerCase() : "";

      if (options?.includeDocs) {
        if (!BINARY_EXTENSIONS.has(ext)) {
          fileSet.add(join(sanitizedRoot, relPath));
        }
        continue;
      }

      if (SPECIAL_FILES.has(base) || SCAN_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(ext)) {
        fileSet.add(join(sanitizedRoot, relPath));
      }
    }
  }

  return Array.from(fileSet).sort();
}

async function loadCompiledRules(basePath: string) {
  const rulesPathFromImport = fileURLToPath(new URL("./rules/signatures.yaml", import.meta.url));
  const rulesCandidates = [
    process.env.SKILL_SCANNER_RULES ?? process.env.SKILLGUARD_RULES,
    join(basePath, "rules", "signatures.yaml"),
    join(dirname(process.execPath), "rules", "signatures.yaml"),
    rulesPathFromImport,
  ].filter(Boolean) as string[];

  for (const candidate of rulesCandidates) {
    try {
      return await loadRulesFromFile(candidate);
    } catch {
      // continue
    }
  }

  return loadRulesFromText(signaturesYaml);
}

async function runScan(targetPath: string, options: ScanOptions) {
  if (options.fix) {
    console.warn("Note: --fix will comment out matched lines in supported file types.");
  }
  if (options.fix && options.format === "sarif") {
    console.warn("Note: --fix with --format sarif will still apply fixes before reporting.");
  }
  const start = Date.now();
  const basePath = sanitizePath(resolve(targetPath));
  const rules = await loadCompiledRules(basePath);

  const skills = await discoverSkills(basePath, {
    includeSystem: options.includeSystem,
    extraSkillDirs: options.extraSkillDirs,
    fullDepth: options.fullDepth,
  });
  const extensions = options.includeExtensions ? await discoverBrowserExtensions(options.extraExtensionDirs) : [];
  const ideExtensions = options.includeIDEExtensions ? await discoverIDEExtensions(options.extraIDEExtensionDirs) : [];

  const targets: Target[] = [
    ...skills.map((s) => ({ kind: "skill" as const, name: s.name, path: s.path })),
    ...extensions.map((e) => ({
      kind: "extension" as const,
      name: e.name,
      path: e.path,
      meta: {
        browser: e.browser,
        profile: e.profile,
        id: e.id,
        version: e.version,
      },
    })),
    ...ideExtensions.map((e) => ({
      kind: "ide-extension" as const,
      name: e.name,
      path: e.path,
      meta: {
        ide: e.ide,
        extensionId: e.extensionId,
        version: e.version,
        publisher: e.publisher,
        isBuiltin: e.isBuiltin,
      },
    })),
  ];

  const scanPlans = targets.length
    ? await Promise.all(
      targets.map(async (target) => ({
        name: target.name,
        path: target.path,
        files: await collectFiles([target.path], { includeDocs: true }),
      }))
    )
    : [
      {
        name: "root",
        path: basePath,
        files: await collectFiles([basePath], { includeDocs: false }),
      },
    ];

  const totalFiles = scanPlans.reduce((sum, plan) => sum + plan.files.length, 0);

  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, scanPlans.length);

  const findings: Finding[] = [];

  const concurrency = Math.min(32, Math.max(4, Math.floor((navigator.hardwareConcurrency ?? 8) / 2)));

  for (let i = 0; i < scanPlans.length; i++) {
    const plan = scanPlans[i];
    tui.beginTarget(i + 1, scanPlans.length, plan.name, plan.files.length);

    const skillFindings: Finding[] = [];
    let index = 0;

    const worker = async () => {
      while (index < plan.files.length) {
        const filePath = plan.files[index++];
        try {
          const fileFindings = await scanFile(filePath, rules, options);
          if (fileFindings.length) {
            skillFindings.push(...fileFindings);
            tui.onFindings(fileFindings);
          }
        } catch {
          // ignore unreadable file
        } finally {
          tui.onFile(filePath);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));

    const filteredSkillFindings = options.enableMeta ? applyMetaAnalyzer(skillFindings) : skillFindings;

    if (options.fix && filteredSkillFindings.length > 0) {
      await applyFixes(filteredSkillFindings);
    }
    if (options.enableMeta) {
      tui.setCurrentFindings(filteredSkillFindings);
    }

    findings.push(...filteredSkillFindings);
    tui.completeTarget(
      {
        name: plan.name,
        files: plan.files.length,
        findings: filteredSkillFindings.length,
        counts: summarizeFindings(filteredSkillFindings),
      },
      filteredSkillFindings
    );
  }

  const elapsedMs = Date.now() - start;
  tui.finish();

  const filteredFindings = options.enableMeta ? applyMetaAnalyzer(findings) : findings;

  const result: ScanResult = {
    targets: targets.length ? targets : [{ kind: "path" as const, name: "root", path: basePath }],
    findings: filteredFindings,
    scannedFiles: totalFiles,
    elapsedMs,
  };

  let outputText: string | null = null;
  const format = outputFormat;

  if (format === "json") {
    outputText = toJson(result);
  } else if (format === "sarif") {
    outputText = toSarif(result);
  }

  if (options.output && outputText !== null) {
    await Bun.write(options.output, outputText);
  }

  if (format === "table") {
    if (!tuiEnabled) {
      console.log(formatSummary(result));
      console.log("");
      console.log(renderTable(result.findings));
    } else {
      console.log(formatSummary(result));
    }
  } else if (!options.output && outputText !== null) {
    console.log(outputText);
  } else {
    console.log(formatSummary(result));
  }

  if (shouldFail(result.findings, options.failOn)) {
    process.exitCode = 2;
  }

  // Generate report files if specified
  if (options.reportDir) {
    try {
      const reportFormats = options.reportFormats || ["html", "json"];
      const generatedReport = await generateReport(result, result.targets, {
        reportDir: options.reportDir,
        formats: reportFormats,
      });

      console.log("\n📄 Report Generated:");
      if (generatedReport.htmlPath) {
        console.log(`  HTML: ${generatedReport.htmlPath}`);
      }
      if (generatedReport.jsonPath) {
        console.log(`  JSON: ${generatedReport.jsonPath}`);
      }
      if (generatedReport.csvPath) {
        console.log(`  CSV: ${generatedReport.csvPath}`);
      }
    } catch (err) {
      console.error("Error generating report:", err instanceof Error ? err.message : String(err));
    }
  }

  if (options.save) {
    const stored = await scanStorage.save(result, "scan", targetPath, {
      tags: options.tags,
      notes: options.notes,
    });
    console.log(`\nScan saved with ID: ${stored.id}`);

    if (options.compareWith) {
      const comparison = await scanStorage.compare(options.compareWith, stored.id);
      if (comparison) {
        console.log("\nComparison with previous scan:");
        console.log(`  New findings: ${comparison.added.length}`);
        console.log(`  Resolved findings: ${comparison.removed.length}`);
        console.log(`  Unchanged: ${comparison.unchanged.length}`);
        if (comparison.severityChanges.length > 0) {
          console.log(`  Severity changes: ${comparison.severityChanges.length}`);
        }
      }
    }
  }

  return result;
}

function parseHeaderList(values: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const v of values) {
    const idx = v.indexOf(":");
    if (idx <= 0) continue;
    const key = v.slice(0, idx).trim();
    const value = v.slice(idx + 1).trim();
    if (!key) continue;
    headers[key] = value;
  }
  return headers;
}

function parseMcpScanList(value?: string): Array<"tools" | "prompts" | "resources" | "instructions"> {
  const allowed = new Set(["tools", "prompts", "resources", "instructions"]);
  if (!value) return ["tools", "instructions", "prompts"];
  const parts = value
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .filter((p) => allowed.has(p));
  const uniq = Array.from(new Set(parts));
  return (uniq.length ? uniq : ["tools", "instructions", "prompts"]) as Array<
    "tools" | "prompts" | "resources" | "instructions"
  >;
}

async function runMcpRemoteScan(serverUrl: string, options: ScanOptions, mcp: McpCliOptions) {
  if (!serverUrl) {
    console.error("Missing MCP server URL. Usage: skill-scanner mcp remote <serverUrl>");
    process.exitCode = 1;
    return;
  }

  if (options.fix) {
    console.warn("Note: --fix is not supported for MCP targets (no local files to modify). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const headers = parseHeaderList(mcp.headers ?? []);
  if (mcp.bearerToken) {
    headers["Authorization"] = `Bearer ${mcp.bearerToken}`;
  }

  const scanList = parseMcpScanList(mcp.scan);
  const allowedMimeTypes = (mcp.mimeTypes ?? "text/plain,text/markdown,text/html,application/json")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const maxResourceBytes =
    typeof mcp.maxResourceBytes === "number" && Number.isFinite(mcp.maxResourceBytes)
      ? Math.max(1, Math.floor(mcp.maxResourceBytes))
      : 1_048_576;

  const collected = await collectFromServer(serverUrl, {
    headers,
    scan: scanList,
    readResources: Boolean(mcp.readResources),
    allowedMimeTypes,
    maxResourceBytes,
  }).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to connect to MCP server: ${serverUrl}`);
    console.error(msg);
    process.exitCode = 1;
    return null;
  });

  if (!collected) return;

  const { host, files, scannedObjects } = virtualizeRemote(serverUrl, collected, { readResources: Boolean(mcp.readResources) });

  const totalFiles = files.length;
  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, 1);
  tui.beginTarget(1, 1, host, totalFiles);

  const targetFindings: Finding[] = [];
  for (const item of files) {
    try {
      const fileFindings = scanContentItem(item, rules, options);
      if (fileFindings.length) {
        targetFindings.push(...fileFindings);
        tui.onFindings(fileFindings);
      }
    } finally {
      tui.onFile(item.virtualPath);
    }
  }

  const filteredTargetFindings = options.enableMeta ? applyMetaAnalyzer(targetFindings) : targetFindings;
  if (options.enableMeta) tui.setCurrentFindings(filteredTargetFindings);

  tui.completeTarget(
    { name: host, files: totalFiles, findings: filteredTargetFindings.length, counts: summarizeFindings(filteredTargetFindings) },
    filteredTargetFindings
  );

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result = {
    targets: [
      {
        kind: "mcp",
        name: host,
        path: serverUrl,
        meta: { serverUrl, transport: "http", scannedObjects },
      },
    ] as Target[],
    findings: filteredTargetFindings,
    scannedFiles: totalFiles,
    elapsedMs,
  };

  let outputText: string | null = null;
  if (outputFormat === "json") outputText = toJson(result);
  else if (outputFormat === "sarif") outputText = toSarif(result);

  if (options.output && outputText !== null) {
    await Bun.write(options.output, outputText);
  }

  if (outputFormat === "table") {
    if (!tuiEnabled) {
      console.log(formatSummary(result));
      console.log("");
      console.log(renderTable(result.findings));
    } else {
      console.log(formatSummary(result));
    }
  } else if (!options.output && outputText !== null) {
    console.log(outputText);
  } else {
    console.log(formatSummary(result));
  }

  if (shouldFail(result.findings, options.failOn)) {
    process.exitCode = 2;
  }

  return result;
}

async function runMcpStaticScan(options: ScanOptions, mcp: McpCliOptions) {
  if (options.fix) {
    console.warn("Note: --fix is not supported for MCP static targets (no local code lines to modify). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const inputs = await loadStaticInputs({
    tools: mcp.toolsFile,
    prompts: mcp.promptsFile,
    resources: mcp.resourcesFile,
    instructions: mcp.instructionsFile,
  });

  if (inputs.sourceFiles.length === 0) {
    console.error("No MCP static inputs provided. Use --tools/--prompts/--resources/--instructions.");
    process.exitCode = 1;
    return;
  }

  const label = staticLabelFromFiles(inputs.sourceFiles);
  const { host, files, scannedObjects } = virtualizeStatic({
    label,
    tools: inputs.tools,
    prompts: inputs.prompts,
    resources: inputs.resources,
    initialize: inputs.initialize,
  });

  const totalFiles = files.length;
  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, 1);
  tui.beginTarget(1, 1, host, totalFiles);

  const targetFindings: Finding[] = [];
  for (const item of files) {
    try {
      const fileFindings = scanContentItem(item, rules, options);
      if (fileFindings.length) {
        targetFindings.push(...fileFindings);
        tui.onFindings(fileFindings);
      }
    } finally {
      tui.onFile(item.virtualPath);
    }
  }

  const filteredTargetFindings = options.enableMeta ? applyMetaAnalyzer(targetFindings) : targetFindings;
  if (options.enableMeta) tui.setCurrentFindings(filteredTargetFindings);

  tui.completeTarget(
    { name: host, files: totalFiles, findings: filteredTargetFindings.length, counts: summarizeFindings(filteredTargetFindings) },
    filteredTargetFindings
  );

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result = {
    targets: [
      {
        kind: "mcp",
        name: host,
        path: "static",
        meta: { sourceFiles: inputs.sourceFiles, transport: "http", scannedObjects },
      },
    ] as Target[],
    findings: filteredTargetFindings,
    scannedFiles: totalFiles,
    elapsedMs,
  };

  let outputText: string | null = null;
  if (outputFormat === "json") outputText = toJson(result);
  else if (outputFormat === "sarif") outputText = toSarif(result);

  if (options.output && outputText !== null) {
    await Bun.write(options.output, outputText);
  }

  if (outputFormat === "table") {
    if (!tuiEnabled) {
      console.log(formatSummary(result));
      console.log("");
      console.log(renderTable(result.findings));
    } else {
      console.log(formatSummary(result));
    }
  } else if (!options.output && outputText !== null) {
    console.log(outputText);
  } else {
    console.log(formatSummary(result));
  }

  if (shouldFail(result.findings, options.failOn)) {
    process.exitCode = 2;
  }

  return result;
}

async function runMcpRemoteMultiScan(
  servers: Array<{ name: string; url: string; sourceFile?: string }>,
  options: ScanOptions,
  mcp: McpCliOptions
) {
  if (servers.length === 0) {
    console.error("No MCP servers found to scan.");
    process.exitCode = 1;
    return;
  }

  if (options.fix) {
    console.warn("Note: --fix is not supported for MCP remote targets (no local files to modify). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const headers = parseHeaderList(mcp.headers ?? []);
  if (mcp.bearerToken) headers["Authorization"] = `Bearer ${mcp.bearerToken}`;

  const scanList = parseMcpScanList(mcp.scan);
  const allowedMimeTypes = (mcp.mimeTypes ?? "text/plain,text/markdown,text/html,application/json")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const maxResourceBytes =
    typeof mcp.maxResourceBytes === "number" && Number.isFinite(mcp.maxResourceBytes)
      ? Math.max(1, Math.floor(mcp.maxResourceBytes))
      : 1_048_576;

  // Collect everything first so the TUI can show an accurate total file count.
  const collectedPlans: Array<{
    target: Target;
    files: Array<{ virtualPath: string; fileType: any; content: string }>;
    scannedObjects: any;
  }> = [];

  for (const server of servers) {
    try {
      const collected = await collectFromServer(server.url, {
        headers,
        scan: scanList,
        readResources: Boolean(mcp.readResources),
        allowedMimeTypes,
        maxResourceBytes,
      });
      const v = virtualizeRemote(server.url, collected, { readResources: Boolean(mcp.readResources) });
      collectedPlans.push({
        target: {
          kind: "mcp",
          name: v.host,
          path: server.url,
          meta: { serverUrl: server.url, transport: "http", scannedObjects: v.scannedObjects, sourceFile: server.sourceFile, serverName: server.name },
        },
        files: v.files,
        scannedObjects: v.scannedObjects,
      });
    } catch (e) {
      // Treat a collection failure as a scan failure for that target, but continue.
      collectedPlans.push({
        target: {
          kind: "mcp",
          name: server.name,
          path: server.url,
          meta: { serverUrl: server.url, transport: "http", scannedObjects: { tools: 0, prompts: 0, resources: 0, instructions: 0 }, sourceFile: server.sourceFile, error: e instanceof Error ? e.message : String(e) },
        },
        files: [],
        scannedObjects: { tools: 0, prompts: 0, resources: 0, instructions: 0 },
      });
    }
  }

  const totalFiles = collectedPlans.reduce((sum, p) => sum + p.files.length, 0);
  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, collectedPlans.length);

  const allFindings: Finding[] = [];
  for (let i = 0; i < collectedPlans.length; i++) {
    const plan = collectedPlans[i]!;
    tui.beginTarget(i + 1, collectedPlans.length, plan.target.name, plan.files.length);

    const targetFindings: Finding[] = [];
    for (const item of plan.files) {
      try {
        const fileFindings = scanContentItem(item, rules, options);
        if (fileFindings.length) {
          targetFindings.push(...fileFindings);
          tui.onFindings(fileFindings);
        }
      } finally {
        tui.onFile(item.virtualPath);
      }
    }

    const filteredTargetFindings = options.enableMeta ? applyMetaAnalyzer(targetFindings) : targetFindings;
    if (options.enableMeta) tui.setCurrentFindings(filteredTargetFindings);

    allFindings.push(...filteredTargetFindings);
    tui.completeTarget(
      { name: plan.target.name, files: plan.files.length, findings: filteredTargetFindings.length, counts: summarizeFindings(filteredTargetFindings) },
      filteredTargetFindings
    );
  }

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result = {
    targets: collectedPlans.map((p) => p.target),
    findings: allFindings,
    scannedFiles: totalFiles,
    elapsedMs,
  };

  let outputText: string | null = null;
  if (outputFormat === "json") outputText = toJson(result);
  else if (outputFormat === "sarif") outputText = toSarif(result);

  if (options.output && outputText !== null) {
    await Bun.write(options.output, outputText);
  }

  if (outputFormat === "table") {
    if (!tuiEnabled) {
      console.log(formatSummary(result));
      console.log("");
      console.log(renderTable(result.findings));
    } else {
      console.log(formatSummary(result));
    }
  } else if (!options.output && outputText !== null) {
    console.log(outputText);
  } else {
    console.log(formatSummary(result));
  }

  if (shouldFail(result.findings, options.failOn)) {
    process.exitCode = 2;
  }

  return result;
}

async function runMcpConfigScan(options: ScanOptions, mcp: McpCliOptions) {
  if (!mcp.configPath) {
    console.error("Missing config path. Usage: skill-scanner mcp config <configPath>");
    process.exitCode = 1;
    return;
  }

  if (mcp.connect) {
    const servers = await loadAndExtractMcpServers(mcp.configPath);
    await runMcpRemoteMultiScan(
      servers.map((s) => ({ name: s.name, url: s.serverUrl, sourceFile: s.sourceFile })),
      options,
      mcp
    );
    return;
  }

  if (options.fix) {
    console.warn("Note: --fix is disabled for mcp config scans by default (to avoid editing user config files). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(1, 1);
  tui.beginTarget(1, 1, mcp.configPath, 1);

  const fileFindings = await scanFile(mcp.configPath, rules, options).catch(() => []);
  if (fileFindings.length) tui.onFindings(fileFindings);
  tui.onFile(mcp.configPath);

  const filtered = options.enableMeta ? applyMetaAnalyzer(fileFindings) : fileFindings;
  tui.completeTarget({ name: mcp.configPath, files: 1, findings: filtered.length, counts: summarizeFindings(filtered) }, filtered);

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result = {
    targets: [{ kind: "path", name: "mcp-config", path: mcp.configPath, meta: { mcpConfig: true } }] as Target[],
    findings: filtered,
    scannedFiles: 1,
    elapsedMs,
  };

  let outputText: string | null = null;
  if (outputFormat === "json") outputText = toJson(result);
  else if (outputFormat === "sarif") outputText = toSarif(result);

  if (options.output && outputText !== null) await Bun.write(options.output, outputText);

  if (outputFormat === "table") {
    if (!tuiEnabled) {
      console.log(formatSummary(result));
      console.log("");
      console.log(renderTable(result.findings));
    } else {
      console.log(formatSummary(result));
    }
  } else if (!options.output && outputText !== null) {
    console.log(outputText);
  } else {
    console.log(formatSummary(result));
  }

  if (shouldFail(result.findings, options.failOn)) process.exitCode = 2;
  return result;
}

async function runMcpKnownConfigsScan(options: ScanOptions, mcp: McpCliOptions) {
  const configPaths = await discoverWellKnownMcpConfigPaths();
  if (configPaths.length === 0) {
    console.log("No well-known MCP config files found on this machine.");
    return;
  }

  if (mcp.connect) {
    const servers: Array<{ name: string; url: string; sourceFile?: string }> = [];
    for (const p of configPaths) {
      const s = await loadAndExtractMcpServers(p);
      for (const item of s) servers.push({ name: item.name, url: item.serverUrl, sourceFile: item.sourceFile });
    }
    await runMcpRemoteMultiScan(servers, options, mcp);
    return;
  }

  if (options.fix) {
    console.warn("Note: --fix is disabled for mcp known-configs scans by default (to avoid editing user config files). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(configPaths.length, configPaths.length);

  const findings: Finding[] = [];
  for (let i = 0; i < configPaths.length; i++) {
    const p = configPaths[i]!;
    tui.beginTarget(i + 1, configPaths.length, p, 1);
    const fileFindings = await scanFile(p, rules, options).catch(() => []);
    const filtered = options.enableMeta ? applyMetaAnalyzer(fileFindings) : fileFindings;
    if (filtered.length) {
      findings.push(...filtered);
      tui.onFindings(filtered);
    }
    tui.onFile(p);
    tui.completeTarget({ name: p, files: 1, findings: filtered.length, counts: summarizeFindings(filtered) }, filtered);
  }

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result = {
    targets: configPaths.map((p) => ({ kind: "path", name: "mcp-config", path: p, meta: { mcpConfig: true } })) as Target[],
    findings,
    scannedFiles: configPaths.length,
    elapsedMs,
  };

  let outputText: string | null = null;
  if (outputFormat === "json") outputText = toJson(result);
  else if (outputFormat === "sarif") outputText = toSarif(result);

  if (options.output && outputText !== null) await Bun.write(options.output, outputText);

  if (outputFormat === "table") {
    if (!tuiEnabled) {
      console.log(formatSummary(result));
      console.log("");
      console.log(renderTable(result.findings));
    } else {
      console.log(formatSummary(result));
    }
  } else if (!options.output && outputText !== null) {
    console.log(outputText);
  } else {
    console.log(formatSummary(result));
  }

  if (shouldFail(result.findings, options.failOn)) process.exitCode = 2;
  return result;
}

async function watchAndScan(targetPath: string, options: ScanOptions) {
  let previousKeys = new Set<string>();
  const basePath = sanitizePath(resolve(targetPath));

  const notifyNewFindings = (findings: Finding[]) => {
    const newFindings = findings.filter((finding) => {
      const key = `${finding.ruleId}|${finding.file}|${finding.line ?? ""}`;
      return !previousKeys.has(key);
    });

    previousKeys = new Set(findings.map((finding) => `${finding.ruleId}|${finding.file}|${finding.line ?? ""}`));

    if (newFindings.length === 0) return;

    const top = newFindings.slice(0, 5);
    console.log("");
    console.log("\x07New findings detected:");
    for (const finding of top) {
      const lineInfo = finding.line ? `:${finding.line}` : "";
      console.log(`- ${finding.severity} ${finding.file}${lineInfo} (${finding.ruleId})`);
    }
    if (newFindings.length > top.length) {
      console.log(`- ...and ${newFindings.length - top.length} more`);
    }
  };

  const initial = await runScan(targetPath, options);
  if (initial) {
    previousKeys = new Set(initial.findings.map((finding: { ruleId: string, file: string, line?: number }) => `${finding.ruleId}|${finding.file}|${finding.line ?? ""}`));
  }

  let timer: NodeJS.Timeout | null = null;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const result = await runScan(targetPath, options);
      if (result) notifyNewFindings(result.findings);
    }, 300);
  };

  const watchRoots = getSearchRoots(basePath, {
    includeSystem: options.includeSystem,
    extraSkillDirs: options.extraSkillDirs,
    fullDepth: options.fullDepth,
  });
  if (options.includeExtensions) {
    watchRoots.push(...(await discoverBrowserExtensionWatchRoots(options.extraExtensionDirs)));
  }
  if (options.includeIDEExtensions) {
    watchRoots.push(...(await discoverIDEExtensionWatchRoots(options.extraIDEExtensionDirs)));
  }

  const existingRoots: string[] = [];
  for (const root of watchRoots) {
    if (await dirExists(root)) existingRoots.push(root);
  }

  console.log(`Watching for changes across ${existingRoots.length} root(s)...`);

  try {
    const watchers = existingRoots.map((root) => {
      try {
        return watch(root, { recursive: true }, () => trigger());
      } catch {
        return null;
      }
    }).filter((watcher): watcher is ReturnType<typeof watch> => Boolean(watcher));

    process.on("SIGINT", () => {
      for (const watcher of watchers) watcher.close();
    });
  } catch {
    console.error("Watch mode is not supported in this environment.");
  }
}

const { command, targetPath, options, systemFlagSet, mcp } = parseArgs(process.argv.slice(2));

// In watch mode, include system skill folders by default unless explicitly set.
if (command === "watch" && !systemFlagSet && options.includeSystem === undefined) {
  options.includeSystem = true;
}

if (command === "scan") {
  await runScan(targetPath, options);
} else if (command === "scan-all") {
  options.fullDepth = true;
  await runScan(targetPath, options);
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
