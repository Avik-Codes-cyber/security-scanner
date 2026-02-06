import { describe, expect, test } from "bun:test";
import { virtualizeRemote } from "./virtualize";

describe("virtualizeRemote", () => {
  test("creates virtual files for tools and instructions", () => {
    const collected: any = {
      initialize: { instructions: "hello" },
      tools: [{ name: "myTool", description: "desc", inputSchema: { type: "object" } }],
      prompts: [],
      resources: [{ uri: "file://secret.txt", mimeType: "text/plain" }],
      resourceContents: {},
    };

    const { host, files, scannedObjects } = virtualizeRemote("https://example.com/mcp", collected, {
      readResources: false,
    });

    expect(host).toBe("example.com");
    expect(scannedObjects.tools).toBe(1);
    expect(scannedObjects.instructions).toBe(1);

    expect(files.some((f) => f.virtualPath === "mcp://example.com/instructions.md")).toBe(true);
    expect(files.some((f) => f.virtualPath.includes("/tools/myTool/description.md"))).toBe(true);
    expect(files.some((f) => f.virtualPath.includes("/tools/myTool/schema.json"))).toBe(true);
    expect(files.some((f) => f.virtualPath.includes("/tools/myTool/tool.json"))).toBe(true);
  });

  test("resource URI encoding is URL-safe base64", () => {
    const collected: any = {
      initialize: undefined,
      tools: [],
      prompts: [],
      resources: [{ uri: "file://a/b+c?x=y", mimeType: "text/plain" }],
      resourceContents: {},
    };

    const { files } = virtualizeRemote("https://example.com/mcp", collected, { readResources: false });
    const meta = files.find((f) => f.virtualPath.includes("/resources/") && f.virtualPath.endsWith("/metadata.json"));
    expect(Boolean(meta)).toBe(true);

    const encoded = meta!.virtualPath.split("/resources/")[1]!.split("/")[0]!;
    expect(encoded.includes("+")).toBe(false);
    expect(encoded.includes("/")).toBe(false);
    expect(encoded.includes("=")).toBe(false);
  });
});

