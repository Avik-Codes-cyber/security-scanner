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
import { debugWarn } from "../../utils/error-handling";
import { sanitizePath } from "../../utils/fs";
import { resetPathTracking } from "../../utils/path-safety";
import { collectFiles, loadCompiledRules } from "../utils";
import { handleScanOutput, generateReportFiles, saveScanResults, checkFailCondition } from "../output";
import { config } from "../../config";
import { setupScanTui } from "./scan-utils";

/**
 * Internal scan function that accepts pre-discovered targets.
 * This is the core scanning logic shared by both runScan and interactive mode.
 */
export async function runScanInternal(
  targets: Target[],
  basePath: string,
  options: ScanOptions
): Promise<ScanResult | undefined> {
  if (options.fix) {
    console.warn("Note: --fix will comment out matched lines in supported file types.");
  }
  if (options.fix && options.format === "sarif") {
    console.warn("Note: --fix with --format sarif will still apply fixes before reporting.");
  }

  const start = Date.now();

  // Reset path tracking for circular symlink detection
  resetPathTracking();

  const rules = await loadCompiledRules(basePath);

  // Create indexed rule engine for faster lookups
  const indexedRules = new IndexedRuleEngine(rules);

  // Initialize cache if enabled
  const cache = config.enableCache
    ? new ScanCache(
      config.cacheDir,
      "1.0",
      config.cacheMaxAge,
      config.cacheMaxEntries,
      config.cacheMaxSizeMB
    )
    : null;
  if (cache) {
    await cache.load();
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

  // Generate scan description based on target types
  const targetKinds = new Set(targets.map(t => t.kind));
  const descriptions: string[] = [];
  if (targetKinds.has("skill")) descriptions.push("Skills");
  if (targetKinds.has("extension")) descriptions.push("Browser Extensions");
  if (targetKinds.has("ide-extension")) descriptions.push("IDE Extensions");
  const scanDescription = descriptions.length > 0 ? descriptions.join(", ") : "Files";

  // Setup TUI
  const { tui, outputFormat, tuiEnabled } = setupScanTui(options, totalFiles, scanPlans.length, options.showConfidence, scanDescription);

  const findings: Finding[] = [];
  let totalFindingsReached = false;

  // Scan each target
  for (let i = 0; i < scanPlans.length; i++) {
    // Check if we've reached the global findings limit
    if (findings.length >= config.maxTotalFindings) {
      totalFindingsReached = true;
      console.warn(`\n⚠️  Maximum findings limit (${config.maxTotalFindings}) reached. Stopping scan.`);
      console.warn("    This prevents memory exhaustion on large codebases.");
      console.warn("    Consider using filters or scanning smaller directories.\n");
      break;
    }

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

        // Enforce per-file limits and update cache
        if (cache) {
          for (const filePath of uncachedFiles) {
            let fileFindings = newFindings.filter(f => f.file === filePath);

            // Enforce per-file limit
            if (fileFindings.length > config.maxFindingsPerFile) {
              fileFindings = fileFindings.slice(0, config.maxFindingsPerFile);
              if (!options.json) {
                console.warn(`⚠️  File ${filePath} exceeded ${config.maxFindingsPerFile} findings limit. Truncated.`);
              }
            }

            await cache.setCachedFindings(filePath, fileFindings);
          }
        }

        // Check total findings limit
        const remainingCapacity = config.maxTotalFindings - findings.length;
        const limitedNewFindings = newFindings.slice(0, remainingCapacity);

        skillFindings = [...cachedFindings, ...limitedNewFindings];

        // Update TUI
        for (const filePath of uncachedFiles) {
          tui.onFile(filePath);
        }
        if (limitedNewFindings.length) {
          tui.onFindings(limitedNewFindings);
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

            // Enforce per-file limit
            if (fileFindings.length > config.maxFindingsPerFile) {
              fileFindings = fileFindings.slice(0, config.maxFindingsPerFile);
              if (!options.json) {
                console.warn(`⚠️  File ${filePath} exceeded ${config.maxFindingsPerFile} findings limit. Truncated.`);
              }
            }

            if (fileFindings.length) {
              // Check total findings limit
              const remainingCapacity = config.maxTotalFindings - findings.length - skillFindings.length;
              if (remainingCapacity <= 0) {
                break; // Stop scanning this target
              }

              // Only add findings up to the limit
              const findingsToAdd = fileFindings.slice(0, remainingCapacity);
              skillFindings.push(...findingsToAdd);
              tui.onFindings(findingsToAdd);
            }
          } catch (error) {
            debugWarn(`Warning: Failed to scan file ${filePath}`, error);
            // Continue scanning other files - individual file failures shouldn't stop the entire scan
          } finally {
            tui.onFile(filePath);
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, worker));
    }
    const filteredSkillFindings = options.enableMeta ? applyMetaAnalyzer(skillFindings) : skillFindings;

    // Add confidence scores if requested (before displaying in TUI)
    let displayFindings = filteredSkillFindings;
    if (options.showConfidence) {
      const { addConfidenceScores } = await import("../../scanner/confidence");
      displayFindings = addConfidenceScores(filteredSkillFindings);
    }

    if (options.fix && displayFindings.length > 0) {
      await applyFixes(displayFindings);
    }

    // Update TUI with findings (with confidence scores if enabled)
    tui.setCurrentFindings(displayFindings);

    findings.push(...displayFindings);
    tui.completeTarget(
      {
        name: plan.name,
        files: plan.files.length,
        findings: displayFindings.length,
        counts: summarizeFindings(displayFindings),
      },
      displayFindings
    );
  }

  // Save cache if enabled
  if (cache) {
    await cache.save();
  }

  const elapsedMs = Date.now() - start;
  tui.finish();

  let filteredFindings = options.enableMeta ? applyMetaAnalyzer(findings) : findings;

  // Filter by minimum confidence if specified (confidence scores already added during scan)
  if (options.showConfidence && options.minConfidence !== undefined) {
    const { filterByConfidence } = await import("../../scanner/confidence");
    const beforeCount = filteredFindings.length;
    filteredFindings = filterByConfidence(filteredFindings, options.minConfidence);
    const filtered = beforeCount - filteredFindings.length;
    if (filtered > 0) {
      console.log(`\n📊 Filtered ${filtered} finding(s) below confidence threshold (${Math.round(options.minConfidence * 100)}%)`);
    }
  }

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
    showConfidence: options.showConfidence,
  });

  checkFailCondition(result, options);
  await generateReportFiles(result, options);
  await saveScanResults(result, "scan", basePath, options);

  return result;
}

/**
 * Run the main scan command with target discovery
 */
export async function runScan(targetPath: string, options: ScanOptions): Promise<ScanResult | undefined> {
  const basePath = sanitizePath(resolve(targetPath));

  // Generate scan description based on what's being scanned
  const scanTypes: string[] = [];
  if (options.includeExtensions) scanTypes.push("Browser Extensions");
  if (options.includeIDEExtensions) scanTypes.push("IDE Extensions");
  if (!options.includeExtensions && !options.includeIDEExtensions) scanTypes.push("Skills");
  if (scanTypes.length === 0) scanTypes.push("Skills");
  const scanDescription = scanTypes.join(", ");

  // Show scan header
  const separator = "═".repeat(100);
  console.log(`\n${separator}`);
  console.log(`   SCAN RESULTS - ${scanDescription}`);
  console.log(`${separator}\n`);

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

  // Add separation after discovery messages
  console.log("");

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

  // Call the internal scan function with discovered targets
  return runScanInternal(targets, basePath, options);
}
