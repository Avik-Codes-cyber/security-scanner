import type { Finding, Severity } from "../../scanner/types.ts";
import type { TargetSummary } from "./types";
import { summarizeFindings } from "../../scanner/report";
import { COLOR } from "./colors";
import { pad, line, wrapText } from "./formatters";
import { colorizeSeverity, getBadgeForSeverity, progressBar } from "./components";
import { renderLogo, renderTagline } from "./logo";
import { colorizeConfidence } from "../../scanner/reporting/formatters";

/**
 * State required for rendering the TUI
 */
export interface RenderState {
  startTime: number;
  totalFiles: number;
  totalTargets: number;
  scannedFiles: number;
  currentTargetIndex: number;
  currentTargetTotal: number;
  currentTargetName: string;
  currentTargetFiles: number;
  currentTargetScanned: number;
  currentFindings: Finding[];
  lastFindings: Finding[];
  completed: TargetSummary[];
  showConfidence?: boolean;
}

/**
 * Build the header section with stats
 */
function buildHeader(state: RenderState, innerWidth: number): string {
  const elapsedTime = (Date.now() - state.startTime) / 1000;
  const headerText = `${COLOR.bold}🛡️  Security Scanner${COLOR.reset}`;
  const skillsText = `${COLOR.dim}Targets${COLOR.reset} ${COLOR.bold}${state.totalTargets}${COLOR.reset}`;
  const statusText = `${COLOR.dim}Files${COLOR.reset} ${COLOR.bold}${state.scannedFiles}/${state.totalFiles}${COLOR.reset}`;
  const timeText = `${COLOR.dim}Elapsed${COLOR.reset} ${COLOR.bold}${elapsedTime.toFixed(1)}s${COLOR.reset}`;
  return pad(`${headerText}  ${skillsText}  ${statusText}  ${timeText}`, innerWidth - 2);
}

/**
 * Build the progress bar line
 */
function buildProgressLine(state: RenderState, innerWidth: number): string {
  const barWidth = Math.max(20, innerWidth - 40);
  const bar = progressBar(state.scannedFiles, state.totalFiles, barWidth);
  return `Progress: ${bar}`;
}

/**
 * Build the current target status line
 */
function buildTargetLine(state: RenderState): string {
  if (state.currentTargetName) {
    return `${COLOR.dim}Target${COLOR.reset} ${COLOR.bold}${state.currentTargetName}${COLOR.reset} (${state.currentTargetIndex}/${state.currentTargetTotal})  ${COLOR.dim}Files${COLOR.reset} ${state.currentTargetScanned}/${state.currentTargetFiles}`;
  }
  return `${COLOR.dim}Target${COLOR.reset} ${COLOR.gray}idle${COLOR.reset}`;
}

/**
 * Build the findings summary line
 */
function buildFindingsSummary(counts: Record<Severity, number>, totalFindings: number): string {
  const hasCritical = counts.CRITICAL > 0;
  const hasHigh = counts.HIGH > 0;
  const hasMedium = counts.MEDIUM > 0;

  if (hasCritical || hasHigh || hasMedium) {
    return `${COLOR.bold}⚠️  Findings: ${totalFindings}${COLOR.reset} │ ${COLOR.brightRed}●${COLOR.reset}${counts.CRITICAL} ${COLOR.magenta}●${COLOR.reset}${counts.HIGH} ${COLOR.brightYellow}●${COLOR.reset}${counts.MEDIUM} ${COLOR.cyan}●${COLOR.reset}${counts.LOW}`;
  }
  return `${COLOR.dim}Findings: ${totalFindings}${COLOR.reset}`;
}

/**
 * Build the findings table header
 */
function buildTableHeader(colSev: number, colFile: number, colRule: number, colMsg: number, showConfidence: boolean = false, colConf?: number): string {
  const columns = [
    pad(`${COLOR.bold}Severity${COLOR.reset}`, colSev),
    pad(`${COLOR.bold}File${COLOR.reset}`, colFile),
    pad(`${COLOR.bold}Rule${COLOR.reset}`, colRule),
    pad(`${COLOR.bold}Message${COLOR.reset}`, colMsg),
  ];

  if (showConfidence && colConf) {
    columns.push(pad(`${COLOR.bold}Confidence${COLOR.reset}`, colConf));
  }

  return columns.join("  ");
}

/**
 * Build finding rows for the table
 */
