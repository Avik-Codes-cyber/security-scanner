import type { Finding, Severity } from "../types";
import { COLOR } from "../../utils/tui/colors";

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

export function colorizeConfidence(confidence?: number): string {
  if (confidence === undefined) return `${COLOR.gray}N/A${COLOR.reset}`;

  const percent = Math.round(confidence * 100);
  let color: string = COLOR.gray;
  let icon = "○";

  if (confidence >= 0.8) {
    color = COLOR.green;
    icon = "●";
  } else if (confidence >= 0.6) {
    color = COLOR.cyan;
    icon = "◐";
  } else if (confidence >= 0.4) {
    color = COLOR.yellow;
    icon = "◑";
  } else {
    color = COLOR.red;
    icon = "○";
  }

  return `${color}${icon} ${percent}%${COLOR.reset}`;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function pad(text: string, width: number): string {
  const plain = stripAnsi(text);
  if (plain.length >= width) return text;
  return text + " ".repeat(width - plain.length);
}

export function renderTable(findings: Finding[], showConfidence: boolean = false): string {
  if (findings.length === 0) {
    return `${COLOR.bold}No findings.${COLOR.reset}`;
  }

  const rows = findings.map((finding) => {
    const baseRow = [
      colorizeSeverity(finding.severity),
      finding.file,
      finding.ruleId,
      finding.message,
      finding.line ? String(finding.line) : "",
    ];

    if (showConfidence) {
      baseRow.push(colorizeConfidence(finding.confidence));
    }

    return baseRow;
  });

  const headers = showConfidence
    ? ["Severity", "File", "Rule", "Message", "Line", "Confidence"]
    : ["Severity", "File", "Rule", "Message", "Line"];

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
