import { describe, expect, test } from "bun:test";
import { summarizeFindings, applyMetaAnalyzer } from "./report";
import type { Finding } from "./types";

describe("summarizeFindings", () => {
    test("counts findings by severity", () => {
        const findings: Finding[] = [
            {
                file: "test.md",
                line: 1,
                severity: "CRITICAL",
                ruleId: "RULE_1",
                message: "Critical issue",
            },
            {
                file: "test.md",
                line: 2,
                severity: "HIGH",
                ruleId: "RULE_2",
                message: "High issue",
            },
            {
                file: "test.md",
                line: 3,
                severity: "HIGH",
                ruleId: "RULE_3",
                message: "Another high issue",
            },
            {
                file: "test.md",
                line: 4,
                severity: "MEDIUM",
                ruleId: "RULE_4",
                message: "Medium issue",
            },
            {
                file: "test.md",
                line: 5,
                severity: "LOW",
                ruleId: "RULE_5",
                message: "Low issue",
            },
        ];

        const summary = summarizeFindings(findings);

        expect(summary.CRITICAL).toBe(1);
        expect(summary.HIGH).toBe(2);
        expect(summary.MEDIUM).toBe(1);
        expect(summary.LOW).toBe(1);
    });

    test("returns zero counts for empty findings", () => {
        const summary = summarizeFindings([]);

        expect(summary.CRITICAL).toBe(0);
        expect(summary.HIGH).toBe(0);
        expect(summary.MEDIUM).toBe(0);
        expect(summary.LOW).toBe(0);
    });
});

describe("applyMetaAnalyzer", () => {
    test("filters duplicate findings", () => {
        const findings: Finding[] = [
            {
                file: "test.md",
                line: 1,
                severity: "HIGH",
                ruleId: "RULE_1",
                message: "Issue",
            },
            {
                file: "test.md",
                line: 1,
                severity: "HIGH",
                ruleId: "RULE_1",
                message: "Issue",
            },
        ];

        const filtered = applyMetaAnalyzer(findings);

        expect(filtered.length).toBe(1);
    });

    test("keeps unique findings", () => {
        const findings: Finding[] = [
            {
                file: "test.md",
                line: 1,
                severity: "HIGH",
                ruleId: "RULE_1",
                message: "Issue 1",
            },
            {
                file: "test.md",
                line: 2,
                severity: "HIGH",
                ruleId: "RULE_2",
                message: "Issue 2",
            },
        ];

        const filtered = applyMetaAnalyzer(findings);

        expect(filtered.length).toBe(2);
    });

    test("handles empty findings array", () => {
        const filtered = applyMetaAnalyzer([]);
        expect(filtered.length).toBe(0);
    });
});