function buildFindingRows(
  findings: Finding[],
  colSev: number,
  colFile: number,
  colRule: number,
  colMsg: number,
  maxRows: number = 50,
  showConfidence: boolean = false,
  colConf?: number
): string[] {
  const rows: string[] = [];

  for (const finding of findings.slice(0, maxRows)) {
    const severity = colorizeSeverity(finding.severity);
    const badge = getBadgeForSeverity(finding.severity);
    const fileLines = wrapText(finding.file, colFile);
    const ruleLines = wrapText(finding.ruleId, colRule);
    const msgLines = wrapText(finding.message, colMsg);
    const confLines = showConfidence && colConf ? [colorizeConfidence(finding.confidence)] : [];
    const lineCount = Math.max(fileLines.length, ruleLines.length, msgLines.length, confLines.length, 1);

    for (let i = 0; i < lineCount; i++) {
      const sevCell = i === 0 ? `${badge} ${severity}` : "";
      const columns = [
        pad(sevCell, colSev + 2),
        pad(fileLines[i] ?? "", colFile),
        pad(ruleLines[i] ?? "", colRule),
        pad(msgLines[i] ?? "", colMsg),
      ];

      if (showConfidence && colConf) {
        columns.push(pad(i === 0 ? confLines[0] ?? "" : "", colConf));
      }

      rows.push(columns.join("  "));
    }
  }

  return rows;
}

/**
 * Build the completed targets section
 */
function buildCompletedSection(completed: TargetSummary[], innerWidth: number): string[] {
  if (completed.length === 0) return [];

  const nameWidth = Math.max(22, Math.floor(innerWidth * 0.35));

  const header = [
    pad(`${COLOR.bold}Completed Target${COLOR.reset}`, nameWidth),
    pad(`${COLOR.bold}Files${COLOR.reset}`, 8),
    pad(`${COLOR.bold}Findings${COLOR.reset}`, 10),
    pad(`${COLOR.bold}🔴${COLOR.reset}`, 3),
    pad(`${COLOR.bold}🟠${COLOR.reset}`, 3),
    pad(`${COLOR.bold}🟡${COLOR.reset}`, 3),
    pad(`${COLOR.bold}🔵${COLOR.reset}`, 3),
  ].join("  ");

  const rows = completed.map((item) => {
    return [
      pad(item.name, nameWidth),
      pad(String(item.files), 8),
      pad(String(item.findings), 10),
      pad(String(item.counts.CRITICAL), 3),
      pad(String(item.counts.HIGH), 3),
      pad(String(item.counts.MEDIUM), 3),
      pad(String(item.counts.LOW), 3),
    ].join("  ");
  });

  return [header, ...rows];
}

/**
 * Render the complete TUI frame
 */
export function renderFrame(state: RenderState, showLogo: boolean = true, showFindings: boolean = true): string {
  const displayFindings = state.currentFindings.length > 0 ? state.currentFindings : state.lastFindings;
  const counts = summarizeFindings(displayFindings);

  const termWidth = Math.max(90, process.stdout.columns ?? 120);
  const width = Math.max(90, Math.min(termWidth, 160));
  const innerWidth = width - 2;

  // Logo and tagline (only on first render)
  const logoLines = showLogo ? renderLogo(innerWidth) : [];
  const tagline = showLogo ? renderTagline(innerWidth) : "";

  // Header section
  const headerLine = buildHeader(state, innerWidth);
  const progressText = buildProgressLine(state, innerWidth);
  const skillLine = buildTargetLine(state);
  const findingsPart = buildFindingsSummary(counts, displayFindings.length);

  // Box borders
  const top = `┌${"─".repeat(innerWidth)}┐`;
  const mid = `├${"─".repeat(innerWidth)}┤`;
  const bottom = `└${"─".repeat(innerWidth)}┘`;

  // If not showing findings, just show progress
  if (!showFindings) {
    return [
      ...(showLogo ? ["", ...logoLines, tagline, ""] : []),
      top,
      line(headerLine, innerWidth),
      line(progressText, innerWidth),
      line(skillLine, innerWidth),
      line(findingsPart, innerWidth),
      bottom,
    ].join("\n");
  }

  // Table columns
  const colSev = 12;
  const colFile = Math.max(28, Math.min(60, Math.floor(innerWidth * 0.40)));
  const colRule = 20;
  const colConf = state.showConfidence ? 12 : 0;
  const colMsg = Math.max(20, innerWidth - (colSev + colFile + colRule + colConf + (state.showConfidence ? 10 : 8)));

  const tableHeader = buildTableHeader(colSev, colFile, colRule, colMsg, state.showConfidence, colConf);
  const rows = buildFindingRows(displayFindings, colSev, colFile, colRule, colMsg, 50, state.showConfidence, colConf);

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

  // Completed section
  const completedRows = buildCompletedSection(state.completed, innerWidth);

  return [
    ...(showLogo ? ["", ...logoLines, tagline, ""] : []),
    top,
    line(headerLine, innerWidth),
    line(progressText, innerWidth),
    line(skillLine, innerWidth),
    line(findingsPart, innerWidth),
    mid,
    line(tableHeader, innerWidth),
    ...body.map((row) => line(row, innerWidth)),
    ...(completedRows.length > 0
      ? [mid, ...completedRows.map((row) => line(row, innerWidth))]
      : []),
    bottom,
  ].join("\n");
}
