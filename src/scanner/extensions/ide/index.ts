import { readdir } from "fs/promises";
import { join } from "path";
import { dirExists } from "../../../utils/fs";
import { IDE_PATTERNS } from "../../../constants";
import { debugWarn } from "../../../utils/error-handling";
import { getAllRoots, type IDERoot } from "./platform-roots";
import { parseVSCodeExtension, parseJetBrainsPlugin, parseZedExtension } from "./manifest-parsers";

export type IDEExtensionTarget = {
  name: string;
  path: string;
  ide: string;
  extensionId: string;
  version?: string;
  publisher?: string;
  isBuiltin?: boolean;
};

const AI_EXTENSION_PATTERN = IDE_PATTERNS.AI_EXTENSION;

// ── Parallelized per-root discovery functions ──

async function discoverVSCodeExtensions(root: IDERoot): Promise<IDEExtensionTarget[]> {
  if (!(await dirExists(root.path))) return [];

  try {
    const entries = await readdir(root.path, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    // Parse all extension manifests concurrently
    const results = await Promise.all(
      dirs.map(async (entry): Promise<IDEExtensionTarget | null> => {
        const extPath = join(root.path, entry.name);
        const manifest = await parseVSCodeExtension(extPath);
        if (!manifest) return null;

        const extensionId = manifest.publisher
          ? `${manifest.publisher}.${manifest.name}`
          : manifest.name;

        return {
          name: manifest.displayName || manifest.name,
          path: extPath,
          ide: root.ide,
          extensionId,
          version: manifest.version,
          publisher: manifest.publisher,
          isBuiltin: entry.name.startsWith("vscode.") || entry.name.startsWith("ms-"),
        };
      })
    );

    return results.filter((r): r is IDEExtensionTarget => r !== null);
  } catch (error) {
    debugWarn(`Warning: Failed to discover VS Code extensions in ${root.path}`, error);
    return [];
  }
}

async function discoverJetBrainsPlugins(root: IDERoot): Promise<IDEExtensionTarget[]> {
  if (!(await dirExists(root.path))) return [];

  try {
    const entries = await readdir(root.path, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    const results = await Promise.all(
      dirs.map(async (entry): Promise<IDEExtensionTarget | null> => {
        const pluginPath = join(root.path, entry.name);
        const parsed = await parseJetBrainsPlugin(pluginPath, entry.name);
        if (!parsed) return null;

        return {
          name: parsed.name,
          path: pluginPath,
          ide: root.ide,
          extensionId: parsed.extensionId,
          version: parsed.version,
          publisher: parsed.publisher,
        };
      })
    );

    return results.filter((r): r is IDEExtensionTarget => r !== null);
  } catch (error) {
    debugWarn(`Warning: Failed to discover JetBrains plugins in ${root.path}`, error);
    return [];
  }
}

async function discoverZedExtensions(root: IDERoot): Promise<IDEExtensionTarget[]> {
  if (!(await dirExists(root.path))) return [];

  try {
    const entries = await readdir(root.path, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    const results = await Promise.all(
      dirs.map(async (entry): Promise<IDEExtensionTarget | null> => {
        const extPath = join(root.path, entry.name);
        const parsed = await parseZedExtension(extPath, entry.name);
        if (!parsed) return null;

        return {
          name: parsed.name,
          path: extPath,
          ide: root.ide,
          extensionId: parsed.extensionId,
          version: parsed.version,
          publisher: parsed.publisher,
        };
      })
    );

    return results.filter((r): r is IDEExtensionTarget => r !== null);
  } catch (error) {
    debugWarn(`Warning: Failed to discover Zed extensions in ${root.path}`, error);
    return [];
  }
}

export async function discoverIDEExtensions(extraRoots?: string[]): Promise<IDEExtensionTarget[]> {
  const { vsCode, jetBrains, zed } = getAllRoots();

  // Launch ALL root discoveries concurrently across all IDE types
  const allDiscoveries = await Promise.all([
    ...vsCode.map(root => discoverVSCodeExtensions(root)),
    ...jetBrains.map(root => discoverJetBrainsPlugins(root)),
    ...zed.map(root => discoverZedExtensions(root)),
  ]);

  const targets = allDiscoveries.flat();

  // Handle extra roots concurrently
  if (extraRoots?.length) {
    const validExtra = extraRoots.filter(Boolean);
    const extraChecks = await Promise.all(
      validExtra.map(async (root): Promise<IDEExtensionTarget | null> => {
        if (await dirExists(root)) {
          return {
            name: `Custom IDE Extension ${root}`,
            path: root,
            ide: "Custom",
            extensionId: root,
          };
        }
        return null;
      })
    );
    for (const t of extraChecks) {
      if (t) targets.push(t);
    }
  }

  // Deduplicate by path first, then by extensionId (keep newest version)
  const uniqueByPath = new Map<string, IDEExtensionTarget>();
  for (const t of targets) {
    if (t.path) uniqueByPath.set(t.path, t);
  }

  // Second pass: deduplicate by extensionId, keeping the entry with the newer version
  const uniqueById = new Map<string, IDEExtensionTarget>();
  for (const t of uniqueByPath.values()) {
    const key = t.extensionId.toLowerCase();
    const existing = uniqueById.get(key);
    if (!existing) {
      uniqueById.set(key, t);
    } else {
      // Keep the one with the newer version (or the first one if versions can't be compared)
      if (t.version && existing.version && t.version > existing.version) {
        uniqueById.set(key, t);
      }
    }
  }

  return Array.from(uniqueById.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverIDEExtensionWatchRoots(extraRoots?: string[]): Promise<string[]> {
  const { vsCode, jetBrains, zed } = getAllRoots();

  // Check all root paths for existence concurrently
  const allRoots = [...vsCode, ...jetBrains, ...zed];
  const extraValid = extraRoots?.filter(Boolean) ?? [];

  const [rootResults, extraResults] = await Promise.all([
    Promise.all(allRoots.map(async (root) => (await dirExists(root.path)) ? root.path : null)),
    Promise.all(extraValid.map(async (root) => (await dirExists(root)) ? root : null)),
  ]);

  const watchRoots = [
    ...rootResults.filter((p): p is string => p !== null),
    ...extraResults.filter((p): p is string => p !== null),
  ];

  return Array.from(new Set(watchRoots));
}

export function isAIExtension(target: IDEExtensionTarget): boolean {
  return AI_EXTENSION_PATTERN.test(target.name) || AI_EXTENSION_PATTERN.test(target.extensionId);
}
