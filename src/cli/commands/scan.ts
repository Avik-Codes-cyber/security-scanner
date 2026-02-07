import { resolve } from "path";
import type { Finding, ScanOptions, ScanResult, Target } from "../../scanner/types";
import { discoverSkills } from "../../scanner/discover";
import { discoverBrowserExtensions, discoverIDEExtensions } from "../../scanner/extensions/index";
import { scanFile } from "../../scanner/scan-file";
import { scanFilesParallel } from "../../scanner/parallel-scanner";
import { ScanCache } from "../../scanner/cache";
import { IndexedRuleEngine } from "../../scanner/engine/indexed-rules";
import { applyMetaAnalyzer, summarizeFindings } from "../../scanner/report";
import { applyFixes } from "../../scanner/fix";
import { createTui } from "../../utils/tui";
import { sanitizePath } from "../../utils/fs";
import { collectFiles, loadCompiledRules } from "../utils";
import { handleScanOutput, generateReportFiles, saveScanResults, checkFailCondition } from "../output";
import { config } from "../../config";

/**
 * Run the main scan command
 */
export async function runScan(targetPath: string, options: ScanOptions): Promise<ScanResult | undefined> {
  if (options.fix) {
    console.warn("Note: --fix will comment out matched lines in supported file types.");
  }
  if (options.fix && options.format === "sarif") {
    console.warn("Note: --fix with --format sarif will still apply fixes before reporting.");
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve(targetPath));
  const rules = await loadCompiledRules(basePath);

  // Create indexed rule engine for faster lookups
  const indexedRules = new IndexedRuleEngine(rules);

  // Initialize cache if enabled
  const cache = config.enableCache ? new ScanCache(config.cacheDir, "1.0", config.cacheMaxAge) : null;
  if (cache) {
    await cache.load();
  }

  // Discover all targets
  const skills = await discoverSkills(basePath, {
    includeSystem: options.includeSystem,
    extraSkillDirs: options.extraSkillDirs,
    fullDepth: options.fullDepth,
  });
  const extensions = options.includeExtensions ? await discoverBrowserExtensions(options.extraExtensionDirs) : [];
  const ideExtensions = options.includeIDEExtensions ? await discoverIDEExtensions(options.extraIDEExtensionDirs) : [];

  // Inform about discovered targets
  if (skills.length > 0) {
    console.log(`✓ Found ${skills.length} skill(s)`);
  } else if (!options.includeExtensions && !options.includeIDEExtensions) {
    console.warn("⚠️  No skills found in the target directory.");
  }

  if (options.includeExtensions) {
    if (extensions.length > 0) {
      console.log(`✓ Found ${extensions.length} browser extension(s)`);
    } else {
      console.warn("⚠️  No browser extensions found. Install Chrome, Edge, Brave, or other Chromium-based browsers with extensions.");
    }
  }

  if (options.includeIDEExtensions) {
    if (ideExtensions.length > 0) {
      console.log(`✓ Found ${ideExtensions.length} IDE extension(s)`);
    } else {
      console.warn("⚠️  No IDE extensions found. Install VS Code, Cursor, or other supported IDEs with extensions.");
    }
  }

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

  // If no targets found at all, exit
  if (targets.length === 0) {
    console.error("❌ No targets found to scan. Stopping.");
    console.log("\nSearched for:");
    console.log("  • Skills (SKILL.md files)");
    if (options.includeExtensions) {
      console.log("  • Browser extensions");
    }
    if (options.includeIDEExtensions) {
      console.log("  • IDE extensions");
    }
    console.log("\nTip: Make sure you're in the correct directory or use --system to scan user-level skill folders.");
    process.exit(1);
  }

  // Plan what files to scan for each target
  const scanPlans = await Promise.all(
    targets.map(async (target) => ({
      name: target.name,
      path: target.path,
      files: await collectFiles([target.path], { includeDocs: true }),
    }))
  );

  const totalFiles = scanPlans.reduce((sum, plan) => sum + plan.files.length, 0);

  // Setup TUI
  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, scanPlans.length);

  const findings: Finding[] = [];

  // Scan each target
  for (let i = 0; i < scanPlans.length; i++) {
    const plan = scanPlans[i];
    tui.beginTarget(i + 1, scanPlans.length, plan.name, plan.files.length);

    let skillFindings: Finding[] = [];

    // Use parallel scanning if enabled and file count exceeds threshold
    const useParallel = config.enableParallelScanning && plan.files.length >= config.parallelThreshold;

    if (useParallel) {
      // Parallel scanning with caching
      const uncachedFiles: string[] = [];
      const cachedFindings: Finding[] = [];

      if (cache) {
        // Check cache for each file
        for (const filePath of plan.files) {
          const cached = await cache.getCachedFindings(filePath);
          if (cached) {
            cachedFindings.push(...cached);
            tui.onFile(filePath);
          } else {
            uncachedFiles.push(filePath);
          }
        }
      } else {
        uncachedFiles.push(...plan.files);
      }

      // Scan uncached files in parallel
      if (uncachedFiles.length > 0) {
        const newFindings = await scanFilesParallel(uncachedFiles, indexedRules.getAllRules(), options);

        // Update cache for newly scanned files
        if (cache) {
          for (const filePath of uncachedFiles) {
            const fileFindings = newFindings.filter(f => f.file === filePath);
            await cache.setCachedFindings(filePath, fileFindings);
          }
        }

        skillFindings = [...cachedFindings, ...newFindings];

        // Update TUI
        for (const filePath of uncachedFiles) {
          tui.onFile(filePath);
        }
        if (newFindings.length) {
          tui.onFindings(newFindings);
        }
      } else {
        skillFindings = cachedFindings;
        if (cachedFindings.length) {
          tui.onFindings(cachedFindings);
        }
      }
    } else {
      // Sequential scanning with caching
      const concurrency = Math.min(32, Math.max(4, Math.floor((navigator.hardwareConcurrency ?? 8) / 2)));
      let index = 0;

      const worker = async () => {
        while (index < plan.files.length) {
          const filePath = plan.files[index++];
          try {
            // Check cache first
            let fileFindings: Finding[] = [];
            if (cache) {
              const cached = await cache.getCachedFindings(filePath);
              if (cached) {
                fileFindings = cached;
              } else {
                fileFindings = await scanFile(filePath, indexedRules, options);
                await cache.setCachedFindings(filePath, fileFindings);
              }
            } else {
              fileFindings = await scanFile(filePath, indexedRules, options);
            }

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
    }

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

  // Save cache if enabled
  if (cache) {
    await cache.save();
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

  // Handle output
  await handleScanOutput(result, {
    format: outputFormat,
    output: options.output,
    tuiEnabled,
  });

  checkFailCondition(result, options);
  await generateReportFiles(result, options);
  await saveScanResults(result, "scan", targetPath, options);

  return result;
}
