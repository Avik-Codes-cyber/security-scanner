import type { CompiledRule } from "./rule-engine.ts";
import type { Finding, ScanOptions } from "./types.ts";
import { scanContent } from "./rule-engine.ts";
import { runHeuristics } from "./heuristics.ts";

export type VirtualFileType = "markdown" | "json" | "manifest" | "text";

export type ScanContentItemInput = {
  virtualPath: string;
  fileType: VirtualFileType;
  content: string;
};

export function scanContentItem(
  item: ScanContentItemInput,
  rules: CompiledRule[],
  options?: ScanOptions
): Finding[] {
  const findings = scanContent(item.content, item.virtualPath, item.fileType, rules);
  const heuristicFindings = options?.useBehavioral
    ? runHeuristics(item.virtualPath, item.content, item.fileType)
    : [];
  return [...findings, ...heuristicFindings];
}

