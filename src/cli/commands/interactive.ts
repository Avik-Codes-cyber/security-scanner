/**
 * Interactive Scan Command
 * 
 * Provides a fully interactive mode where users can input path, select targets, and configure scans
 */

import { resolve } from "path";
import type { ScanOptions, Target } from "../../scanner/types";
import { warn, debugWarn } from "../../utils/error-handling";
import { discoverSkills } from "../../scanner/discover";
import { discoverBrowserExtensions, discoverIDEExtensions } from "../../scanner/extensions/index";
import { sanitizePath } from "../../utils/fs";
import { resetPathTracking } from "../../utils/path-safety";
import { promptScanType, runInteractiveSession } from "../interactive";
import { runScanInternal } from "./scan";
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

        // Step 5: Merge options and prepare for scan
        const modifiedOptions: ScanOptions = {
            ...options,
            ...session.scanOptions,
        };

        // Clean up stdin before running the scan
        cleanupStdin();

        // Log selected targets count
        console.log(`✓ Scanning ${session.selectedTargets.length} selected target(s)\n`);

        // Step 6: Use the shared scan logic from scan.ts
        await runScanInternal(session.selectedTargets, basePath, modifiedOptions);
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
    } catch (error) {
        warn("Warning: Failed to remove stdin listeners", error);
    }

    try {
        // Restore normal mode
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
    } catch (error) {
        warn("Warning: Failed to restore stdin raw mode", error);
    }

    try {
        // Pause stdin
        process.stdin.pause();
    } catch (error) {
        warn("Warning: Failed to pause stdin", error);
    }

    try {
        // Show cursor (always attempt this for better UX)
        process.stdout.write("\x1b[?25h");
    } catch (error) {
        // This one is less critical - cursor visibility is cosmetic
        // Only log in debug mode or if verbose
        debugWarn("Warning: Failed to show cursor", error);
    }
}
