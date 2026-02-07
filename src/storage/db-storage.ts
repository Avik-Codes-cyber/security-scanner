import { Database } from "bun:sqlite";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import type { Finding, ScanResult, Target, Severity } from "../scanner/types";
import type { StoredScan, ScanQuery, ScanComparison } from "./scan-storage";

/**
 * SQLite-based storage for scan results with efficient querying and indexing.
 * Provides better performance than JSON file storage for large scan histories.
 */
export class DatabaseStorage {
    private db: Database;
    private maxScans: number;

    constructor(dbPath: string, maxScans: number = 1000) {
        // Ensure directory exists before opening database
        const dir = dirname(dbPath);
        try {
            require("fs").mkdirSync(dir, { recursive: true });
        } catch (e) {
            // Directory might already exist
        }

        this.db = new Database(dbPath, { create: true });
        this.maxScans = maxScans;
        this.initSchema();
    }

    private initSchema(): void {
        // Create tables
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        hostname TEXT,
        platform TEXT,
        command TEXT,
        target_path TEXT NOT NULL,
        scanned_files INTEGER,
        elapsed_ms INTEGER,
        finding_count INTEGER,
        critical_count INTEGER,
        high_count INTEGER,
        medium_count INTEGER,
        low_count INTEGER,
        tags TEXT,
        notes TEXT,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_timestamp ON scans(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_target ON scans(target_path);
      CREATE INDEX IF NOT EXISTS idx_finding_count ON scans(finding_count);
      
      CREATE TABLE IF NOT EXISTS findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER,
        message TEXT,
        category TEXT,
        remediation TEXT,
        source TEXT,
        FOREIGN KEY(scan_id) REFERENCES scans(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_scan_findings ON findings(scan_id);
      CREATE INDEX IF NOT EXISTS idx_severity ON findings(severity);
      CREATE INDEX IF NOT EXISTS idx_rule_id ON findings(rule_id);
      
      CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        meta TEXT,
        FOREIGN KEY(scan_id) REFERENCES scans(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_scan_targets ON targets(scan_id);
    `);
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }

    async save(
        result: ScanResult,
        command: string,
        targetPath: string,
        options?: {
            tags?: string[];
            notes?: string;
        }
    ): Promise<StoredScan> {
        await mkdir(dirname(this.db.filename), { recursive: true });

        const scan: StoredScan = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            hostname: require("os").hostname(),
            platform: process.platform,
            command,
            targetPath,
            summary: {
                scannedFiles: result.scannedFiles,
                elapsedMs: result.elapsedMs,
                findingCount: result.findings.length,
                severities: this.calculateSeverities(result.findings),
            },
            targets: result.targets,
            findings: result.findings,
            tags: options?.tags,
            notes: options?.notes,
        };

        const tx = this.db.transaction(() => {
            // Insert scan record
            const insertScan = this.db.prepare(
                `INSERT INTO scans (
          id, timestamp, hostname, platform, command, target_path,
          scanned_files, elapsed_ms, finding_count,
          critical_count, high_count, medium_count, low_count,
          tags, notes, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );

            insertScan.run(
                scan.id,
                Date.parse(scan.timestamp),
                scan.hostname,
                scan.platform,
                scan.command,
                scan.targetPath,
                scan.summary.scannedFiles,
                scan.summary.elapsedMs,
                scan.summary.findingCount,
                scan.summary.severities.CRITICAL,
                scan.summary.severities.HIGH,
                scan.summary.severities.MEDIUM,
                scan.summary.severities.LOW,
                scan.tags ? JSON.stringify(scan.tags) : null,
                scan.notes || null,
                JSON.stringify({ targets: scan.targets })
            );

            // Insert findings
            const findingStmt = this.db.prepare(
                `INSERT INTO findings (
          scan_id, rule_id, severity, file, line, message, category, remediation, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );

            for (const finding of scan.findings) {
                findingStmt.run(
                    scan.id,
                    finding.ruleId,
                    finding.severity,
                    finding.file,
                    finding.line || null,
                    finding.message,
                    finding.category || null,
                    finding.remediation || null,
                    finding.source || null
                );
            }

            // Insert targets
            const targetStmt = this.db.prepare(
                `INSERT INTO targets (scan_id, kind, name, path, meta) VALUES (?, ?, ?, ?, ?)`
            );

            for (const target of scan.targets) {
                targetStmt.run(
                    scan.id,
                    target.kind,
                    target.name,
                    target.path,
                    target.meta ? JSON.stringify(target.meta) : null
                );
            }
        });

        tx();

        await this.enforceRetentionPolicy();

        return scan;
    }

    private calculateSeverities(findings: Finding[]): Record<Severity, number> {
        return findings.reduce(
            (acc, finding) => {
                acc[finding.severity] = (acc[finding.severity] || 0) + 1;
                return acc;
            },
            { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<Severity, number>
        );
    }

    private async enforceRetentionPolicy(): Promise<void> {
        const count = this.db.prepare("SELECT COUNT(*) as count FROM scans").get() as { count: number };

        if (count.count <= this.maxScans) return;

        const toDelete = count.count - this.maxScans;
        const deleteStmt = this.db.prepare(
            `DELETE FROM scans WHERE id IN (
        SELECT id FROM scans ORDER BY timestamp ASC LIMIT ?
      )`
        );
        deleteStmt.run(toDelete);
    }

    async get(id: string): Promise<StoredScan | null> {
        const scanRow = this.db.prepare(`SELECT * FROM scans WHERE id = ?`).get(id) as any;

        if (!scanRow) return null;

        const findings = this.db.prepare(`SELECT * FROM findings WHERE scan_id = ?`).all(id) as any[];
        const targets = this.db.prepare(`SELECT * FROM targets WHERE scan_id = ?`).all(id) as any[];

        return this.rowToScan(scanRow, findings, targets);
    }

    private rowToScan(scanRow: any, findingRows: any[], targetRows: any[]): StoredScan {
        const metadata = scanRow.metadata ? JSON.parse(scanRow.metadata) : {};

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

    async listAll(): Promise<StoredScan[]> {
        const scanRows = this.db.prepare(`SELECT * FROM scans ORDER BY timestamp DESC`).all() as any[];

        const scans: StoredScan[] = [];

        for (const scanRow of scanRows) {
            const findings = this.db.prepare(`SELECT * FROM findings WHERE scan_id = ?`).all(scanRow.id) as any[];
            const targets = this.db.prepare(`SELECT * FROM targets WHERE scan_id = ?`).all(scanRow.id) as any[];

            scans.push(this.rowToScan(scanRow, findings, targets));
        }

        return scans;
    }

    async query(query: ScanQuery): Promise<StoredScan[]> {
        let sql = "SELECT * FROM scans WHERE 1=1";
        const params: any[] = [];

        if (query.startDate) {
            sql += " AND timestamp >= ?";
            params.push(query.startDate.getTime());
        }

        if (query.endDate) {
            sql += " AND timestamp <= ?";
            params.push(query.endDate.getTime());
        }

        if (query.targetPath) {
            sql += " AND target_path LIKE ?";
            params.push(`%${query.targetPath}%`);
        }

        if (query.hasFindings !== undefined) {
            sql += query.hasFindings ? " AND finding_count > 0" : " AND finding_count = 0";
        }

        if (query.minSeverity) {
            const severityColumns: Record<Severity, string[]> = {
                LOW: ["low_count", "medium_count", "high_count", "critical_count"],
                MEDIUM: ["medium_count", "high_count", "critical_count"],
                HIGH: ["high_count", "critical_count"],
                CRITICAL: ["critical_count"],
            };

            const columns = severityColumns[query.minSeverity];
            const conditions = columns.map((col) => `${col} > 0`).join(" OR ");
            sql += ` AND (${conditions})`;
        }

        sql += " ORDER BY timestamp DESC";

        if (query.limit) {
            sql += " LIMIT ?";
            params.push(query.limit);
        }

        const stmt = this.db.prepare(sql);
        const scanRows = stmt.all(...params) as any[];
        const scans: StoredScan[] = [];

        for (const scanRow of scanRows) {
            const findings = this.db.prepare(`SELECT * FROM findings WHERE scan_id = ?`).all(scanRow.id) as any[];
            const targets = this.db.prepare(`SELECT * FROM targets WHERE scan_id = ?`).all(scanRow.id) as any[];

            const scan = this.rowToScan(scanRow, findings, targets);

            // Filter by tags if specified
            if (query.tags && query.tags.length > 0) {
                if (!scan.tags || !query.tags.some((tag) => scan.tags!.includes(tag))) {
                    continue;
                }
            }

            scans.push(scan);
        }

        return scans;
    }

    async delete(id: string): Promise<boolean> {
        const result = this.db.prepare("DELETE FROM scans WHERE id = ?").run(id);
        return result.changes > 0;
    }

    async deleteAll(): Promise<void> {
        this.db.exec("DELETE FROM scans");
    }

    async getLatest(targetPath?: string): Promise<StoredScan | null> {
        let sql = "SELECT * FROM scans";
        const params: any[] = [];

        if (targetPath) {
            sql += " WHERE target_path = ?";
            params.push(targetPath);
        }

        sql += " ORDER BY timestamp DESC LIMIT 1";

        const stmt = this.db.prepare(sql);
        const scanRow = params.length > 0 ? stmt.get(...params) as any : stmt.get() as any;

        if (!scanRow) return null;

        const findings = this.db.prepare(`SELECT * FROM findings WHERE scan_id = ?`).all(scanRow.id) as any[];
        const targets = this.db.prepare(`SELECT * FROM targets WHERE scan_id = ?`).all(scanRow.id) as any[];

        return this.rowToScan(scanRow, findings, targets);
    }

    async compare(baselineId: string, currentId: string): Promise<ScanComparison | null> {
        const baseline = await this.get(baselineId);
        const current = await this.get(currentId);

        if (!baseline || !current) return null;

        const baselineFindings = new Map(
            baseline.findings.map((f) => [this.findingKey(f), f])
        );
        const currentFindings = new Map(
            current.findings.map((f) => [this.findingKey(f), f])
        );

        const added: Finding[] = [];
        const removed: Finding[] = [];
        const unchanged: Finding[] = [];
        const severityChanges: ScanComparison["severityChanges"] = [];

        for (const [key, finding] of currentFindings) {
            if (!baselineFindings.has(key)) {
                added.push(finding);
            } else {
                const baselineFinding = baselineFindings.get(key)!;
                if (baselineFinding.severity !== finding.severity) {
                    severityChanges.push({
                        finding,
                        oldSeverity: baselineFinding.severity,
                        newSeverity: finding.severity,
                    });
                } else {
                    unchanged.push(finding);
                }
            }
        }

        for (const [key, finding] of baselineFindings) {
            if (!currentFindings.has(key)) {
                removed.push(finding);
            }
        }

        return {
            baselineScan: baseline,
            currentScan: current,
            added,
            removed,
            unchanged,
            severityChanges,
        };
    }

    private findingKey(finding: Finding): string {
        return `${finding.ruleId}|${finding.file}|${finding.line ?? ""}|${finding.message}`;
    }

    async getStats(): Promise<{
        totalScans: number;
        totalFindings: number;
        findingsBySeverity: Record<Severity, number>;
        scansByTarget: Record<string, number>;
        dateRange: { earliest: string; latest: string } | null;
    }> {
        const countRow = this.db.prepare("SELECT COUNT(*) as count FROM scans").get() as { count: number };

        if (countRow.count === 0) {
            return {
                totalScans: 0,
                totalFindings: 0,
                findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
                scansByTarget: {},
                dateRange: null,
            };
        }

        const severityRow = this.db.prepare(
            `SELECT 
        SUM(critical_count) as critical,
        SUM(high_count) as high,
        SUM(medium_count) as medium,
        SUM(low_count) as low
      FROM scans`
        ).get() as any;

        const targetRows = this.db.prepare(
            `SELECT target_path, COUNT(*) as count FROM scans GROUP BY target_path`
        ).all() as any[];

        const scansByTarget: Record<string, number> = {};
        for (const row of targetRows) {
            scansByTarget[row.target_path] = row.count;
        }

        const dateRow = this.db.prepare(
            `SELECT MIN(timestamp) as earliest, MAX(timestamp) as latest FROM scans`
        ).get() as any;

        return {
            totalScans: countRow.count,
            totalFindings:
                (severityRow.critical || 0) +
                (severityRow.high || 0) +
                (severityRow.medium || 0) +
                (severityRow.low || 0),
            findingsBySeverity: {
                CRITICAL: severityRow.critical || 0,
                HIGH: severityRow.high || 0,
                MEDIUM: severityRow.medium || 0,
                LOW: severityRow.low || 0,
            },
            scansByTarget,
            dateRange: dateRow.earliest
                ? {
                    earliest: new Date(dateRow.earliest).toISOString(),
                    latest: new Date(dateRow.latest).toISOString(),
                }
                : null,
        };
    }

    close(): void {
        this.db.close();
    }
}
