/**
 * Interactive Prompts
 * 
 * Provides reusable prompt components for interactive CLI
 */

import type { InteractiveChoice } from "./types";
import {
    enableRawMode,
    disableRawMode,
    waitForKey,
    hideCursor,
    showCursor,
} from "./input";

const COLORS = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
};

/**
 * Display a single-select prompt
 */
export async function selectPrompt(
    message: string,
    choices: InteractiveChoice[]
): Promise<string> {
    let selectedIndex = 0;
    let rendered = false;

    const render = () => {
        // Clear screen from cursor down
        if (rendered) {
            process.stdout.write('\x1b[J');
            process.stdout.write(`\x1b[${choices.length + 1}A`);
        }

        process.stdout.write(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset}\n`);

        choices.forEach((choice, index) => {
            const isSelected = index === selectedIndex;
            const prefix = isSelected ? `${COLORS.cyan}❯${COLORS.reset}` : " ";
            const label = isSelected ? `${COLORS.cyan}${choice.label}${COLORS.reset}` : choice.label;
            const desc = choice.description ? ` ${COLORS.dim}(${choice.description})${COLORS.reset}` : "";
            process.stdout.write(`${prefix} ${label}${desc}\n`);
        });

        rendered = true;
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
                process.stdout.write('\x1b[J');
                process.stdout.write(`\x1b[${choices.length + 1}A`);
                console.log(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.cyan}${choices[selectedIndex].label}${COLORS.reset}`);
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
    let rendered = false;

    const render = () => {
        // Clear screen from cursor down
        if (rendered) {
            process.stdout.write('\x1b[J');
            process.stdout.write(`\x1b[${choices.length + 1}A`);
        }

        process.stdout.write(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.dim}(Space to select, Enter to confirm)${COLORS.reset}\n`);

        choices.forEach((choice, index) => {
            const isHighlighted = index === selectedIndex;
            const isSelected = selected.has(index);
            const prefix = isHighlighted ? `${COLORS.cyan}❯${COLORS.reset}` : " ";
            const checkbox = isSelected ? `${COLORS.green}◉${COLORS.reset}` : "◯";
            const label = isHighlighted ? `${COLORS.cyan}${choice.label}${COLORS.reset}` : choice.label;
            const desc = choice.description ? ` ${COLORS.dim}(${choice.description})${COLORS.reset}` : "";
            process.stdout.write(`${prefix} ${checkbox} ${label}${desc}\n`);
        });

        rendered = true;
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
                process.stdout.write('\x1b[J');
                process.stdout.write(`\x1b[${choices.length + 1}A`);
                const selectedLabels = Array.from(selected)
                    .map((i) => choices[i].label)
                    .join(", ");
                console.log(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.cyan}${selectedLabels || "None"}${COLORS.reset}`);
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
        console.log(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.dim}${hint}${COLORS.reset}`);

        const key = await waitForKey();

        // Move up and clear
        process.stdout.write('\x1b[1A\x1b[2K');

        if (key.name === "return") {
            const answer = defaultValue ? "Yes" : "No";
            console.log(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.cyan}${answer}${COLORS.reset}`);
            return defaultValue;
        } else if (key.name === "y") {
            console.log(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.cyan}Yes${COLORS.reset}`);
            return true;
        } else if (key.name === "n") {
            console.log(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.cyan}No${COLORS.reset}`);
            return false;
        } else if (key.name === "c" && key.ctrl) {
            throw new Error("User cancelled");
        }

        // Invalid input, use default
        const answer = defaultValue ? "Yes" : "No";
        console.log(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.cyan}${answer}${COLORS.reset}`);
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

    const hint = defaultValue ? ` ${COLORS.dim}(${defaultValue})${COLORS.reset}` : "";
    process.stdout.write(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset}${hint}: `);

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
                        console.log(`${COLORS.cyan}?${COLORS.reset} ${COLORS.bold}${message}${COLORS.reset} ${COLORS.cyan}${result}${COLORS.reset}`);
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
