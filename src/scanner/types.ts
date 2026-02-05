export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

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
  extraSkillDirs?: string[];
  useBehavioral?: boolean;
  useLlm?: boolean;
  useAiDefense?: boolean;
  enableMeta?: boolean;
  format?: "table" | "json" | "sarif";
  output?: string;
};

export type ScanResult = {
  skills: Skill[];
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
