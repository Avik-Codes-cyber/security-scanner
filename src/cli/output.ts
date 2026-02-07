import type { Finding, ScanOptions, ScanResult } from "../scanner/types";
import { formatSummary, renderTable, shouldFail, toJson, toSarif, generateReport } from "../scanner/reporting";
import { scanStorage } from "../storage/scan-storage";

/**
 * Output formatting options
 */
export interface OutputOptions {
  format: "table" | "json" | "sarif";
  output?: string;
  tuiEnabled: boolean;
  reportDir?: string;
  reportFormats?: ("json" | "html" | "csv")[];
}

/**
 * Handle output formatting and file writing for scan results
 */
export async function handleScanOutput(
  result: ScanResult,
  options: OutputOptions & { showConfidence?: boolean }
): Promise<void> {
  const { format, output, tuiEnabled, showConfidence } = options;

  let outputText: string | null = null;

  if (format === "json") {
    outputText = toJson(result);
  } else if (format === "sarif") {
    outputText = toSarif(result);
  }

  if (output && outputText !== null) {
    await Bun.write(output, outputText);
  }

  if (format === "table") {
    if (!tuiEnabled) {
      console.log(formatSummary(result));
      console.log("");
      console.log(renderTable(result.findings, showConfidence));
    } else {
      console.log(formatSummary(result));
    }
  } else if (!output && outputText !== null) {
    console.log(outputText);
  } else {
    console.log(formatSummary(result));
  }
}

/**
 * Generate report files if reportDir is specified
 */
export async function generateReportFiles(
  result: ScanResult,
  options: { reportDir?: string; reportFormats?: ("json" | "html" | "csv")[] }
): Promise<void> {
  if (!options.reportDir) return;

  try {
    const reportFormats = options.reportFormats || ["html", "json"];
    const generatedReport = await generateReport(result, result.targets, {
      reportDir: options.reportDir,
      formats: reportFormats,
    });

    console.log("\n📄 Report Generated:");
    if (generatedReport.htmlPath) {
      console.log(`  HTML: ${generatedReport.htmlPath}`);
    }
    if (generatedReport.jsonPath) {
      console.log(`  JSON: ${generatedReport.jsonPath}`);
    }
    if (generatedReport.csvPath) {
      console.log(`  CSV: ${generatedReport.csvPath}`);
    }
  } catch (err) {
    console.error("Error generating report:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Save scan results and handle comparison if needed
 */
export async function saveScanResults(
  result: ScanResult,
  command: string,
  targetPath: string,
  options: ScanOptions
): Promise<void> {
  if (!options.save) return;

  const stored = await scanStorage.save(result, command, targetPath, {
    tags: options.tags,
    notes: options.notes,
  });
  console.log(`\nScan saved with ID: ${stored.id}`);

  if (options.compareWith) {
    const comparison = await scanStorage.compare(options.compareWith, stored.id);
    if (comparison) {
      console.log("\nComparison with previous scan:");
      console.log(`  New findings: ${comparison.added.length}`);
      console.log(`  Resolved findings: ${comparison.removed.length}`);
      console.log(`  Unchanged: ${comparison.unchanged.length}`);
      if (comparison.severityChanges.length > 0) {
        console.log(`  Severity changes: ${comparison.severityChanges.length}`);
      }
    }
  }
}

/**
 * Check if the process should exit with a failure code based on findings
 */
export function checkFailCondition(result: ScanResult, options: ScanOptions): void {
  if (shouldFail(result.findings, options.failOn)) {
    process.exitCode = 2;
  }
}
