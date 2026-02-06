import { resolve } from "path";
import type { Finding, ScanOptions, ScanResult, Target } from "../../scanner/types";
import { scanFile } from "../../scanner/scan-file";
import { scanContentItem } from "../../scanner/engine/scan-content";
import { applyMetaAnalyzer, summarizeFindings } from "../../scanner/report";
import { collectFromServer } from "../../scanner/mcp/collect";
import { loadStaticInputs } from "../../scanner/mcp/static";
import { staticLabelFromFiles, virtualizeRemote, virtualizeStatic } from "../../scanner/mcp/virtualize";
import { discoverWellKnownMcpConfigPaths } from "../../scanner/mcp/known-configs";
import { loadAndExtractMcpServers } from "../../scanner/mcp/config";
import { createTui } from "../../utils/tui";
import { sanitizePath } from "../../utils/fs";
import type { McpCliOptions } from "../types";
import { loadCompiledRules, parseHeaderList, parseMcpScanList } from "../utils";
import { handleScanOutput, checkFailCondition } from "../output";

/**
 * Run MCP remote scan against a server URL
 */
export async function runMcpRemoteScan(
  serverUrl: string,
  options: ScanOptions,
  mcp: McpCliOptions
): Promise<ScanResult | undefined> {
  if (!serverUrl) {
    console.error("Missing MCP server URL. Usage: skill-scanner mcp remote <serverUrl>");
    process.exitCode = 1;
    return;
  }

  if (options.fix) {
    console.warn("Note: --fix is not supported for MCP targets (no local files to modify). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const headers = parseHeaderList(mcp.headers ?? []);
  if (mcp.bearerToken) {
    headers["Authorization"] = `Bearer ${mcp.bearerToken}`;
  }

  const scanList = parseMcpScanList(mcp.scan);
  const allowedMimeTypes = (mcp.mimeTypes ?? "text/plain,text/markdown,text/html,application/json")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const maxResourceBytes =
    typeof mcp.maxResourceBytes === "number" && Number.isFinite(mcp.maxResourceBytes)
      ? Math.max(1, Math.floor(mcp.maxResourceBytes))
      : 1_048_576;

  const collected = await collectFromServer(serverUrl, {
    headers,
    scan: scanList,
    readResources: Boolean(mcp.readResources),
    allowedMimeTypes,
    maxResourceBytes,
  }).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to connect to MCP server: ${serverUrl}`);
    console.error(msg);
    process.exitCode = 1;
    return null;
  });

  if (!collected) return;

  const { host, files, scannedObjects } = virtualizeRemote(serverUrl, collected, {
    readResources: Boolean(mcp.readResources),
  });

  const totalFiles = files.length;
  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, 1);
  tui.beginTarget(1, 1, host, totalFiles);

  const targetFindings: Finding[] = [];
  for (const item of files) {
    try {
      const fileFindings = scanContentItem(item, rules, options);
      if (fileFindings.length) {
        targetFindings.push(...fileFindings);
        tui.onFindings(fileFindings);
      }
    } finally {
      tui.onFile(item.virtualPath);
    }
  }

  const filteredTargetFindings = options.enableMeta ? applyMetaAnalyzer(targetFindings) : targetFindings;
  if (options.enableMeta) tui.setCurrentFindings(filteredTargetFindings);

  tui.completeTarget(
    { name: host, files: totalFiles, findings: filteredTargetFindings.length, counts: summarizeFindings(filteredTargetFindings) },
    filteredTargetFindings
  );

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result: ScanResult = {
    targets: [
      {
        kind: "mcp",
        name: host,
        path: serverUrl,
        meta: { serverUrl, transport: "http", scannedObjects },
      },
    ] as Target[],
    findings: filteredTargetFindings,
    scannedFiles: totalFiles,
    elapsedMs,
  };

  await handleScanOutput(result, { format: outputFormat, output: options.output, tuiEnabled });
  checkFailCondition(result, options);

  return result;
}

/**
 * Run MCP static scan from JSON files
 */
export async function runMcpStaticScan(
  options: ScanOptions,
  mcp: McpCliOptions
): Promise<ScanResult | undefined> {
  if (options.fix) {
    console.warn("Note: --fix is not supported for MCP static targets (no local code lines to modify). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const inputs = await loadStaticInputs({
    tools: mcp.toolsFile,
    prompts: mcp.promptsFile,
    resources: mcp.resourcesFile,
    instructions: mcp.instructionsFile,
  });

  if (inputs.sourceFiles.length === 0) {
    console.error("No MCP static inputs provided. Use --tools/--prompts/--resources/--instructions.");
    process.exitCode = 1;
    return;
  }

  const label = staticLabelFromFiles(inputs.sourceFiles);
  const { host, files, scannedObjects } = virtualizeStatic({
    label,
    tools: inputs.tools,
    prompts: inputs.prompts,
    resources: inputs.resources,
    initialize: inputs.initialize,
  });

  const totalFiles = files.length;
  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, 1);
  tui.beginTarget(1, 1, host, totalFiles);

  const targetFindings: Finding[] = [];
  for (const item of files) {
    try {
      const fileFindings = scanContentItem(item, rules, options);
      if (fileFindings.length) {
        targetFindings.push(...fileFindings);
        tui.onFindings(fileFindings);
      }
    } finally {
      tui.onFile(item.virtualPath);
    }
  }

  const filteredTargetFindings = options.enableMeta ? applyMetaAnalyzer(targetFindings) : targetFindings;
  if (options.enableMeta) tui.setCurrentFindings(filteredTargetFindings);

  tui.completeTarget(
    { name: host, files: totalFiles, findings: filteredTargetFindings.length, counts: summarizeFindings(filteredTargetFindings) },
    filteredTargetFindings
  );

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result: ScanResult = {
    targets: [
      {
        kind: "mcp",
        name: host,
        path: "static",
        meta: { sourceFiles: inputs.sourceFiles, transport: "http", scannedObjects },
      },
    ] as Target[],
    findings: filteredTargetFindings,
    scannedFiles: totalFiles,
    elapsedMs,
  };

  await handleScanOutput(result, { format: outputFormat, output: options.output, tuiEnabled });
  checkFailCondition(result, options);

  return result;
}

/**
 * Run MCP scan against multiple remote servers
 */
export async function runMcpRemoteMultiScan(
  servers: Array<{ name: string; url: string; sourceFile?: string }>,
  options: ScanOptions,
  mcp: McpCliOptions
): Promise<ScanResult | undefined> {
  if (servers.length === 0) {
    console.error("No MCP servers found to scan.");
    process.exitCode = 1;
    return;
  }

  if (options.fix) {
    console.warn("Note: --fix is not supported for MCP remote targets (no local files to modify). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const headers = parseHeaderList(mcp.headers ?? []);
  if (mcp.bearerToken) headers["Authorization"] = `Bearer ${mcp.bearerToken}`;

  const scanList = parseMcpScanList(mcp.scan);
  const allowedMimeTypes = (mcp.mimeTypes ?? "text/plain,text/markdown,text/html,application/json")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const maxResourceBytes =
    typeof mcp.maxResourceBytes === "number" && Number.isFinite(mcp.maxResourceBytes)
      ? Math.max(1, Math.floor(mcp.maxResourceBytes))
      : 1_048_576;

  // Collect everything first so the TUI can show an accurate total file count.
  const collectedPlans: Array<{
    target: Target;
    files: Array<{ virtualPath: string; fileType: any; content: string }>;
    scannedObjects: any;
  }> = [];

  for (const server of servers) {
    try {
      const collected = await collectFromServer(server.url, {
        headers,
        scan: scanList,
        readResources: Boolean(mcp.readResources),
        allowedMimeTypes,
        maxResourceBytes,
      });
      const v = virtualizeRemote(server.url, collected, { readResources: Boolean(mcp.readResources) });
      collectedPlans.push({
        target: {
          kind: "mcp",
          name: v.host,
          path: server.url,
          meta: {
            serverUrl: server.url,
            transport: "http",
            scannedObjects: v.scannedObjects,
            sourceFile: server.sourceFile,
            serverName: server.name,
          },
        },
        files: v.files,
        scannedObjects: v.scannedObjects,
      });
    } catch (e) {
      // Treat a collection failure as a scan failure for that target, but continue.
      collectedPlans.push({
        target: {
          kind: "mcp",
          name: server.name,
          path: server.url,
          meta: {
            serverUrl: server.url,
            transport: "http",
            scannedObjects: { tools: 0, prompts: 0, resources: 0, instructions: 0 },
            sourceFile: server.sourceFile,
            error: e instanceof Error ? e.message : String(e),
          },
        },
        files: [],
        scannedObjects: { tools: 0, prompts: 0, resources: 0, instructions: 0 },
      });
    }
  }

  const totalFiles = collectedPlans.reduce((sum, p) => sum + p.files.length, 0);
  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(totalFiles, collectedPlans.length);

  const allFindings: Finding[] = [];
  for (let i = 0; i < collectedPlans.length; i++) {
    const plan = collectedPlans[i]!;
    tui.beginTarget(i + 1, collectedPlans.length, plan.target.name, plan.files.length);

    const targetFindings: Finding[] = [];
    for (const item of plan.files) {
      try {
        const fileFindings = scanContentItem(item, rules, options);
        if (fileFindings.length) {
          targetFindings.push(...fileFindings);
          tui.onFindings(fileFindings);
        }
      } finally {
        tui.onFile(item.virtualPath);
      }
    }

    const filteredTargetFindings = options.enableMeta ? applyMetaAnalyzer(targetFindings) : targetFindings;
    if (options.enableMeta) tui.setCurrentFindings(filteredTargetFindings);

    allFindings.push(...filteredTargetFindings);
    tui.completeTarget(
      { name: plan.target.name, files: plan.files.length, findings: filteredTargetFindings.length, counts: summarizeFindings(filteredTargetFindings) },
      filteredTargetFindings
    );
  }

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result: ScanResult = {
    targets: collectedPlans.map((p) => p.target),
    findings: allFindings,
    scannedFiles: totalFiles,
    elapsedMs,
  };

  await handleScanOutput(result, { format: outputFormat, output: options.output, tuiEnabled });
  checkFailCondition(result, options);

  return result;
}

/**
 * Run MCP config file scan
 */
export async function runMcpConfigScan(
  options: ScanOptions,
  mcp: McpCliOptions
): Promise<ScanResult | undefined> {
  if (!mcp.configPath) {
    console.error("Missing config path. Usage: skill-scanner mcp config <configPath>");
    process.exitCode = 1;
    return;
  }

  if (mcp.connect) {
    const servers = await loadAndExtractMcpServers(mcp.configPath);
    return await runMcpRemoteMultiScan(
      servers.map((s) => ({ name: s.name, url: s.serverUrl, sourceFile: s.sourceFile })),
      options,
      mcp
    );
  }

  if (options.fix) {
    console.warn("Note: --fix is disabled for mcp config scans by default (to avoid editing user config files). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(1, 1);
  tui.beginTarget(1, 1, mcp.configPath, 1);

  const fileFindings = await scanFile(mcp.configPath, rules, options).catch(() => []);
  if (fileFindings.length) tui.onFindings(fileFindings);
  tui.onFile(mcp.configPath);

  const filtered = options.enableMeta ? applyMetaAnalyzer(fileFindings) : fileFindings;
  tui.completeTarget({ name: mcp.configPath, files: 1, findings: filtered.length, counts: summarizeFindings(filtered) }, filtered);

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result: ScanResult = {
    targets: [{ kind: "path", name: "mcp-config", path: mcp.configPath, meta: { mcpConfig: true } }] as Target[],
    findings: filtered,
    scannedFiles: 1,
    elapsedMs,
  };

  await handleScanOutput(result, { format: outputFormat, output: options.output, tuiEnabled });
  checkFailCondition(result, options);

  return result;
}

/**
 * Run scan against well-known MCP config file locations
 */
export async function runMcpKnownConfigsScan(
  options: ScanOptions,
  mcp: McpCliOptions
): Promise<ScanResult | undefined> {
  const configPaths = await discoverWellKnownMcpConfigPaths();
  if (configPaths.length === 0) {
    console.log("No well-known MCP config files found on this machine.");
    return;
  }

  if (mcp.connect) {
    const servers: Array<{ name: string; url: string; sourceFile?: string }> = [];
    for (const p of configPaths) {
      const s = await loadAndExtractMcpServers(p);
      for (const item of s) servers.push({ name: item.name, url: item.serverUrl, sourceFile: item.sourceFile });
    }
    return await runMcpRemoteMultiScan(servers, options, mcp);
  }

  if (options.fix) {
    console.warn("Note: --fix is disabled for mcp known-configs scans by default (to avoid editing user config files). Ignoring --fix.");
    options.fix = false;
  }

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const outputFormat = options.format ?? (options.json ? "json" : "table");
  const tuiEnabled = options.tui ?? (process.stdout.isTTY && outputFormat === "table");
  const tui = createTui(tuiEnabled);
  tui.start(configPaths.length, configPaths.length);

  const findings: Finding[] = [];
  for (let i = 0; i < configPaths.length; i++) {
    const p = configPaths[i]!;
    tui.beginTarget(i + 1, configPaths.length, p, 1);
    const fileFindings = await scanFile(p, rules, options).catch(() => []);
    const filtered = options.enableMeta ? applyMetaAnalyzer(fileFindings) : fileFindings;
    if (filtered.length) {
      findings.push(...filtered);
      tui.onFindings(filtered);
    }
    tui.onFile(p);
    tui.completeTarget({ name: p, files: 1, findings: filtered.length, counts: summarizeFindings(filtered) }, filtered);
  }

  const elapsedMs = Date.now() - start;
  tui.finish();

  const result: ScanResult = {
    targets: configPaths.map((p) => ({ kind: "path", name: "mcp-config", path: p, meta: { mcpConfig: true } })) as Target[],
    findings,
    scannedFiles: configPaths.length,
    elapsedMs,
  };

  await handleScanOutput(result, { format: outputFormat, output: options.output, tuiEnabled });
  checkFailCondition(result, options);

  return result;
}
