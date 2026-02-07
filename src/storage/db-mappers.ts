import type { Finding, Severity } from "../scanner/types";
import type { StoredScan } from "./scan-storage";

/**
 * Map database row to StoredScan object
 */
export function rowToScan(scanRow: any, findingRows: any[], targetRows: any[]): StoredScan {
    return {
        id: scanRow.id,
        timestamp: new Date(scanRow.timestamp).toISOString(),
        hostname: scanRow.hostname,
        platform: scanRow.platform,
        command: scanRow.command,
        targetPath: scanRow.target_path,
        summary: {
            scannedFiles: scanRow.scanned_files,
            elapsedMs: scanRow.elapsed_ms,
            findingCount: scanRow.finding_count,
            severities: {
                CRITICAL: scanRow.critical_count,
                HIGH: scanRow.high_count,
                MEDIUM: scanRow.medium_count,
                LOW: scanRow.low_count,
            },
        },
        targets: targetRows.map((t) => ({
            kind: t.kind,
            name: t.name,
            path: t.path,
            meta: t.meta ? JSON.parse(t.meta) : undefined,
        })),
        findings: findingRows.map((f) => ({
            ruleId: f.rule_id,
            severity: f.severity,
            message: f.message,
            file: f.file,
            line: f.line || undefined,
            category: f.category || undefined,
            remediation: f.remediation || undefined,
            source: f.source || undefined,
        })),
        tags: scanRow.tags ? JSON.parse(scanRow.tags) : undefined,
        notes: scanRow.notes || undefined,
    };
}

/**
 * Calculate severity counts from findings
 */
export function calculateSeverities(findings: Finding[]): Record<Severity, number> {
    return findings.reduce(
        (acc, finding) => {
            acc[finding.severity] = (acc[finding.severity] || 0) + 1;
            return acc;
        },
        { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<Severity, number>
    );
}

/**
 * Generate unique key for finding comparison
 */
export function findingKey(finding: Finding): string {
    return `${finding.ruleId}|${finding.file}|${finding.line ?? ""}|${finding.message}`;
}

/**
 * Generate unique scan ID
 */
export function generateScanId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
