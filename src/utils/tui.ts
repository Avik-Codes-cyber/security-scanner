import type { Finding, Severity } from "../scanner/types.ts";
import { summarizeFindings } from "../scanner/report";

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[38;5;102m",
  text: "\x1b[38;5;145m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  redBg: "\x1b[41m",
  yellow: "\x1b[33m",
  yellowBg: "\x1b[43m",
  magenta: "\x1b[35m",
  magentaBg: "\x1b[45m",
  cyan: "\x1b[36m",
  cyanBg: "\x1b[46m",
  blue: "\x1b[34m",
  blueBg: "\x1b[44m",
  green: "\x1b[32m",
  greenBg: "\x1b[42m",
  white: "\x1b[37m",
  whiteBg: "\x1b[47m",
  brightRed: "\x1b[91m",
  brightYellow: "\x1b[93m",
  brightCyan: "\x1b[96m",
  brightGreen: "\x1b[92m",
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
      return `${COLOR.brightRed}${COLOR.bold}${sev}${COLOR.reset}`;
    case "HIGH":
      return `${COLOR.magenta}${COLOR.bold}${sev}${COLOR.reset}`;
    case "MEDIUM":
      return `${COLOR.brightYellow}${sev}${COLOR.reset}`;
    case "LOW":
      return `${COLOR.cyan}${sev}${COLOR.reset}`;
    default:
      return sev;
  }
}

