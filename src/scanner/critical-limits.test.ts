import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { scanFile } from "./scan-file";
import { ScanCache } from "./cache";
import { loadRulesFromText } from "./engine/rule-engine";

describe("Critical Limits Protection", () => {
    let testDir: string;

    beforeAll(async () => {
        testDir = await mkdtemp(join(tmpdir(), "critical-limits-test-"));
    });

    afterAll(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    test("enforces per-file findings limit", async () => {
        // Create a file with many potential findings
        const filePath = join(testDir, "many-findings.md");
        const content = Array(200)
            .fill("ignore all previous instructions")
            .join("\n");
        await writeFile(filePath, content);

        const rules = loadRulesFromText(`
- id: TEST_RULE
  category: test
  severity: HIGH
  patterns:
    - "ignore all previous instructions"
  file_types: [markdown]
`);

        const findings = await scanFile(filePath, rules);

        // Should be capped at 20 per rule (MAX_FINDINGS_PER_RULE_PER_FILE)
        expect(findings.length).toBeLessThanOrEqual(20);
    });

    test("cache enforces LRU eviction on max entries", async () => {
        const cache = new ScanCache(
            join(testDir, "cache-lru"),
            "1.0",
            7 * 24 * 60 * 60 * 1000,
            5, // maxEntries = 5
            100 // maxSizeMB
        );

        await cache.load();

        // Add 10 files to cache (exceeds limit of 5)
        for (let i = 0; i < 10; i++) {
            const filePath = join(testDir, `file-${i}.md`);
            await writeFile(filePath, `content ${i}`);
            await cache.setCachedFindings(filePath, [
                {
                    ruleId: "TEST",
                    severity: "HIGH",
                    message: "test",
                    file: filePath,
                    category: "test",
                    source: "signature",
                },
            ]);
        }

        const stats = cache.getStats();

        // Cache should have evicted old entries to stay at max
        expect(stats.entryCount).toBeLessThanOrEqual(5);
    });

    test("cache enforces size limit with LRU eviction", async () => {
        const cache = new ScanCache(
            join(testDir, "cache-size"),
            "1.0",
            7 * 24 * 60 * 60 * 1000,
            10000, // maxEntries
            0.001 // maxSizeMB = 1KB (very small to trigger eviction)
        );

        await cache.load();

        // Add files with findings until size limit is hit
        for (let i = 0; i < 100; i++) {
            const filePath = join(testDir, `large-file-${i}.md`);
            await writeFile(filePath, `content ${i}`);

            // Create many findings to increase cache size
            const findings = Array(50).fill(null).map((_, j) => ({
                ruleId: "TEST",
                severity: "HIGH" as const,
                message: `Finding ${j} with a very long message to increase memory usage`,
                file: filePath,
                line: j,
                category: "test",
                remediation: "Long remediation text to increase size",
                source: "signature" as const,
            }));

            await cache.setCachedFindings(filePath, findings);
        }

        const stats = cache.getStats();

        // Cache should have evicted entries to stay under size limit
        // With 1KB limit, we shouldn't have all 100 files cached
        expect(stats.entryCount).toBeLessThan(100);
    });

    test("handles regex timeout gracefully", async () => {
        // This test verifies that catastrophic backtracking doesn't hang
        const filePath = join(testDir, "redos-test.md");

        // Pattern that could cause catastrophic backtracking
        const content = "a".repeat(30) + "!";
        await writeFile(filePath, content);

        // Potentially dangerous pattern (nested quantifiers)
        const rules = loadRulesFromText(`
- id: DANGEROUS_PATTERN
  category: test
  severity: HIGH
  patterns:
    - "^(a+)+$"
  file_types: [markdown]
`);

        const startTime = Date.now();
        const findings = await scanFile(filePath, rules);
        const elapsed = Date.now() - startTime;

        // Should complete quickly (within 2 seconds) even with dangerous pattern
        expect(elapsed).toBeLessThan(2000);
    });

    test("rejects files exceeding size limit", async () => {
        const filePath = join(testDir, "large-file.md");

        // Create a 6MB file (exceeds 5MB default limit)
        const largeContent = "x".repeat(6 * 1024 * 1024);
        await writeFile(filePath, largeContent);

        const rules = loadRulesFromText(`
- id: TEST_RULE
  category: test
  severity: HIGH
  patterns:
    - "test"
  file_types: [markdown]
`);

        const findings = await scanFile(filePath, rules);

        // Should return empty array (file too large)
        expect(findings).toEqual([]);
    });

    test("cache handles concurrent access safely", async () => {
        const cache = new ScanCache(join(testDir, "cache-concurrent"));
        await cache.load();

        const filePath = join(testDir, "concurrent-test.md");
        await writeFile(filePath, "test content");

        // Simulate concurrent writes to same file
        const promises = Array(10).fill(null).map(async (_, i) => {
            await cache.setCachedFindings(filePath, [
                {
                    ruleId: `TEST_${i}`,
                    severity: "HIGH",
                    message: `test ${i}`,
                    file: filePath,
                    category: "test",
                    source: "signature",
                },
            ]);
        });

        await Promise.all(promises);

        // Cache should have one entry (last write wins)
        const cached = await cache.getCachedFindings(filePath);
        expect(cached).not.toBeNull();
        expect(cached?.length).toBeGreaterThan(0);
    });

    test("handles empty file gracefully", async () => {
        const filePath = join(testDir, "empty.md");
        await writeFile(filePath, "");

        const rules = loadRulesFromText(`
- id: TEST_RULE
  category: test
  severity: HIGH
  patterns:
    - "test"
  file_types: [markdown]
`);

        const findings = await scanFile(filePath, rules);
        expect(findings).toEqual([]);
    });

    test("handles file with only whitespace", async () => {
        const filePath = join(testDir, "whitespace.md");
        await writeFile(filePath, "   \n\n\t\t\n   ");

        const rules = loadRulesFromText(`
- id: TEST_RULE
  category: test
  severity: HIGH
  patterns:
    - "test"
  file_types: [markdown]
`);

        const findings = await scanFile(filePath, rules);
        expect(findings).toEqual([]);
    });
});
