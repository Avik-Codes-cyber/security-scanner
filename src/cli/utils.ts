import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { SKIP_DIRS, SCAN_EXTENSIONS, SPECIAL_FILES, BINARY_EXTENSIONS } from "./types";
import { loadRulesFromFile, loadRulesFromText } from "../scanner/engine/rule-engine";
import { signaturesYaml } from "../rules/signatures";
import { dirExists, isInSkippedDir, sanitizePath } from "../utils/fs";
import type { CompiledRule } from "../scanner/engine/rule-engine";

/**
 * Parse header list from CLI arguments into a key-value object
 */
export function parseHeaderList(values: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const v of values) {
    const idx = v.indexOf(":");
    if (idx <= 0) continue;
    const key = v.slice(0, idx).trim();
    const value = v.slice(idx + 1).trim();
    if (!key) continue;
    headers[key] = value;
  }
  return headers;
}

/**
 * Parse the MCP scan list from CLI argument
 */
export function parseMcpScanList(value?: string): Array<"tools" | "prompts" | "resources" | "instructions"> {
  const allowed = new Set(["tools", "prompts", "resources", "instructions"]);
  if (!value) return ["tools", "instructions", "prompts"];
  const parts = value
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .filter((p) => allowed.has(p));
  const uniq = Array.from(new Set(parts));
  return (uniq.length ? uniq : ["tools", "instructions", "prompts"]) as Array<
    "tools" | "prompts" | "resources" | "instructions"
  >;
}

/**
 * Collect files from scan roots based on file type filters
 */
export async function collectFiles(scanRoots: string[], options?: { includeDocs?: boolean }): Promise<string[]> {
  const fileSet = new Set<string>();

  for (const root of scanRoots) {
    const sanitizedRoot = sanitizePath(root);
    if (!(await dirExists(sanitizedRoot))) {
      continue;
    }
    const glob = new Bun.Glob("**/*");
    for await (const relPath of glob.scan({ cwd: sanitizedRoot, onlyFiles: true })) {
      if (isInSkippedDir(relPath, SKIP_DIRS)) continue;

      const base = relPath.split(/[\\/]/g).pop() ?? relPath;
      const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")).toLowerCase() : "";

      if (options?.includeDocs) {
        if (!BINARY_EXTENSIONS.has(ext)) {
          fileSet.add(join(sanitizedRoot, relPath));
        }
        continue;
      }

      if (SPECIAL_FILES.has(base) || SCAN_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(ext)) {
        fileSet.add(join(sanitizedRoot, relPath));
      }
    }
  }

  return Array.from(fileSet).sort();
}

/**
 * Load compiled rules from various possible locations
 */
export async function loadCompiledRules(basePath: string): Promise<CompiledRule[]> {
  const rulesPathFromImport = fileURLToPath(new URL("../rules/signatures.yaml", import.meta.url));
  const rulesCandidates = [
    process.env.SKILL_SCANNER_RULES ?? process.env.SKILLGUARD_RULES,
    join(basePath, "rules", "signatures.yaml"),
    join(dirname(process.execPath), "rules", "signatures.yaml"),
    rulesPathFromImport,
  ].filter(Boolean) as string[];

  for (const candidate of rulesCandidates) {
    try {
      return await loadRulesFromFile(candidate);
    } catch {
      // continue
    }
  }

  return loadRulesFromText(signaturesYaml);
}
