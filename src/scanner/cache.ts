import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { Finding } from "./types";

export type CacheEntry = {
    hash: string;
    findings: Finding[];
    timestamp: number;
    ruleVersion: string;
};

/**
 * File-based cache for scan results to avoid re-scanning unchanged files.
 * Uses SHA-256 hashing to detect file changes.
 */
export class ScanCache {
    private cache: Map<string, CacheEntry>;
    private cacheDir: string;
    private ruleVersion: string;
    private maxAge: number; // milliseconds
    private dirty: boolean;
    private maxEntries: number;
    private maxSizeBytes: number;
    private locks: Map<string, Promise<void>>; // Per-file locks for concurrent access

    constructor(
        cacheDir?: string,
        ruleVersion: string = "1.0",
        maxAge: number = 7 * 24 * 60 * 60 * 1000,
        maxEntries: number = 10000,
        maxSizeMB: number = 100
    ) {
        this.cache = new Map();
        this.cacheDir = cacheDir || this.getDefaultCacheDir();
        this.ruleVersion = ruleVersion;
        this.maxAge = maxAge;
        this.maxEntries = maxEntries;
        this.maxSizeBytes = maxSizeMB * 1024 * 1024;
        this.dirty = false;
        this.locks = new Map();
    }

    private getDefaultCacheDir(): string {
        const home = process.env.HOME || process.env.USERPROFILE;
        if (process.platform === "darwin") {
            return join(home || "", "Library", "Caches", "securityscanner");
        } else if (process.platform === "win32") {
            return join(process.env.LOCALAPPDATA || "", "securityscanner", "cache");
        } else {
            return join(home || "", ".cache", "securityscanner");
        }
    }

    private getCachePath(): string {
        return join(this.cacheDir, "scan-cache.json");
    }

    /**
     * Load cache from disk.
     */
    async load(): Promise<void> {
        try {
            await mkdir(this.cacheDir, { recursive: true });
            const content = await readFile(this.getCachePath(), "utf-8");
            const data = JSON.parse(content);

            if (data && typeof data === "object") {
                const now = Date.now();
                for (const [path, entry] of Object.entries(data)) {
                    const cacheEntry = entry as CacheEntry;
                    // Skip expired or outdated entries
                    if (
                        cacheEntry.ruleVersion === this.ruleVersion &&
                        now - cacheEntry.timestamp < this.maxAge
                    ) {
                        this.cache.set(path, cacheEntry);
                    }
                }
            }
        } catch {
            // Cache doesn't exist or is corrupted, start fresh
            this.cache.clear();
        }
    }

    /**
     * Save cache to disk.
     */
    async save(): Promise<void> {
        if (!this.dirty) return;

        try {
            await mkdir(this.cacheDir, { recursive: true });
            const data: Record<string, CacheEntry> = {};
            for (const [path, entry] of this.cache.entries()) {
                data[path] = entry;
            }
            await writeFile(this.getCachePath(), JSON.stringify(data, null, 2), "utf-8");
            this.dirty = false;
        } catch (error) {
            console.warn("Failed to save scan cache:", error);
        }
    }

    /**
     * Get cached findings for a file if it hasn't changed.
     * Thread-safe with per-file locking.
     */
    async getCachedFindings(filePath: string): Promise<Finding[] | null> {
        // Wait for any pending write operation on this file
        const existingLock = this.locks.get(filePath);
        if (existingLock) {
            await existingLock;
        }

        const cached = this.cache.get(filePath);
        if (!cached) return null;

        // Check if rule version matches
        if (cached.ruleVersion !== this.ruleVersion) {
            this.cache.delete(filePath);
            this.dirty = true;
            return null;
        }

        // Check if cache is expired
        if (Date.now() - cached.timestamp > this.maxAge) {
            this.cache.delete(filePath);
            this.dirty = true;
            return null;
        }

        // Check if file has changed
        const currentHash = await this.hashFile(filePath);
        if (cached.hash !== currentHash) {
            this.cache.delete(filePath);
            this.dirty = true;
            return null;
        }

        return cached.findings;
    }

