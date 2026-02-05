#!/usr/bin/env bun
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { watch } from "fs";
import { discoverSkills, getSearchRoots } from "./scanner/discover.ts";
import { loadRulesFromFile, loadRulesFromText } from "./scanner/rule-engine.ts";
import { scanFile } from "./scanner/scan-file.ts";
import type { Finding, Severity, ScanOptions } from "./scanner/types.ts";
import { applyMetaAnalyzer, formatSummary, renderTable, shouldFail, summarizeFindings, toJson } from "./scanner/report.ts";
import { applyFixes } from "./scanner/fix.ts";
import { toSarif } from "./scanner/sarif.ts";
import { createTui } from "./utils/tui.ts";
import { dirExists, isInSkippedDir, sanitizePath } from "./utils/fs.ts";
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
    useBehavioral: true,
    format: "table",
  };

  while (args.length) {
    const arg = args.shift()!;
    if (arg === "--json") {
      options.json = true;
      options.format = "json";
    }
    else if (arg === "--tui") options.tui = true;
    else if (arg === "--no-tui") options.tui = false;
    else if (arg === "--fix") options.fix = true;
    else if (arg === "--system" || arg === "--include-system") options.includeSystem = true;
    else if (arg === "--full-depth" || arg === "--recursive") options.fullDepth = true;
    else if (arg === "--use-behavioral") options.useBehavioral = true;
    else if (arg === "--no-behavioral") options.useBehavioral = false;
    else if (arg === "--use-llm") options.useLlm = true;
    else if (arg === "--use-aidefense") options.useAiDefense = true;
    else if (arg === "--use-all") {
      options.useBehavioral = true;
      options.useLlm = true;
      options.useAiDefense = true;
    }
    else if (arg === "--enable-meta") options.enableMeta = true;
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
  skillguard scan <path> [options]
  skillguard scan-all <path> [options]
  skillguard watch <path> [options]

Options:
  --json            Output JSON report (alias for --format json)
  --format <type>   Output format: table | json | sarif
  --output <file>   Write report to file instead of stdout
  --fail-on-findings  Exit non-zero if any findings are detected
  --fail-on <lvl>   Exit non-zero if findings at or above level (LOW, MEDIUM, HIGH, CRITICAL)
  --tui             Force TUI rendering
  --no-tui          Disable TUI rendering
  --fix             Reserved for future auto-fix (not implemented)
  --system          Include common system skill directories (e.g., ~/.codex/skills)
  --skills-dir      Add an extra skills root to scan (repeatable)
  --full-depth      Always search recursively for SKILL.md (slower)
  --recursive       Alias for --full-depth
  --use-behavioral  Enable behavioral heuristic engine
  --no-behavioral   Disable behavioral heuristic engine
  --use-llm         Enable LLM analyzer (reserved)
  --use-aidefense   Enable AI defense engine (reserved)
  --use-all         Enable all engines
  --enable-meta     Enable meta-analyzer (false-positive filtering)

Examples:
  skillguard scan /path/to/skill
  skillguard scan /path/to/skill --use-behavioral
  skillguard scan /path/to/skill --use-behavioral --use-llm --use-aidefense
  skillguard scan /path/to/skill --use-llm --enable-meta
  skillguard scan-all /path/to/skills --recursive --use-behavioral
  skillguard scan-all ./skills --fail-on-findings --format sarif --output results.sarif
`;

  console.log(help);
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

async function runScan(targetPath: string, options: ScanOptions) {
  if (options.fix) {
    console.warn("Note: --fix will comment out matched lines in supported file types.");
  }
  if (options.fix && options.format === "sarif") {
    console.warn("Note: --fix with --format sarif will still apply fixes before reporting.");
  }
  if (options.useLlm) {
    console.warn("Note: --use-llm is reserved and not implemented yet.");
  }
  if (options.useAiDefense) {
    console.warn("Note: --use-aidefense is reserved and not implemented yet.");
  }
  const start = Date.now();
  const basePath = sanitizePath(resolve(targetPath));
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
  const scanPlans = skills.length
    ? await Promise.all(
        skills.map(async (skill) => ({
          name: skill.name,
          path: skill.path,
          files: await collectFiles([skill.path], { includeDocs: true }),
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
    tui.beginSkill(i + 1, scanPlans.length, plan.name, plan.files.length);

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
    tui.completeSkill(
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

  const result = {
    skills,
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
} else if (command === "scan-all") {
  options.fullDepth = true;
  await runScan(targetPath, options);
} else if (command === "watch") {
  await watchAndScan(targetPath, options);
} else {
  printHelp();
  process.exitCode = 1;
}
