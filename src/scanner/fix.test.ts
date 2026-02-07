import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { applyFixes } from "./fix";
import type { Finding } from "./types";

describe("applyFixes", () => {
    let testDir: string;

    beforeAll(() => {
        testDir = mkdtempSync(join(tmpdir(), "fix-test-"));
    });

    afterAll(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    test("comments out problematic lines in markdown", async () => {
        const testFile = join(testDir, "test.md");
        const content = "Line 1\nProblematic line\nLine 3";
        await Bun.write(testFile, content);

        const findings: Finding[] = [
            {
                file: testFile,
                line: 2,
                severity: "HIGH",
                ruleId: "TEST_RULE",
                message: "Test issue",
            },
        ];

        await applyFixes(findings);

        const fixed = readFileSync(testFile, "utf-8");
        expect(fixed).toContain("<!-- Problematic line -->");
        expect(fixed).toContain("Line 1");
        expect(fixed).toContain("Line 3");
    });

    test("comments out problematic lines in Python", async () => {
        const testFile = join(testDir, "test.py");
        const content = "import os\neval('dangerous')\nprint('safe')";
        await Bun.write(testFile, content);

        const findings: Finding[] = [
            {
                file: testFile,
                line: 2,
                severity: "HIGH",
                ruleId: "CODE_PY_EVAL",
                message: "Dangerous eval",
            },
        ];

        await applyFixes(findings);

        const fixed = readFileSync(testFile, "utf-8");
        expect(fixed).toContain("# eval('dangerous')");
        expect(fixed).toContain("import os");
        expect(fixed).toContain("print('safe')");
    });

    test("comments out problematic lines in JavaScript", async () => {
        const testFile = join(testDir, "test.js");
        const content = "const x = 1;\neval('alert(1)');\nconst y = 2;";
        await Bun.write(testFile, content);

        const findings: Finding[] = [
            {
                file: testFile,
                line: 2,
                severity: "HIGH",
                ruleId: "CODE_JS_EVAL",
                message: "Dangerous eval",
            },
        ];

        await applyFixes(findings);

        const fixed = readFileSync(testFile, "utf-8");
        expect(fixed).toContain("// eval('alert(1)');");
        expect(fixed).toContain("const x = 1;");
        expect(fixed).toContain("const y = 2;");
    });

    test("skips JSON files (no comment support)", async () => {
        const testFile = join(testDir, "test.json");
        const content = '{"key": "value"}';
        await Bun.write(testFile, content);

        const findings: Finding[] = [
            {
                file: testFile,
                line: 1,
                severity: "HIGH",
                ruleId: "TEST_RULE",
                message: "Test issue",
            },
        ];

        await applyFixes(findings);

        const unchanged = readFileSync(testFile, "utf-8");
        expect(unchanged).toBe(content); // Should remain unchanged
    });

    test("handles multiple findings in same file", async () => {
        const testFile = join(testDir, "multi.md");
        const content = "Line 1\nBad line 2\nLine 3\nBad line 4\nLine 5";
        await Bun.write(testFile, content);

        const findings: Finding[] = [
            {
                file: testFile,
                line: 2,
                severity: "HIGH",
                ruleId: "TEST_RULE_1",
                message: "Issue 1",
            },
            {
                file: testFile,
                line: 4,
                severity: "HIGH",
                ruleId: "TEST_RULE_2",
                message: "Issue 2",
            },
        ];

        await applyFixes(findings);

        const fixed = readFileSync(testFile, "utf-8");
        expect(fixed).toContain("<!-- Bad line 2 -->");
        expect(fixed).toContain("<!-- Bad line 4 -->");
        expect(fixed).toContain("Line 1");
        expect(fixed).toContain("Line 3");
        expect(fixed).toContain("Line 5");
    });
});
