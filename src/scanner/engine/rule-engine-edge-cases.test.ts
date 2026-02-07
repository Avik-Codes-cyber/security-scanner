import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scanFile } from "../scan-file";
import { IndexedRuleEngine } from "./indexed-rules";
import { loadCompiledRules } from "../../cli/utils";

describe("Rule engine edge cases", () => {
    let testDir: string;
    let ruleEngine: IndexedRuleEngine;

    beforeAll(async () => {
        testDir = mkdtempSync(join(tmpdir(), "rule-engine-test-"));
        const rules = await loadCompiledRules(".");
        ruleEngine = new IndexedRuleEngine(rules);
    });

    afterAll(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    test("handles empty file", async () => {
        const testFile = join(testDir, "empty.txt");
        await Bun.write(testFile, "");

        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
        expect(findings.length).toBe(0);
    });

    test("handles file with only whitespace", async () => {
        const testFile = join(testDir, "whitespace.txt");
        await Bun.write(testFile, "   \n\n\t\t  \n  ");

        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles file with single line", async () => {
        const testFile = join(testDir, "single-line.txt");
        await Bun.write(testFile, "single line content");

        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles file with no newline at end", async () => {
        const testFile = join(testDir, "no-newline.txt");
        await Bun.write(testFile, "line 1\nline 2");

        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles file with many empty lines", async () => {
        const testFile = join(testDir, "many-empty.txt");
        await Bun.write(testFile, "\n".repeat(1000));

        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles file with very long lines", async () => {
        const testFile = join(testDir, "long-line.txt");
        await Bun.write(testFile, "x".repeat(10000));

        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles file with mixed line endings", async () => {
        const testFile = join(testDir, "mixed-endings.txt");
        await Bun.write(testFile, "line1\nline2\r\nline3\rline4");

        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles file with unicode characters", async () => {
        const testFile = join(testDir, "unicode.txt");
        await Bun.write(testFile, "Hello 世界 🌍 مرحبا");

        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });

    test("handles file with null bytes", async () => {
        const testFile = join(testDir, "null-bytes.txt");
        await Bun.write(testFile, "text\x00with\x00nulls");

        // Should detect as binary and skip
        const findings = await scanFile(testFile, ruleEngine, {});
        expect(Array.isArray(findings)).toBe(true);
    });
});
