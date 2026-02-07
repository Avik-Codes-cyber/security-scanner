/**
 * Interactive Target Selector
 * 
 * Provides interactive selection of scan targets and options
 */

import { resolve } from "path";
import type { Target, ScanOptions, Severity } from "../../scanner/types";
import type { InteractiveSession, InteractiveChoice } from "./types";
import { selectPrompt, multiselectPrompt, confirmPrompt, inputPrompt } from "./prompts";

/**
 * Prompt for scan path
 */
export async function promptScanPath(defaultPath = "."): Promise<string> {
    // Ensure stdin is properly set up
    if (!process.stdin.isTTY) {
        console.error("Error: Interactive mode requires a TTY terminal");
        process.exit(1);
    }

    // Set up stdin for input
    process.stdin.setEncoding('utf8');

    const path = await inputPrompt(
        "Enter path to scan",
        defaultPath
    );

    try {
        const resolvedPath = resolve(path);
        return resolvedPath;
    } catch (error) {
        console.log(`⚠️  Invalid path: ${path}`);
        return promptScanPath(defaultPath);
    }
}

/**
 * Prompt for scan type (what to include)
 */
export async function promptScanType(): Promise<Partial<ScanOptions> & { skipCurrentPath?: boolean; customPath?: string }> {
    const options: Partial<ScanOptions> & { skipCurrentPath?: boolean; customPath?: string } = {};

    // Ask what to scan
    const scanTypes = await multiselectPrompt(
        "What would you like to scan?",
        [
            { label: "Current directory", value: "current", description: "Scan the current working directory", selected: true },
            { label: "System skill directories", value: "system", description: "~/.codex/skills, ~/.cursor/skills, etc." },
            { label: "Browser extensions", value: "extensions", description: "Chrome, Edge, Brave, Firefox" },
            { label: "IDE extensions", value: "ide-extensions", description: "VS Code, Cursor, JetBrains" },
            { label: "Custom path", value: "custom", description: "Specify a different path to scan" },
        ]
    );

    const scanCurrent = scanTypes.includes("current");
    const scanCustom = scanTypes.includes("custom");

    options.skipCurrentPath = !scanCurrent && !scanCustom;
    options.includeSystem = scanTypes.includes("system");
    options.includeExtensions = scanTypes.includes("extensions");
    options.includeIDEExtensions = scanTypes.includes("ide-extensions");

    // If custom path is selected, prompt for it
    if (scanCustom) {
        const customPath = await inputPrompt(
            "Enter custom path to scan",
            "."
        );
        options.customPath = customPath;
    }

    // Only ask about depth if scanning current directory or custom path
    if (scanCurrent || scanCustom) {
        const fullDepth = await confirmPrompt(
            "Search recursively for all SKILL.md files? (slower but more thorough)",
            false
        );
        options.fullDepth = fullDepth;

        // Ask about extra directories
        const addExtraDirs = await confirmPrompt(
            "Add extra skill directories to scan?",
            false
        );

        if (addExtraDirs) {
            const dirsInput = await inputPrompt(
                "Extra skill directories (comma-separated)",
                ""
            );
            if (dirsInput) {
                options.extraSkillDirs = dirsInput.split(",").map((d) => d.trim()).filter(Boolean);
            }
        }
    }

    return options;
}

/**
 * Create choices from targets
 */
function createTargetChoices(targets: Target[]): InteractiveChoice[] {
    return targets.map((target) => ({
        label: target.name,
        value: target.path,
        description: `${target.kind} - ${target.path}`,
        selected: false,
    }));
}

/**
 * Run interactive target selection
 */
export async function selectTargets(
    availableTargets: Target[]
): Promise<Target[]> {
    if (availableTargets.length === 0) {
        console.log("No targets available for selection.");
        return [];
    }

    console.log("\n");

    // Ask if user wants to select specific targets or scan all
    const scanAll = await confirmPrompt(
        `Scan all ${availableTargets.length} target(s)?`,
        true
    );

    if (scanAll) {
        return availableTargets;
    }

    // Multi-select targets
    const choices = createTargetChoices(availableTargets);
    const selectedPaths = await multiselectPrompt(
        "Select targets to scan:",
        choices
    );

    return availableTargets.filter((t) => selectedPaths.includes(t.path));
}

/**
 * Configure scan options interactively
 */
export async function configureScanOptions(
    currentOptions: Partial<ScanOptions> = {}
): Promise<Partial<ScanOptions>> {
    console.log("\n");

    const configureOptions = await confirmPrompt(
        "Configure scan options?",
        false
    );

    if (!configureOptions) {
        return currentOptions;
    }

    const options: Partial<ScanOptions> = { ...currentOptions };

    // Severity threshold
    const severityChoice = await selectPrompt(
        "Fail on severity level:",
        [
            { label: "None (don't fail)", value: "none" },
            { label: "Low", value: "LOW" },
            { label: "Medium", value: "MEDIUM" },
            { label: "High", value: "HIGH" },
            { label: "Critical", value: "CRITICAL" },
        ]
    );

    if (severityChoice !== "none") {
        options.failOn = severityChoice as Severity;
    }

    // Output format
    const formatChoice = await selectPrompt(
        "Output format:",
        [
            { label: "Table (interactive)", value: "table" },
            { label: "JSON", value: "json" },
            { label: "SARIF", value: "sarif" },
        ]
    );
    options.format = formatChoice as "table" | "json" | "sarif";

    // Additional options
    const enableMeta = await confirmPrompt(
        "Enable meta-analysis (reduce false positives)?",
        currentOptions.enableMeta ?? true
    );
    options.enableMeta = enableMeta;

    const enableFix = await confirmPrompt(
        "Auto-fix issues (comment out problematic lines)?",
        currentOptions.fix ?? false
    );
    options.fix = enableFix;

    const saveResults = await confirmPrompt(
        "Save scan results to database?",
        currentOptions.save ?? false
    );
    options.save = saveResults;

    // Tags for saved results
    if (saveResults) {
        const tagsInput = await inputPrompt(
            "Tags (comma-separated)",
            currentOptions.tags?.join(", ") ?? ""
        );
        if (tagsInput) {
            options.tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
        }
    }

    return options;
}

/**
 * Run a complete interactive session
 */
export async function runInteractiveSession(
    availableTargets: Target[],
    initialOptions: Partial<ScanOptions> = {}
): Promise<InteractiveSession> {
    console.log("\n🔍 Interactive Security Scanner\n");

    try {
        // Select targets
        const selectedTargets = await selectTargets(availableTargets);

        if (selectedTargets.length === 0) {
            console.log("\n❌ No targets selected. Exiting.\n");
            return {
                selectedTargets: [],
                scanOptions: {},
                shouldProceed: false,
            };
        }

        // Configure options
        const scanOptions = await configureScanOptions(initialOptions);

        // Confirm scan
        console.log("\n");
        const proceed = await confirmPrompt(
            `Proceed with scanning ${selectedTargets.length} target(s)?`,
            true
        );

        if (!proceed) {
            console.log("\n❌ Scan cancelled.\n");
            return {
                selectedTargets,
                scanOptions,
                shouldProceed: false,
            };
        }

        console.log("\n");

        return {
            selectedTargets,
            scanOptions,
            shouldProceed: true,
        };
    } catch (error) {
        if (error instanceof Error && error.message === "User cancelled") {
            console.log("\n\n❌ Cancelled by user.\n");
            process.exit(0);
        }
        throw error;
    }
}
