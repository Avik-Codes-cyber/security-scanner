import { describe, expect, test } from "bun:test";
import { collectFromServer } from "./collect";

describe("collectFromServer", () => {
  test("paginates tools/list with nextCursor", async () => {
    const originalFetch = globalThis.fetch;
    const calls: any[] = [];

    globalThis.fetch = (async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body);

      if (body.method === "tools/list" && !body.params?.cursor) {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "a" }], nextCursor: "c1" } }), { status: 200 });
      }
      if (body.method === "tools/list" && body.params?.cursor === "c1") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "b" }] } }), { status: 200 });
      }

      // default: method not found
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } }), { status: 200 });
    }) as any;

    try {
      const out = await collectFromServer("https://mcp.example.com", { scan: ["tools", "prompts"] });
      expect(out.tools.map((t) => t.name)).toEqual(["a", "b"]);
      expect(out.prompts.length).toBe(0);
      expect(calls.some((c) => c.method === "tools/list" && c.params?.cursor === "c1")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

