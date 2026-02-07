import { mkdir, readFile, writeFile, readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import type { Finding, ScanResult, Target, Severity } from "../scanner/types";
import { DatabaseStorage } from "./db-storage";
import { config } from "../config";

export interface StoredScan {
  id: string;
  timestamp: string;
  hostname: string;
  platform: string;
  command: string;
  targetPath: string;
  summary: {
    scannedFiles: number;
    elapsedMs: number;
    findingCount: number;
    severities: Record<Severity, number>;
  };
  targets: Target[];
  findings: Finding[];
  tags?: string[];
  notes?: string;
}

export interface ScanQuery {
  startDate?: Date;
  endDate?: Date;
  targetPath?: string;
  minSeverity?: Severity;
  hasFindings?: boolean;
  tags?: string[];
  limit?: number;
}

export interface ScanComparison {
  baselineScan: StoredScan;
  currentScan: StoredScan;
  added: Finding[];
  removed: Finding[];
  unchanged: Finding[];
  severityChanges: Array<{
    finding: Finding;
    oldSeverity: Severity;
    newSeverity: Severity;
  }>;
}

class ScanStorage {
  private dataDir: string;
  private maxScans: number;

  constructor(dataDir?: string, maxScans: number = 100) {
    this.dataDir = dataDir || this.getDefaultDataDir();
    this.maxScans = maxScans;
  }

  public getDefaultDataDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (process.platform === "darwin") {
      return join(home || "", "Library", "Application Support", "securityscanner");
    } else if (process.platform === "win32") {
      return join(process.env.LOCALAPPDATA || "", "securityscanner");
    } else {
      return join(home || "", ".config", "securityscanner");
    }
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private getScanPath(id: string): string {
    return join(this.dataDir, `${id}.json`);
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
    await this.ensureDir();

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

    await writeFile(
      this.getScanPath(scan.id),
      JSON.stringify(scan, null, 2),
      "utf-8"
    );

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
    const scans = await this.listAll();
    if (scans.length <= this.maxScans) return;

    const sorted = scans.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const toDelete = sorted.slice(0, sorted.length - this.maxScans);
    for (const scan of toDelete) {
      await this.delete(scan.id);
    }
  }

  async get(id: string): Promise<StoredScan | null> {
    try {
      const content = await readFile(this.getScanPath(id), "utf-8");
      return JSON.parse(content) as StoredScan;
    } catch {
      return null;
    }
  }

  async listAll(): Promise<StoredScan[]> {
    await this.ensureDir();

    try {
      const entries = await readdir(this.dataDir);
      const scans: StoredScan[] = [];

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const id = entry.slice(0, -5);
        const scan = await this.get(id);
        if (scan) scans.push(scan);
      }

      return scans.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch {
      return [];
    }
  }

  async query(query: ScanQuery): Promise<StoredScan[]> {
    let scans = await this.listAll();

    if (query.startDate) {
      scans = scans.filter(
        (s) => new Date(s.timestamp) >= query.startDate!
      );
    }

    if (query.endDate) {
      scans = scans.filter(
        (s) => new Date(s.timestamp) <= query.endDate!
      );
    }

    if (query.targetPath) {
      scans = scans.filter((s) =>
        s.targetPath.toLowerCase().includes(query.targetPath!.toLowerCase())
      );
    }

    if (query.minSeverity) {
      const severityOrder: Record<Severity, number> = {
        LOW: 0,
        MEDIUM: 1,
        HIGH: 2,
        CRITICAL: 3,
      };
      const minLevel = severityOrder[query.minSeverity];
      scans = scans.filter((s) =>
        Object.entries(s.summary.severities).some(
          ([sev, count]) => severityOrder[sev as Severity] >= minLevel && count > 0
        )
      );
    }

    if (query.hasFindings !== undefined) {
      scans = scans.filter(
        (s) => (s.summary.findingCount > 0) === query.hasFindings
      );
    }

    if (query.tags && query.tags.length > 0) {
      scans = scans.filter((s) =>
        query.tags!.some((tag) => s.tags?.includes(tag))
      );
    }

    if (query.limit) {
      scans = scans.slice(0, query.limit);
    }

    return scans;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await unlink(this.getScanPath(id));
      return true;
    } catch {
      return false;
    }
  }

  async deleteAll(): Promise<void> {
    const scans = await this.listAll();
    await Promise.all(scans.map((s) => this.delete(s.id)));
  }

  async getLatest(targetPath?: string): Promise<StoredScan | null> {
    const scans = await this.listAll();
    if (!scans.length) return null;

    if (targetPath) {
      const matching = scans.filter((s) => s.targetPath === targetPath);
      return matching[0] || null;
    }

    return scans[0];
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
    const scans = await this.listAll();

    if (scans.length === 0) {
      return {
        totalScans: 0,
        totalFindings: 0,
        findingsBySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
        scansByTarget: {},
        dateRange: null,
      };
    }

    const findingsBySeverity: Record<Severity, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    const scansByTarget: Record<string, number> = {};

    for (const scan of scans) {
      for (const [sev, count] of Object.entries(scan.summary.severities)) {
        findingsBySeverity[sev as Severity] += count;
      }
      scansByTarget[scan.targetPath] = (scansByTarget[scan.targetPath] || 0) + 1;
    }

    const timestamps = scans.map((s) => new Date(s.timestamp).getTime());

    return {
      totalScans: scans.length,
      totalFindings: findingsBySeverity.LOW + findingsBySeverity.MEDIUM + findingsBySeverity.HIGH + findingsBySeverity.CRITICAL,
      findingsBySeverity,
      scansByTarget,
      dateRange: {
        earliest: new Date(Math.min(...timestamps)).toISOString(),
        latest: new Date(Math.max(...timestamps)).toISOString(),
      },
    };
  }
}

export const scanStorage = config.storageBackend === "sqlite"
  ? new DatabaseStorage(
    config.sqliteDbPath || join(new ScanStorage().getDefaultDataDir(), "scans.db"),
    config.maxStoredScans
  )
  : new ScanStorage(undefined, config.maxStoredScans);

export { ScanStorage };