    /**
     * Store findings for a file in cache.
     * Implements LRU eviction when cache limits are exceeded.
     * Thread-safe with per-file locking to prevent race conditions.
     */
    async setCachedFindings(filePath: string, findings: Finding[]): Promise<void> {
        // Wait for any existing operation on this file
        const existingLock = this.locks.get(filePath);
        if (existingLock) {
            await existingLock;
        }

        // Create a new lock for this operation
        const lockPromise = this.doSetCachedFindings(filePath, findings);
        this.locks.set(filePath, lockPromise);

        try {
            await lockPromise;
        } finally {
            // Release the lock
            this.locks.delete(filePath);
        }
    }

    /**
     * Internal method to actually set cached findings.
     */
    private async doSetCachedFindings(filePath: string, findings: Finding[]): Promise<void> {
        const hash = await this.hashFile(filePath);

        // Check if we need to evict entries
        if (this.cache.size >= this.maxEntries) {
            this.evictOldestEntry();
        }

        // Check cache size and evict if needed
        const estimatedSize = this.estimateCacheSize();
        if (estimatedSize >= this.maxSizeBytes) {
            this.evictOldestEntry();
        }

        this.cache.set(filePath, {
            hash,
            findings,
            timestamp: Date.now(),
            ruleVersion: this.ruleVersion,
        });
        this.dirty = true;
    }

    /**
     * Evict the oldest cache entry (LRU eviction).
     */
    private evictOldestEntry(): void {
        if (this.cache.size === 0) return;

        let oldestPath: string | null = null;
        let oldestTimestamp = Infinity;

        for (const [path, entry] of this.cache.entries()) {
            if (entry.timestamp < oldestTimestamp) {
                oldestTimestamp = entry.timestamp;
                oldestPath = path;
            }
        }

        if (oldestPath) {
            this.cache.delete(oldestPath);
            this.dirty = true;
        }
    }

    /**
     * Estimate total cache size in bytes.
     */
    private estimateCacheSize(): number {
        let totalSize = 0;
        for (const entry of this.cache.values()) {
            // Rough estimate: hash (64 bytes) + findings array + timestamp (8 bytes) + ruleVersion (20 bytes)
            totalSize += 92;
            // Each finding: ~500 bytes average (file path, message, remediation, etc.)
            totalSize += entry.findings.length * 500;
        }
        return totalSize;
    }

    /**
     * Compute SHA-256 hash of a file.
     */
    async hashFile(filePath: string): Promise<string> {
        try {
            const file = Bun.file(filePath);
            const hasher = new Bun.CryptoHasher("sha256");
            hasher.update(await file.arrayBuffer());
            return hasher.digest("hex");
        } catch {
            // If file can't be read, return a unique hash based on path and timestamp
            return `error-${filePath}-${Date.now()}`;
        }
    }

    /**
     * Clear all cached entries.
     */
    clear(): void {
        this.cache.clear();
        this.dirty = true;
    }

    /**
     * Get cache statistics.
     */
    getStats(): {
        entryCount: number;
        totalFindings: number;
        oldestEntry: number | null;
        newestEntry: number | null;
    } {
        let totalFindings = 0;
        let oldestEntry: number | null = null;
        let newestEntry: number | null = null;

        for (const entry of this.cache.values()) {
            totalFindings += entry.findings.length;
            if (oldestEntry === null || entry.timestamp < oldestEntry) {
                oldestEntry = entry.timestamp;
            }
            if (newestEntry === null || entry.timestamp > newestEntry) {
                newestEntry = entry.timestamp;
            }
        }

        return {
            entryCount: this.cache.size,
            totalFindings,
            oldestEntry,
            newestEntry,
        };
    }
}
