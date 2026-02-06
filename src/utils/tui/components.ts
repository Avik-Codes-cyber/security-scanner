import type { Severity } from "../../scanner/types.ts";
import { COLOR } from "./colors";

/**
 * Colorize severity level with appropriate styling
 */
export function colorizeSeverity(sev: Severity): string {
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

/**
 * Get a colored badge icon for severity level
 */
export function getBadgeForSeverity(sev: Severity): string {
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

/**
 * Render an ASCII progress bar
 */
export function progressBar(current: number, total: number, width: number): string {
  if (total <= 0) return "";
  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(width * ratio);
  const empty = Math.max(0, width - filled);
  const pct = Math.round(ratio * 100);
  return `${COLOR.brightGreen}${"█".repeat(filled)}${COLOR.gray}${"░".repeat(empty)}${COLOR.reset} ${COLOR.bold}${pct}%${COLOR.reset}`;
}
