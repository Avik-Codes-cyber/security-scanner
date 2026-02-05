#!/usr/bin/env bun
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { watch } from "fs";
import { discoverSkills, getSearchRoots } from "./scanner/discover.ts";
import { loadRulesFromFile, loadRulesFromText } from "./scanner/rule-engine.ts";
import { scanFile } from "./scanner/scan-file.ts";
import type { Finding, Severity, ScanOptions } from "./scanner/types.ts";
import { formatSummary, renderTable, shouldFail, toJson } from "./scanner/report.ts";
import { createTui } from "./utils/tui.ts";
import { dirExists, isInSkippedDir } from "./utils/fs.ts";
import { signaturesYaml } from "./rules/signatures.ts";

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", "__pycache__"];
const SCAN_EXTENSIONS = new Set([".py", ".ts", ".js", ".mjs", ".cjs", ".sh", ".bash"]);
const SPECIAL_FILES = new Set(["SKILL.md", "manifest.json", "package.json"]);
const BINARY_EXTENSIONS = new Set([".exe", ".bin", ".dll", ".so", ".dylib", ".jar"]);

function parseSeverity(value?: string): Severity | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === "LOW" || upper === "MEDIUM" || upper === "HIGH" || upper === "CRITICAL") {
    return upper;
  }
  return undefined;
}

function parseArgs(argv: string[]) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith("-") ? args.shift()! : "scan";
  const targetPath = args[0] && !args[0].startsWith("-") ? args.shift()! : ".";

  const options: ScanOptions & { watch?: boolean } = {
    json: false,
    tui: undefined,
    extraSkillDirs: [],
  };

  while (args.length) {
    const arg = args.shift()!;
    if (arg === "--json") options.json = true;
    else if (arg === "--tui") options.tui = true;
    else if (arg === "--no-tui") options.tui = false;
    else if (arg === "--fix") options.fix = true;
    else if (arg === "--system" || arg === "--include-system") options.includeSystem = true;
    else if (arg === "--full-depth") options.fullDepth = true;
    else if (arg === "--skills-dir") {
      const value = args.shift();
      if (value) options.extraSkillDirs?.push(value);
    } else if (arg.startsWith("--skills-dir=")) {
      const value = arg.split("=")[1];
      if (value) options.extraSkillDirs?.push(value);
    }
    else if (arg === "--fail-on") {
      options.failOn = parseSeverity(args.shift());
    } else if (arg.startsWith("--fail-on=")) {
      options.failOn = parseSeverity(arg.split("=")[1]);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { command, targetPath, options };
}

function printHelp() {
  const help = `Skillguard - Agent Skill Security Scanner

Usage:
  skillguard scan <path> [--json] [--fail-on <level>] [--tui|--no-tui] [--fix] [--system] [--skills-dir <path>] [--full-depth]
  skillguard watch <path>

Options:
  --json            Output JSON report
  --fail-on <lvl>   Exit non-zero if findings at or above level (LOW, MEDIUM, HIGH, CRITICAL)
  --tui             Force TUI rendering
  --no-tui          Disable TUI rendering
  --fix             Reserved for future auto-fix (not implemented)
  --system          Include common system skill directories (e.g., ~/.codex/skills)
  --skills-dir      Add an extra skills root to scan (repeatable)
  --full-depth      Always search recursively for SKILL.md (slower)
`;

  console.log(help);
}

async function collectFiles(scanRoots: string[]): Promise<string[]> {
  const fileSet = new Set<string>();

  for (const root of scanRoots) {
    if (!(await dirExists(root))) {
      continue;
    }
    const glob = new Bun.Glob("**/*");
    for await (const relPath of glob.scan({ cwd: root, onlyFiles: true })) {
      if (isInSkippedDir(relPath, SKIP_DIRS)) continue;

      const base = relPath.split(/[\\/]/g).pop() ?? relPath;
      const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")).toLowerCase() : "";

      if (SPECIAL_FILES.has(base) || SCAN_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(ext)) {
        fileSet.add(join(root, relPath));
      }
    }
  }

  return Array.from(fileSet).sort();
}

async function runScan(targetPath: string, options: ScanOptions) {
  if (options.fix) {
    console.warn("Note: --fix is not implemented yet. Running in scan-only mode.");
  }
  const start = Date.now();
  const basePath = resolve(targetPath);
  const rulesPathFromImport = fileURLToPath(new URL("./rules/signatures.yaml", import.meta.url));
  const rulesCandidates = [
    process.env.SKILLGUARD_RULES,
    join(basePath, "rules", "signatures.yaml"),
    join(dirname(process.execPath), "rules", "signatures.yaml"),
    rulesPathFromImport,
  ].filter(Boolean) as string[];

  let rules: ReturnType<typeof loadRulesFromText> | null = null;
  for (const candidate of rulesCandidates) {
    try {
      rules = await loadRulesFromFile(candidate);
      break;
    } catch {
      // continue to next candidate
    }
  }

  if (!rules) {
    rules = loadRulesFromText(signaturesYaml);
  }

  const skills = await discoverSkills(basePath, {
    includeSystem: options.includeSystem,
    extraSkillDirs: options.extraSkillDirs,
    fullDepth: options.fullDepth,
  });
  const scanRoots = skills.length ? skills.map((skill) => skill.path) : [basePath];
  const files = await collectFiles(scanRoots);

  const tuiEnabled = options.tui ?? (process.stdout.isTTY && !options.json);
  const tui = createTui(tuiEnabled);
  tui.start(files.length);

  const findings: Finding[] = [];

  const concurrency = Math.min(32, Math.max(4, Math.floor((navigator.hardwareConcurrency ?? 8) / 2)));
  let index = 0;

  const worker = async () => {
    while (index < files.length) {
      const filePath = files[index++];
      try {
        const fileFindings = await scanFile(filePath, rules);
        if (fileFindings.length) {
          findings.push(...fileFindings);
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

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result = {
    skills,
    findings,
    scannedFiles: files.length,
    elapsedMs,
  };

  if (options.json) {
    console.log(toJson(result));
  } else {
    console.log(formatSummary(result));
    console.log("");
    console.log(renderTable(findings));
  }

  if (shouldFail(findings, options.failOn)) {
    process.exitCode = 2;
  }

  return result;
}

async function watchAndScan(targetPath: string, options: ScanOptions) {
  let previousKeys = new Set<string>();
  const basePath = resolve(targetPath);

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
    previousKeys = new Set(initial.findings.map((finding) => `${finding.ruleId}|${finding.file}|${finding.line ?? ""}`));
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

const { command, targetPath, options } = parseArgs(process.argv.slice(2));

if (command === "scan") {
  await runScan(targetPath, options);
} else if (command === "watch") {
  await watchAndScan(targetPath, options);
} else {
  printHelp();
  process.exitCode = 1;
}
