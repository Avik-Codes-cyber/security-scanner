import type { Finding, Severity } from "../scanner/types.ts";
import { summarizeFindings } from "../scanner/report";

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[38;5;102m",
  text: "\x1b[38;5;145m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
};

const LOGO_LINES = [
  "███████╗███████╗ ██████╗██╗   ██╗██████╗ ██╗████████╗██╗   ██╗",
  "██╔════╝██╔════╝██╔════╝██║   ██║██╔══██╗██║╚══██╔══╝╚██╗ ██╔╝",
  "███████╗█████╗  ██║     ██║   ██║██████╔╝██║   ██║    ╚████╔╝ ",
  "╚════██║██╔══╝  ██║     ██║   ██║██╔══██╗██║   ██║     ╚██╔╝  ",
  "███████║███████╗╚██████╗╚██████╔╝██║  ██║██║   ██║      ██║   ",
  "╚══════╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝   ╚═╝      ╚═╝   ",
];

const LOGO_COLORS = [
  "\x1b[38;5;33m",  // deep blue
  "\x1b[38;5;39m",  // blue
  "\x1b[38;5;45m",  // cyan
  "\x1b[38;5;51m",  // bright cyan
  "\x1b[38;5;82m",  // green
  "\x1b[38;5;118m", // bright green
  "\x1b[38;5;190m", // yellow
  "\x1b[38;5;208m", // orange
  "\x1b[38;5;201m", // magenta
];

function gradientChunks(text: string, palette: string[]): string {
  if (!text) return text;
  const chunks = Math.max(3, Math.min(palette.length, 9));
  const size = Math.ceil(text.length / chunks);
  let out = "";
  for (let i = 0; i < chunks; i++) {
    const part = text.slice(i * size, (i + 1) * size);
    if (!part) break;
    out += `${palette[i % palette.length]}${part}`;
  }
  return `${out}${COLOR.reset}`;
}

function colorizeSeverity(sev: Severity): string {
  switch (sev) {
    case "CRITICAL":
      return `${COLOR.red}${sev}${COLOR.reset}`;
    case "HIGH":
      return `${COLOR.magenta}${sev}${COLOR.reset}`;
    case "MEDIUM":
      return `${COLOR.yellow}${sev}${COLOR.reset}`;
    case "LOW":
      return `${COLOR.cyan}${sev}${COLOR.reset}`;
    default:
      return sev;
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

function pad(text: string, width: number): string {
  const len = visibleLength(text);
  if (len >= width) return text;
  return text + " ".repeat(width - len);
}

function line(text: string, width: number): string {
  return `│ ${pad(text, width - 2)} │`;
}

function divider(width: number, left = "├", mid = "─", right = "┤"): string {
  return `${left}${mid.repeat(width)}${right}`;
}

function progressBar(current: number, total: number, width: number): string {
  if (total <= 0) return "";
  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(width * ratio);
  const empty = Math.max(0, width - filled);
  return `${COLOR.blue}${"█".repeat(filled)}${COLOR.gray}${"░".repeat(empty)}${COLOR.reset}`;
}

function wrapText(text: string, width: number): string[] {
  const clean = stripAnsi(text);
  if (width <= 1) return [clean];

  const words = clean.split(/\s+/g).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length === 0 && word.length > width) {
      // Hard-wrap long tokens
      let chunk = word;
      while (chunk.length > width) {
        lines.push(chunk.slice(0, width));
        chunk = chunk.slice(width);
      }
      current = chunk;
      continue;
    }

    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length <= width) {
      current = next;
    } else {
      if (current.length > 0) lines.push(current);
      current = word;
    }
  }

  if (current.length > 0) lines.push(current);
  if (lines.length === 0) lines.push(clean.slice(0, width));
  return lines;
}

