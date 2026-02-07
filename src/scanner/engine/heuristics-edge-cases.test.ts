import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// We need to test the heuristics indirectly through scanFile
import { scanFile } from "../scan-file";
import { IndexedRuleEngine } from "./indexed-rules";
import { loadCompiledRules } from "../../cli/utils";

describe("Heuristics edge cases", () => {
    let testDir: string;
    let ruleEngine: IndexedRuleEngine;

    beforeAll(async () => {
        testDir = mkdtempSync(join(tmpdir(), "heuristics-test-"));
        const rules = await loadCompiledRules(".");
        ruleEngine = new IndexedRuleEngine(rules);
    });

    afterAll(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    test("handles empty string entropy calculation", async () => {
        const testFile = join(testDir, "empty.json");
        await Bun.write(testFile, JSON.stringify({ key: "" }));

        // Should not crash on empty string
        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles single character entropy", async () => {
        const testFile = join(testDir, "single.json");
        await Bun.write(testFile, JSON.stringify({ key: "a" }));

        // Should handle division by 1
        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles very long strings without crashing", async () => {
        const testFile = join(testDir, "long.json");
        const longString = "A".repeat(10000);
        await Bun.write(testFile, JSON.stringify({ key: longString }));

        // Should handle large strings
        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles strings with all same characters", async () => {
        const testFile = join(testDir, "same.json");
        await Bun.write(testFile, JSON.stringify({ key: "aaaaaaaaaaaaaaaaaaaaaa" }));

        // Entropy should be 0 for all same characters
        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles malformed JSON gracefully", async () => {
        const testFile = join(testDir, "malformed.json");
        await Bun.write(testFile, "{ invalid json }");

        // Should not crash on malformed JSON
        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles JSON with null values", async () => {
        const testFile = join(testDir, "null.json");
        await Bun.write(testFile, JSON.stringify({ key: null, nested: { value: null } }));

        // Should handle null values
        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles deeply nested JSON", async () => {
        const testFile = join(testDir, "deep.json");
        let nested: any = { value: "test" };
        for (let i = 0; i < 100; i++) {
            nested = { nested };
        }
        await Bun.write(testFile, JSON.stringify(nested));

        // Should handle deep nesting
        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });
});
