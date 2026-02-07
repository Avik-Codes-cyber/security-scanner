/**
 * Interactive Mode Types
 */

import type { Target, ScanOptions } from "../../scanner/types";

export type InteractiveChoice = {
    label: string;
    value: string;
    description?: string;
    selected?: boolean;
};

export type InteractivePromptType = "select" | "multiselect" | "confirm" | "input";

export type InteractivePrompt = {
    type: InteractivePromptType;
    message: string;
    choices?: InteractiveChoice[];
    default?: string | boolean;
    validate?: (value: string) => boolean | string;
};

export type InteractiveSession = {
    selectedTargets: Target[];
    scanOptions: Partial<ScanOptions>;
    shouldProceed: boolean;
};

export type KeyPress = {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
};
