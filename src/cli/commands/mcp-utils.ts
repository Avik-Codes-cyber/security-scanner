import type { Finding, ScanOptions, ScanResult } from "../../scanner/types";
import { applyMetaAnalyzer } from "../../scanner/report";
import { scanContentItem } from "../../scanner/engine/scan-content";
import type { ScanUi } from "../../utils/tui/types";
import type { McpCliOptions } from "../types";
import { parseHeaderList, parseMcpScanList } from "../utils";
import { handleScanOutput, checkFailCondition } from "../output";
import { setupScanTui } from "./scan-utils";

/**
 * Setup TUI for MCP scans (wrapper around shared setupScanTui)
 */
export function setupMcpTui(options: ScanOptions, totalFiles: number, totalTargets: number) {
    return setupScanTui(options, totalFiles, totalTargets, false);
}

/**
 * Scan virtual files with TUI updates
 */
export function scanMcpFiles(
    files: Array<{ virtualPath: string; fileType: any; content: string }>,
    rules: any[],
    options: ScanOptions,
    tui: ScanUi
): Finding[] {
    const targetFindings: Finding[] = [];
    for (const item of files) {
        try {
            const fileFindings = scanContentItem(item, rules, options);
            if (fileFindings.length) {
                targetFindings.push(...fileFindings);
                tui.onFindings(fileFindings);
            }
        } finally {
            tui.onFile(item.virtualPath);
        }
    }
    return targetFindings;
}

/**
 * Apply meta analysis if enabled
 */
export function applyMetaIfEnabled(findings: Finding[], options: ScanOptions, tui: ScanUi): Finding[] {
    const filtered = options.enableMeta ? applyMetaAnalyzer(findings) : findings;
    if (options.enableMeta) tui.setCurrentFindings(filtered);
    return filtered;
}

/**
 * Finalize scan and output results
 */
export async function finalizeMcpScan(
    result: ScanResult,
    options: ScanOptions,
    outputFormat: "table" | "json" | "sarif",
    tuiEnabled: boolean,
    tui: ScanUi,
    startTime: number
): Promise<ScanResult> {
    result.elapsedMs = Date.now() - startTime;
    tui.finish();
    await handleScanOutput(result, { format: outputFormat, output: options.output, tuiEnabled });
    checkFailCondition(result, options);
    return result;
}

/**
 * Disable fix for MCP targets
 */
export function disableFixForMcp(options: ScanOptions, reason: string) {
    if (options.fix) {
        console.warn(`Note: --fix is not supported for ${reason}. Ignoring --fix.`);
        options.fix = false;
    }
}

/**
 * Parse MCP connection options
 */
export function parseMcpConnectionOptions(mcp: McpCliOptions) {
    const headers = parseHeaderList(mcp.headers ?? []);
    if (mcp.bearerToken) {
        headers["Authorization"] = `Bearer ${mcp.bearerToken}`;
    }

    const scanList = parseMcpScanList(mcp.scan);
    const allowedMimeTypes = (mcp.mimeTypes ?? "text/plain,text/markdown,text/html,application/json")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);

    const maxResourceBytes =
        typeof mcp.maxResourceBytes === "number" && Number.isFinite(mcp.maxResourceBytes)
            ? Math.max(1, Math.floor(mcp.maxResourceBytes))
            : 1_048_576;

    return { headers, scanList, allowedMimeTypes, maxResourceBytes };
}
