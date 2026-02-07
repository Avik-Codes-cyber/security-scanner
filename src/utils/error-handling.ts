/**
 * Utility functions for consistent error handling across the codebase
 */

/**
 * Formats an error for logging, extracting the message if it's an Error instance
 */
export function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Logs a warning message in DEBUG mode only
 */
export function debugWarn(message: string, error?: unknown): void {
    if (process.env.DEBUG) {
        if (error) {
            console.warn(`${message}:`, formatError(error));
        } else {
            console.warn(message);
        }
    }
}

/**
 * Always logs a warning message (not gated by DEBUG mode)
 */
export function warn(message: string, error?: unknown): void {
    if (error) {
        console.warn(`${message}:`, formatError(error));
    } else {
        console.warn(message);
    }
}
