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
export async function promptScanType(): Promise<Partial<ScanOptions> & {
    skipCurrentPath?: boolean;
    customPath?: string;
    mcpType?: "known" | "config" | "remote" | "static";
    mcpConfigPath?: string;
    mcpServerUrl?: string;
    mcpStaticFiles?: string[];
    mcpBearerToken?: string;
    mcpHeaders?: string[];
    mcpScan?: string;
    mcpReadResources?: boolean;
    mcpMimeTypes?: string;
    mcpMaxResourceBytes?: number;
}> {
    const options: Partial<ScanOptions> & {
        skipCurrentPath?: boolean;
        customPath?: string;
        mcpType?: "known" | "config" | "remote" | "static";
        mcpConfigPath?: string;
        mcpServerUrl?: string;
        mcpStaticFiles?: string[];
        mcpBearerToken?: string;
        mcpHeaders?: string[];
        mcpScan?: string;
        mcpReadResources?: boolean;
        mcpMimeTypes?: string;
        mcpMaxResourceBytes?: number;
    } = {};

    // Ask what to scan
    const scanTypes = await multiselectPrompt(
        "What would you like to scan?",
        [
            { label: "Current directory", value: "current", description: "Scan the current working directory", selected: true },
            { label: "System skill directories", value: "system", description: "~/.codex/skills, ~/.cursor/skills, etc." },
            { label: "Browser extensions", value: "extensions", description: "Chrome, Edge, Brave, Firefox" },
            { label: "IDE extensions", value: "ide-extensions", description: "VS Code, Cursor, JetBrains" },
            { label: "MCP servers", value: "mcp", description: "Model Context Protocol servers" },
            { label: "Custom path", value: "custom", description: "Specify a different path to scan" },
        ]
    );

    const scanCurrent = scanTypes.includes("current");
    const scanCustom = scanTypes.includes("custom");
    const scanMcp = scanTypes.includes("mcp");

    options.skipCurrentPath = !scanCurrent && !scanCustom;
    options.includeSystem = scanTypes.includes("system");
    options.includeExtensions = scanTypes.includes("extensions");
    options.includeIDEExtensions = scanTypes.includes("ide-extensions");
    options.includeMcp = scanMcp;

    // If custom path is selected, prompt for it
    if (scanCustom) {
        const customPath = await inputPrompt(
            "Enter custom path to scan",
            "."
        );
        options.customPath = customPath;
    }

    // If MCP is selected, prompt for MCP options
    if (scanMcp) {
        const mcpType = await selectPrompt(
            "MCP scan type:",
            [
                { label: "Known configs (auto-discover)", value: "known" },
                { label: "Config file", value: "config" },
                { label: "Remote server URL", value: "remote" },
                { label: "Static JSON files", value: "static" },
            ]
        );

        options.mcpType = mcpType as "known" | "config" | "remote" | "static";

        if (mcpType === "config") {
            const configPath = await inputPrompt(
                "Path to MCP config file",
                "mcp.json"
            );
            options.mcpConfigPath = configPath;
        } else if (mcpType === "remote") {
            const serverUrl = await inputPrompt(
                "MCP server URL",
                "http://localhost:3000"
            );
            options.mcpServerUrl = serverUrl;

            // Ask for authentication
            const needsAuth = await confirmPrompt(
                "Does this server require authentication?",
                false
            );

            if (needsAuth) {
                const authType = await selectPrompt(
                    "Authentication type:",
                    [
                        { label: "Bearer token", value: "bearer" },
                        { label: "Custom headers", value: "headers" },
                    ]
                );

                if (authType === "bearer") {
                    const token = await inputPrompt(
                        "Bearer token",
                        ""
                    );
                    if (token) {
                        options.mcpBearerToken = token;
                    }
                } else if (authType === "headers") {
                    const headersInput = await inputPrompt(
                        "Custom headers (format: Key:Value, comma-separated)",
                        ""
                    );
                    if (headersInput) {
                        options.mcpHeaders = headersInput.split(",").map((h) => h.trim()).filter(Boolean);
                    }
                }
            }

            // Ask for scan options
            const scanOptions = await multiselectPrompt(
                "What to scan from MCP server?",
                [
                    { label: "Tools", value: "tools", selected: true },
                    { label: "Instructions", value: "instructions", selected: true },
                    { label: "Prompts", value: "prompts", selected: true },
                    { label: "Resources", value: "resources", selected: false },
                ]
            );
            options.mcpScan = scanOptions.join(",");

            // Ask if should read resource contents
            if (scanOptions.includes("resources")) {
                const readResources = await confirmPrompt(
                    "Read resource contents? (may be slower)",
                    false
                );
                options.mcpReadResources = readResources;

                if (readResources) {
                    const mimeTypes = await inputPrompt(
                        "Allowed MIME types (comma-separated, empty for all)",
                        ""
                    );
                    if (mimeTypes) {
                        options.mcpMimeTypes = mimeTypes;
                    }

                    const maxBytes = await inputPrompt(
                        "Max resource size in bytes (empty for default)",
                        ""
                    );
                    if (maxBytes) {
                        const parsed = parseInt(maxBytes, 10);
                        if (!isNaN(parsed) && parsed > 0) {
                            options.mcpMaxResourceBytes = parsed;
                        }
                    }
                }
            }
        } else if (mcpType === "static") {
            const staticFiles = await inputPrompt(
                "Static JSON files (comma-separated)",
                ""
            );
            if (staticFiles) {
                options.mcpStaticFiles = staticFiles.split(",").map((f) => f.trim()).filter(Boolean);
            }
        }
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

    // Confidence scoring
    const showConfidence = await confirmPrompt(
        "Show confidence scores?",
        currentOptions.showConfidence ?? false
    );
    options.showConfidence = showConfidence;

    if (showConfidence) {
        const minConfidenceInput = await inputPrompt(
            "Minimum confidence threshold (0.0-1.0)",
            currentOptions.minConfidence?.toString() ?? "0.0"
        );
        const minConfidence = parseFloat(minConfidenceInput);
        if (!isNaN(minConfidence) && minConfidence >= 0 && minConfidence <= 1) {
            options.minConfidence = minConfidence;
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
