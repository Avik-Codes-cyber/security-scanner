/**
 * Platform-specific utility functions
 */

/**
 * Gets the user's home directory path
 * Works across Windows, macOS, and Linux
 */
export function getHomeDir(): string | null {
    return process.env.HOME ?? process.env.USERPROFILE ?? null;
}
