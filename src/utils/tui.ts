/**
 * TUI Module - Terminal User Interface for Security Scanner
 * 
 * This module has been refactored into smaller, focused sub-modules:
 * - tui/types.ts     - Type definitions (TargetSummary, ScanStats, ScanUi)
 * - tui/colors.ts    - ANSI color constants
 * - tui/formatters.ts - Text formatting utilities
 * - tui/components.ts - UI components (progress bar, badges)
 * - tui/logo.ts      - Logo rendering
 * - tui/renderer.ts  - Frame rendering logic
 * - tui/index.ts     - Main TUI factory
 */

// Re-export everything from the modular TUI implementation
export { createTui } from "./tui/index";
export type { TargetSummary, ScanStats, ScanUi } from "./tui/types";
