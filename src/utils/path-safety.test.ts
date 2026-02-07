import { describe, expect, test, beforeEach } from "bun:test";
import { isSafePath, resetPathTracking } from "./path-safety";
import { tmpdir } from "os";
import { join } from "path";

describe("path-safety", () => {
    beforeEach(() => {
        resetPathTracking();
    });

    test("validates safe paths", async () => {
        // Use tmpdir which exists on all platforms
        const result = await isSafePath(tmpdir());
        expect(result.safe).toBe(true);
    });

    test("detects non-existent paths", async () => {
        const nonExistent = join(tmpdir(), "non-existent-path-12345");
        const result = await isSafePath(nonExistent);
        expect(result.safe).toBe(false);
        expect(result.reason).toBeTruthy();
    });

    test("resets path tracking", async () => {
        const testPath = tmpdir();
        await isSafePath(testPath);
        resetPathTracking();

        // After reset, should work normally
        const result = await isSafePath(testPath);
        expect(result.safe).toBe(true);
    });

    test("handles current directory", async () => {
        const result = await isSafePath(".");
        expect(result.safe).toBe(true);
    });

    test("validates paths within root", async () => {
        // Test with current directory which we know exists
        const result = await isSafePath(".", ".");
        expect(result.safe).toBe(true);
    });
});
