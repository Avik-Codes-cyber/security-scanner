import { extname, basename } from "path";
import type { CompiledRule } from "./engine/rule-engine";
import type { Finding, ScanOptions } from "./types.ts";
import { isProbablyBinary, readBytes, readText } from "../utils/fs";
import { scanContent } from "./engine/rule-engine";
import { runHeuristics } from "./engine/heuristics";
import type { IndexedRuleEngine } from "./engine/indexed-rules";
import { isSafePath, hasNullByte, detectSpecialFile } from "../utils/path-safety";
import { FILE_SIZE_LIMITS, BINARY_EXTENSIONS } from "../constants";

const MAX_BYTES = FILE_SIZE_LIMITS.MAX_SCAN_BYTES;

export function detectFileType(filePath: string): string | null {
  const base = basename(filePath);
  const ext = extname(filePath).toLowerCase();

  // Check for special files without extensions
  const specialType = detectSpecialFile(base);
  if (specialType) return specialType;

  if (base === "SKILL.md") return "markdown";
  if (base === "manifest.json") return "manifest";
  if (base === "package.json") return "json";

  if (ext === ".md" || ext === ".mdx" || ext === ".txt" || ext === ".rst") return "markdown";
  if (ext === ".yaml" || ext === ".yml" || ext === ".toml" || ext === ".ini" || ext === ".cfg" || ext === ".conf") {
    return "markdown";
  }
  if (ext === ".json") return "json";
  if (ext === ".py") return "python";
  if (ext === ".ts" || ext === ".tsx" || ext === ".d.ts") return "typescript";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs" || ext === ".jsx") return "javascript";
  if (ext === ".sh" || ext === ".bash") return "bash";
  if (ext === ".go") return "python"; // Go syntax similar enough for basic pattern matching
  if (ext === ".java" || ext === ".class") return "python"; // Java similar enough
  if (ext === ".cpp" || ext === ".cc" || ext === ".cxx" || ext === ".c" || ext === ".h" || ext === ".hpp") return "python"; // C/C++ similar
  if (ext === ".cs") return "python"; // C# similar syntax
  if (ext === ".swift") return "python"; // Swift similar enough
  if (ext === ".rb") return "python"; // Ruby similar
  if (ext === ".php") return "javascript"; // PHP similar to JS
  if (ext === ".lua") return "bash"; // Lua similar scripting patterns
  if (ext === ".pl" || ext === ".pm") return "bash"; // Perl similar scripting
  if (ext === ".rs") return "python"; // Rust similar syntax
  if (ext === ".kt") return "python"; // Kotlin similar to Java
  if (ext === ".scala") return "python"; // Scala similar
  if (ext === ".groovy") return "python"; // Groovy similar
  if (ext === ".dart") return "python"; // Dart similar
  if (ext === ".vue" || ext === ".svelte") return "javascript"; // Vue/Svelte are JS-based
  if (ext === ".html" || ext === ".htm") return "javascript"; // HTML may contain scripts
  if (ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".less") return "markdown"; // CSS-like
  if (BINARY_EXTENSIONS.has(ext)) return "binary";

  return "text";
}

export async function scanFile(
  filePath: string,
  rules: CompiledRule[] | IndexedRuleEngine,
  options?: ScanOptions
): Promise<Finding[]> {
  // Safety check: verify path is safe to scan
  const safetyCheck = await isSafePath(filePath);
  if (!safetyCheck.safe) {
    if (options?.json !== true) {
      console.warn(`⚠️  Skipping ${filePath}: ${safetyCheck.reason}`);
    }
    return [];
  }

  const fileType = detectFileType(filePath);
  if (!fileType) return [];

  // Get applicable rules for this file type
  const applicableRules = Array.isArray(rules)
    ? rules
    : rules.getRulesForFileType(fileType);

  if (fileType === "binary") {
    const bytes = await readBytes(filePath, MAX_BYTES);
    if (isProbablyBinary(bytes)) {
      return scanContent("binary", filePath, "binary", applicableRules);
    }
    return [];
  }

  // Explicitly skip archive/package formats that are commonly present in browser extension dirs.
  // (We don't unpack yet; scanning raw bytes adds noise and is expensive.)
  const ext = extname(filePath).toLowerCase();
  if (ext === ".crx" || ext === ".xpi" || ext === ".zip") return [];

  // Check for null bytes (binary data in text files)
  if (await hasNullByte(filePath)) {
    if (options?.json !== true) {
      console.warn(`⚠️  Skipping ${filePath}: Contains null bytes (likely binary)`);
    }
    return [];
  }

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

  try {
    const content = await readText(filePath, MAX_BYTES);

    // Skip empty files
    if (content.trim().length === 0) {
      return [];
    }

    const findings = scanContent(content, filePath, fileType, applicableRules);
    const heuristicFindings = options?.useBehavioral ? runHeuristics(filePath, content, fileType) : [];

    return [...findings, ...heuristicFindings];
  } catch (err: any) {
    if (options?.json !== true && err.code !== "ENOENT") {
      console.warn(`⚠️  Error scanning ${filePath}: ${err.message}`);
    }
    return [];
  }
}
