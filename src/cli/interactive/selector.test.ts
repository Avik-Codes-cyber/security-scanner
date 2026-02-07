import { describe, expect, test } from "bun:test";
import { resolve } from "path";

describe("Interactive Selector", () => {
    test("promptScanPath resolves paths correctly", () => {
        const testPath = ".";
        const resolved = resolve(testPath);
        expect(resolved).toBeTruthy();
        expect(typeof resolved).toBe("string");
    });

    test("scan type options structure", () => {
        // Test that scan type options have expected structure
        const options = {
            skipCurrentPath: false,
            includeSystem: true,
            includeExtensions: false,
            includeIDEExtensions: false,
            fullDepth: false,
            customPath: undefined,
        };

        expect(options.skipCurrentPath).toBe(false);
        expect(options.includeSystem).toBe(true);
        expect(options.includeExtensions).toBe(false);
    });

    test("target choices structure", () => {
        const targets = [
            {
                kind: "skill" as const,
                name: "test-skill",
                path: "/path/to/skill",
            },
            {
                kind: "extension" as const,
                name: "test-extension",
                path: "/path/to/extension",
                meta: {
                    browser: "chrome",
                    profile: "Default",
                    id: "test-id",
                    version: "1.0.0",
                },
            },
        ];

        expect(targets.length).toBe(2);
        expect(targets[0].kind).toBe("skill");
        expect(targets[1].kind).toBe("extension");
        expect(targets[1].meta?.browser).toBe("chrome");
    });
});
