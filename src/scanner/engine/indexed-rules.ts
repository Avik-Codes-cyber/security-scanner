import type { CompiledRule } from "./rule-engine";

/**
 * Indexed rule engine that pre-organizes rules by file type for faster lookups.
 * This avoids checking irrelevant rules against files.
 */
export class IndexedRuleEngine {
    private rulesByFileType: Map<string, CompiledRule[]>;
    private universalRules: CompiledRule[];
    private allRules: CompiledRule[];

    constructor(rules: CompiledRule[]) {
        this.allRules = rules;
        this.rulesByFileType = new Map();
        this.universalRules = [];

        for (const rule of rules) {
            if (rule.file_types.includes("any")) {
                this.universalRules.push(rule);
            } else {
                for (const fileType of rule.file_types) {
                    if (!this.rulesByFileType.has(fileType)) {
                        this.rulesByFileType.set(fileType, []);
                    }
                    this.rulesByFileType.get(fileType)!.push(rule);
                }
            }
        }
    }

    /**
     * Get all rules applicable to a specific file type.
     * Returns universal rules (file_types: ["any"]) plus type-specific rules.
     */
    getRulesForFileType(fileType: string): CompiledRule[] {
        const specificRules = this.rulesByFileType.get(fileType) || [];
        return [...this.universalRules, ...specificRules];
    }

    /**
     * Get all rules (for backwards compatibility).
     */
    getAllRules(): CompiledRule[] {
        return this.allRules;
    }

    /**
     * Get statistics about rule distribution.
     */
    getStats(): {
        totalRules: number;
        universalRules: number;
        fileTypeCount: number;
        avgRulesPerType: number;
    } {
        const fileTypeCount = this.rulesByFileType.size;
        const totalSpecificRules = Array.from(this.rulesByFileType.values()).reduce(
            (sum, rules) => sum + rules.length,
            0
        );

        return {
            totalRules: this.allRules.length,
            universalRules: this.universalRules.length,
            fileTypeCount,
            avgRulesPerType: fileTypeCount > 0 ? totalSpecificRules / fileTypeCount : 0,
        };
    }
}
