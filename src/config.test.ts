import { describe, expect, test } from "bun:test";
import { config } from "./config";

describe("config", () => {
    test("has default values", () => {
        expect(config).toBeTruthy();
        expect(typeof config.enableCache).toBe("boolean");
        expect(typeof config.enableParallelScanning).toBe("boolean");
        expect(typeof config.parallelWorkerCount).toBe("number");
        expect(typeof config.parallelThreshold).toBe("number");
    });

    test("cache configuration", () => {
        expect(typeof config.cacheMaxAge).toBe("number");
        expect(config.cacheMaxAge).toBeGreaterThan(0);
    });

    test("parallel scanning configuration", () => {
        expect(config.parallelWorkerCount).toBeGreaterThan(0);
        expect(config.parallelThreshold).toBeGreaterThan(0);
    });

    test("storage configuration", () => {
        expect(config.storageBackend).toMatch(/^(json|sqlite)$/);
        expect(config.maxStoredScans).toBeGreaterThan(0);
    });

    test("performance configuration", () => {
        expect(config.maxFileSize).toBeGreaterThan(0);
        expect(typeof config.enableStreamingForLargeFiles).toBe("boolean");
        expect(config.streamingThreshold).toBeGreaterThan(0);
    });
});
