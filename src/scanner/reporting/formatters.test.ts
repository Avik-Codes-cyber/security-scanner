import { describe, expect, test } from "bun:test";
import { formatSeverity, formatTimestamp, formatDuration } from "./formatters";

describe("formatSeverity", () => {
    test("formats CRITICAL severity", () => {
        const formatted = formatSeverity("CRITICAL");
        expect(formatted).toContain("CRITICAL");
    });

    test("formats HIGH severity", () => {
        const formatted = formatSeverity("HIGH");
        expect(formatted).toContain("HIGH");
    });

    test("formats MEDIUM severity", () => {
        const formatted = formatSeverity("MEDIUM");
        expect(formatted).toContain("MEDIUM");
    });

    test("formats LOW severity", () => {
        const formatted = formatSeverity("LOW");
        expect(formatted).toContain("LOW");
    });
});

describe("formatTimestamp", () => {
    test("formats date as ISO string", () => {
        const date = new Date("2024-01-01T12:00:00Z");
        const formatted = formatTimestamp(date);
        expect(formatted).toContain("2024");
        expect(formatted).toContain("01");
    });

    test("formats current date", () => {
        const formatted = formatTimestamp(new Date());
        expect(formatted).toBeTruthy();
        expect(typeof formatted).toBe("string");
    });
});

describe("formatDuration", () => {
    test("formats milliseconds", () => {
        const formatted = formatDuration(500);
        expect(formatted).toContain("ms");
    });

    test("formats seconds", () => {
        const formatted = formatDuration(5000);
        expect(formatted).toMatch(/\d+(\.\d+)?s/);
    });

    test("handles zero duration", () => {
        const formatted = formatDuration(0);
        expect(formatted).toBeTruthy();
    });
});
