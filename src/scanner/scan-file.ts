import { extname, basename } from "path";
import type { CompiledRule } from "./rule-engine.ts";
import type { Finding, ScanOptions } from "./types.ts";
import { isProbablyBinary, readBytes, readText } from "../utils/fs.ts";
import { scanContent } from "./rule-engine.ts";
import { runHeuristics } from "./heuristics.ts";

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
  if (ext === ".py") return "python";
  if (ext === ".ts") return "typescript";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".sh" || ext === ".bash") return "bash";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";

  return null;
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

  const content = await readText(filePath, MAX_BYTES);
  const findings = scanContent(content, filePath, fileType, rules);
  const heuristicFindings = options?.useBehavioral ? runHeuristics(filePath, content, fileType) : [];

  return [...findings, ...heuristicFindings];
}
