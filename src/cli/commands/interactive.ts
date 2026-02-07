/**
 * Interactive Scan Command
 * 
 * Provides a fully interactive mode where users can input path, select targets, and configure scans
 */

import { resolve } from "path";
import type { ScanOptions, Target, Finding, ScanResult } from "../../scanner/types";
import { discoverSkills } from "../../scanner/discover";
import { discoverBrowserExtensions, discoverIDEExtensions } from "../../scanner/extensions/index";
import { sanitizePath } from "../../utils/fs";
import { resetPathTracking } from "../../utils/path-safety";
import { promptScanPath, promptScanType, runInteractiveSession } from "../interactive";
import { IndexedRuleEngine } from "../../scanner/engine/indexed-rules";
import { scanFile } from "../../scanner/scan-file";
import { scanFilesParallel } from "../../scanner/parallel-scanner";
import { ScanCache } from "../../scanner/cache";
import { applyMetaAnalyzer, summarizeFindings } from "../../scanner/report";
import { applyFixes } from "../../scanner/fix";
import { createTui } from "../../utils/tui";
import { collectFiles, loadCompiledRules } from "../utils";
import { handleScanOutput, generateReportFiles, saveScanResults, checkFailCondition } from "../output";
import { config } from "../../config";
import { LOGO_LINES } from "../../utils/tui/logo";
import { LOGO_COLORS } from "../../utils/tui/colors";

/**
 * Display the logo
 */
function showLogo(): void {
    console.log();
    LOGO_LINES.forEach((line, i) => {
        const color = LOGO_COLORS[i] || LOGO_COLORS[0];
        console.log(`${color}${line}\x1b[0m`);
    });
    console.log();
    console.log('\x1b[2mSecurity scanner for skills, browser extensions, Code Extensions and MCP servers\x1b[0m');
    console.log();
}

/**
 * Discover all available targets for interactive selection
 */
async function discoverAllTargets(
    basePath: string,
    options: ScanOptions & { skipCurrentPath?: boolean }
): Promise<Target[]> {
    const targets: Target[] = [];

    // Discover skills from current path (unless skipped)
    if (!options.skipCurrentPath) {
        const skills = await discoverSkills(basePath, {
            includeSystem: options.includeSystem,
            extraSkillDirs: options.extraSkillDirs,
            fullDepth: options.fullDepth,
        });

        targets.push(
            ...skills.map((s) => ({
                kind: "skill" as const,
                name: s.name,
                path: s.path,
            }))
        );
    } else if (options.includeSystem) {
        // If skipping current path but including system, only scan system directories
        const skills = await discoverSkills(basePath, {
            includeSystem: true,
            extraSkillDirs: options.extraSkillDirs,
            fullDepth: false,
        });

        // Filter to only system directories (not from basePath)
        const systemSkills = skills.filter(s => !s.path.startsWith(basePath));
        targets.push(
            ...systemSkills.map((s) => ({
                kind: "skill" as const,
                name: s.name,
                path: s.path,
            }))
        );
    }

    // Discover browser extensions if enabled
    if (options.includeExtensions) {
        const extensions = await discoverBrowserExtensions(options.extraExtensionDirs);
        targets.push(
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
            }))
        );
    }

    // Discover IDE extensions if enabled
    if (options.includeIDEExtensions) {
        const ideExtensions = await discoverIDEExtensions(options.extraIDEExtensionDirs);
        targets.push(
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
            }))
        );
    }

    return targets;
}

/**
 * Run scan with only selected targets (custom implementation)
 */
