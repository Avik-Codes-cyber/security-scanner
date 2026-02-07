/**
 * Interactive Prompts
 * 
 * Provides reusable prompt components for interactive CLI
 */

import cliTruncate from 'cli-truncate';
import type { InteractiveChoice } from "./types";
import {
    enableRawMode,
    disableRawMode,
    waitForKey,
    hideCursor,
    showCursor,
} from "./input";
import { COLOR } from "../../utils/tui/colors";

/**
 * Get terminal width with fallback
 */
function getTerminalWidth(): number {
    return process.stdout.columns || 80;
}

/**
 * Strip ANSI color codes to get actual string length
 */
function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Truncate text to fit terminal width, accounting for ANSI codes
 */
function truncateForTerminal(text: string, maxWidth: number): string {
    const stripped = stripAnsi(text);
    if (stripped.length <= maxWidth) {
        return text;
    }

    // Find ANSI codes in original text
    const ansiCodes: string[] = [];
    const ansiRegex = /\x1b\[[0-9;]*m/g;
    let match;
    while ((match = ansiRegex.exec(text)) !== null) {
        ansiCodes.push(match[0]);
    }

    // Truncate the stripped version
    const truncated = cliTruncate(stripped, maxWidth);

    // If we have ANSI codes, try to preserve them
    if (ansiCodes.length > 0) {
        return ansiCodes[0] + truncated + COLOR.reset;
    }

    return truncated;
}

/**
 * Display a single-select prompt
 */
export async function selectPrompt(
    message: string,
    choices: InteractiveChoice[]
): Promise<string> {
    let selectedIndex = 0;
    let lastLineCount = 0;
    const termWidth = getTerminalWidth();

    const clearPrevious = () => {
        if (lastLineCount > 0) {
            // Move up to start
            process.stdout.write(`\x1b[${lastLineCount}A`);
            // Clear each line
            for (let i = 0; i < lastLineCount; i++) {
                process.stdout.write('\x1b[2K\r'); // Clear line and return to start
                if (i < lastLineCount - 1) {
                    process.stdout.write('\x1b[1B'); // Move down one line
                }
            }
            // Move back to start
            process.stdout.write(`\x1b[${lastLineCount - 1}A\r`);
        }
    };

    const render = () => {
        clearPrevious();

        const lines: string[] = [];
        lines.push(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset}`);

        choices.forEach((choice, index) => {
            const isSelected = index === selectedIndex;
            const prefix = isSelected ? `${COLOR.cyan}❯${COLOR.reset}` : " ";
            const label = isSelected ? `${COLOR.cyan}${choice.label}${COLOR.reset}` : choice.label;
            const desc = choice.description ? ` ${COLOR.dim}(${choice.description})${COLOR.reset}` : "";
            const fullText = `${prefix} ${label}${desc}`;
            const truncated = truncateForTerminal(fullText, termWidth - 2);
            lines.push(truncated);
        });

        // Write all lines
        process.stdout.write(lines.join('\n') + '\n');
        lastLineCount = lines.length;
    };

    enableRawMode();
    hideCursor();

    try {
        render();

        while (true) {
            const key = await waitForKey();

            if (key.name === "up" && selectedIndex > 0) {
                selectedIndex--;
                render();
            } else if (key.name === "down" && selectedIndex < choices.length - 1) {
                selectedIndex++;
                render();
            } else if (key.name === "return") {
                // Clear and show final result
                clearPrevious();
                const resultText = `${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.cyan}${choices[selectedIndex].label}${COLOR.reset}`;
                console.log(truncateForTerminal(resultText, termWidth - 2));
                return choices[selectedIndex].value;
            } else if (key.name === "c" && key.ctrl) {
                throw new Error("User cancelled");
            }
        }
    } finally {
        disableRawMode();
        showCursor();
    }
}

/**
 * Display a multi-select prompt
 */
export async function multiselectPrompt(
    message: string,
    choices: InteractiveChoice[]
): Promise<string[]> {
    let selectedIndex = 0;
    const selected = new Set<number>(
        choices.map((c, i) => (c.selected ? i : -1)).filter((i) => i >= 0)
    );
    let lastLineCount = 0;
    const termWidth = getTerminalWidth();

    const clearPrevious = () => {
        if (lastLineCount > 0) {
            // Move up to start
            process.stdout.write(`\x1b[${lastLineCount}A`);
            // Clear each line
            for (let i = 0; i < lastLineCount; i++) {
                process.stdout.write('\x1b[2K\r'); // Clear line and return to start
                if (i < lastLineCount - 1) {
                    process.stdout.write('\x1b[1B'); // Move down one line
                }
            }
            // Move back to start
            process.stdout.write(`\x1b[${lastLineCount - 1}A\r`);
        }
    };

    const render = () => {
        clearPrevious();

        const lines: string[] = [];
        lines.push(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.dim}(Space to select, Enter to confirm)${COLOR.reset}`);

        choices.forEach((choice, index) => {
            const isHighlighted = index === selectedIndex;
            const isSelected = selected.has(index);
            const prefix = isHighlighted ? `${COLOR.cyan}❯${COLOR.reset}` : " ";
            const checkbox = isSelected ? `${COLOR.green}◉${COLOR.reset}` : "◯";
            const label = isHighlighted ? `${COLOR.cyan}${choice.label}${COLOR.reset}` : choice.label;
            const desc = choice.description ? ` ${COLOR.dim}(${choice.description})${COLOR.reset}` : "";
            const fullText = `${prefix} ${checkbox} ${label}${desc}`;
            const truncated = truncateForTerminal(fullText, termWidth - 2);
            lines.push(truncated);
        });

        // Write all lines
        process.stdout.write(lines.join('\n') + '\n');
        lastLineCount = lines.length;
    };

    enableRawMode();
    hideCursor();

    try {
        render();

        while (true) {
            const key = await waitForKey();

            if (key.name === "up" && selectedIndex > 0) {
                selectedIndex--;
                render();
            } else if (key.name === "down" && selectedIndex < choices.length - 1) {
                selectedIndex++;
                render();
            } else if (key.name === "space") {
                if (selected.has(selectedIndex)) {
                    selected.delete(selectedIndex);
                } else {
                    selected.add(selectedIndex);
                }
                render();
            } else if (key.name === "return") {
                // Clear and show final result
                clearPrevious();
                const selectedLabels = Array.from(selected)
                    .map((i) => choices[i].label)
                    .join(", ");
                const resultText = `${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.cyan}${selectedLabels || "None"}${COLOR.reset}`;
                console.log(truncateForTerminal(resultText, termWidth - 2));
                return Array.from(selected).map((i) => choices[i].value);
            } else if (key.name === "c" && key.ctrl) {
                throw new Error("User cancelled");
            }
        }
    } finally {
        disableRawMode();
        showCursor();
    }
}

/**
 * Display a confirmation prompt
 */
export async function confirmPrompt(
    message: string,
    defaultValue = true
): Promise<boolean> {
    const hint = defaultValue ? "(Y/n)" : "(y/N)";

    enableRawMode();

    try {
        console.log(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.dim}${hint}${COLOR.reset}`);

        const key = await waitForKey();

        // Move up and clear
        process.stdout.write('\x1b[1A\x1b[2K');

        if (key.name === "return") {
            const answer = defaultValue ? "Yes" : "No";
            console.log(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.cyan}${answer}${COLOR.reset}`);
            return defaultValue;
        } else if (key.name === "y") {
            console.log(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.cyan}Yes${COLOR.reset}`);
            return true;
        } else if (key.name === "n") {
            console.log(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.cyan}No${COLOR.reset}`);
            return false;
        } else if (key.name === "c" && key.ctrl) {
            throw new Error("User cancelled");
        }

        // Invalid input, use default
        const answer = defaultValue ? "Yes" : "No";
        console.log(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.cyan}${answer}${COLOR.reset}`);
        return defaultValue;
    } finally {
        disableRawMode();
    }
}

/**
 * Display an input prompt
 */
export async function inputPrompt(
    message: string,
    defaultValue = ""
): Promise<string> {
    // Ensure stdin is set up properly
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }

    // Make sure stdin is readable
    if (process.stdin.readable) {
        process.stdin.resume();
    }

    process.stdin.setEncoding('utf8');
    showCursor();

    const hint = defaultValue ? ` ${COLOR.dim}(${defaultValue})${COLOR.reset}` : "";
    process.stdout.write(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset}${hint}: `);

    return new Promise((resolve, reject) => {
        let input = "";
        let resolved = false;

        const handler = (chunk: any) => {
            if (resolved) return;

            const str = chunk.toString('utf8');

            // Handle each character
            for (let i = 0; i < str.length; i++) {
                const char = str[i];
                const code = str.charCodeAt(i);

                // Enter key (CR or LF)
                if (code === 13 || code === 10) {
                    if (!resolved) {
                        resolved = true;
                        process.stdin.removeListener("data", handler);
                        process.stdin.pause();
                        process.stdout.write("\n");
                        const result = input.trim() || defaultValue;
                        // Move up and clear, then show result
                        process.stdout.write('\x1b[1A\x1b[2K');
                        console.log(`${COLOR.cyan}?${COLOR.reset} ${COLOR.bold}${message}${COLOR.reset} ${COLOR.cyan}${result}${COLOR.reset}`);
                        resolve(result);
                        return;
                    }
                }
                // Ctrl+C
                else if (code === 3) {
                    if (!resolved) {
                        resolved = true;
                        process.stdin.removeListener("data", handler);
                        process.stdin.pause();
                        reject(new Error("User cancelled"));
                        return;
                    }
                }
                // Backspace or Delete
                else if (code === 127 || code === 8) {
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        process.stdout.write("\b \b");
                    }
                }
                // Printable characters
                else if (code >= 32 && code <= 126) {
                    input += char;
                    process.stdout.write(char);
                }
            }
        };

        process.stdin.on("data", handler);
    });
}
