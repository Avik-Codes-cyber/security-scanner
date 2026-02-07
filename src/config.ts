/**
 * Configuration for scanner performance features.
 * These can be overridden via environment variables.
 */

export type ScannerConfig = {
    // Parallel scanning
    enableParallelScanning: boolean;
    parallelWorkerCount: number;
    parallelThreshold: number; // Minimum files before using parallel scanning

    // Caching
    enableCache: boolean;
    cacheMaxAge: number; // milliseconds
    cacheDir?: string;

    // Storage
    storageBackend: "json" | "sqlite";
    sqliteDbPath?: string;
    maxStoredScans: number;

    // Performance
    maxFileSize: number; // bytes
    enableStreamingForLargeFiles: boolean;
    streamingThreshold: number; // bytes
};

function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (!value) return defaultValue;
    return value.toLowerCase() === "true" || value === "1";
}

function parseEnvNumber(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): ScannerConfig {
    return {
        // Parallel scanning (enabled by default)
        enableParallelScanning: parseEnvBoolean(
            process.env.SCANNER_PARALLEL_ENABLED,
            true
        ),
        parallelWorkerCount: parseEnvNumber(
            process.env.SCANNER_PARALLEL_WORKERS,
            Math.min(require("os").cpus().length, 4)
        ),
        parallelThreshold: parseEnvNumber(
            process.env.SCANNER_PARALLEL_THRESHOLD,
            10
        ),

        // Caching (enabled by default)
        enableCache: parseEnvBoolean(process.env.SCANNER_CACHE_ENABLED, true),
        cacheMaxAge: parseEnvNumber(
            process.env.SCANNER_CACHE_MAX_AGE,
            7 * 24 * 60 * 60 * 1000 // 7 days
        ),
        cacheDir: process.env.SCANNER_CACHE_DIR,

        // Storage (JSON by default for backwards compatibility)
        storageBackend: (process.env.SCANNER_STORAGE_BACKEND as "json" | "sqlite") || "json",
        sqliteDbPath: process.env.SCANNER_SQLITE_PATH,
        maxStoredScans: parseEnvNumber(process.env.SCANNER_MAX_STORED_SCANS, 100),

        // Performance
        maxFileSize: parseEnvNumber(
            process.env.SCANNER_MAX_FILE_SIZE,
            5 * 1024 * 1024 // 5MB
        ),
        enableStreamingForLargeFiles: parseEnvBoolean(
            process.env.SCANNER_STREAMING_ENABLED,
            false // Disabled by default for now
        ),
        streamingThreshold: parseEnvNumber(
            process.env.SCANNER_STREAMING_THRESHOLD,
            1 * 1024 * 1024 // 1MB
        ),
    };
}

// Global config instance
export const config = loadConfig();
