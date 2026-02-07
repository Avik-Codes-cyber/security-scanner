import { parse as parseYaml } from "yaml";
import type { Finding, Rule, Severity } from "../types";
import { readText } from "../../utils/fs";
import { config } from "../../config";
import { SCAN_LIMITS } from "../../constants";

const MAX_FINDINGS_PER_RULE_PER_FILE = SCAN_LIMITS.MAX_FINDINGS_PER_RULE_PER_FILE;

export type CompiledRule = Rule & {
  _compiled: RegExp[];
  _excludeCompiled: RegExp[];
};

export async function loadRulesFromFile(rulesPath: string): Promise<CompiledRule[]> {
  const content = await readText(rulesPath);
  return loadRulesFromText(content);
}

export function loadRulesFromText(content: string): CompiledRule[] {
  const parsed = parseYaml(content);
  if (!Array.isArray(parsed)) {
    throw new Error("Rules file must contain a YAML array of rules.");
  }

  const rules: CompiledRule[] = [];

  for (const raw of parsed) {
    if (!raw?.id || !raw?.category || !raw?.severity || !raw?.patterns || !raw?.file_types) {
      continue;
    }

    const patterns = Array.isArray(raw.patterns) ? raw.patterns : [];
    const excludePatterns = Array.isArray(raw.exclude_patterns) ? raw.exclude_patterns : [];
    const compiled = patterns
      .map((pattern: string) => {
        try {
          // YAML rules often use PCRE-style inline case-insensitive flags like (?i),
          // which JavaScript RegExp doesn't support. Normalize to JS flags.
          let flags = "g";
          let normalized = pattern;
          if (normalized.includes("(?i)")) {
            normalized = normalized.replace(/\(\?i\)/g, "");
            flags = "gi";
          }
          return new RegExp(normalized, flags);
        } catch {
          return null;
        }
      })
      .filter((re: RegExp | null): re is RegExp => Boolean(re));

    const excludeCompiled = excludePatterns
      .map((pattern: string) => {
        try {
          let flags = "g";
          let normalized = pattern;
          if (normalized.includes("(?i)")) {
            normalized = normalized.replace(/\(\?i\)/g, "");
            flags = "gi";
          }
          return new RegExp(normalized, flags);
        } catch {
          return null;
        }
      })
      .filter((re: RegExp | null): re is RegExp => Boolean(re));

    rules.push({
      id: raw.id,
      category: raw.category,
      severity: raw.severity as Severity,
      patterns,
      file_types: raw.file_types,
      description: raw.description,
      remediation: raw.remediation,
      exclude_patterns: raw.exclude_patterns,
      _compiled: compiled,
      _excludeCompiled: excludeCompiled,
    });
  }

  return rules;
}

function buildLineIndex(content: string): number[] {
  const indices = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") {
      indices.push(i + 1);
    }
  }
  return indices;
}

function indexToLine(lineIndex: number[], position: number): number {
  let low = 0;
  let high = lineIndex.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineIndex[mid] <= position) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(1, low);
}

function isFileTypeMatch(rule: CompiledRule, fileType: string): boolean {
  return rule.file_types.includes(fileType) || rule.file_types.includes("any");
}

function isExcluded(rule: CompiledRule, match: string): boolean {
  if (!rule._excludeCompiled.length) return false;
  return rule._excludeCompiled.some((re) => re.test(match));
}

/**
 * Execute regex with timeout protection to prevent ReDoS attacks.
 * Returns null if timeout is exceeded.
 */
function execWithTimeout(regex: RegExp, content: string, timeoutMs: number): RegExpExecArray | null {
  const startTime = Date.now();

  try {
    const match = regex.exec(content);

    // Check if execution took too long
    if (Date.now() - startTime > timeoutMs) {
      console.warn(`⚠️  Regex timeout exceeded for pattern: ${regex.source.substring(0, 50)}...`);
      return null;
    }

    return match;
  } catch (error) {
    // Regex execution error (e.g., stack overflow from catastrophic backtracking)
    console.warn(`⚠️  Regex execution error: ${error}`);
    return null;
  }
}

export function scanContent(
  content: string,
  filePath: string,
  fileType: string,
  rules: CompiledRule[]
): Finding[] {
  const findings: Finding[] = [];
  const lineIndex = buildLineIndex(content);

  for (const rule of rules) {
    if (!isFileTypeMatch(rule, fileType)) continue;

    let ruleHits = 0;

    for (const regex of rule._compiled) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null = null;
      const regexStartTime = Date.now();

      while ((match = execWithTimeout(regex, content, config.regexTimeoutMs)) !== null) {
        // Check total time spent on this regex
        if (Date.now() - regexStartTime > config.regexTimeoutMs * 5) {
          console.warn(`⚠️  Regex taking too long for rule ${rule.id}, stopping.`);
          break;
        }

        if (match[0].length === 0) {
          regex.lastIndex++;
          continue;
        }

        if (isExcluded(rule, match[0])) {
          continue;
        }

        const line = indexToLine(lineIndex, match.index);

        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: rule.description ?? `Matched rule ${rule.id}`,
          file: filePath,
          line,
          category: rule.category,
          remediation: rule.remediation,
          source: "signature",
        });

        ruleHits++;
        if (ruleHits >= MAX_FINDINGS_PER_RULE_PER_FILE) {
          break;
        }
      }

      if (ruleHits >= MAX_FINDINGS_PER_RULE_PER_FILE) {
        break;
      }
    }
  }

  return findings;
}
