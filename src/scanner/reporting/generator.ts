import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { Finding, ScanResult, Target } from "../types.ts";
import { summarizeFindings } from "./summary";
import { escapeHtml, getSeverityIcon, HTML_STYLES } from "./html-template";
import { escapeCSV, generateReportFilename, getCurrentTimestamp, formatElapsedTime } from "./format-utils";

export interface ReportGeneratorOptions {
  reportDir: string;
  formats?: ("json" | "html" | "csv")[];
  includeDetails?: boolean;
}

export interface GeneratedReport {
  jsonPath?: string;
  htmlPath?: string;
  csvPath?: string;
  timestamp: string;
  summary: {
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
}

function generateJsonReport(
  result: ScanResult,
  targets: Target[],
  timestamp: string
): string {
  const counts = summarizeFindings(result.findings);
  return JSON.stringify(
    {
      metadata: {
        timestamp,
        version: "1.0",
        hostname: require("os").hostname(),
        platform: process.platform,
      },
      summary: {
        totalFiles: result.scannedFiles,
        elapsedMs: result.elapsedMs,
        totalFindings: result.findings.length,
        severities: counts,
      },
      targets: targets.map((t) => ({
        name: t.name,
        path: t.path,
        kind: t.kind,
      })),
      findings: result.findings.map((f) => ({
        severity: f.severity,
        ruleId: f.ruleId,
        file: f.file,
        line: f.line,
        message: f.message,
      })),
    },
    null,
    2
  );
}

function generateHtmlReport(
  result: ScanResult,
  targets: Target[],
  timestamp: string
): string {
  const counts = summarizeFindings(result.findings);
  const elapsedSeconds = formatElapsedTime(result.elapsedMs);

  let findingsHtml = "";
  if (result.findings.length === 0) {
    findingsHtml = '<tr><td colspan="5" class="no-findings">No security findings detected</td></tr>';
  } else {
    findingsHtml = result.findings
      .map(
        (f) => `
      <tr class="finding finding-${f.severity.toLowerCase()}">
        <td class="severity">
          <span class="badge badge-${f.severity.toLowerCase()}">
            ${getSeverityIcon(f.severity)} ${f.severity}
          </span>
        </td>
        <td class="file">${escapeHtml(f.file)}</td>
        <td class="line">${f.line || "-"}</td>
        <td class="rule">${escapeHtml(f.ruleId)}</td>
        <td class="message">${escapeHtml(f.message)}</td>
      </tr>
    `
      )
      .join("");
  }

  let targetsHtml = targets
    .map(
      (t) => `
    <div class="target">
      <strong>${escapeHtml(t.name)}</strong>
      <br/>
      <small>${escapeHtml(t.path)}</small>
    </div>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Scan Report</title>
  <style>${HTML_STYLES}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🛡️ Security Scan Report</h1>
      <div class="timestamp">Generated on ${escapeHtml(timestamp)}</div>
      <p style="margin-top: 10px; color: #bbb;">Scan completed in ${elapsedSeconds}s | ${result.scannedFiles} files scanned</p>
    </header>
    
    <div class="summary-grid">
      <div class="summary-card critical">
        <div class="card-label">Critical</div>
        <div class="card-value">${counts.CRITICAL}</div>
      </div>
      <div class="summary-card high">
        <div class="card-label">High</div>
        <div class="card-value">${counts.HIGH}</div>
      </div>
      <div class="summary-card medium">
        <div class="card-label">Medium</div>
        <div class="card-value">${counts.MEDIUM}</div>
      </div>
      <div class="summary-card low">
        <div class="card-label">Low</div>
        <div class="card-value">${counts.LOW}</div>
      </div>
      <div class="summary-card">
        <div class="card-label">Total Findings</div>
        <div class="card-value">${result.findings.length}</div>
      </div>
    </div>
    
    ${targets.length > 0
      ? `
    <div class="targets-section">
      <h2>📁 Scanned Targets</h2>
      ${targetsHtml}
    </div>
    `
      : ""
    }
    
    <div class="findings-section">
      <h2>🔍 Detailed Findings</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>File</th>
            <th>Line</th>
            <th>Rule</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          ${findingsHtml}
        </tbody>
      </table>
    </div>
    
    <footer>
      <p>Security Scanner v1.0 | Protecting your codebase from security risks</p>
    </footer>
  </div>
</body>
</html>`;
}

function generateCsvReport(
  result: ScanResult,
  targets: Target[],
  timestamp: string
): string {
  const counts = summarizeFindings(result.findings);

  let csv = "Security Scan Report\n";
  csv += `Generated: ${timestamp}\n`;
  csv += `Files Scanned: ${result.scannedFiles}\n`;
  csv += `Total Findings: ${result.findings.length}\n`;
  csv += `Critical: ${counts.CRITICAL}, High: ${counts.HIGH}, Medium: ${counts.MEDIUM}, Low: ${counts.LOW}\n`;
  csv += "\n";

  if (targets.length > 0) {
    csv += "Scanned Targets\n";
    for (const target of targets) {
      csv += `${escapeCSV(target.name)},${escapeCSV(target.path)},${target.kind}\n`;
    }
    csv += "\n";
  }

  csv +=
    "Severity,File,Line,Rule,Message\n";
  for (const finding of result.findings) {
    csv += [
      escapeCSV(finding.severity),
      escapeCSV(finding.file),
      finding.line || "",
      escapeCSV(finding.ruleId),
      escapeCSV(finding.message),
    ].join(",");
    csv += "\n";
  }

  return csv;
}

export async function generateReport(
  result: ScanResult,
  targets: Target[],
  options: ReportGeneratorOptions
): Promise<GeneratedReport> {
  const formats = options.formats || ["html", "json"];
  const timestamp = getCurrentTimestamp();
  const baseName = generateReportFilename();

  await mkdir(options.reportDir, { recursive: true });

  const counts = summarizeFindings(result.findings);
  const report: GeneratedReport = {
    timestamp,
    summary: {
      totalFindings: result.findings.length,
      criticalCount: counts.CRITICAL,
      highCount: counts.HIGH,
      mediumCount: counts.MEDIUM,
      lowCount: counts.LOW,
    },
  };

  if (formats.includes("json")) {
    const jsonPath = join(options.reportDir, `${baseName}.json`);
    const jsonContent = generateJsonReport(result, targets, timestamp);
    await writeFile(jsonPath, jsonContent, "utf-8");
    report.jsonPath = jsonPath;
  }

  if (formats.includes("html")) {
    const htmlPath = join(options.reportDir, `${baseName}.html`);
    const htmlContent = generateHtmlReport(result, targets, timestamp);
    await writeFile(htmlPath, htmlContent, "utf-8");
    report.htmlPath = htmlPath;
  }

  if (formats.includes("csv")) {
    const csvPath = join(options.reportDir, `${baseName}.csv`);
    const csvContent = generateCsvReport(result, targets, timestamp);
    await writeFile(csvPath, csvContent, "utf-8");
    report.csvPath = csvPath;
  }

  return report;
}
