import { describe, expect, test } from "bun:test";
import { isMethodNotFound, McpRpcError, rpc } from "./client-http";

describe("rpc (JSON-RPC over HTTP)", () => {
  test("sends JSON-RPC request body and returns result", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody = "";

    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBody = init?.body ?? "";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    try {
      const result = await rpc<any>("https://mcp.example.com", "tools/list", { cursor: "x" }, { headers: { "X-Test": "1" } });
      expect(result.ok).toBe(true);
      const parsed = JSON.parse(capturedBody);
      expect(parsed.jsonrpc).toBe("2.0");
      expect(parsed.method).toBe("tools/list");
      expect(parsed.params.cursor).toBe("x");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws McpRpcError on JSON-RPC error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    try {
      let err: any = null;
      try {
        await rpc("https://mcp.example.com", "prompts/list");
      } catch (e) {
        err = e;
      }
      expect(err instanceof McpRpcError).toBe(true);
      expect(isMethodNotFound(err)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

