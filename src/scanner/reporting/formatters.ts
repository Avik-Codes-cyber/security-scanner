import type { Finding, Severity } from "../types";

const COLOR = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

export function colorizeSeverity(sev: Severity): string {
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

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function pad(text: string, width: number): string {
  const plain = stripAnsi(text);
  if (plain.length >= width) return text;
  return text + " ".repeat(width - plain.length);
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
