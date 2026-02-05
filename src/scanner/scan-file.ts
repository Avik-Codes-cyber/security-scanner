import { extname, basename } from "path";
import type { CompiledRule } from "./rule-engine.ts";
import type { Finding, ScanOptions } from "./types.ts";
import { isProbablyBinary, readBytes, readText } from "../utils/fs";
import { scanContent } from "./rule-engine";
import { runHeuristics } from "./heuristics";

const MAX_BYTES = 5 * 1024 * 1024;

const BINARY_EXTENSIONS = new Set([
  ".exe",
  ".bin",
  ".dll",
  ".so",
  ".dylib",
  ".jar",
]);

export function detectFileType(filePath: string): string | null {
  const base = basename(filePath);
  const ext = extname(filePath).toLowerCase();

  if (base === "SKILL.md") return "markdown";
  if (base === "manifest.json") return "manifest";
  if (base === "package.json") return "json";

  if (ext === ".md" || ext === ".mdx" || ext === ".txt" || ext === ".rst") return "markdown";
  if (ext === ".yaml" || ext === ".yml" || ext === ".toml" || ext === ".ini" || ext === ".cfg" || ext === ".conf") {
    return "markdown";
  }
  if (ext === ".json") return "json";
  if (ext === ".py") return "python";
  if (ext === ".ts") return "typescript";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".sh" || ext === ".bash") return "bash";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";

  return "text";
}

export async function scanFile(filePath: string, rules: CompiledRule[], options?: ScanOptions): Promise<Finding[]> {
  const fileType = detectFileType(filePath);
  if (!fileType) return [];

  if (fileType === "binary") {
    const bytes = await readBytes(filePath, MAX_BYTES);
    if (isProbablyBinary(bytes)) {
      return scanContent("binary", filePath, "binary", rules);
    }
    return [];
  }

  // Explicitly skip archive/package formats that are commonly present in browser extension dirs.
  // (We don't unpack yet; scanning raw bytes adds noise and is expensive.)
  const ext = extname(filePath).toLowerCase();
  if (ext === ".crx" || ext === ".xpi" || ext === ".zip") return [];

  // For unknown file types we still try scanning as text, but skip obvious binaries
  // to avoid noisy errors and wasted work (common in browser extensions).
  if (fileType === "text") {
    try {
      const sampleBuffer = await Bun.file(filePath).slice(0, 512).arrayBuffer();
      const sample = new Uint8Array(sampleBuffer);
      if (isProbablyBinary(sample)) return [];
    } catch {
      return [];
    }
  }

  const content = await readText(filePath, MAX_BYTES);
  const findings = scanContent(content, filePath, fileType, rules);
  const heuristicFindings = options?.useBehavioral ? runHeuristics(filePath, content, fileType) : [];

  return [...findings, ...heuristicFindings];
}
