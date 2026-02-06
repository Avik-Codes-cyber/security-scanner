import { readText } from "../../utils/fs.ts";
import type { McpInitialize, McpPrompt, McpResource, McpTool } from "./types.ts";

type AnyObj = Record<string, unknown>;

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

function asObject(value: unknown): AnyObj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyObj) : null;
}

function extractArray(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  const obj = asObject(value);
  const inner = obj ? obj[key] : undefined;
  return Array.isArray(inner) ? inner : [];
}

function toTool(raw: any): McpTool | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.name !== "string") return null;
  return {
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : undefined,
    inputSchema: raw.inputSchema ?? raw.input_schema ?? raw.schema ?? undefined,
  };
}

function toPrompt(raw: any): McpPrompt | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.name !== "string") return null;
  return {
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : undefined,
    arguments: raw.arguments ?? raw.inputSchema ?? undefined,
  };
}

function toResource(raw: any): McpResource | null {
  if (!raw || typeof raw !== "object") return null;
  const uri = typeof raw.uri === "string" ? raw.uri : typeof raw.resource_uri === "string" ? raw.resource_uri : null;
  if (!uri) return null;
  return {
    uri,
    name: typeof raw.name === "string" ? raw.name : typeof raw.resource_name === "string" ? raw.resource_name : undefined,
    description:
      typeof raw.description === "string" ? raw.description : typeof raw.resource_description === "string" ? raw.resource_description : undefined,
    mimeType:
      typeof raw.mimeType === "string"
        ? raw.mimeType
        : typeof raw.mime_type === "string"
          ? raw.mime_type
          : typeof raw.resource_mime_type === "string"
            ? raw.resource_mime_type
            : undefined,
  };
}

function toInitialize(raw: any): McpInitialize | null {
  if (typeof raw === "string") return { instructions: raw };
  if (!raw || typeof raw !== "object") return null;
  const instructions = typeof raw.instructions === "string" ? raw.instructions : undefined;
  if (!instructions) return null;
  return {
    instructions,
    protocolVersion: typeof raw.protocolVersion === "string" ? raw.protocolVersion : undefined,
    serverInfo: raw.serverInfo && typeof raw.serverInfo === "object" ? raw.serverInfo : undefined,
  };
}

export type McpStaticInputs = {
  tools?: string;
  prompts?: string;
  resources?: string;
  instructions?: string;
};

export async function loadStaticInputs(files: McpStaticInputs): Promise<{
  tools?: McpTool[];
  prompts?: McpPrompt[];
  resources?: McpResource[];
  initialize?: McpInitialize;
  sourceFiles: string[];
}> {
  const sourceFiles = [files.tools, files.prompts, files.resources, files.instructions].filter(Boolean) as string[];

  const result: {
    tools?: McpTool[];
    prompts?: McpPrompt[];
    resources?: McpResource[];
    initialize?: McpInitialize;
    sourceFiles: string[];
  } = { sourceFiles };

  if (files.tools) {
    const raw = parseJson(await readText(files.tools));
    const arr = extractArray(raw, "tools");
    result.tools = arr.map(toTool).filter((x): x is McpTool => Boolean(x));
  }

  if (files.prompts) {
    const raw = parseJson(await readText(files.prompts));
    const arr = extractArray(raw, "prompts");
    result.prompts = arr.map(toPrompt).filter((x): x is McpPrompt => Boolean(x));
  }

  if (files.resources) {
    const raw = parseJson(await readText(files.resources));
    const arr = extractArray(raw, "resources");
    result.resources = arr.map(toResource).filter((x): x is McpResource => Boolean(x));
  }

  if (files.instructions) {
    const raw = parseJson(await readText(files.instructions));
    const init = toInitialize(raw);
    if (init) result.initialize = init;
  }

  return result;
}

