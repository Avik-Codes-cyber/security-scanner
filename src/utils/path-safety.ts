import { lstat, realpath } from "fs/promises";
import { resolve, dirname } from "path";

/**
 * Safety utilities for path handling to prevent common issues
 */

const visitedPaths = new Set<string>();

/**
 * Check if a path is safe to scan (no circular symlinks, readable, etc.)
 */
export async function isSafePath(path: string, rootPath?: string): Promise<{ safe: boolean; reason?: string }> {
    try {
        // Check if path exists and is readable
        const stats = await lstat(path);

        // If it's a symlink, check for circular references
        if (stats.isSymbolicLink()) {
            try {
                const realPath = await realpath(path);
                const resolvedPath = resolve(realPath);

                // Check if we've already visited this path (circular symlink)
                if (visitedPaths.has(resolvedPath)) {
                    return { safe: false, reason: "Circular symlink detected" };
                }

                // Check if symlink points outside root (if root is specified)
                if (rootPath) {
                    const resolvedRoot = resolve(rootPath);
                    if (!resolvedPath.startsWith(resolvedRoot)) {
                        return { safe: false, reason: "Symlink points outside scan root" };
                    }
                }

                visitedPaths.add(resolvedPath);
            } catch (err) {
                return { safe: false, reason: "Broken symlink" };
            }
        }

        // Check if it's a special file (device, socket, pipe)
        if (!stats.isFile() && !stats.isDirectory() && !stats.isSymbolicLink()) {
            return { safe: false, reason: "Special file (device/socket/pipe)" };
        }

        return { safe: true };
    } catch (err: any) {
        if (err.code === "EACCES" || err.code === "EPERM") {
            return { safe: false, reason: "Permission denied" };
        }
        if (err.code === "ENOENT") {
            return { safe: false, reason: "File not found" };
        }
        return { safe: false, reason: `Error: ${err.message}` };
    }
}

/**
 * Reset visited paths tracking (call before each scan)
 */
export function resetPathTracking(): void {
    visitedPaths.clear();
}

/**
 * Check if a file has a null byte (likely binary)
 */
export async function hasNullByte(filePath: string): Promise<boolean> {
    try {
        const file = Bun.file(filePath);
        const buffer = await file.slice(0, 8192).arrayBuffer(); // Check first 8KB
        const bytes = new Uint8Array(buffer);
        return bytes.includes(0);
    } catch {
        return false;
    }
}

/**
 * Detect special files by name (no extension)
 */
export function detectSpecialFile(filename: string): string | null {
    const specialFiles: Record<string, string> = {
        "Dockerfile": "dockerfile",
        "Makefile": "makefile",
        "Rakefile": "ruby",
        "Gemfile": "ruby",
        "Podfile": "ruby",
        "Vagrantfile": "ruby",
        "Brewfile": "ruby",
        "LICENSE": "text",
        "README": "markdown",
        "CHANGELOG": "markdown",
        "CONTRIBUTING": "markdown",
        "AUTHORS": "text",
        "NOTICE": "text",
        ".gitignore": "text",
        ".dockerignore": "text",
        ".npmignore": "text",
        ".eslintrc": "json",
        ".prettierrc": "json",
        ".babelrc": "json",
    };

    return specialFiles[filename] || null;
}

/**
 * Check available disk space
 */
export async function hasEnoughDiskSpace(path: string, requiredBytes: number = 100 * 1024 * 1024): Promise<boolean> {
    try {
        // This is a simplified check - in production you'd use a proper disk space library
        // For now, we'll just return true and let the OS handle it
        return true;
    } catch {
        return true;
    }
}

/**
 * Validate that a path is within allowed boundaries
 */
export function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
    const resolvedTarget = resolve(targetPath);
    const resolvedRoot = resolve(rootPath);
    return resolvedTarget.startsWith(resolvedRoot);
}