async function runScanWithSelectedTargets(
    selectedTargets: Target[],
    options: ScanOptions
): Promise<ScanResult | undefined> {
    if (options.fix) {
        console.warn("Note: --fix will comment out matched lines in supported file types.");
    }

    const start = Date.now();

    const rules = await loadCompiledRules(selectedTargets[0]?.path || ".");
    const indexedRules = new IndexedRuleEngine(rules);

    // Initialize cache if enabled
    const cache = config.enableCache ? new ScanCache(config.cacheDir, "1.0", config.cacheMaxAge) : null;
    if (cache) {
        await cache.load();
    }

    console.log(`✓ Scanning ${selectedTargets.length} selected target(s)\n`);

    // Plan what files to scan for each target
    const scanPlans = await Promise.all(
        selectedTargets.map(async (target) => ({
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
            const uncachedFiles: string[] = [];
            const cachedFindings: Finding[] = [];

            if (cache) {
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

            if (uncachedFiles.length > 0) {
                const newFindings = await scanFilesParallel(uncachedFiles, indexedRules.getAllRules(), options);

                if (cache) {
                    for (const filePath of uncachedFiles) {
                        const fileFindings = newFindings.filter(f => f.file === filePath);
                        await cache.setCachedFindings(filePath, fileFindings);
                    }
                }

                skillFindings = [...cachedFindings, ...newFindings];

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
            const concurrency = Math.min(32, Math.max(4, Math.floor((navigator.hardwareConcurrency ?? 8) / 2)));
            let index = 0;

            const worker = async () => {
                while (index < plan.files.length) {
                    const filePath = plan.files[index++];
                    try {
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

    let filteredFindings = options.enableMeta ? applyMetaAnalyzer(findings) : findings;

    // Add confidence scores if requested
    if (options.showConfidence) {
        const { addConfidenceScores, filterByConfidence } = await import("../../scanner/confidence");
        filteredFindings = addConfidenceScores(filteredFindings);

        // Filter by minimum confidence if specified
        if (options.minConfidence !== undefined) {
            const beforeCount = filteredFindings.length;
            filteredFindings = filterByConfidence(filteredFindings, options.minConfidence);
            const filtered = beforeCount - filteredFindings.length;
            if (filtered > 0) {
                console.log(`\n📊 Filtered ${filtered} finding(s) below confidence threshold (${Math.round(options.minConfidence * 100)}%)`);
            }
        }
    }

    const result: ScanResult = {
        targets: selectedTargets,
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
    await saveScanResults(result, "scan", selectedTargets[0]?.path || ".", options);

    return result;
}

/**
 * Run fully interactive scan command
 */
export async function runInteractiveScan(
    initialPath?: string,
    initialOptions: ScanOptions = {} as ScanOptions
): Promise<void> {
    // Show logo at the start
    showLogo();
    console.log("\n🔍 Interactive Security Scanner\n");

    try {
        // Step 1: Get scan type (what to include)
        const scanTypeOptions = await promptScanType();
        console.log("\n");

        // Step 2: Determine scan path
        let scanPath = initialPath || ".";
        if (scanTypeOptions.customPath) {
            scanPath = scanTypeOptions.customPath;
        }

        // Merge options
        const options: ScanOptions & { skipCurrentPath?: boolean; customPath?: string } = {
            ...initialOptions,
            ...scanTypeOptions,
        };

        const basePath = sanitizePath(resolve(scanPath));

        // Reset path tracking for circular symlink detection
        resetPathTracking();

        // Step 3: Discover all available targets
        console.log("🔍 Discovering targets...\n");
        const availableTargets = await discoverAllTargets(basePath, options);

        if (availableTargets.length === 0) {
            console.error("❌ No targets found to scan.");
            console.log("\nSearched for:");
            console.log("  • Skills (SKILL.md files)");
            if (options.includeExtensions) {
                console.log("  • Browser extensions");
            }
            if (options.includeIDEExtensions) {
                console.log("  • IDE extensions");
            }
            console.log("\nTip: Try enabling system directories or extensions.\n");
            cleanupStdin();
            process.exit(1);
        }

        console.log(`✓ Found ${availableTargets.length} target(s)\n`);

        // Step 4: Run interactive session for target selection and option configuration
        const session = await runInteractiveSession(availableTargets, options);

        if (!session.shouldProceed) {
            cleanupStdin();
            return;
        }

        // Step 5: Create a modified scan that only processes selected targets
        const modifiedOptions: ScanOptions = {
            ...options,
            ...session.scanOptions,
        };

        // Clean up stdin before running the scan
        cleanupStdin();

        // Run the scan with only selected targets
        await runScanWithSelectedTargets(session.selectedTargets, modifiedOptions);
    } catch (error) {
        if (error instanceof Error && error.message === "User cancelled") {
            console.log("\n\n❌ Cancelled by user.\n");
            cleanupStdin();
            process.exit(0);
        }
        cleanupStdin();
        throw error;
    }
}

/**
 * Clean up stdin to restore normal terminal behavior
 */
function cleanupStdin(): void {
    try {
        // Remove all listeners
        process.stdin.removeAllListeners('data');
        process.stdin.removeAllListeners('keypress');

        // Restore normal mode
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }

        // Pause stdin
        process.stdin.pause();

        // Show cursor
        process.stdout.write("\x1b[?25h");
    } catch {
        // Ignore cleanup errors
    }
}
