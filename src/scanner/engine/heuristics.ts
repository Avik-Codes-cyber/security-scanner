import { basename } from "path";
import type { Finding } from "../types";
import { analyzeExtensionManifest } from "../extensions/browser/manifest";
import { analyzeCode } from "./code-analyzer";
import { SCAN_LIMITS } from "../../constants";

const MAX_HEURISTIC_FINDINGS = SCAN_LIMITS.MAX_HEURISTIC_FINDINGS;

function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;

  // Use Array.from to properly handle Unicode characters (including emoji, surrogate pairs)
  const chars = Array.from(value);
  const freq: Record<string, number> = {};

  for (const ch of chars) {
    freq[ch] = (freq[ch] ?? 0) + 1;
  }

  const len = chars.length;
  let entropy = 0;

  for (const count of Object.values(freq)) {
    const p = count / len;
    if (p > 0) {  // Avoid log2(0) which is -Infinity
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

function extractCandidateStrings(content: string): string[] {
  const candidates: string[] = [];

  // Unicode-aware regex: matches ASCII alphanumeric and common secret characters
  // \p{L} matches any Unicode letter, \p{N} matches any Unicode number
  const regex = /[\p{L}\p{N}+/_=\-]{20,}/gu;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(content)) !== null) {
    candidates.push(match[0]);
    if (candidates.length > 2000) break;
  }

  return candidates;
}

function detectHighEntropyStrings(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const candidates = extractCandidateStrings(content);

  for (const candidate of candidates) {
    if (candidate.length < 20) continue;
    const entropy = shannonEntropy(candidate);
    if (entropy >= 4.2) {
      findings.push({
        ruleId: "HEURISTIC_HIGH_ENTROPY_SECRET",
        severity: "HIGH",
        message: "High-entropy string that may be a secret or token",
        file,
        category: "heuristic_secrets",
        remediation: "Remove hardcoded secrets. Use environment variables or a vault.",
        source: "heuristic",
      });

      if (findings.length >= MAX_HEURISTIC_FINDINGS) break;
    }
  }

  return findings;
}

function scanPackageScripts(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  let parsed: any = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    return findings;
  }

  const scripts = parsed?.scripts;
  if (!scripts || typeof scripts !== "object") return findings;

  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== "string") continue;
    const lower = command.toLowerCase();

    const isInstallScript = /(pre|post)?install|prepare|prepublish|postpublish|prepack|postpack/.test(name);
    if (isInstallScript) {
      findings.push({
        ruleId: "SUPPLY_CHAIN_INSTALL_SCRIPT",
        severity: "MEDIUM",
        message: `Auto-run script detected in package.json: ${name}`,
        file,
        category: "supply_chain",
        remediation: "Review install scripts carefully and remove if unnecessary.",
        source: "heuristic",
      });
    }

    if (isInstallScript && /(curl|wget|invoke-webrequest|powershell)/.test(lower)) {
      findings.push({
        ruleId: "SUPPLY_CHAIN_REMOTE_FETCH",
        severity: "HIGH",
        message: "Install script fetches remote content",
        file,
        category: "supply_chain",
        remediation: "Avoid remote fetch in install scripts. Vendor dependencies securely.",
        source: "heuristic",
      });
    }

    if (isInstallScript && /(curl|wget).*(\|\s*(sh|bash))/.test(lower)) {
      findings.push({
        ruleId: "SUPPLY_CHAIN_REMOTE_EXEC",
        severity: "CRITICAL",
        message: "Install script pipes remote content to shell",
        file,
        category: "supply_chain",
        remediation: "Never pipe remote content to shell during install.",
        source: "heuristic",
      });
    }

    if (/(chmod|chown)/.test(lower)) {
      findings.push({
        ruleId: "SUPPLY_CHAIN_PERMISSION_CHANGE",
        severity: "HIGH",
        message: "Install script modifies file permissions",
        file,
        category: "supply_chain",
        remediation: "Avoid permission changes in install scripts unless required and documented.",
        source: "heuristic",
      });
    }
  }

  return findings;
}

export function runHeuristics(filePath: string, content: string, fileType: string): Finding[] {
  const findings: Finding[] = [];

  findings.push(...detectHighEntropyStrings(filePath, content));

  if (fileType === "json" && basename(filePath) === "package.json") {
    findings.push(...scanPackageScripts(filePath, content));
  }

  if ((fileType === "manifest" || fileType === "json") && basename(filePath) === "manifest.json") {
    findings.push(...analyzeExtensionManifest(filePath, content));
  }

  if (fileType === "javascript" || fileType === "typescript" || fileType === "python" || fileType === "bash") {
    findings.push(...analyzeCode(filePath, content, fileType));
  }

  return findings;
}
