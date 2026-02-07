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
  maxRetries?: number;
  retryDelayMs?: number;
};

let nextId = 1;

/**
 * Retry an RPC call with exponential backoff.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  method: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on method not found or other client errors
      if (error instanceof McpRpcError) {
        if (error.code === -32601 || (error.code && error.code >= 400 && error.code < 500)) {
          throw error; // Client error, don't retry
        }
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * delay; // Add 0-30% jitter
      const totalDelay = delay + jitter;

      console.warn(`⚠️  MCP RPC ${method} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(totalDelay)}ms...`);

      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }

  throw lastError || new Error("Retry failed");
}

export async function rpc<T = unknown>(
  url: string,
  method: string,
  params?: unknown,
  options?: RpcOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 1000;

  return retryWithBackoff(
    async () => {
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
              "accept": "application/json, text/event-stream",
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

        // Handle SSE format (event: message\ndata: {...})
        let jsonText = text;
        if (text.startsWith('event:')) {
          const lines = text.split('\n');
          const dataLine = lines.find(line => line.startsWith('data:'));
          if (dataLine) {
            jsonText = dataLine.substring(5).trim(); // Remove "data:" prefix
          }
        }

        let json: any;
        try {
          json = jsonText ? JSON.parse(jsonText) : null;
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
    },
    maxRetries,
    retryDelayMs,
    method
  );
}

export function isMethodNotFound(err: unknown): boolean {
  if (!(err instanceof McpRpcError)) return false;
  return err.code === -32601;
}
