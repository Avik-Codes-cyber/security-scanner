import { describe, expect, test } from "bun:test";
import { sanitizePath, isProbablyBinary } from "./fs";
import { isAbsolute } from "path";

describe("sanitizePath", () => {
    test("resolves relative paths to absolute", () => {
        const sanitized = sanitizePath(".");
        expect(sanitized).toBeTruthy();
        expect(isAbsolute(sanitized)).toBe(true);
    });

    test("handles absolute paths", () => {
        const testPath = process.platform === "win32" ? "C:\\tmp\\test" : "/tmp/test";
        const sanitized = sanitizePath(testPath);
        expect(isAbsolute(sanitized)).toBe(true);
        expect(sanitized).toContain("test");
    });

    test("normalizes paths with ..", () => {
        const testPath = process.platform === "win32" ? "C:\\tmp\\test\\..\\other" : "/tmp/test/../other";
        const expected = process.platform === "win32" ? "C:\\tmp\\other" : "/tmp/other";
        const sanitized = sanitizePath(testPath);
        expect(sanitized).toBe(expected);
    });

    test("handles home directory expansion", () => {
        const sanitized = sanitizePath("~/test");
        expect(sanitized).toContain("test");
        expect(sanitized).not.toContain("~");
        expect(isAbsolute(sanitized)).toBe(true);
    });

    test("removes null bytes", () => {
        const testPath = process.platform === "win32" ? "C:\\tmp\\test\x00malicious" : "/tmp/test\x00malicious";
        const sanitized = sanitizePath(testPath);
        expect(sanitized).not.toContain("\x00");
        expect(sanitized).toContain("test");
        expect(sanitized).toContain("malicious");
    });

    test("handles current directory", () => {
        const sanitized = sanitizePath(".");
        expect(sanitized).toBeTruthy();
        expect(sanitized.length).toBeGreaterThan(0);
        expect(isAbsolute(sanitized)).toBe(true);
    });
});

describe("isProbablyBinary", () => {
    test("detects null bytes as binary", () => {
        const bytes = new Uint8Array([0x00, 0x01, 0x02]);
        expect(isProbablyBinary(bytes)).toBe(true);
    });

    test("recognizes text content", () => {
        const text = "Hello, World!";
        const bytes = new Uint8Array(Buffer.from(text));
        expect(isProbablyBinary(bytes)).toBe(false);
    });

    test("handles empty arrays", () => {
        const bytes = new Uint8Array([]);
        expect(isProbablyBinary(bytes)).toBe(false);
    });
});
