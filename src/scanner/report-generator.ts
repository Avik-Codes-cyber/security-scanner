import { mkdir, writeFile } from "fs/promises";
import { join, basename } from "path";
import type { Finding, ScanResult, Severity, Target } from "./types.ts";
import { summarizeFindings } from "./report";

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

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeCSV(text: string): string {
    if (!text) return '""';
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function getSeverityColor(severity: Severity): string {
    switch (severity) {
        case "CRITICAL":
            return "#ff4444";
        case "HIGH":
            return "#ff9800";
        case "MEDIUM":
            return "#ffc107";
        case "LOW":
            return "#2196f3";
        default:
            return "#999999";
    }
}

function getSeverityIcon(severity: Severity): string {
    switch (severity) {
        case "CRITICAL":
            return "🔴";
        case "HIGH":
            return "🟠";
        case "MEDIUM":
            return "🟡";
        case "LOW":
            return "🔵";
        default:
            return "⭕";
    }
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
    const elapsedSeconds = (result.elapsedMs / 1000).toFixed(2);

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
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%);
      color: #e0e0e0;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    
    header {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      border-left: 5px solid #4CAF50;
      backdrop-filter: blur(10px);
    }
    
    h1 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 2.5em;
      margin-bottom: 15px;
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .timestamp {
      color: #999;
      font-size: 0.9em;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    
    .summary-card {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 20px;
      border-left: 4px solid #999;
      backdrop-filter: blur(10px);
    }
    
    .summary-card.critical {
      border-left-color: #ff4444;
    }
    
    .summary-card.high {
      border-left-color: #ff9800;
    }
    
    .summary-card.medium {
      border-left-color: #ffc107;
    }
    
    .summary-card.low {
      border-left-color: #2196f3;
    }
    
    .card-label {
      color: #999;
      font-size: 0.85em;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .card-value {
      font-size: 2em;
      font-weight: bold;
      color: #fff;
    }
    
    .targets-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 30px;
      backdrop-filter: blur(10px);
    }
    
    .targets-section h2 {
      font-size: 1.3em;
      margin-bottom: 15px;
      color: #4CAF50;
    }
    
    .target {
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
      margin: 8px 0;
      border-radius: 6px;
      border-left: 3px solid #4CAF50;
    }
    
    .findings-section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 25px;
      backdrop-filter: blur(10px);
      overflow-x: auto;
    }
    
    .findings-section h2 {
      font-size: 1.3em;
      margin-bottom: 15px;
      color: #4CAF50;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    
    th {
      background: rgba(76, 175, 80, 0.1);
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #4CAF50;
      color: #4CAF50;
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    tr:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 600;
      white-space: nowrap;
    }
    
    .badge-critical {
      background: rgba(255, 68, 68, 0.2);
      color: #ff4444;
    }
    
    .badge-high {
      background: rgba(255, 152, 0, 0.2);
      color: #ff9800;
    }
    
    .badge-medium {
      background: rgba(255, 193, 7, 0.2);
      color: #ffc107;
    }
    
    .badge-low {
      background: rgba(33, 150, 243, 0.2);
      color: #2196f3;
    }
    
    .file {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      color: #a3d977;
    }
    
    .no-findings {
      text-align: center;
      padding: 40px 12px !important;
      color: #4CAF50;
      font-weight: 600;
    }
    
    footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 0.85em;
      margin-top: 40px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
  </style>
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
    const timestamp = new Date().toISOString();
    const timestampShort = new Date().toISOString().replace(/[:.]/g, "-").split("T")[0];
    const baseName = `security-scan-${timestampShort}`;

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
