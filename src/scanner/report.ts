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
  const payload = {
    summary: {
      scannedFiles: result.scannedFiles,
      elapsedMs: result.elapsedMs,
      findingCount: result.findings.length,
      severities: summarizeFindings(result.findings),
    },
    findings: result.findings,
  };

  return JSON.stringify(payload, null, 2);
}

export function shouldFail(findings: Finding[], threshold?: Severity): boolean {
  if (!threshold) return false;
  return findings.some((finding) => SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[threshold]);
}
