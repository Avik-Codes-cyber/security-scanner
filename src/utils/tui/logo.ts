import { COLOR, LOGO_COLORS } from "./colors";
import { center, gradientChunks } from "./formatters";

/**
 * ASCII art logo lines
 */
export const LOGO_LINES = [
  "███████╗███████╗ ██████╗██╗   ██╗██████╗ ██╗████████╗██╗   ██╗",
  "██╔════╝██╔════╝██╔════╝██║   ██║██╔══██╗██║╚══██╔══╝╚██╗ ██╔╝",
  "███████╗█████╗  ██║     ██║   ██║██████╔╝██║   ██║    ╚████╔╝ ",
  "╚════██║██╔══╝  ██║     ██║   ██║██╔══██╗██║   ██║     ╚██╔╝  ",
  "███████║███████╗╚██████╗╚██████╔╝██║  ██║██║   ██║      ██║   ",
  "╚══════╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝   ╚═╝      ╚═╝   ",
];

/**
 * Render the logo with gradient colors
 */
export function renderLogo(innerWidth: number): string[] {
  return LOGO_LINES.map((lineText) => {
    return center(gradientChunks(lineText, LOGO_COLORS), innerWidth);
  });
}

/**
 * Render the tagline centered within the given width
 */
export function renderTagline(innerWidth: number): string {
  return center(
    `${COLOR.dim}Security scanner for skills, browser extensions, Code Extensions and MCP servers${COLOR.reset}`,
    innerWidth
  );
}
