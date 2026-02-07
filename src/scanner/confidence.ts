import type { Finding } from "./types";

export type FindingWithConfidence = Finding & {
    confidence?: number; // 0.0 to 1.0
    confidenceReason?: string;
};

/**
 * Calculate confidence score for a finding based on multiple factors.
 */
export function calculateConfidence(finding: Finding, context: {
    fileType?: string;
    inComment?: boolean;
    inTestFile?: boolean;
    matchLength?: number;
    entropy?: number;
}): number {
    let confidence = 0.5; // Start at 50%

    // Source-based confidence
    if (finding.source === "signature") {
        confidence += 0.3; // Signature matches are more reliable
    } else if (finding.source === "heuristic") {
        confidence += 0.1; // Heuristics are less certain
    }

    // Severity-based confidence (higher severity = more scrutiny needed)
    if (finding.severity === "CRITICAL") {
        confidence += 0.1;
    } else if (finding.severity === "HIGH") {
        confidence += 0.05;
    }

    // Context-based adjustments
    if (context.inComment) {
        confidence -= 0.3; // Likely false positive in comments
    }

    if (context.inTestFile) {
        confidence -= 0.2; // Test files often have fake credentials
    }

    // Entropy-based confidence (for secret detection)
    if (finding.category === "heuristic_secrets" && context.entropy) {
        if (context.entropy >= 4.5) {
            confidence += 0.2; // Very high entropy = likely real secret
        } else if (context.entropy >= 4.2) {
            confidence += 0.1; // High entropy = possibly real
        } else {
            confidence -= 0.1; // Lower entropy = less likely
        }
    }

    // Match length (longer matches are more specific)
    if (context.matchLength) {
        if (context.matchLength > 50) {
            confidence += 0.1;
        } else if (context.matchLength < 10) {
            confidence -= 0.1;
        }
    }

    // File type relevance
    if (context.fileType) {
        // Certain findings are more relevant in certain file types
        if (finding.category === "supply_chain" && context.fileType === "json") {
            confidence += 0.1;
        }
        if (finding.category === "command_injection" && context.fileType === "bash") {
            confidence += 0.1;
        }
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence));
}

/**
 * Add confidence scores to findings.
 */
export function addConfidenceScores(
    findings: Finding[],
    fileType?: string
): FindingWithConfidence[] {
    return findings.map((finding) => {
        // Determine context
        const inTestFile = finding.file.includes("/test/") ||
            finding.file.includes("/tests/") ||
            finding.file.includes("/__tests__/") ||
            finding.file.includes(".test.") ||
            finding.file.includes(".spec.");

        const context = {
            fileType,
            inTestFile,
            inComment: false, // TODO: Detect if finding is in a comment
        };

        const confidence = calculateConfidence(finding, context);

        let confidenceReason = "";
        if (confidence >= 0.8) {
            confidenceReason = "High confidence - strong indicators";
        } else if (confidence >= 0.6) {
            confidenceReason = "Medium confidence - likely valid";
        } else if (confidence >= 0.4) {
            confidenceReason = "Low confidence - review carefully";
        } else {
            confidenceReason = "Very low confidence - likely false positive";
        }

        return {
            ...finding,
            confidence,
            confidenceReason,
        };
    });
}

/**
 * Filter findings by minimum confidence threshold.
 */
export function filterByConfidence(
    findings: FindingWithConfidence[],
    minConfidence: number = 0.5
): FindingWithConfidence[] {
    return findings.filter((f) => (f.confidence ?? 1.0) >= minConfidence);
}

/**
 * Sort findings by confidence (highest first).
 */
export function sortByConfidence(findings: FindingWithConfidence[]): FindingWithConfidence[] {
    return [...findings].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}
