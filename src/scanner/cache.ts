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

    constructor(cacheDir?: string, ruleVersion: string = "1.0", maxAge: number = 7 * 24 * 60 * 60 * 1000) {
        this.cache = new Map();
        this.cacheDir = cacheDir || this.getDefaultCacheDir();
        this.ruleVersion = ruleVersion;
        this.maxAge = maxAge;
        this.dirty = false;
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
     */
    async getCachedFindings(filePath: string): Promise<Finding[] | null> {
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
     */
    async setCachedFindings(filePath: string, findings: Finding[]): Promise<void> {
        const hash = await this.hashFile(filePath);
        this.cache.set(filePath, {
            hash,
            findings,
            timestamp: Date.now(),
            ruleVersion: this.ruleVersion,
        });
        this.dirty = true;
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
