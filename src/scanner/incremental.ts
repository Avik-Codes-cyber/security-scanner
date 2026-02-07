import { stat } from "fs/promises";
import { ScanCache } from "./cache";
import type { Finding } from "./types";

export type IncrementalScanOptions = {
    cache: ScanCache;
    baselineTimestamp?: number; // Only scan files modified after this timestamp
    gitDiff?: boolean; // Use git to find changed files
};

/**
 * Filter files for incremental scanning based on modification time or git status.
 */
export async function filterIncrementalFiles(
    files: string[],
    options: IncrementalScanOptions
): Promise<{ toScan: string[]; cached: Map<string, Finding[]> }> {
    const toScan: string[] = [];
    const cached = new Map<string, Finding[]>();

    for (const file of files) {
        // Check cache first
        const cachedFindings = await options.cache.getCachedFindings(file);

        if (cachedFindings !== null) {
            // If we have a baseline timestamp, check if file was modified after it
            if (options.baselineTimestamp) {
                try {
                    const stats = await stat(file);
                    const modifiedTime = stats.mtimeMs;

                    if (modifiedTime > options.baselineTimestamp) {
                        // File modified after baseline, needs rescan
                        toScan.push(file);
                    } else {
                        // File not modified, use cache
                        cached.set(file, cachedFindings);
                    }
                } catch {
                    // If we can't stat the file, scan it
                    toScan.push(file);
                }
            } else {
                // No baseline, use cache
                cached.set(file, cachedFindings);
            }
        } else {
            // Not in cache, needs scan
            toScan.push(file);
        }
    }

    return { toScan, cached };
}

/**
 * Get list of changed files from git.
 */
export async function getGitChangedFiles(basePath: string, since?: string): Promise<string[]> {
    try {
        const { execSync } = await import("child_process");

        // Get changed files since a commit/branch/time
        const gitCommand = since
            ? `git diff --name-only ${since}`
            : `git diff --name-only HEAD`;

        const output = execSync(gitCommand, {
            cwd: basePath,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"], // Suppress stderr
        });

        return output
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    } catch {
        // Git not available or not a git repo
        return [];
    }
}

/**
 * Get baseline timestamp from last scan.
 */
export function getLastScanTimestamp(cache: ScanCache): number | undefined {
    const stats = cache.getStats();
    return stats.newestEntry ?? undefined;
}
