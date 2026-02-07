/**
 * Escape CSV special characters
 */
export function escapeCSV(text: string): string {
    if (!text) return '""';
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/**
 * Generate a timestamp-based filename
 */
export function generateReportFilename(prefix: string = "security-scan"): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T")[0];
    return `${prefix}-${timestamp}`;
}

/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Format elapsed time in seconds
 */
export function formatElapsedTime(ms: number): string {
    return (ms / 1000).toFixed(2);
}
