export type RpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

export class McpRpcError extends Error {
  code?: number;
  data?: unknown;
  constructor(message: string, options?: { code?: number; data?: unknown }) {
    super(message);
    this.name = "McpRpcError";
    this.code = options?.code;
    this.data = options?.data;
  }
}

export type RpcOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

let nextId = 1;

export async function rpc<T = unknown>(
  url: string,
  method: string,
  params?: unknown,
  options?: RpcOptions
): Promise<T> {
  const id = nextId++;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params: params ?? {},
  });

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options?.headers ?? {}),
        },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new McpRpcError(`Network error calling MCP server at ${url}`, { data: { method, message: msg } });
    }

    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new McpRpcError(`Invalid JSON-RPC response from ${url} (${res.status})`, {
        code: res.status,
        data: text,
      });
    }

    if (!res.ok) {
      const err = (json && (json.error as RpcError)) || undefined;
      const msg = err?.message ?? `HTTP ${res.status}`;
      throw new McpRpcError(`MCP RPC failed: ${method}: ${msg}`, { code: err?.code ?? res.status, data: err?.data });
    }

    if (json?.error) {
      const err = json.error as RpcError;
      throw new McpRpcError(`MCP RPC error: ${method}: ${err.message ?? "Unknown error"}`, {
        code: err.code,
        data: err.data,
      });
    }

    if (!json || typeof json !== "object" || !("result" in json)) {
      throw new McpRpcError(`Missing JSON-RPC result for ${method}`, { data: json });
    }

    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

export function isMethodNotFound(err: unknown): boolean {
  if (!(err instanceof McpRpcError)) return false;
  return err.code === -32601;
}
