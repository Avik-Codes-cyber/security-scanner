import { Worker } from "worker_threads";
import { cpus } from "os";
import type { CompiledRule } from "./engine/rule-engine";
import type { Finding, ScanOptions } from "./types";

export type ScanTask = {
    files: string[];
    rules: CompiledRule[];
    options?: ScanOptions;
};

export type ScanTaskResult = {
    findings: Finding[];
    error?: string;
};

/**
 * Scans files in parallel using worker threads for better performance on multi-core systems.
 */
export async function scanFilesParallel(
    files: string[],
    rules: CompiledRule[],
    options?: ScanOptions
): Promise<Finding[]> {
    if (files.length === 0) return [];

    // For small file counts, don't bother with workers
    if (files.length < 10) {
        const { scanFile } = await import("./scan-file");
        const results = await Promise.all(
            files.map((file) => scanFile(file, rules, options))
        );
        return results.flat();
    }

    const workerCount = Math.min(cpus().length, files.length, 8); // Cap at 8 workers
    const chunkSize = Math.ceil(files.length / workerCount);
    const chunks: string[][] = [];

    for (let i = 0; i < files.length; i += chunkSize) {
        chunks.push(files.slice(i, i + chunkSize));
    }

    const results = await Promise.all(
        chunks.map((chunk) => scanChunkInWorker(chunk, rules, options))
    );

    return results.flat();
}

async function scanChunkInWorker(
    files: string[],
    rules: CompiledRule[],
    options?: ScanOptions
): Promise<Finding[]> {
    // Worker threads have issues with bundled binaries in Bun
    // Use Promise.all for parallel execution instead
    const { scanFile } = await import("./scan-file");
    const results = await Promise.all(
        files.map((file) => scanFile(file, rules, options).catch(() => []))
    );
    return results.flat();
}
