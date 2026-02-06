import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadStaticInputs } from "./static";

describe("loadStaticInputs", () => {
  test("accepts array and wrapped object formats", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-static-"));
    const toolsA = join(dir, "tools-array.json");
    const toolsB = join(dir, "tools-wrapped.json");

    await Bun.write(toolsA, JSON.stringify([{ name: "t1", description: "d1", inputSchema: {} }], null, 2));
    await Bun.write(toolsB, JSON.stringify({ tools: [{ name: "t2", description: "d2", inputSchema: {} }] }, null, 2));

    const a = await loadStaticInputs({ tools: toolsA });
    expect(a.tools?.length).toBe(1);
    expect(a.tools?.[0]?.name).toBe("t1");

    const b = await loadStaticInputs({ tools: toolsB });
    expect(b.tools?.length).toBe(1);
    expect(b.tools?.[0]?.name).toBe("t2");
  });

  test("ignores files with unexpected shapes safely", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-static-"));
    const tools = join(dir, "tools.json");
    await Bun.write(tools, JSON.stringify({ notTools: true }, null, 2));
    const out = await loadStaticInputs({ tools });
    expect(out.tools?.length ?? 0).toBe(0);
  });
});

