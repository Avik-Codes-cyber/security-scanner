import { extname } from "path";
import type { Finding } from "./types.ts";
import { readText } from "../utils/fs";
import { FILE_SIZE_LIMITS } from "../constants";

const MAX_BYTES = FILE_SIZE_LIMITS.MAX_SCAN_BYTES;

type CommentStyle =
  | { type: "prefix"; value: string }
  | { type: "wrap"; start: string; end: string };

const EXT_COMMENT_STYLE: Record<string, CommentStyle | null> = {
  ".md": { type: "wrap", start: "<!-- ", end: " -->" },
  ".mdx": { type: "wrap", start: "<!-- ", end: " -->" },
  ".txt": { type: "prefix", value: "#" },
  ".rst": { type: "prefix", value: "#" },
  ".yaml": { type: "prefix", value: "#" },
  ".yml": { type: "prefix", value: "#" },
  ".toml": { type: "prefix", value: "#" },
  ".ini": { type: "prefix", value: "#" },
  ".cfg": { type: "prefix", value: "#" },
  ".conf": { type: "prefix", value: "#" },
  ".py": { type: "prefix", value: "#" },
  ".sh": { type: "prefix", value: "#" },
  ".bash": { type: "prefix", value: "#" },
  ".js": { type: "prefix", value: "//" },
  ".ts": { type: "prefix", value: "//" },
  ".mjs": { type: "prefix", value: "//" },
  ".cjs": { type: "prefix", value: "//" },
  ".json": null,
};

function getCommentStyle(filePath: string): CommentStyle | null {
  const ext = extname(filePath).toLowerCase();
  if (ext in EXT_COMMENT_STYLE) return EXT_COMMENT_STYLE[ext] ?? null;
  return null;
}

function isAlreadyCommented(line: string, style: CommentStyle): boolean {
  const trimmed = line.trimStart();
  if (style.type === "prefix") {
    return trimmed.startsWith(style.value);
  }
  return trimmed.startsWith("<!--") && trimmed.endsWith("-->");
}

function commentLine(line: string, style: CommentStyle): string {
  const match = line.match(/^(\s*)(.*)$/);
  const indent = match ? match[1] : "";
  const content = match ? match[2] : line;

  if (style.type === "prefix") {
    if (content.trim().length === 0) return line;
    return `${indent}${style.value} ${content}`;
  }

  if (content.trim().length === 0) return line;
  return `${indent}${style.start}${content}${style.end}`;
}

export type FixSummary = {
  fixedFiles: number;
  fixedLines: number;
  skippedFiles: number;
  skippedLines: number;
  skippedReasons: Record<string, number>;
};

export async function applyFixes(findings: Finding[]): Promise<FixSummary> {
  const summary: FixSummary = {
    fixedFiles: 0,
    fixedLines: 0,
    skippedFiles: 0,
    skippedLines: 0,
    skippedReasons: {},
  };

  const byFile = new Map<string, Set<number>>();

  for (const finding of findings) {
    if (!finding.line) {
      summary.skippedLines += 1;
      summary.skippedReasons["missing-line"] = (summary.skippedReasons["missing-line"] ?? 0) + 1;
      continue;
    }
    if (finding.source === "heuristic") {
      summary.skippedLines += 1;
      summary.skippedReasons["heuristic"] = (summary.skippedReasons["heuristic"] ?? 0) + 1;
      continue;
    }

    const set = byFile.get(finding.file) ?? new Set<number>();
    set.add(finding.line);
    byFile.set(finding.file, set);
  }

  for (const [file, lines] of byFile) {
    const style = getCommentStyle(file);
    if (!style) {
      summary.skippedFiles += 1;
      summary.skippedReasons["unsupported-type"] = (summary.skippedReasons["unsupported-type"] ?? 0) + 1;
      summary.skippedLines += lines.size;
      continue;
    }

    let content = "";
    try {
      content = await readText(file, MAX_BYTES);
    } catch {
      summary.skippedFiles += 1;
      summary.skippedReasons["read-failed"] = (summary.skippedReasons["read-failed"] ?? 0) + 1;
      summary.skippedLines += lines.size;
      continue;
    }

    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const split = content.split(/\r?\n/);
    let changed = false;
    let fixedHere = 0;

    for (const lineNumber of lines) {
      const index = lineNumber - 1;
      if (index < 0 || index >= split.length) {
        summary.skippedLines += 1;
        summary.skippedReasons["line-out-of-range"] = (summary.skippedReasons["line-out-of-range"] ?? 0) + 1;
        continue;
      }
      const original = split[index];
      if (isAlreadyCommented(original, style)) {
        summary.skippedLines += 1;
        summary.skippedReasons["already-commented"] = (summary.skippedReasons["already-commented"] ?? 0) + 1;
        continue;
      }
      const updated = commentLine(original, style);
      if (updated !== original) {
        split[index] = updated;
        changed = true;
        fixedHere += 1;
      }
    }

    if (changed) {
      await Bun.write(file, split.join(eol));
      summary.fixedFiles += 1;
      summary.fixedLines += fixedHere;
    }
  }

  return summary;
}
