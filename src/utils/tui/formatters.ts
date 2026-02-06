import { COLOR } from "./colors";

/**
 * Remove ANSI escape codes from text
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Calculate visible length of text (excluding ANSI codes)
 */
export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

/**
 * Pad text to a fixed width (accounting for ANSI codes)
 */
export function pad(text: string, width: number): string {
  const len = visibleLength(text);
  if (len >= width) return text;
  return text + " ".repeat(width - len);
}

/**
 * Center text within a given width
 */
export function center(text: string, width: number): string {
  const len = visibleLength(text);
  if (len >= width) return text;
  const left = Math.floor((width - len) / 2);
  const right = width - len - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

/**
 * Create a bordered line for the TUI box
 */
export function line(text: string, width: number): string {
  return `│ ${pad(text, width - 2)} │`;
}

/**
 * Create a horizontal divider line
 */
export function divider(width: number, left = "├", mid = "─", right = "┤"): string {
  return `${left}${mid.repeat(width)}${right}`;
}

/**
 * Wrap text to fit within a given width
 */
export function wrapText(text: string, width: number): string[] {
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

/**
 * Apply gradient coloring to text using a color palette
 */
export function gradientChunks(text: string, palette: string[]): string {
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
