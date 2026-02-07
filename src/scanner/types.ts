export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TargetKind = "skill" | "extension" | "ide-extension" | "mcp" | "path";

export type Target = {
  kind: TargetKind;
  name: string;
  path: string;
  meta?: Record<string, unknown>;
};

export type Rule = {
  id: string;
  category: string;
  severity: Severity;
  patterns: string[];
  file_types: string[];
  description?: string;
  remediation?: string;
  exclude_patterns?: string[];
};

export type Finding = {
  ruleId: string;
  severity: Severity;
  message: string;
  file: string;
  line?: number;
  category?: string;
  remediation?: string;
  source?: "signature" | "heuristic";
  confidence?: number; // 0.0 to 1.0
  confidenceReason?: string;
};

export type Skill = {
  name: string;
  path: string;
  content: string;
};

export type ScanOptions = {
  json?: boolean;
  failOn?: Severity;
  tui?: boolean;
  includeInternal?: boolean;
  fullDepth?: boolean;
  fix?: boolean;
  includeSystem?: boolean;
  includeExtensions?: boolean;
  includeIDEExtensions?: boolean;
  includeMcp?: boolean;
  extraExtensionDirs?: string[];
  extraIDEExtensionDirs?: string[];
  extraSkillDirs?: string[];
  useBehavioral?: boolean;
  enableMeta?: boolean;
  format?: "table" | "json" | "sarif";
  output?: string;
  save?: boolean;
  tags?: string[];
  notes?: string;
  compareWith?: string;
  targetPath?: string;
  reportDir?: string;
  reportFormats?: ("json" | "html" | "csv")[];
  showConfidence?: boolean; // Show confidence scores in output
  minConfidence?: number; // Minimum confidence threshold (0.0-1.0)
};

export type ScanResult = {
  targets: Target[];
  findings: Finding[];
  scannedFiles: number;
  elapsedMs: number;
};

export const SEVERITY_RANK: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};
