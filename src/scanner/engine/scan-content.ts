import type { CompiledRule } from "./rule-engine";
import type { Finding, ScanOptions } from "../types";
import { scanContent } from "./rule-engine";
import { runHeuristics } from "./heuristics";

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
