import { describe, expect, test, beforeEach } from "bun:test";
import { isSafePath, resetPathTracking } from "./path-safety";

describe("path-safety", () => {
    beforeEach(() => {
        resetPathTracking();
    });

    test("validates safe paths", async () => {
        const result = await isSafePath("/tmp");
        expect(result.safe).toBe(true);
    });

    test("detects non-existent paths", async () => {
        const result = await isSafePath("/non/existent/path/that/does/not/exist");
        expect(result.safe).toBe(false);
        expect(result.reason).toBeTruthy();
    });

    test("resets path tracking", async () => {
        await isSafePath("/tmp");
        resetPathTracking();

        // After reset, should work normally
        const result = await isSafePath("/tmp");
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
