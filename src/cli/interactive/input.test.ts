import { describe, expect, test } from "bun:test";
import { parseKeyPress } from "./input";

describe("parseKeyPress", () => {
    test("parses arrow up", () => {
        const key = parseKeyPress(Buffer.from("\x1b[A"));
        expect(key?.name).toBe("up");
        expect(key?.ctrl).toBe(false);
    });

    test("parses arrow down", () => {
        const key = parseKeyPress(Buffer.from("\x1b[B"));
        expect(key?.name).toBe("down");
        expect(key?.ctrl).toBe(false);
    });

    test("parses enter", () => {
        const key = parseKeyPress(Buffer.from("\r"));
        expect(key?.name).toBe("return");
    });

    test("parses space", () => {
        const key = parseKeyPress(Buffer.from(" "));
        expect(key?.name).toBe("space");
    });

    test("parses ctrl+c", () => {
        const key = parseKeyPress(Buffer.from("\x03"));
        expect(key?.name).toBe("c");
        expect(key?.ctrl).toBe(true);
    });

    test("parses regular characters", () => {
        const key = parseKeyPress(Buffer.from("a"));
        expect(key?.name).toBe("a");
        expect(key?.ctrl).toBe(false);
    });

    test("parses y and n", () => {
        expect(parseKeyPress(Buffer.from("y"))?.name).toBe("y");
        expect(parseKeyPress(Buffer.from("n"))?.name).toBe("n");
        expect(parseKeyPress(Buffer.from("Y"))?.name).toBe("y");
        expect(parseKeyPress(Buffer.from("N"))?.name).toBe("n");
    });
});
