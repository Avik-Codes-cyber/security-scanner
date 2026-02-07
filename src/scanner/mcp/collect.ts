import type { McpInitialize, McpListResult, McpPrompt, McpResource, McpTool } from "./types.ts";
import { isMethodNotFound, rpc } from "./client-http.ts";
import { config } from "../../config";

export type McpCollectOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  scan?: Array<"tools" | "prompts" | "resources" | "instructions">;
  readResources?: boolean;
  allowedMimeTypes?: string[];
  maxResourceBytes?: number;
};

export type McpCollected = {
  initialize?: McpInitialize;
  tools: McpTool[];
  prompts: McpPrompt[];
  resources: McpResource[];
  resourceContents: Record<string, { mimeType?: string; content: string }>;
};

function normalizeListResult<T>(raw: any, key: string): McpListResult<T> {
  const items = Array.isArray(raw?.[key]) ? (raw[key] as T[]) : [];
  const nextCursor = typeof raw?.nextCursor === "string" ? raw.nextCursor : undefined;
  return { items, nextCursor };
}

async function listAll<T>(
  url: string,
  method: string,
  key: string,
  options: Pick<McpCollectOptions, "headers" | "timeoutMs" | "maxRetries" | "retryDelayMs">
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined = undefined;
  while (true) {
    const params = cursor ? { cursor } : {};
    let raw: any;
    try {
      raw = await rpc<any>(url, method, params, {
        headers: options.headers,
        timeoutMs: options.timeoutMs ?? config.mcpTimeoutMs,
        maxRetries: options.maxRetries ?? config.mcpMaxRetries,
        retryDelayMs: options.retryDelayMs ?? config.mcpRetryDelayMs,
      });
    } catch (err) {
      if (isMethodNotFound(err)) return [];
      throw err;
    }
    const { items, nextCursor } = normalizeListResult<T>(raw, key);
    out.push(...items);
    if (!nextCursor) break;
    cursor = nextCursor;
    if (out.length > 20000) break;
  }
  return out;
}

async function bestEffortInitialize(url: string, options: Pick<McpCollectOptions, "headers" | "timeoutMs" | "maxRetries" | "retryDelayMs">) {
  try {
    const result = await rpc<any>(
      url,
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "Security Scanner", version: "0.1.0" },
      },
      {
        headers: options.headers,
        timeoutMs: options.timeoutMs ?? config.mcpTimeoutMs,
        maxRetries: options.maxRetries ?? config.mcpMaxRetries,
        retryDelayMs: options.retryDelayMs ?? config.mcpRetryDelayMs,
      }
    );
    const init: McpInitialize = {
      instructions: typeof result?.instructions === "string" ? result.instructions : undefined,
      protocolVersion: typeof result?.protocolVersion === "string" ? result.protocolVersion : undefined,
      serverInfo: result?.serverInfo && typeof result.serverInfo === "object" ? result.serverInfo : undefined,
    };
    return init;
  } catch {
    return undefined;
  }
}

function pickTextContent(raw: any, maxBytes: number): string | null {
  const contents = Array.isArray(raw?.contents) ? raw.contents : [];
  const parts: string[] = [];
  for (const item of contents) {
    if (item && typeof item.text === "string") parts.push(item.text);
  }
  if (parts.length === 0) return null;
  const joined = parts.join("\n");
  if (new TextEncoder().encode(joined).byteLength > maxBytes) {
    return joined.slice(0, Math.max(0, maxBytes));
  }
  return joined;
}

export async function collectFromServer(url: string, options?: McpCollectOptions): Promise<McpCollected> {
  const scan = new Set(options?.scan ?? ["tools", "instructions", "prompts"]);
  const allowedMime = new Set((options?.allowedMimeTypes ?? []).map((m) => m.toLowerCase()));
  const maxResourceBytes = options?.maxResourceBytes ?? 1_048_576;

  const collected: McpCollected = {
    initialize: undefined,
    tools: [],
    prompts: [],
    resources: [],
    resourceContents: {},
  };

  if (scan.has("instructions")) {
    collected.initialize = await bestEffortInitialize(url, {
      headers: options?.headers,
      timeoutMs: options?.timeoutMs,
      maxRetries: options?.maxRetries,
      retryDelayMs: options?.retryDelayMs,
    });
  }

  if (scan.has("tools")) {
    collected.tools = await listAll<McpTool>(url, "tools/list", "tools", {
      headers: options?.headers,
      timeoutMs: options?.timeoutMs,
      maxRetries: options?.maxRetries,
      retryDelayMs: options?.retryDelayMs,
    });
  }

  if (scan.has("prompts")) {
    collected.prompts = await listAll<McpPrompt>(url, "prompts/list", "prompts", {
      headers: options?.headers,
      timeoutMs: options?.timeoutMs,
      maxRetries: options?.maxRetries,
      retryDelayMs: options?.retryDelayMs,
    });
  }

  if (scan.has("resources")) {
    collected.resources = await listAll<McpResource>(url, "resources/list", "resources", {
      headers: options?.headers,
      timeoutMs: options?.timeoutMs,
      maxRetries: options?.maxRetries,
      retryDelayMs: options?.retryDelayMs,
    });
  }

  if (scan.has("resources") && options?.readResources && collected.resources.length > 0) {
    for (const resource of collected.resources) {
      if (!resource?.uri || typeof resource.uri !== "string") continue;

      const mimeLower = typeof resource.mimeType === "string" ? resource.mimeType.toLowerCase() : "";
      if (allowedMime.size > 0 && mimeLower && !allowedMime.has(mimeLower)) {
        continue;
      }

      let raw: any;
      try {
        raw = await rpc<any>(
          url,
          "resources/read",
          { uri: resource.uri },
          {
            headers: options?.headers,
            timeoutMs: options?.timeoutMs ?? config.mcpTimeoutMs,
            maxRetries: options?.maxRetries ?? config.mcpMaxRetries,
            retryDelayMs: options?.retryDelayMs ?? config.mcpRetryDelayMs,
          }
        );
      } catch (err) {
        if (isMethodNotFound(err)) break;
        continue;
      }

      const text = pickTextContent(raw, maxResourceBytes);
      if (text) {
        collected.resourceContents[resource.uri] = { mimeType: resource.mimeType, content: text };
      }
    }
  }

  return collected;
}

