import { resolve } from "path";
import type { Finding, ScanOptions, ScanResult, Target } from "../../scanner/types";
import { scanFile } from "../../scanner/scan-file";
import { summarizeFindings } from "../../scanner/report";
import { collectFromServer } from "../../scanner/mcp/collect";
import { loadStaticInputs } from "../../scanner/mcp/static";
import { staticLabelFromFiles, virtualizeRemote, virtualizeStatic } from "../../scanner/mcp/virtualize";
import { discoverWellKnownMcpConfigPaths } from "../../scanner/mcp/known-configs";
import { loadAndExtractMcpServers } from "../../scanner/mcp/config";
import { sanitizePath } from "../../utils/fs";
import type { McpCliOptions } from "../types";
import { loadCompiledRules } from "../utils";
import {
  setupMcpTui,
  scanMcpFiles,
  applyMetaIfEnabled,
  finalizeMcpScan,
  disableFixForMcp,
  parseMcpConnectionOptions,
} from "./mcp-utils";

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

  disableFixForMcp(options, "MCP targets (no local files to modify)");

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const { headers, scanList, allowedMimeTypes, maxResourceBytes } = parseMcpConnectionOptions(mcp);

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

  const { tui, outputFormat, tuiEnabled } = setupMcpTui(options, files.length, 1);
  tui.beginTarget(1, 1, host, files.length);

  const targetFindings = scanMcpFiles(files, rules, options, tui);
  const filteredFindings = applyMetaIfEnabled(targetFindings, options, tui);

  tui.completeTarget(
    { name: host, files: files.length, findings: filteredFindings.length, counts: summarizeFindings(filteredFindings) },
    filteredFindings
  );

  const result: ScanResult = {
    targets: [
      {
        kind: "mcp",
        name: host,
        path: serverUrl,
        meta: { serverUrl, transport: "http", scannedObjects },
      },
    ] as Target[],
    findings: filteredFindings,
    scannedFiles: files.length,
    elapsedMs: 0, // Set by finalizeMcpScan
  };

  return finalizeMcpScan(result, options, outputFormat, tuiEnabled, tui, start);
}

/**
 * Run MCP static scan from JSON files
 */
export async function runMcpStaticScan(
  options: ScanOptions,
  mcp: McpCliOptions
): Promise<ScanResult | undefined> {
  disableFixForMcp(options, "MCP static targets (no local code lines to modify)");

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

  const { tui, outputFormat, tuiEnabled } = setupMcpTui(options, files.length, 1);
  tui.beginTarget(1, 1, host, files.length);

  const targetFindings = scanMcpFiles(files, rules, options, tui);
  const filteredFindings = applyMetaIfEnabled(targetFindings, options, tui);

  tui.completeTarget(
    { name: host, files: files.length, findings: filteredFindings.length, counts: summarizeFindings(filteredFindings) },
    filteredFindings
  );

  const result: ScanResult = {
    targets: [
      {
        kind: "mcp",
        name: host,
        path: "static",
        meta: { sourceFiles: inputs.sourceFiles, transport: "http", scannedObjects },
      },
    ] as Target[],
    findings: filteredFindings,
    scannedFiles: files.length,
    elapsedMs: 0, // Set by finalizeMcpScan
  };

  return finalizeMcpScan(result, options, outputFormat, tuiEnabled, tui, start);
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

  disableFixForMcp(options, "MCP remote targets (no local files to modify)");

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const { headers, scanList, allowedMimeTypes, maxResourceBytes } = parseMcpConnectionOptions(mcp);

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
  const { tui, outputFormat, tuiEnabled } = setupMcpTui(options, totalFiles, collectedPlans.length);

  const allFindings: Finding[] = [];
  for (let i = 0; i < collectedPlans.length; i++) {
    const plan = collectedPlans[i]!;
    tui.beginTarget(i + 1, collectedPlans.length, plan.target.name, plan.files.length);

    const targetFindings = scanMcpFiles(plan.files, rules, options, tui);
    const filteredFindings = applyMetaIfEnabled(targetFindings, options, tui);

    allFindings.push(...filteredFindings);
    tui.completeTarget(
      { name: plan.target.name, files: plan.files.length, findings: filteredFindings.length, counts: summarizeFindings(filteredFindings) },
      filteredFindings
    );
  }

  const result: ScanResult = {
    targets: collectedPlans.map((p) => p.target),
    findings: allFindings,
    scannedFiles: totalFiles,
    elapsedMs: 0, // Set by finalizeMcpScan
  };

  return finalizeMcpScan(result, options, outputFormat, tuiEnabled, tui, start);
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

  disableFixForMcp(options, "mcp config scans (to avoid editing user config files)");

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const { tui, outputFormat, tuiEnabled } = setupMcpTui(options, 1, 1);
  tui.beginTarget(1, 1, mcp.configPath, 1);

  const fileFindings = await scanFile(mcp.configPath, rules, options).catch(() => []);
  if (fileFindings.length) tui.onFindings(fileFindings);
  tui.onFile(mcp.configPath);

  const filtered = applyMetaIfEnabled(fileFindings, options, tui);
  tui.completeTarget({ name: mcp.configPath, files: 1, findings: filtered.length, counts: summarizeFindings(filtered) }, filtered);

  const result: ScanResult = {
    targets: [{ kind: "path", name: "mcp-config", path: mcp.configPath, meta: { mcpConfig: true } }] as Target[],
    findings: filtered,
    scannedFiles: 1,
    elapsedMs: 0, // Set by finalizeMcpScan
  };

  return finalizeMcpScan(result, options, outputFormat, tuiEnabled, tui, start);
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

  disableFixForMcp(options, "mcp known-configs scans (to avoid editing user config files)");

  const start = Date.now();
  const basePath = sanitizePath(resolve("."));
  const rules = await loadCompiledRules(basePath);

  const { tui, outputFormat, tuiEnabled } = setupMcpTui(options, configPaths.length, configPaths.length);

  const findings: Finding[] = [];
  for (let i = 0; i < configPaths.length; i++) {
    const p = configPaths[i]!;
    tui.beginTarget(i + 1, configPaths.length, p, 1);
    const fileFindings = await scanFile(p, rules, options).catch(() => []);
    const filtered = applyMetaIfEnabled(fileFindings, options, tui);
    if (filtered.length) {
      findings.push(...filtered);
      tui.onFindings(filtered);
    }
    tui.onFile(p);
    tui.completeTarget({ name: p, files: 1, findings: filtered.length, counts: summarizeFindings(filtered) }, filtered);
  }

  const result: ScanResult = {
    targets: configPaths.map((p) => ({ kind: "path", name: "mcp-config", path: p, meta: { mcpConfig: true } })) as Target[],
    findings,
    scannedFiles: configPaths.length,
    elapsedMs: 0, // Set by finalizeMcpScan
  };

  return finalizeMcpScan(result, options, outputFormat, tuiEnabled, tui, start);
}
