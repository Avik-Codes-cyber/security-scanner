/**
 * Interactive Input Handling
 * 
 * Provides low-level keyboard input handling for interactive prompts
 */

import type { KeyPress } from "./types";

/**
 * Enable raw mode for stdin to capture keypresses
 */
export function enableRawMode(): void {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
}

/**
 * Disable raw mode and restore normal stdin behavior
 */
export function disableRawMode(): void {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }
}

/**
 * Parse a raw buffer into a KeyPress object
 */
export function parseKeyPress(buffer: Buffer): KeyPress | null {
    const str = buffer.toString();

    // Special keys
    if (str === "\r" || str === "\n") {
        return { name: "return", ctrl: false, meta: false, shift: false };
    }
    if (str === "\x1b") {
        return { name: "escape", ctrl: false, meta: false, shift: false };
    }
    if (str === "\x03") {
        return { name: "c", ctrl: true, meta: false, shift: false };
    }
    if (str === " ") {
        return { name: "space", ctrl: false, meta: false, shift: false };
    }
    if (str === "\x7f" || str === "\b") {
        return { name: "backspace", ctrl: false, meta: false, shift: false };
    }

    // Arrow keys
    if (str === "\x1b[A") {
        return { name: "up", ctrl: false, meta: false, shift: false };
    }
    if (str === "\x1b[B") {
        return { name: "down", ctrl: false, meta: false, shift: false };
    }
    if (str === "\x1b[C") {
        return { name: "right", ctrl: false, meta: false, shift: false };
    }
    if (str === "\x1b[D") {
        return { name: "left", ctrl: false, meta: false, shift: false };
    }

    // Regular characters
    if (str.length === 1 && str >= "a" && str <= "z") {
        return { name: str, ctrl: false, meta: false, shift: false };
    }
    if (str.length === 1 && str >= "A" && str <= "Z") {
        return { name: str.toLowerCase(), ctrl: false, meta: false, shift: true };
    }

    return null;
}

/**
 * Wait for a single keypress and return the parsed key
 */
export async function waitForKey(): Promise<KeyPress> {
    return new Promise((resolve) => {
        const handler = (buffer: Buffer) => {
            const key = parseKeyPress(buffer);
            if (key) {
                process.stdin.off("data", handler);
                resolve(key);
            }
        };
        process.stdin.on("data", handler);
    });
}

/**
 * Clear the current line in the terminal
 */
export function clearLine(): void {
    process.stdout.write("\x1b[2K\r");
}

/**
 * Move cursor up n lines
 */
export function moveCursorUp(n: number): void {
    if (n > 0) {
        process.stdout.write(`\x1b[${n}A`);
    }
}

/**
 * Hide the cursor
 */
export function hideCursor(): void {
    process.stdout.write("\x1b[?25l");
}

/**
 * Show the cursor
 */
export function showCursor(): void {
    process.stdout.write("\x1b[?25h");
}
