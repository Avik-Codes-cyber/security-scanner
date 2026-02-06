import type { Finding } from "../types";

export function applyMetaAnalyzer(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.ruleId}|${finding.file}|${finding.line ?? ""}|${finding.message}`;
    if (!seen.has(key)) {
      seen.set(key, finding);
    }
  }
  return Array.from(seen.values());
}
