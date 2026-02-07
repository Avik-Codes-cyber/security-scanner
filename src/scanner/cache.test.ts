import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ScanCache } from "./cache";

describe("ScanCache", () => {
    let testDir: string;
    let cache: ScanCache;

    beforeAll(() => {
        testDir = mkdtempSync(join(tmpdir(), "cache-test-"));
        cache = new ScanCache(testDir, "1.0", 1000 * 60 * 60); // 1 hour
    });

    afterAll(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    test("initializes cache", async () => {
        await cache.load();
        expect(cache).toBeTruthy();
    });

    test("caches and retrieves findings", async () => {
        await cache.load();

        // Create a real test file
        const testFile = join(testDir, "cache-test.md");
        await Bun.write(testFile, "test content");

        const findings = [
            {
                file: testFile,
                line: 1,
                column: 0,
                severity: "HIGH" as const,
                ruleId: "TEST_RULE",
                message: "Test finding",
                snippet: "test snippet",
            },
        ];

        await cache.setCachedFindings(testFile, findings);
        const retrieved = await cache.getCachedFindings(testFile);

        expect(retrieved).toBeTruthy();
        expect(retrieved?.length).toBe(1);
        expect(retrieved?.[0].ruleId).toBe("TEST_RULE");
    });

    test("returns null for non-cached files", async () => {
        await cache.load();
        const retrieved = await cache.getCachedFindings("/non/existent/file.txt");
        expect(retrieved).toBeNull();
    });

    test("invalidates cache for modified files", async () => {
        await cache.load();

        const testFile = join(testDir, "test-file.txt");
        await Bun.write(testFile, "original content");

        const findings = [
            {
                file: testFile,
                line: 1,
                column: 0,
                severity: "HIGH" as const,
                ruleId: "TEST_RULE",
                message: "Test finding",
                snippet: "test snippet",
            },
        ];

        await cache.setCachedFindings(testFile, findings);

        // Modify the file
        await Bun.sleep(10); // Ensure different timestamp
        await Bun.write(testFile, "modified content");

        const retrieved = await cache.getCachedFindings(testFile);
        expect(retrieved).toBeNull(); // Should be invalidated
    });

    test("saves and loads cache from disk", async () => {
        const cache1 = new ScanCache(testDir, "1.0", 1000 * 60 * 60);
        await cache1.load();

        // Create a real file for testing
        const testFile = join(testDir, "persistent.md");
        await Bun.write(testFile, "test content");

        const findings = [
            {
                file: testFile,
                line: 1,
                column: 0,
                severity: "CRITICAL" as const,
                ruleId: "PERSIST_TEST",
                message: "Persistent finding",
                snippet: "test",
            },
        ];

        await cache1.setCachedFindings(testFile, findings);
        await cache1.save();

        // Create new cache instance and load
        const cache2 = new ScanCache(testDir, "1.0", 1000 * 60 * 60);
        await cache2.load();

        const retrieved = await cache2.getCachedFindings(testFile);
        expect(retrieved).toBeTruthy();
        expect(retrieved?.[0].ruleId).toBe("PERSIST_TEST");
    });
});
