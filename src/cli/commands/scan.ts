import { resolve } from "path";
import type { Finding, ScanOptions, ScanResult, Target } from "../../scanner/types";
import { discoverSkills } from "../../scanner/discover";
import { discoverBrowserExtensions, discoverIDEExtensions } from "../../scanner/extensions/index";
import { scanFile } from "../../scanner/scan-file";
import { applyMetaAnalyzer, summarizeFindings } from "../../scanner/report";
import { applyFixes } from "../../scanner/fix";
import { createTui } from "../../utils/tui";
import { sanitizePath } from "../../utils/fs";
import { collectFiles, loadCompiledRules } from "../utils";
import { handleScanOutput, generateReportFiles, saveScanResults, checkFailCondition } from "../output";

/**
 * Run the main scan command
 */
export async function runScan(targetPath: string, options: ScanOptions): Promise<ScanResult | undefined> {
  if (options.fix) {
    console.warn("Note: --fix will comment out matched lines in supported file types.");
  }
  if (options.fix && options.format === "sarif") {
    console.warn("Note: --fix with --format sarif will still apply fixes before reporting.");
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve(targetPath));
  const rules = await loadCompiledRules(basePath);

  // Discover all targets
  const skills = await discoverSkills(basePath, {
    includeSystem: options.includeSystem,
    extraSkillDirs: options.extraSkillDirs,
    fullDepth: options.fullDepth,
  });
  const extensions = options.includeExtensions ? await discoverBrowserExtensions(options.extraExtensionDirs) : [];
  const ideExtensions = options.includeIDEExtensions ? await discoverIDEExtensions(options.extraIDEExtensionDirs) : [];

  const targets: Target[] = [
    ...skills.map((s) => ({ kind: "skill" as const, name: s.name, path: s.path })),
    ...extensions.map((e) => ({
      kind: "extension" as const,
      name: e.name,
      path: e.path,
      meta: {
        browser: e.browser,
        profile: e.profile,
        id: e.id,
        version: e.version,
      },
    })),
    ...ideExtensions.map((e) => ({
      kind: "ide-extension" as const,
      name: e.name,
      path: e.path,
      meta: {
        ide: e.ide,
        extensionId: e.extensionId,
        version: e.version,
        publisher: e.publisher,
        isBuiltin: e.isBuiltin,
      },
    })),
  ];

  // Plan what files to scan for each target
  const scanPlans = targets.length
    ? await Promise.all(
      targets.map(async (target) => ({
        name: target.name,
        path: target.path,
        files: await collectFiles([target.path], { includeDocs: true }),
      }))
    )
    : [
      {
        name: "root",
        path: basePath,
        files: await collectFiles([basePath], { includeDocs: false }),
      },
    ];

  const totalFiles = scanPlans.reduce((sum, plan) => sum + plan.files.length, 0);

  // Setup TUI
  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, scanPlans.length);

  const findings: Finding[] = [];
  const concurrency = Math.min(32, Math.max(4, Math.floor((navigator.hardwareConcurrency ?? 8) / 2)));

  // Scan each target
  for (let i = 0; i < scanPlans.length; i++) {
    const plan = scanPlans[i];
    tui.beginTarget(i + 1, scanPlans.length, plan.name, plan.files.length);

    const skillFindings: Finding[] = [];
    let index = 0;

    const worker = async () => {
      while (index < plan.files.length) {
        const filePath = plan.files[index++];
        try {
          const fileFindings = await scanFile(filePath, rules, options);
          if (fileFindings.length) {
            skillFindings.push(...fileFindings);
            tui.onFindings(fileFindings);
          }
        } catch {
          // ignore unreadable file
        } finally {
          tui.onFile(filePath);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));

    const filteredSkillFindings = options.enableMeta ? applyMetaAnalyzer(skillFindings) : skillFindings;

    if (options.fix && filteredSkillFindings.length > 0) {
      await applyFixes(filteredSkillFindings);
    }
    if (options.enableMeta) {
      tui.setCurrentFindings(filteredSkillFindings);
    }

    findings.push(...filteredSkillFindings);
    tui.completeTarget(
      {
        name: plan.name,
        files: plan.files.length,
        findings: filteredSkillFindings.length,
        counts: summarizeFindings(filteredSkillFindings),
      },
      filteredSkillFindings
    );
  }

  const elapsedMs = Date.now() - start;
  tui.finish();

  const filteredFindings = options.enableMeta ? applyMetaAnalyzer(findings) : findings;

  const result: ScanResult = {
    targets: targets.length ? targets : [{ kind: "path" as const, name: "root", path: basePath }],
    findings: filteredFindings,
    scannedFiles: totalFiles,
    elapsedMs,
  };

  // Handle output
  await handleScanOutput(result, {
    format: outputFormat,
    output: options.output,
    tuiEnabled,
  });

  checkFailCondition(result, options);
  await generateReportFiles(result, options);
  await saveScanResults(result, "scan", targetPath, options);

  return result;
}
