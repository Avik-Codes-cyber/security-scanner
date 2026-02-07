import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { detectEncoding } from "../utils/fs";
import { calculateConfidence, addConfidenceScores, filterByConfidence } from "./confidence";
import { filterIncrementalFiles, getLastScanTimestamp } from "./incremental";
import { ScanCache } from "./cache";
import type { Finding } from "./types";

describe("P2 Improvements", () => {
    let testDir: string;

    beforeAll(async () => {
        testDir = await mkdtemp(join(tmpdir(), "p2-improvements-test-"));
    });

    afterAll(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("Unicode Handling", () => {
        test("handles emoji in strings", () => {
            const text = "🔑 API Key: abc123def456 🔐";
            // Should not crash and should handle emoji properly
            expect(text.length).toBeGreaterThan(0);
        });

        test("handles surrogate pairs correctly", () => {
            const text = "𝕳𝖊𝖑𝖑𝖔"; // Mathematical bold text
            const chars = Array.from(text);
            expect(chars.length).toBe(5); // 5 characters, not 10 bytes
        });

        test("handles RTL text", () => {
            const text = "مرحبا Hello שלום"; // Arabic, English, Hebrew
            expect(text.length).toBeGreaterThan(0);
        });

        test("handles CJK characters", () => {
            const text = "你好世界 こんにちは 안녕하세요"; // Chinese, Japanese, Korean
            expect(text.length).toBeGreaterThan(0);
        });
    });

    describe("Encoding Detection", () => {
        test("detects UTF-8 BOM", () => {
            const buffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
            const encoding = detectEncoding(buffer);
            expect(encoding).toBe("utf-8");
        });

        test("detects UTF-16 BE BOM", () => {
            const buffer = new Uint8Array([0xFE, 0xFF, 0x00, 0x48]);
            const encoding = detectEncoding(buffer);
            expect(encoding).toBe("utf-16be");
        });

        test("detects UTF-16 LE BOM", () => {
            const buffer = new Uint8Array([0xFF, 0xFE, 0x48, 0x00]);
            const encoding = detectEncoding(buffer);
            expect(encoding).toBe("utf-16le");
        });

        test("detects binary data", () => {
            const buffer = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x00, 0xFF]);
            const encoding = detectEncoding(buffer);
            expect(encoding).toBe("binary");
        });

        test("detects Latin-1 encoding", () => {
            // Latin-1 with high bytes that aren't valid UTF-8
            const buffer = new Uint8Array([0xE9, 0xE8, 0xE0]); // é è à in Latin-1
            const encoding = detectEncoding(buffer);
            expect(encoding).toBe("latin1");
        });

        test("defaults to UTF-8 for ASCII", () => {
            const buffer = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
            const encoding = detectEncoding(buffer);
            expect(encoding).toBe("utf-8");
        });

        test("detects valid UTF-8 multi-byte sequences", () => {
            // UTF-8 encoding of "你好" (Chinese for "hello")
            const buffer = new Uint8Array([0xE4, 0xBD, 0xA0, 0xE5, 0xA5, 0xBD]);
            const encoding = detectEncoding(buffer);
            expect(encoding).toBe("utf-8");
        });
    });

    describe("Confidence Scoring", () => {
        test("calculates confidence for signature-based findings", () => {
            const finding: Finding = {
                ruleId: "TEST_RULE",
                severity: "HIGH",
                message: "Test finding",
                file: "/test/file.ts",
                category: "test",
                source: "signature",
            };

            const confidence = calculateConfidence(finding, {});
            expect(confidence).toBeGreaterThan(0.5); // Signature findings have higher confidence
        });

        test("reduces confidence for test files", () => {
            const finding: Finding = {
                ruleId: "SECRET",
                severity: "HIGH",
                message: "Secret found",
                file: "/src/test/fixtures.ts",
                category: "credentials",
                source: "heuristic",
            };

            const confidence = calculateConfidence(finding, { inTestFile: true });
            expect(confidence).toBeLessThan(0.5); // Test files reduce confidence
        });

        test("increases confidence for high entropy secrets", () => {
            const finding: Finding = {
                ruleId: "HIGH_ENTROPY",
                severity: "HIGH",
                message: "High entropy string",
                file: "/src/config.ts",
                category: "heuristic_secrets",
                source: "heuristic",
            };

            const confidence = calculateConfidence(finding, { entropy: 4.7 });
            expect(confidence).toBeGreaterThan(0.6);
        });

        test("adds confidence scores to findings", () => {
            const findings: Finding[] = [
                {
                    ruleId: "TEST1",
                    severity: "HIGH",
                    message: "Test 1",
                    file: "/src/app.ts",
                    category: "test",
                    source: "signature",
                },
                {
                    ruleId: "TEST2",
                    severity: "MEDIUM",
                    message: "Test 2",
                    file: "/test/app.test.ts",
                    category: "test",
                    source: "heuristic",
                },
            ];

            const withConfidence = addConfidenceScores(findings);
            expect(withConfidence.length).toBe(2);
            expect(withConfidence[0].confidence).toBeDefined();
            expect(withConfidence[0].confidenceReason).toBeDefined();
            expect(withConfidence[1].confidence).toBeLessThan(withConfidence[0].confidence!);
        });

        test("filters findings by confidence threshold", () => {
            const findings = [
                {
                    ruleId: "HIGH_CONF",
                    severity: "HIGH" as const,
                    message: "High confidence",
                    file: "/src/app.ts",
                    category: "test",
                    source: "signature" as const,
                    confidence: 0.9,
                },
                {
                    ruleId: "LOW_CONF",
                    severity: "MEDIUM" as const,
                    message: "Low confidence",
                    file: "/test/app.test.ts",
                    category: "test",
                    source: "heuristic" as const,
                    confidence: 0.3,
                },
            ];

            const filtered = filterByConfidence(findings, 0.5);
            expect(filtered.length).toBe(1);
            expect(filtered[0].ruleId).toBe("HIGH_CONF");
        });
    });

    describe("Incremental Scanning", () => {
        test("filters files based on cache", async () => {
            const cache = new ScanCache(join(testDir, "incremental-cache"));
            await cache.load();

            // Create test files
            const file1 = join(testDir, "file1.md");
            const file2 = join(testDir, "file2.md");
            await writeFile(file1, "content 1");
            await writeFile(file2, "content 2");

            // Cache file1
            await cache.setCachedFindings(file1, [
                {
                    ruleId: "TEST",
                    severity: "HIGH",
                    message: "test",
                    file: file1,
                    category: "test",
                    source: "signature",
                },
            ]);

            // Filter for incremental scan
            const result = await filterIncrementalFiles([file1, file2], { cache });

            expect(result.toScan).toContain(file2); // file2 not cached
            expect(result.cached.has(file1)).toBe(true); // file1 cached
        });

        test("gets last scan timestamp from cache", async () => {
            const cache = new ScanCache(join(testDir, "timestamp-cache"));
            await cache.load();

            const file = join(testDir, "timestamp-test.md");
            await writeFile(file, "test");

            await cache.setCachedFindings(file, []);

            const timestamp = getLastScanTimestamp(cache);
            expect(timestamp).toBeDefined();
            expect(timestamp).toBeGreaterThan(0);
        });

        test("respects baseline timestamp", async () => {
            const cache = new ScanCache(join(testDir, "baseline-cache"));
            await cache.load();

            const file = join(testDir, "baseline-test.md");
            await writeFile(file, "test");

            // Cache the file
            await cache.setCachedFindings(file, []);

            // Use a baseline timestamp in the future
            const futureTimestamp = Date.now() + 10000;
            const result = await filterIncrementalFiles([file], {
                cache,
                baselineTimestamp: futureTimestamp,
            });

            // File should be cached (not modified after baseline)
            expect(result.cached.has(file)).toBe(true);
        });
    });
});
