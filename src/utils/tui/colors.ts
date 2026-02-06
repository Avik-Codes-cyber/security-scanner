/**
 * ANSI color codes for terminal output
 */
export const COLOR = {
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
} as const;

/**
 * Color palette for logo gradient effect
 */
export const LOGO_COLORS = [
  "\x1b[38;5;33m",  // deep blue
  "\x1b[38;5;39m",  // blue
  "\x1b[38;5;45m",  // cyan
];