function getBadgeForSeverity(sev: Severity): string {
  switch (sev) {
    case "CRITICAL":
      return `${COLOR.redBg}${COLOR.bold} ! ${COLOR.reset}`;
    case "HIGH":
      return `${COLOR.magentaBg}${COLOR.bold} ⚠ ${COLOR.reset}`;
    case "MEDIUM":
      return `${COLOR.yellowBg}${COLOR.bold} ○ ${COLOR.reset}`;
    case "LOW":
      return `${COLOR.cyanBg}${COLOR.bold} ○ ${COLOR.reset}`;
    default:
      return " ";
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
  const pct = Math.round(ratio * 100);
  return `${COLOR.brightGreen}${"█".repeat(filled)}${COLOR.gray}${"░".repeat(empty)}${COLOR.reset} ${COLOR.bold}${pct}%${COLOR.reset}`;
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

export type ScanUi = {
  start: (totalFiles: number, totalTargets?: number) => void;
  beginTarget: (index: number, total: number, name: string, files: number) => void;
  onFile: (filePath: string) => void;
  onFindings: (newFindings: Finding[]) => void;
  setCurrentFindings: (findings: Finding[]) => void;
  completeTarget: (summary: TargetSummary, findings?: Finding[]) => void;
  finish: () => void;
  getStats: () => ScanStats;
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
      getStats: () => ({
        startTime: 0,
        totalFiles: 0,
        scannedFiles: 0,
        totalFindings: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
      }),
    };
  }

  const startTime = Date.now();
  let endTime: number | undefined;
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
  let lastRenderTime = 0;
  let finished = false;
  let isFirstRender = true;
  let lastOutputLineCount = 0;
  const DEBOUNCE_DELAY = 200;
  const MIN_RENDER_INTERVAL = 100;

  const render = () => {
    scheduled = null;
    lastRenderTime = Date.now();
    const displayFindings = currentFindings.length > 0 ? currentFindings : lastFindings;
    const counts = summarizeFindings(displayFindings);

    const termWidth = Math.max(90, process.stdout.columns ?? 120);
    const width = Math.max(90, Math.min(termWidth, 160));
    const innerWidth = width - 2;

    const logoLines = LOGO_LINES.map((lineText) => {
      return center(gradientChunks(lineText, LOGO_COLORS), innerWidth);
    });

    const tagline = center(`${COLOR.dim}Security scanner for skills, browser extensions, Code Extensions and MCP servers${COLOR.reset}`, innerWidth);

    const elapsedTime = (Date.now() - startTime) / 1000;
    const headerText = `${COLOR.bold}🛡️  Security Scanner${COLOR.reset}`;
    const skillsText = `${COLOR.dim}Targets${COLOR.reset} ${COLOR.bold}${totalTargets}${COLOR.reset}`;
    const statusText = `${COLOR.dim}Files${COLOR.reset} ${COLOR.bold}${scannedFiles}/${totalFiles}${COLOR.reset}`;
    const timeText = `${COLOR.dim}Elapsed${COLOR.reset} ${COLOR.bold}${elapsedTime.toFixed(1)}s${COLOR.reset}`;
    const headerLine = pad(`${headerText}  ${skillsText}  ${statusText}  ${timeText}`, innerWidth - 2);

    const barWidth = Math.max(20, innerWidth - 40);
    const bar = progressBar(scannedFiles, totalFiles, barWidth);
    const progressText = `Progress: ${bar}`;

    const skillLine = currentTargetName
      ? `${COLOR.dim}Target${COLOR.reset} ${COLOR.bold}${currentTargetName}${COLOR.reset} (${currentTargetIndex}/${currentTargetTotal})  ${COLOR.dim}Files${COLOR.reset} ${currentTargetScanned}/${currentTargetFiles}`
      : `${COLOR.dim}Target${COLOR.reset} ${COLOR.gray}idle${COLOR.reset}`;

    const totalFindings = displayFindings.length;
    const hasCritical = counts.CRITICAL > 0;
    const hasHigh = counts.HIGH > 0;
    const hasMedium = counts.MEDIUM > 0;
    const findingsPart = hasCritical || hasHigh || hasMedium
      ? `${COLOR.bold}⚠️  Findings: ${totalFindings}${COLOR.reset} │ ${COLOR.brightRed}●${COLOR.reset}${counts.CRITICAL} ${COLOR.magenta}●${COLOR.reset}${counts.HIGH} ${COLOR.brightYellow}●${COLOR.reset}${counts.MEDIUM} ${COLOR.cyan}●${COLOR.reset}${counts.LOW}`
      : `${COLOR.dim}Findings: ${totalFindings}${COLOR.reset}`;

    const colSev = 12;
    const colFile = Math.max(28, Math.min(60, Math.floor(innerWidth * 0.40)));
    const colRule = 20;
    const colMsg = Math.max(20, innerWidth - (colSev + colFile + colRule + 8));

    const tableHeader = [
      pad(`${COLOR.bold}Severity${COLOR.reset}`, colSev),
      pad(`${COLOR.bold}File${COLOR.reset}`, colFile),
      pad(`${COLOR.bold}Rule${COLOR.reset}`, colRule),
      pad(`${COLOR.bold}Message${COLOR.reset}`, colMsg),
    ].join("  ");

    const rows: string[] = [];
    for (const finding of displayFindings.slice(0, 50)) {
      const severity = colorizeSeverity(finding.severity);
      const badge = getBadgeForSeverity(finding.severity);
      const fileLines = wrapText(finding.file, colFile);
      const ruleLines = wrapText(finding.ruleId, colRule);
      const msgLines = wrapText(finding.message, colMsg);
      const lineCount = Math.max(fileLines.length, ruleLines.length, msgLines.length, 1);

      for (let i = 0; i < lineCount; i++) {
        const sevCell = i === 0 ? `${badge} ${severity}` : "";
        rows.push(
          [
            pad(sevCell, colSev + 2),
            pad(fileLines[i] ?? "", colFile),
            pad(ruleLines[i] ?? "", colRule),
            pad(msgLines[i] ?? "", colMsg),
          ].join("  ")
        );
      }
    }

    const moreFindings = displayFindings.length > 50 ? displayFindings.length - 50 : 0;
    const body =
      rows.length > 0
        ? [
          ...rows,
          ...(moreFindings > 0 ? [pad(`${COLOR.gray}... and ${moreFindings} more findings${COLOR.reset}`, innerWidth - 2)] : []),
        ]
        : [
          pad(`${COLOR.gray}No findings yet.${COLOR.reset}`, innerWidth - 2),
        ];

    const completedHeader = [
      pad(`${COLOR.bold}Completed Target${COLOR.reset}`, Math.max(22, Math.floor(innerWidth * 0.35))),
      pad(`${COLOR.bold}Files${COLOR.reset}`, 8),
      pad(`${COLOR.bold}Findings${COLOR.reset}`, 10),
      pad(`${COLOR.bold}🔴${COLOR.reset}`, 3),
      pad(`${COLOR.bold}🟠${COLOR.reset}`, 3),
      pad(`${COLOR.bold}🟡${COLOR.reset}`, 3),
      pad(`${COLOR.bold}🔵${COLOR.reset}`, 3),
    ].join("  ");

    const completedRows = completed.map((item) => {
      return [
        pad(item.name, Math.max(22, Math.floor(innerWidth * 0.35))),
        pad(String(item.files), 8),
        pad(String(item.findings), 10),
        pad(String(item.counts.CRITICAL), 3),
        pad(String(item.counts.HIGH), 3),
        pad(String(item.counts.MEDIUM), 3),
        pad(String(item.counts.LOW), 3),
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
      line(findingsPart, innerWidth),
      mid,
      line(tableHeader, innerWidth),
      ...body.map((row) => line(row, innerWidth)),
      ...(completed.length > 0
        ? [mid, line(completedHeader, innerWidth), ...completedRows.map((row) => line(row, innerWidth))]
        : []),
      bottom,
    ].join("\n");

    if (isFirstRender) {
      // First render: clear entire screen, move to home, write output
      process.stdout.write("\x1b[2J\x1b[?25l\x1b[H" + output + "\n");
      isFirstRender = false;
      lastOutputLineCount = output.split("\n").length;
    } else {
      // Subsequent renders: move to home and write the same number of lines, leaving the rest untouched
      process.stdout.write("\x1b[H" + output + "\x1b[K");
      // Clear any lines below if needed
      const outputLineCount = output.split("\n").length;
      if (outputLineCount < lastOutputLineCount) {
        process.stdout.write("\x1b[J");
      }
      lastOutputLineCount = outputLineCount;
    }
  };

  const scheduleRender = () => {
    if (finished) return;
    if (scheduled) return;

    const timeSinceLastRender = Date.now() - lastRenderTime;
    if (timeSinceLastRender < MIN_RENDER_INTERVAL) {
      // If we just rendered, schedule the next render with a longer delay
      scheduled = setTimeout(render, DEBOUNCE_DELAY);
      return;
    }

    // Render immediately if enough time has passed
    render();
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
      endTime = Date.now();
      if (scheduled) {
        clearTimeout(scheduled);
        scheduled = null;
      }
      render();
      finished = true;
      // Show cursor again
      process.stdout.write("\x1b[?25h\n");
    },
    getStats() {
      const counts = summarizeFindings([...currentFindings, ...lastFindings]);
      return {
        startTime,
        endTime,
        totalFiles,
        scannedFiles,
        totalFindings: currentFindings.length + lastFindings.length,
        criticalCount: counts.CRITICAL,
        highCount: counts.HIGH,
        mediumCount: counts.MEDIUM,
        lowCount: counts.LOW,
      };
    },
  };
}
