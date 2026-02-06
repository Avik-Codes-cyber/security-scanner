import type { Finding, Severity } from "../../scanner/types.ts";

/**
 * Summary of a completed scan target
 */
export type TargetSummary = {
  name: string;
  files: number;
  findings: number;
  counts: Record<Severity, number>;
};

/**
 * Statistics for a scan session
 */
export type ScanStats = {
  startTime: number;
  endTime?: number;
  totalFiles: number;
  scannedFiles: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

/**
 * Interface for the scan UI controller
 */
export type ScanUi = {
  /** Start the TUI with total files and targets */
  start: (totalFiles: number, totalTargets?: number) => void;
  /** Begin scanning a new target */
  beginTarget: (index: number, total: number, name: string, files: number) => void;
  /** Called when a file has been scanned */
  onFile: (filePath: string) => void;
  /** Called when new findings are discovered */
  onFindings: (newFindings: Finding[]) => void;
  /** Replace current findings (used for meta-analyzer filtering) */
  setCurrentFindings: (findings: Finding[]) => void;
  /** Mark a target as complete */
  completeTarget: (summary: TargetSummary, findings?: Finding[]) => void;
  /** Finish the TUI and restore terminal state */
  finish: () => void;
  /** Get current scan statistics */
  getStats: () => ScanStats;
};
