import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ScanStorage } from "./scan-storage";
import type { ScanResult } from "../scanner/types";

describe("ScanStorage", () => {
    let testDir: string;
    let storage: ScanStorage;

    beforeAll(() => {
        testDir = mkdtempSync(join(tmpdir(), "storage-test-"));
        storage = new ScanStorage(testDir, 10); // Max 10 scans
    });

    afterAll(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    test("initializes storage", () => {
        expect(storage).toBeTruthy();
    });

    test("saves and retrieves scan results", async () => {
        const scanResult: ScanResult = {
            targets: [
                {
                    kind: "skill",
                    name: "test-skill",
                    path: "/test/skill",
                },
            ],
            findings: [
                {
                    file: "/test/file.md",
                    line: 1,
                    severity: "HIGH",
                    ruleId: "TEST_RULE",
                    message: "Test finding",
                },
            ],
            scannedFiles: 1,
            elapsedMs: 100,
        };

        const scan = await storage.save(
            scanResult,
            "test-scan",
            "/test/path",
            { tags: ["test"], notes: "Test scan" }
        );

        expect(scan.id).toBeTruthy();
        expect(scan.findings.length).toBe(1);
        expect(scan.tags).toContain("test");

        const retrieved = await storage.get(scan.id);
        expect(retrieved).toBeTruthy();
        expect(retrieved?.findings.length).toBe(1);
    });

    test("lists recent scans", async () => {
        const scanResult: ScanResult = {
            targets: [],
            findings: [],
            scannedFiles: 0,
            elapsedMs: 50,
        };

        await storage.save(scanResult, "scan-1", "/test/1", {});
        await storage.save(scanResult, "scan-2", "/test/2", {});

        const scans = await storage.listAll();
        expect(scans.length).toBeGreaterThanOrEqual(2);
    });

    test("deletes old scans when exceeding max", async () => {
        const smallStorage = new ScanStorage(testDir, 3); // Max 3 scans

        const scanResult: ScanResult = {
            targets: [],
            findings: [],
            scannedFiles: 0,
            elapsedMs: 50,
        };

        // Save 5 scans (should keep only last 3)
        for (let i = 0; i < 5; i++) {
            await smallStorage.save(scanResult, `scan-${i}`, `/test/${i}`, {});
            await Bun.sleep(10); // Ensure different timestamps
        }

        const scans = await smallStorage.listAll();
        expect(scans.length).toBeLessThanOrEqual(3);
    });

    test("filters scans by tag", async () => {
        const scanResult: ScanResult = {
            targets: [],
            findings: [],
            scannedFiles: 0,
            elapsedMs: 50,
        };

        await storage.save(scanResult, "tagged-scan", "/test/tagged", {
            tags: ["production"],
        });

        const scans = await storage.query({ tags: ["production"] });
        expect(scans.some((s) => s.tags?.includes("production"))).toBe(true);
    });

    test("gets scan statistics", async () => {
        const stats = await storage.getStats();
        expect(stats).toBeTruthy();
        expect(typeof stats.totalScans).toBe("number");
        expect(typeof stats.totalFindings).toBe("number");
    });
});
