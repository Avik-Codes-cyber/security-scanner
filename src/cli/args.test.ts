import { describe, expect, test } from "bun:test";
import { parseArgs, parseSeverity } from "./args";

describe("parseSeverity", () => {
    test("parses valid severity levels", () => {
        expect(parseSeverity("low")).toBe("LOW");
        expect(parseSeverity("medium")).toBe("MEDIUM");
        expect(parseSeverity("high")).toBe("HIGH");
        expect(parseSeverity("critical")).toBe("CRITICAL");
    });

    test("handles case insensitivity", () => {
        expect(parseSeverity("HIGH")).toBe("HIGH");
        expect(parseSeverity("High")).toBe("HIGH");
        expect(parseSeverity("HiGh")).toBe("HIGH");
    });

    test("returns undefined for invalid values", () => {
        expect(parseSeverity("invalid")).toBeUndefined();
        expect(parseSeverity("")).toBeUndefined();
        expect(parseSeverity()).toBeUndefined();
    });
});

describe("parseArgs", () => {
    test("parses scan command with path", () => {
        const args = parseArgs(["scan", "."]);
        expect(args.command).toBe("scan");
        expect(args.targetPath).toBe(".");
    });

    test("defaults to scan command", () => {
        const args = parseArgs(["."]);
        // When only path is provided, it becomes targetPath
        expect(args.targetPath).toBe(".");
    });

    test("parses --json flag", () => {
        const args = parseArgs(["scan", ".", "--json"]);
        expect(args.options.json).toBe(true);
    });

    test("parses --fail-on severity", () => {
        const args = parseArgs(["scan", ".", "--fail-on", "high"]);
        expect(args.options.failOn).toBe("HIGH");
    });

    test("parses --system flag", () => {
        const args = parseArgs(["scan", ".", "--system"]);
        expect(args.options.includeSystem).toBe(true);
    });

    test("parses --extensions flag", () => {
        const args = parseArgs(["scan", ".", "--extensions"]);
        expect(args.options.includeExtensions).toBe(true);
    });

    test("parses --ide-extensions flag", () => {
        const args = parseArgs(["scan", ".", "--ide-extensions"]);
        expect(args.options.includeIDEExtensions).toBe(true);
    });

    test("parses --fix flag", () => {
        const args = parseArgs(["scan", ".", "--fix"]);
        expect(args.options.fix).toBe(true);
    });

    test("parses --save flag", () => {
        const args = parseArgs(["scan", ".", "--save"]);
        expect(args.options.save).toBe(true);
    });

    test("parses --format option", () => {
        const args = parseArgs(["scan", ".", "--format", "sarif"]);
        expect(args.options.format).toBe("sarif");
    });

    test("parses --output option", () => {
        const args = parseArgs(["scan", ".", "--output", "results.json"]);
        expect(args.options.output).toBe("results.json");
    });

    test("parses interactive command", () => {
        const args = parseArgs(["interactive"]);
        expect(args.command).toBe("interactive");
    });

    test("parses interactive short alias", () => {
        const args = parseArgs(["i"]);
        expect(args.command).toBe("i");
    });

    test("parses watch command", () => {
        const args = parseArgs(["watch", "."]);
        expect(args.command).toBe("watch");
        expect(args.targetPath).toBe(".");
    });

    test("parses history command", () => {
        const args = parseArgs(["history"]);
        expect(args.command).toBe("history");
    });

    test("parses mcp remote command", () => {
        const args = parseArgs(["mcp", "remote", "https://example.com"]);
        expect(args.command).toBe("mcp");
        expect(args.mcp?.subcommand).toBe("remote");
        expect(args.mcp?.serverUrl).toBe("https://example.com");
    });

    test("parses mcp static command", () => {
        const args = parseArgs(["mcp", "static", "--tools", "tools.json"]);
        expect(args.command).toBe("mcp");
        expect(args.mcp?.subcommand).toBe("static");
    });
});
