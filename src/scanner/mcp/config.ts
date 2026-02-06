import { readText } from "../../utils/fs.ts";

export type McpServerRef = {
  name: string;
  serverUrl: string;
  sourceFile?: string;
  raw?: unknown;
};

type AnyObj = Record<string, unknown>;

function asObject(value: unknown): AnyObj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyObj) : null;
}

function getString(obj: AnyObj, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function walk(value: unknown, fn: (obj: AnyObj) => void, maxDepth = 8) {
  const seen = new Set<any>();

  const inner = (v: unknown, depth: number) => {
    if (depth > maxDepth) return;
    if (!v || typeof v !== "object") return;
    if (seen.has(v)) return;
    seen.add(v);

    if (Array.isArray(v)) {
      for (const item of v) inner(item, depth + 1);
      return;
    }

    const obj = v as AnyObj;
    fn(obj);
    for (const child of Object.values(obj)) inner(child, depth + 1);
  };

  inner(value, 0);
}

export function extractMcpServersFromJson(parsed: unknown, sourceFile?: string): McpServerRef[] {
  const out: McpServerRef[] = [];

  walk(parsed, (obj) => {
    const servers = obj["mcpServers"];
    const serversObj = asObject(servers);
    if (!serversObj) return;

    for (const [name, raw] of Object.entries(serversObj)) {
      const def = asObject(raw) ?? {};
      const serverUrl = getString(def, ["serverUrl", "url", "server_url"]);
      if (!serverUrl) continue;
      out.push({ name, serverUrl, sourceFile, raw });
    }
  });

  // De-dup by url+name
  const seen = new Set<string>();
  return out.filter((s) => {
    const key = `${s.name}|${s.serverUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadAndExtractMcpServers(configPath: string): Promise<McpServerRef[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readText(configPath));
  } catch {
    return [];
  }
  return extractMcpServersFromJson(parsed, configPath);
}

