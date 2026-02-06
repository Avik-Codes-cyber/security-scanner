export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpPrompt = {
  name: string;
  description?: string;
  arguments?: unknown;
};

export type McpResource = {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
};

export type McpInitialize = {
  instructions?: string;
  serverInfo?: { name?: string; version?: string };
  protocolVersion?: string;
};

export type McpListResult<T> = {
  items: T[];
  nextCursor?: string;
};

