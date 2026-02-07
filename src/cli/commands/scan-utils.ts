import type { ScanOptions } from "../../scanner/types";
import { createTui } from "../../utils/tui";

/**
 * Setup TUI for any scan operation
 * Shared by scan.ts, mcp.ts, and other scan commands
 */
export function setupScanTui(
    options: ScanOptions,
    totalFiles: number,
    totalTargets: number,
    showConfidence: boolean = false,
    scanDescription?: string
) {
    const outputFormat = options.format ?? (options.json ? "json" : "table");
    const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
    const tui = createTui(tuiEnabled, showConfidence, scanDescription);
    tui.start(totalFiles, totalTargets);
    return { tui, outputFormat, tuiEnabled };
}
