/**
 * Interactive Mode Module
 * 
 * Provides interactive CLI functionality for target selection and configuration
 */

// Types
export type {
    InteractiveChoice,
    InteractivePromptType,
    InteractivePrompt,
    InteractiveSession,
    KeyPress,
} from "./types";

// Input handling
export {
    enableRawMode,
    disableRawMode,
    parseKeyPress,
    waitForKey,
    clearLine,
    moveCursorUp,
    hideCursor,
    showCursor,
} from "./input";

// Prompts
export {
    selectPrompt,
    multiselectPrompt,
    confirmPrompt,
    inputPrompt,
} from "./prompts";

// Target selector
export {
    promptScanPath,
    promptScanType,
    selectTargets,
    configureScanOptions,
    runInteractiveSession,
} from "./selector";
