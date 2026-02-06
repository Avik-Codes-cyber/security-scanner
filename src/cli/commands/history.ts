import type { ScanOptions } from "../../scanner/types";
import { scanStorage, type ScanQuery } from "../../storage/scan-storage";

/**
 * Run the history command for viewing/managing scan history
 */
export async function runHistoryCommand(subcommand: string, options: ScanOptions): Promise<void> {
  const format = options.format ?? (options.json ? "json" : "table");

  // Handle stats subcommand
  if (subcommand === "--stats" || subcommand === "stats") {
    const stats = await scanStorage.getStats();
    if (format === "json") {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log("Scan History Statistics");
      console.log("======================");
      console.log(`Total scans: ${stats.totalScans}`);
      console.log(`Total findings: ${stats.totalFindings}`);
      console.log("\nFindings by severity:");
      console.log(`  CRITICAL: ${stats.findingsBySeverity.CRITICAL}`);
      console.log(`  HIGH: ${stats.findingsBySeverity.HIGH}`);
      console.log(`  MEDIUM: ${stats.findingsBySeverity.MEDIUM}`);
      console.log(`  LOW: ${stats.findingsBySeverity.LOW}`);
      if (stats.dateRange) {
        console.log(`\nDate range: ${stats.dateRange.earliest} to ${stats.dateRange.latest}`);
      }
    }
    return;
  }

  // Handle clear subcommand
  if (subcommand === "--clear" || subcommand === "clear") {
    await scanStorage.deleteAll();
    console.log("All scan history cleared.");
    return;
  }

  // Handle delete subcommand
  if (subcommand?.startsWith("--delete ")) {
    const id = subcommand.slice(9).trim();
    if (await scanStorage.delete(id)) {
      console.log(`Scan ${id} deleted.`);
    } else {
      console.error(`Scan ${id} not found.`);
      process.exitCode = 1;
    }
    return;
  }

  // If subcommand looks like an ID, show details for that scan
  if (subcommand && !subcommand.startsWith("--")) {
    const scan = await scanStorage.get(subcommand);
    if (!scan) {
      console.error(`Scan ${subcommand} not found.`);
      process.exitCode = 1;
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(scan, null, 2));
    } else {
      console.log(`Scan Details: ${scan.id}`);
      console.log("=".repeat(50));
      console.log(`Timestamp: ${scan.timestamp}`);
      console.log(`Command: ${scan.command}`);
      console.log(`Target: ${scan.targetPath}`);
      console.log(`Hostname: ${scan.hostname}`);
      console.log(`Platform: ${scan.platform}`);
      if (scan.tags?.length) console.log(`Tags: ${scan.tags.join(", ")}`);
      if (scan.notes) console.log(`Notes: ${scan.notes}`);
      console.log("\nSummary:");
      console.log(`  Files scanned: ${scan.summary.scannedFiles}`);
      console.log(`  Findings: ${scan.summary.findingCount}`);
      console.log(`  Elapsed: ${scan.summary.elapsedMs}ms`);
      console.log("\nFindings by severity:");
      console.log(`  CRITICAL: ${scan.summary.severities.CRITICAL}`);
      console.log(`  HIGH: ${scan.summary.severities.HIGH}`);
      console.log(`  MEDIUM: ${scan.summary.severities.MEDIUM}`);
      console.log(`  LOW: ${scan.summary.severities.LOW}`);
      if (scan.findings.length > 0) {
        console.log("\nFindings:");
        scan.findings.forEach((f, i) => {
          console.log(`  ${i + 1}. [${f.severity}] ${f.ruleId}: ${f.message}`);
          if (f.file) console.log(`     File: ${f.file}:${f.line ?? ""}`);
        });
      }
    }
    return;
  }

  // Default: list recent scans
  const query: ScanQuery = {};

  if (options.targetPath) {
    query.targetPath = options.targetPath;
  }

  const scans = await scanStorage.query(query);

  if (format === "json") {
    console.log(JSON.stringify(scans, null, 2));
  } else {
    if (scans.length === 0) {
      console.log("No scans found in history.");
      return;
    }

    console.log("Recent Scans");
    console.log("============");
    scans.forEach((scan, i) => {
      const date = new Date(scan.timestamp).toLocaleString();
      const tags = scan.tags?.length ? ` [${scan.tags.join(", ")}]` : "";
      console.log(`${i + 1}. ${scan.id}`);
      console.log(`   Date: ${date}`);
      console.log(`   Target: ${scan.targetPath}`);
      console.log(`   Files: ${scan.summary.scannedFiles}, Findings: ${scan.summary.findingCount}${tags}`);
      console.log();
    });
  }
}
