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
  "███████╗██╗  ██╗██╗██╗     ██╗      ███████╗ ██████╗ █████╗ ███╗   ██╗███╗   ██╗███████╗██████╗ ",
  "██╔════╝██║ ██╔╝██║██║     ██║      ██╔════╝██╔════╝██╔══██╗████╗  ██║████╗  ██║██╔════╝██╔══██╗",
  "███████╗█████╔╝ ██║██║     ██║      ███████╗██║     ███████║██╔██╗ ██║██╔██╗ ██║█████╗  ██████╔╝",
  "╚════██║██╔═██╗ ██║██║     ██║      ╚════██║██║     ██╔══██║██║╚██╗██║██║╚██╗██║██╔══╝  ██╔══██╗",
  "███████║██║  ██╗██║███████╗███████╗ ███████║╚██████╗██║  ██║██║ ╚████║██║ ╚████║███████╗██║  ██║",
  "╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝",
];

const GRAYS = [
  "\x1b[38;5;250m",
  "\x1b[38;5;248m",
  "\x1b[38;5;245m",
  "\x1b[38;5;243m",
  "\x1b[38;5;240m",
  "\x1b[38;5;238m",
];

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

export type SkillSummary = {
  name: string;
  files: number;
  findings: number;
  counts: Record<Severity, number>;
};

export type Tui = {
  start: (totalFiles: number, totalSkills?: number) => void;
  beginSkill: (index: number, total: number, name: string, files: number) => void;
  onFile: (filePath: string) => void;
  onFindings: (newFindings: Finding[]) => void;
  setCurrentFindings: (findings: Finding[]) => void;
  completeSkill: (summary: SkillSummary, findings?: Finding[]) => void;
  finish: () => void;
};

export function createTui(enabled: boolean): Tui {
  if (!enabled) {
    return {
      start: () => { },
      onFile: () => { },
      onFindings: () => { },
      finish: () => { },
    };
  }

  let totalFiles = 0;
  let totalSkills = 0;
  let scannedFiles = 0;
  let currentFile = "";
  let currentSkillIndex = 0;
  let currentSkillTotal = 0;
  let currentSkillName = "";
  let currentSkillFiles = 0;
  let currentSkillScanned = 0;
  const currentFindings: Finding[] = [];
  const lastFindings: Finding[] = [];
  let lastFindingsLabel = "";
  const completed: SkillSummary[] = [];
  let scheduled: NodeJS.Timeout | null = null;
  let finished = false;

  const render = () => {
    scheduled = null;
    const displayFindings = currentFindings.length > 0 ? currentFindings : lastFindings;
    const counts = summarizeFindings(displayFindings);

    const termWidth = Math.max(90, process.stdout.columns ?? 120);
    const width = Math.max(90, Math.min(termWidth, 140));
    const innerWidth = width - 2;

    const logoLines = LOGO_LINES.map((lineText, i) => {
      const color = GRAYS[i % GRAYS.length];
      return center(`${color}${lineText}${COLOR.reset}`, innerWidth);
    });

    const tagline = center(`${COLOR.dim}Agent skill security scanner${COLOR.reset}`, innerWidth);

    const headerText = `${COLOR.bold}Skill Scanner${COLOR.reset}`;
    const skillsText = `${COLOR.dim}Skills${COLOR.reset} ${totalSkills}`;
    const statusText = `${COLOR.dim}Files${COLOR.reset} ${scannedFiles}/${totalFiles}`;
    const headerLine = pad(`${headerText}  ${skillsText}  ${statusText}`, innerWidth - 2);

    const barWidth = Math.max(20, innerWidth - 30);
    const bar = progressBar(scannedFiles, totalFiles, barWidth);
    const progressText = `Progress: ${bar} ${scannedFiles}/${totalFiles}`;

    const skillLine = currentSkillName
      ? `${COLOR.dim}Skill${COLOR.reset}: ${currentSkillName} (${currentSkillIndex}/${currentSkillTotal})  ${COLOR.dim}Skill Files${COLOR.reset}: ${currentSkillScanned}/${currentSkillFiles}`
      : `${COLOR.dim}Skill${COLOR.reset}: -`;

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
      pad(`${COLOR.bold}Completed Skill${COLOR.reset}`, Math.max(20, Math.floor(innerWidth * 0.4))),
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
      totalSkills = skills;
      scheduleRender();
    },
    beginSkill(index, total, name, files) {
      currentSkillIndex = index;
      currentSkillTotal = total;
      currentSkillName = name;
      currentSkillFiles = files;
      currentSkillScanned = 0;
      currentFindings.length = 0;
      scheduleRender();
    },
    onFile(filePath) {
      scannedFiles += 1;
      currentSkillScanned += 1;
      currentFile = filePath;
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
    completeSkill(summary, findings = []) {
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
