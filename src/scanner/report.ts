import type { Finding, ScanResult, Severity } from "./types.ts";
import { SEVERITY_RANK } from "./types.ts";

const COLOR = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function colorizeSeverity(sev: Severity): string {
  switch (sev) {
    case "CRITICAL":
      return `${COLOR.red}${sev}${COLOR.reset}`;
    case "HIGH":
      return `${COLOR.magenta}${sev}${COLOR.reset}`;
    case "MEDIUM":
      return `${COLOR.yellow}${sev}${COLOR.reset}`;
    case "LOW":
      return `${COLOR.cyan}${sev}${COLOR.reset}`;
    default:
      return sev;
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function pad(text: string, width: number): string {
  const plain = stripAnsi(text);
  if (plain.length >= width) return text;
  return text + " ".repeat(width - plain.length);
}

export function formatSummary(result: ScanResult): string {
  const counts = summarizeFindings(result.findings);
  const parts = [
    `${COLOR.bold}Scanned${COLOR.reset} ${result.scannedFiles} files in ${result.elapsedMs}ms`,
    `${COLOR.bold}Findings${COLOR.reset} ${result.findings.length}`,
    `${COLOR.red}CRITICAL${COLOR.reset}:${counts.CRITICAL}`,
    `${COLOR.magenta}HIGH${COLOR.reset}:${counts.HIGH}`,
    `${COLOR.yellow}MEDIUM${COLOR.reset}:${counts.MEDIUM}`,
    `${COLOR.cyan}LOW${COLOR.reset}:${counts.LOW}`,
  ];
  return parts.join(" | ");
}

export function summarizeFindings(findings: Finding[]): Record<Severity, number> {
  return findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
  );
}

export function renderTable(findings: Finding[]): string {
  if (findings.length === 0) {
    return `${COLOR.bold}No findings.${COLOR.reset}`;
  }

  const rows = findings.map((finding) => [
    colorizeSeverity(finding.severity),
    finding.file,
    finding.ruleId,
    finding.message,
    finding.line ? String(finding.line) : "",
  ]);

  const headers = ["Severity", "File", "Rule", "Message", "Line"];
  const columns = headers.length;
  const widths = new Array(columns).fill(0).map((_, i) => headers[i].length);

  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index], stripAnsi(cell).length);
    });
  }

  const headerRow = headers
    .map((header, index) => pad(`${COLOR.bold}${header}${COLOR.reset}`, widths[index]))
    .join("  ");

  const separator = widths.map((w) => "-".repeat(w)).join("  ");

  const body = rows
    .map((row) => row.map((cell, i) => pad(cell, widths[i])).join("  "))
    .join("\n");

  return [headerRow, separator, body].join("\n");
}

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

export function toJson(result: ScanResult): string {
  const ruleCounts = new Map<
    string,
    { ruleId: string; severity: Severity; category?: string; source?: string; count: number }
  >();
  const categoryCounts = new Map<string, number>();
  const sourceCounts: Record<string, number> = { signature: 0, heuristic: 0, unknown: 0 };

  for (const finding of result.findings) {
    const existing = ruleCounts.get(finding.ruleId);
    if (existing) {
      existing.count += 1;
    } else {
      ruleCounts.set(finding.ruleId, {
        ruleId: finding.ruleId,
        severity: finding.severity,
        category: finding.category,
        source: finding.source,
        count: 1,
      });
    }

    if (finding.category) {
      categoryCounts.set(finding.category, (categoryCounts.get(finding.category) ?? 0) + 1);
    }

    const src = finding.source ?? "unknown";
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
  }

  const targetKinds = result.targets.reduce(
    (acc, t) => {
      acc[t.kind] = (acc[t.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const mcpTargets = result.targets.filter((t) => t.kind === "mcp");
  const mcpObjects = { tools: 0, prompts: 0, resources: 0, instructions: 0 };
  for (const t of mcpTargets) {
    const so: any = t.meta && typeof t.meta === "object" ? (t.meta as any).scannedObjects : undefined;
    if (!so || typeof so !== "object") continue;
    for (const key of ["tools", "prompts", "resources", "instructions"] as const) {
      const v = so[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        (mcpObjects as any)[key] += v;
      }
    }
  }

  // Fallback: derive object counts from MCP virtual paths in findings (only counts objects that had findings).
  if (mcpTargets.length > 0 && mcpObjects.tools + mcpObjects.prompts + mcpObjects.resources + mcpObjects.instructions === 0) {
    for (const finding of result.findings) {
      if (!finding.file.startsWith("mcp://")) continue;
      const parts = finding.file.replace(/^mcp:\/\//, "").split("/");
      const kind = parts[1];
      if (kind === "tools") mcpObjects.tools += 1;
      else if (kind === "prompts") mcpObjects.prompts += 1;
      else if (kind === "resources") mcpObjects.resources += 1;
      else if (kind === "instructions.md") mcpObjects.instructions += 1;
    }
  }

  const payload = {
    summary: {
      scannedFiles: result.scannedFiles,
      elapsedMs: result.elapsedMs,
      findingCount: result.findings.length,
      severities: summarizeFindings(result.findings),
    },
    detected: {
      targetKinds,
      sources: sourceCounts,
      rules: Array.from(ruleCounts.values()).sort((a, b) => b.count - a.count),
      categories: Array.from(categoryCounts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      ...(mcpTargets.length > 0
        ? {
            mcp: {
              servers: mcpTargets.length,
              objects: mcpObjects,
            },
          }
        : {}),
    },
    targets: result.targets,
    findings: result.findings,
  };

  return JSON.stringify(payload, null, 2);
}

export function shouldFail(findings: Finding[], threshold?: Severity): boolean {
  if (!threshold) return false;
  return findings.some((finding) => SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[threshold]);
}
