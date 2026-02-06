import { watch } from "fs";
import { resolve } from "path";
import type { Finding, ScanOptions } from "../../scanner/types";
import { getSearchRoots } from "../../scanner/discover";
import { discoverBrowserExtensionWatchRoots, discoverIDEExtensionWatchRoots } from "../../scanner/extensions/index";
import { sanitizePath, dirExists } from "../../utils/fs";
import { runScan } from "./scan";

/**
 * Run scan in watch mode - continuously monitors for file changes
 */
export async function watchAndScan(targetPath: string, options: ScanOptions): Promise<void> {
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

  // Run initial scan
  const initial = await runScan(targetPath, options);
  if (initial) {
    previousKeys = new Set(
      initial.findings.map(
        (finding: { ruleId: string; file: string; line?: number }) =>
          `${finding.ruleId}|${finding.file}|${finding.line ?? ""}`
      )
    );
  }

  // Setup debounced re-scan trigger
  let timer: NodeJS.Timeout | null = null;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const result = await runScan(targetPath, options);
      if (result) notifyNewFindings(result.findings);
    }, 300);
  };

  // Determine which directories to watch
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

  // Filter to only existing directories
  const existingRoots: string[] = [];
  for (const root of watchRoots) {
    if (await dirExists(root)) existingRoots.push(root);
  }

  console.log(`Watching for changes across ${existingRoots.length} root(s)...`);

  try {
    const watchers = existingRoots
      .map((root) => {
        try {
          return watch(root, { recursive: true }, () => trigger());
        } catch {
          return null;
        }
      })
      .filter((watcher): watcher is ReturnType<typeof watch> => Boolean(watcher));

    process.on("SIGINT", () => {
      for (const watcher of watchers) watcher.close();
    });
  } catch {
    console.error("Watch mode is not supported in this environment.");
  }
}
