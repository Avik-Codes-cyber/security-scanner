import { describe, expect, test } from "bun:test";
import { sanitizePath, isProbablyBinary } from "./fs";

describe("sanitizePath", () => {
    test("resolves relative paths to absolute", () => {
        const sanitized = sanitizePath(".");
        expect(sanitized).toBeTruthy();
        expect(sanitized.startsWith("/")).toBe(true);
    });

    test("handles absolute paths", () => {
        const sanitized = sanitizePath("/tmp/test");
        expect(sanitized).toBe("/tmp/test");
    });

    test("normalizes paths with ..", () => {
        const sanitized = sanitizePath("/tmp/test/../other");
        expect(sanitized).toBe("/tmp/other");
    });

    test("handles home directory expansion", () => {
        const sanitized = sanitizePath("~/test");
        expect(sanitized).toContain("test");
        expect(sanitized).not.toContain("~");
        expect(sanitized.startsWith("/")).toBe(true);
    });

    test("removes null bytes", () => {
        const sanitized = sanitizePath("/tmp/test\x00malicious");
        expect(sanitized).not.toContain("\x00");
        expect(sanitized).toBe("/tmp/testmalicious");
    });

    test("handles current directory", () => {
        const sanitized = sanitizePath(".");
        expect(sanitized).toBeTruthy();
        expect(sanitized.length).toBeGreaterThan(0);
        expect(sanitized.startsWith("/")).toBe(true);
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
