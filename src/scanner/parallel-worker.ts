import { parentPort } from "worker_threads";
import type { ScanTask, ScanTaskResult } from "./parallel-scanner";
import { scanFile } from "./scan-file";

if (!parentPort) {
    throw new Error("This module must be run as a worker thread");
}

parentPort.on("message", async (task: ScanTask) => {
    try {
        const findings = await Promise.all(
            task.files.map((file) => scanFile(file, task.rules, task.options))
        );

        const result: ScanTaskResult = {
            findings: findings.flat(),
        };

        parentPort!.postMessage(result);
    } catch (error) {
        const result: ScanTaskResult = {
            findings: [],
            error: error instanceof Error ? error.message : String(error),
        };
        parentPort!.postMessage(result);
    }
});
