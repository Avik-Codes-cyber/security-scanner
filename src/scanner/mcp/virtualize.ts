import { basename } from "path";
import type { VirtualFileType } from "../engine/scan-content";
import type { McpCollected, McpCollectOptions } from "./collect.ts";
import type { McpInitialize, McpPrompt, McpResource, McpTool } from "./types.ts";

export type VirtualFile = {
  virtualPath: string;
  fileType: VirtualFileType;
  content: string;
};

export type ScannedObjects = {
  tools: number;
  prompts: number;
  resources: number;
  instructions: number;
};

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
}

function hostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host || safeSegment(url);
  } catch {
    return safeSegment(url);
  }
}

function urlSafeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const b64 = Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function extFromMime(mimeType?: string): string {
  const m = (mimeType ?? "").toLowerCase();
  if (m.includes("markdown")) return "md";
  if (m.includes("html")) return "html";
  if (m.includes("json")) return "json";
  return "txt";
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return JSON.stringify({ error: "unserializable" }, null, 2);
  }
}

export function virtualizeRemote(serverUrl: string, collected: McpCollected, options?: McpCollectOptions) {
  const host = hostFromUrl(serverUrl);
  const files: VirtualFile[] = [];

  const scannedObjects: ScannedObjects = {
    tools: collected.tools.length,
    prompts: collected.prompts.length,
    resources: collected.resources.length,
    instructions: collected.initialize?.instructions ? 1 : 0,
  };

  if (collected.initialize?.instructions) {
    files.push({
      virtualPath: `mcp://${host}/instructions.md`,
      fileType: "markdown",
      content: collected.initialize.instructions,
    });
  }

  for (const tool of collected.tools) {
    const name = safeSegment(tool.name ?? "tool");
    files.push({
      virtualPath: `mcp://${host}/tools/${name}/description.md`,
      fileType: "markdown",
      content: tool.description ?? "",
    });
    files.push({
      virtualPath: `mcp://${host}/tools/${name}/schema.json`,
      fileType: "json",
      content: toJson(tool.inputSchema ?? {}),
    });
    files.push({
      virtualPath: `mcp://${host}/tools/${name}/tool.json`,
      fileType: "json",
      content: toJson(tool),
    });
  }

  for (const prompt of collected.prompts) {
    const name = safeSegment(prompt.name ?? "prompt");
    files.push({
      virtualPath: `mcp://${host}/prompts/${name}/description.md`,
      fileType: "markdown",
      content: prompt.description ?? "",
    });
    files.push({
      virtualPath: `mcp://${host}/prompts/${name}/prompt.json`,
      fileType: "json",
      content: toJson(prompt),
    });
  }

  for (const resource of collected.resources) {
    const id = urlSafeBase64(resource.uri ?? "");
    files.push({
      virtualPath: `mcp://${host}/resources/${id}/metadata.json`,
      fileType: "json",
      content: toJson(resource),
    });

    if (options?.readResources && resource.uri && collected.resourceContents[resource.uri]) {
      const rc = collected.resourceContents[resource.uri]!;
      const ext = extFromMime(rc.mimeType ?? resource.mimeType);
      files.push({
        virtualPath: `mcp://${host}/resources/${id}/content.${ext}`,
        fileType: ext === "json" ? "json" : "markdown",
        content: rc.content,
      });
    }
  }

  return { host, files, scannedObjects };
}

export type StaticInputs = {
  label: string;
  tools?: McpTool[];
  prompts?: McpPrompt[];
  resources?: McpResource[];
  initialize?: McpInitialize;
};

export function virtualizeStatic(inputs: StaticInputs) {
  const host = safeSegment(inputs.label || "static");
  const collected: McpCollected = {
    tools: inputs.tools ?? [],
    prompts: inputs.prompts ?? [],
    resources: inputs.resources ?? [],
    initialize: inputs.initialize,
    resourceContents: {},
  };

  return virtualizeRemote(`mcp://${host}`, collected, { readResources: false });
}

export function staticLabelFromFiles(files: string[]): string {
  if (files.length === 0) return "static";
  if (files.length === 1) return basename(files[0]!);
  return `${basename(files[0]!)}+${files.length - 1}`;
}