function center(text: string, width: number): string {
  const len = visibleLength(text);
  if (len >= width) return text;
  const left = Math.floor((width - len) / 2);
  const right = width - len - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

export type TargetSummary = {
  name: string;
  files: number;
  findings: number;
  counts: Record<Severity, number>;
};

export type ScanUi = {
  start: (totalFiles: number, totalTargets?: number) => void;
  beginTarget: (index: number, total: number, name: string, files: number) => void;
  onFile: (filePath: string) => void;
  onFindings: (newFindings: Finding[]) => void;
  setCurrentFindings: (findings: Finding[]) => void;
  completeTarget: (summary: TargetSummary, findings?: Finding[]) => void;
  finish: () => void;
};

export function createTui(enabled: boolean): ScanUi {
  if (!enabled) {
    const noop = () => { };
    return {
      start: (_totalFiles: number, _totalTargets?: number) => noop(),
      beginTarget: (_index: number, _total: number, _name: string, _files: number) => noop(),
      onFile: (_filePath: string) => noop(),
      onFindings: (_newFindings: Finding[]) => noop(),
      setCurrentFindings: (_findings: Finding[]) => noop(),
      completeTarget: (_summary: TargetSummary, _findings?: Finding[]) => noop(),
      finish: () => noop(),
    };
  }

  let totalFiles = 0;
  let totalTargets = 0;
  let scannedFiles = 0;
  let currentTargetIndex = 0;
  let currentTargetTotal = 0;
  let currentTargetName = "";
  let currentTargetFiles = 0;
  let currentTargetScanned = 0;
  const currentFindings: Finding[] = [];
  const lastFindings: Finding[] = [];
  let lastFindingsLabel = "";
  const completed: TargetSummary[] = [];
  let scheduled: NodeJS.Timeout | null = null;
  let finished = false;

  const render = () => {
    scheduled = null;
    const displayFindings = currentFindings.length > 0 ? currentFindings : lastFindings;
    const counts = summarizeFindings(displayFindings);

    const termWidth = Math.max(90, process.stdout.columns ?? 120);
    const width = Math.max(90, Math.min(termWidth, 140));
    const innerWidth = width - 2;

    const logoLines = LOGO_LINES.map((lineText) => {
      return center(gradientChunks(lineText, LOGO_COLORS), innerWidth);
    });

    const tagline = center(`${COLOR.dim}Security scanner for skills and browser extensions${COLOR.reset}`, innerWidth);

    const headerText = `${COLOR.bold}Security Scanner${COLOR.reset}`;
    const skillsText = `${COLOR.dim}Targets${COLOR.reset} ${totalTargets}`;
    const statusText = `${COLOR.dim}Files${COLOR.reset} ${scannedFiles}/${totalFiles}`;
    const headerLine = pad(`${headerText}  ${skillsText}  ${statusText}`, innerWidth - 2);

    const barWidth = Math.max(20, innerWidth - 30);
    const bar = progressBar(scannedFiles, totalFiles, barWidth);
    const progressText = `Progress: ${bar} ${scannedFiles}/${totalFiles}`;

    const skillLine = currentTargetName
      ? `${COLOR.dim}Target${COLOR.reset}: ${currentTargetName} (${currentTargetIndex}/${currentTargetTotal})  ${COLOR.dim}Target Files${COLOR.reset}: ${currentTargetScanned}/${currentTargetFiles}`
      : `${COLOR.dim}Target${COLOR.reset}: -`;

    const summary = `Findings: ${displayFindings.length} | ${COLOR.red}CRITICAL${COLOR.reset}:${counts.CRITICAL} ${COLOR.magenta}HIGH${COLOR.reset}:${counts.HIGH} ${COLOR.yellow}MEDIUM${COLOR.reset}:${counts.MEDIUM} ${COLOR.cyan}LOW${COLOR.reset}:${counts.LOW}`;

    const colSev = 10;
    const colRule = 26;
    const colFile = Math.max(30, Math.min(64, Math.floor(innerWidth * 0.48)));
    const colMsg = Math.max(20, innerWidth - (colSev + colFile + colRule + 6));

    const tableHeader = [
      pad(`${COLOR.bold}Severity${COLOR.reset}`, colSev),
      pad(`${COLOR.bold}File${COLOR.reset}`, colFile),
      pad(`${COLOR.bold}Rule${COLOR.reset}`, colRule),
      pad(`${COLOR.bold}Message${COLOR.reset}`, colMsg),
    ].join("  ");

    const rows: string[] = [];
    for (const finding of displayFindings) {
      const severity = colorizeSeverity(finding.severity);
      const fileLines = wrapText(finding.file, colFile);
      const ruleLines = wrapText(finding.ruleId, colRule);
      const msgLines = wrapText(finding.message, colMsg);
      const lineCount = Math.max(fileLines.length, ruleLines.length, msgLines.length, 1);

      for (let i = 0; i < lineCount; i++) {
        rows.push(
          [
            pad(i === 0 ? severity : "", colSev),
            pad(fileLines[i] ?? "", colFile),
            pad(ruleLines[i] ?? "", colRule),
            pad(msgLines[i] ?? "", colMsg),
          ].join("  ")
        );
      }
    }

    const body =
      rows.length > 0
        ? rows
        : [
          [
            pad("", colSev),
            pad("", colFile),
            pad("", colRule),
            pad(`${COLOR.gray}No findings yet.${COLOR.reset}`, colMsg),
          ].join("  "),
        ];

    const completedHeader = [
      pad(`${COLOR.bold}Completed Target${COLOR.reset}`, Math.max(20, Math.floor(innerWidth * 0.4))),
      pad(`${COLOR.bold}Files${COLOR.reset}`, 8),
      pad(`${COLOR.bold}Findings${COLOR.reset}`, 10),
      pad(`${COLOR.bold}Critical${COLOR.reset}`, 9),
      pad(`${COLOR.bold}High${COLOR.reset}`, 6),
      pad(`${COLOR.bold}Medium${COLOR.reset}`, 8),
      pad(`${COLOR.bold}Low${COLOR.reset}`, 6),
    ].join("  ");

    const completedRows = completed.map((item) => {
      return [
        pad(item.name, Math.max(20, Math.floor(innerWidth * 0.4))),
        pad(String(item.files), 8),
        pad(String(item.findings), 10),
        pad(String(item.counts.CRITICAL), 9),
        pad(String(item.counts.HIGH), 6),
        pad(String(item.counts.MEDIUM), 8),
        pad(String(item.counts.LOW), 6),
      ].join("  ");
    });

    const top = `┌${"─".repeat(innerWidth)}┐`;
    const mid = `├${"─".repeat(innerWidth)}┤`;
    const bottom = `└${"─".repeat(innerWidth)}┘`;

    const output = [
      "",
      ...logoLines,
      tagline,
      "",
      top,
      line(headerLine, innerWidth),
      line(progressText, innerWidth),
      line(skillLine, innerWidth),
      line(summary, innerWidth),
      mid,
      line(tableHeader, innerWidth),
      ...body.map((row) => line(row, innerWidth)),
      ...(completed.length > 0
        ? [mid, line(completedHeader, innerWidth), ...completedRows.map((row) => line(row, innerWidth))]
        : []),
      bottom,
    ].join("\n");

    process.stdout.write("\x1b[2J\x1b[H" + output + "\n");
  };

  const scheduleRender = () => {
    if (finished) return;
    if (scheduled) return;
    scheduled = setTimeout(render, 60);
  };

  return {
    start(total, skills = 0) {
      totalFiles = total;
      totalTargets = skills;
      scheduleRender();
    },
    beginTarget(index, total, name, files) {
      currentTargetIndex = index;
      currentTargetTotal = total;
      currentTargetName = name;
      currentTargetFiles = files;
      currentTargetScanned = 0;
      currentFindings.length = 0;
      scheduleRender();
    },
    onFile(filePath) {
      scannedFiles += 1;
      currentTargetScanned += 1;
      scheduleRender();
    },
    onFindings(newFindings) {
      if (newFindings.length) {
        currentFindings.push(...newFindings);
        scheduleRender();
      }
    },
    setCurrentFindings(findings) {
      currentFindings.length = 0;
      currentFindings.push(...findings);
      scheduleRender();
    },
    completeTarget(summary, findings = []) {
      completed.push(summary);
      if (findings.length > 0) {
        lastFindings.length = 0;
        lastFindings.push(...findings);
        lastFindingsLabel = summary.name;
      }
      scheduleRender();
    },
    finish() {
      if (scheduled) {
        clearTimeout(scheduled);
        scheduled = null;
      }
      render();
      finished = true;
    },
  };
}
