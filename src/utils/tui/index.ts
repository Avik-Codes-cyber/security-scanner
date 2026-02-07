import type { Finding } from "../../scanner/types.ts";
import { summarizeFindings } from "../../scanner/report";
import type { TargetSummary, ScanStats, ScanUi } from "./types";
import { renderFrame, type RenderState } from "./renderer";

// Re-export types for external consumers
export type { TargetSummary, ScanStats, ScanUi };

/**
 * Create a no-op TUI for when the TUI is disabled
 */
function createNoopTui(): ScanUi {
  const noop = () => { };
  return {
    start: (_totalFiles: number, _totalTargets?: number) => noop(),
    beginTarget: (_index: number, _total: number, _name: string, _files: number) => noop(),
    onFile: (_filePath: string) => noop(),
    onFindings: (_newFindings: Finding[]) => noop(),
    setCurrentFindings: (_findings: Finding[]) => noop(),
    completeTarget: (_summary: TargetSummary, _findings?: Finding[]) => noop(),
    finish: () => noop(),
    getStats: () => ({
      startTime: 0,
      totalFiles: 0,
      scannedFiles: 0,
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    }),
  };
}

/**
 * Create the active TUI controller
 */
function createActiveTui(showConfidence: boolean = false, scanDescription?: string): ScanUi {
  const DEBOUNCE_DELAY = 200;
  const MIN_RENDER_INTERVAL = 100;

  // State
  const state: RenderState = {
    startTime: Date.now(),
    totalFiles: 0,
    totalTargets: 0,
    scannedFiles: 0,
    currentTargetIndex: 0,
    currentTargetTotal: 0,
    currentTargetName: "",
    currentTargetFiles: 0,
    currentTargetScanned: 0,
    currentFindings: [],
    lastFindings: [],
    completed: [],
    showConfidence,
  };

  let endTime: number | undefined;
  let scheduled: NodeJS.Timeout | null = null;
  let lastRenderTime = 0;
  let finished = false;
  let isFirstRender = true;

  // Cleanup function to ensure proper terminal state restoration
  const cleanup = () => {
    process.stdout.write("\x1b[?25h"); // Show cursor
  };

  // Register signal handlers for proper cleanup on interrupt
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  for (const sig of signals) {
    const handler = () => {
      cleanup();
      process.exit(0);
    };
    process.on(sig, handler);
  }

  const render = () => {
    scheduled = null;
    lastRenderTime = Date.now();

    // Only render if finished
    if (!finished) {
      return;
    }

    // Show findings only when finished
    const output = renderFrame(state, true, true);

    // Show final results (header already shown at start)
    process.stdout.write("\n" + output);
  };

  const scheduleRender = () => {
    if (finished) return;
    if (scheduled) return;

    const timeSinceLastRender = Date.now() - lastRenderTime;
    if (timeSinceLastRender < MIN_RENDER_INTERVAL) {
      // If we just rendered, schedule the next render with a longer delay
      scheduled = setTimeout(render, DEBOUNCE_DELAY);
      return;
    }

    // Render immediately if enough time has passed
    render();
  };

  return {
    start(total, skills = 0) {
      state.totalFiles = total;
      state.totalTargets = skills;
      scheduleRender();
    },

    beginTarget(index, total, name, files) {
      state.currentTargetIndex = index;
      state.currentTargetTotal = total;
      state.currentTargetName = name;
      state.currentTargetFiles = files;
      state.currentTargetScanned = 0;
      state.currentFindings.length = 0;
      scheduleRender();
    },

    onFile(_filePath) {
      state.scannedFiles += 1;
      state.currentTargetScanned += 1;
      scheduleRender();
    },

    onFindings(newFindings) {
      if (newFindings.length) {
        state.currentFindings.push(...newFindings);
        scheduleRender();
      }
    },

    setCurrentFindings(findings) {
      state.currentFindings.length = 0;
      state.currentFindings.push(...findings);
      scheduleRender();
    },

    completeTarget(summary, findings = []) {
      state.completed.push(summary);
      if (findings.length > 0) {
        state.lastFindings.length = 0;
        state.lastFindings.push(...findings);
      }
      scheduleRender();
    },

    finish() {
      endTime = Date.now();
      finished = true; // Set finished before rendering to show findings table
      if (scheduled) {
        clearTimeout(scheduled);
        scheduled = null;
      }
      // Render final results with findings table
      render();
      // Clean up terminal state
      cleanup();
      process.stdout.write("\n");
    },

    getStats() {
      const counts = summarizeFindings([...state.currentFindings, ...state.lastFindings]);
      return {
        startTime: state.startTime,
        endTime,
        totalFiles: state.totalFiles,
        scannedFiles: state.scannedFiles,
        totalFindings: state.currentFindings.length + state.lastFindings.length,
        criticalCount: counts.CRITICAL,
        highCount: counts.HIGH,
        mediumCount: counts.MEDIUM,
        lowCount: counts.LOW,
      };
    },
  };
}

/**
 * Create a TUI controller based on whether TUI is enabled or not
 */
export function createTui(enabled: boolean, showConfidence: boolean = false, scanDescription?: string): ScanUi {
  if (!enabled) {
    return createNoopTui();
  }
  return createActiveTui(showConfidence, scanDescription);
}
