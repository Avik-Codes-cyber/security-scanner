import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { dirExists } from "../utils/fs";

export type IDEExtensionTarget = {
  name: string;
  path: string;
  ide: string;
  extensionId: string;
  version?: string;
  publisher?: string;
  isBuiltin?: boolean;
};

type IDERoot = { ide: string; path: string };

function homeDir(): string | null {
  return process.env.HOME ?? process.env.USERPROFILE ?? null;
}

// ── Pre-compiled regex for AI keyword matching (avoids re-creation per call) ──

const AI_KEYWORD_PATTERN = /\b(ai|gpt|copilot|llm|language.model|chatgpt|claude|anthropic|openai|ollama|localai|codeium|tabnine|intellisense|assistant)\b/i;
const AI_EXTENSION_PATTERN = /copilot|chatgpt|claude|anthropic|codeium|tabnine|cody|continue|supermaven|cursor|ai|gpt|llm|assistant/i;

// Pre-compiled XML regexes (avoids re-compilation per plugin)
const XML_ID_RE = /<id>([^<]+)<\/id>/;
const XML_NAME_RE = /<name>([^<]+)<\/name>/;
const XML_VERSION_RE = /<version>([^<]+)<\/version>/;
const XML_VENDOR_RE = /<vendor[^>]*>([^<]+)<\/vendor>/;

// ── Platform root resolution (computed once, cached) ──

let _cachedAllRoots: { vsCode: IDERoot[]; jetBrains: IDERoot[]; zed: IDERoot[] } | null = null;

function getAllRoots(): { vsCode: IDERoot[]; jetBrains: IDERoot[]; zed: IDERoot[] } {
  if (_cachedAllRoots) return _cachedAllRoots;

  const home = homeDir();
  const platform = process.platform;

  const vsCode: IDERoot[] = [];
  const jetBrains: IDERoot[] = [];
  const zed: IDERoot[] = [];

  if (!home) {
    _cachedAllRoots = { vsCode, jetBrains, zed };
    return _cachedAllRoots;
  }

  // VS Code / Cursor / Windsurf / VSCodium
  if (platform === "darwin") {
    vsCode.push(
      { ide: "VS Code", path: join(home, ".vscode", "extensions") },
      { ide: "VS Code Insiders", path: join(home, ".vscode-insiders", "extensions") },
      { ide: "Cursor", path: join(home, ".cursor", "extensions") },
      { ide: "Windsurf", path: join(home, ".windsurf", "extensions") },
      { ide: "VSCodium", path: join(home, ".vscode-oss", "extensions") },
      { ide: "VS Code", path: join(home, "Library", "Application Support", "Code", "extensions") },
      { ide: "VS Code Insiders", path: join(home, "Library", "Application Support", "Code - Insiders", "extensions") },
      { ide: "Cursor", path: join(home, "Library", "Application Support", "Cursor", "extensions") },
      { ide: "Windsurf", path: join(home, "Library", "Application Support", "Windsurf", "extensions") },
      { ide: "VSCodium", path: join(home, "Library", "Application Support", "VSCodium", "extensions") },
    );
  } else if (platform === "win32") {
    vsCode.push(
      { ide: "VS Code", path: join(home, ".vscode", "extensions") },
      { ide: "VS Code Insiders", path: join(home, ".vscode-insiders", "extensions") },
      { ide: "Cursor", path: join(home, ".cursor", "extensions") },
      { ide: "Windsurf", path: join(home, ".windsurf", "extensions") },
    );
  } else {
    vsCode.push(
      { ide: "VS Code", path: join(home, ".config", "Code", "extensions") },
      { ide: "VS Code Insiders", path: join(home, ".config", "Code - Insiders", "extensions") },
      { ide: "Cursor", path: join(home, ".config", "Cursor", "extensions") },
      { ide: "Windsurf", path: join(home, ".config", "Windsurf", "extensions") },
      { ide: "VSCodium", path: join(home, ".config", "VSCodium", "extensions") },
    );
  }

  // JetBrains
  if (platform === "darwin") {
    const jbBase = join(home, "Library", "Application Support", "JetBrains");
    jetBrains.push(
      { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2025.3", "plugins") },
      { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2024.3", "plugins") },
      { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2024.2", "plugins") },
      { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2024.1", "plugins") },
      { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2023.3", "plugins") },
      { ide: "PyCharm", path: join(jbBase, "PyCharm2025.3", "plugins") },
      { ide: "PyCharm", path: join(jbBase, "PyCharm2024.3", "plugins") },
      { ide: "PyCharm", path: join(jbBase, "PyCharm2024.2", "plugins") },
      { ide: "PyCharm", path: join(jbBase, "PyCharm2023.3", "plugins") },
      { ide: "WebStorm", path: join(jbBase, "WebStorm2025.3", "plugins") },
      { ide: "WebStorm", path: join(jbBase, "WebStorm2024.3", "plugins") },
      { ide: "WebStorm", path: join(jbBase, "WebStorm2024.2", "plugins") },
      { ide: "CLion", path: join(jbBase, "CLion2025.3", "plugins") },
      { ide: "CLion", path: join(jbBase, "CLion2024.3", "plugins") },
      { ide: "GoLand", path: join(jbBase, "GoLand2025.3", "plugins") },
      { ide: "GoLand", path: join(jbBase, "GoLand2024.3", "plugins") },
      { ide: "Rider", path: join(jbBase, "Rider2025.3", "plugins") },
      { ide: "Rider", path: join(jbBase, "Rider2024.3", "plugins") },
      { ide: "Android Studio", path: join(home, "Library", "Application Support", "Google", "AndroidStudio2025.3", "plugins") },
      { ide: "Android Studio", path: join(home, "Library", "Application Support", "Google", "AndroidStudio2024.2", "plugins") },
    );
  } else if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      const jbBase = join(appData, "JetBrains");
      jetBrains.push(
        { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2025.3", "plugins") },
        { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2024.3", "plugins") },
        { ide: "PyCharm", path: join(jbBase, "PyCharm2025.3", "plugins") },
        { ide: "PyCharm", path: join(jbBase, "PyCharm2024.3", "plugins") },
        { ide: "WebStorm", path: join(jbBase, "WebStorm2025.3", "plugins") },
        { ide: "WebStorm", path: join(jbBase, "WebStorm2024.3", "plugins") },
      );
    }
  } else {
    const jbBase = join(home, ".local", "share", "JetBrains");
    jetBrains.push(
      { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2025.3", "plugins") },
      { ide: "IntelliJ IDEA", path: join(jbBase, "IntelliJIdea2024.3", "plugins") },
      { ide: "PyCharm", path: join(jbBase, "PyCharm2025.3", "plugins") },
      { ide: "PyCharm", path: join(jbBase, "PyCharm2024.3", "plugins") },
      { ide: "WebStorm", path: join(jbBase, "WebStorm2025.3", "plugins") },
      { ide: "WebStorm", path: join(jbBase, "WebStorm2024.3", "plugins") },
    );
  }

  // Zed
  if (platform === "darwin") {
    zed.push({ ide: "Zed", path: join(home, "Library", "Application Support", "Zed", "extensions") });
  } else if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      zed.push({ ide: "Zed", path: join(localAppData, "Zed", "extensions") });
    }
  } else {
    const xdgData = process.env.XDG_DATA_HOME;
    zed.push({
      ide: "Zed",
      path: xdgData ? join(xdgData, "zed", "extensions") : join(home, ".local", "share", "zed", "extensions"),
    });
  }

  _cachedAllRoots = { vsCode, jetBrains, zed };
  return _cachedAllRoots;
}

interface VSCodeExtensionManifest {
  name: string;
  publisher?: string;
  version: string;
  displayName?: string;
  description?: string;
  categories?: string[];
  keywords?: string[];
  activationEvents?: string[];
  contributes?: {
    commands?: unknown[];
    configuration?: unknown;
    menus?: unknown;
    keybindings?: unknown[];
    themes?: unknown[];
    grammars?: unknown[];
    snippets?: unknown[];
    views?: unknown;
    viewsContainers?: unknown;
    [key: string]: unknown;
  };
  main?: string;
  browser?: string;
  engines?: { vscode?: string };
  repository?: { url?: string };
  bugs?: { url?: string };
  aiRelated?: {
    providesAICommands?: boolean;
    hasLanguageModel?: boolean;
    providesChatParticipants?: boolean;
    usesLanguageModel?: boolean;
  };
}

async function resolveNLSString(extensionPath: string, value: string): Promise<string> {
  if (!value?.startsWith("%")) return value;

  try {
    const nlsPath = join(extensionPath, "package.nls.json");
    const nlsContent = await readFile(nlsPath, "utf-8");
    const nls = JSON.parse(nlsContent) as Record<string, string>;
    const key = value.slice(1, -1); // Remove % from both sides
    return nls[key] || value;
  } catch {
    return value;
  }
}

async function parseVSCodeExtension(extensionPath: string): Promise<VSCodeExtensionManifest | null> {
  try {
    const packageJsonPath = join(extensionPath, "package.json");
    const content = await readFile(packageJsonPath, "utf-8");
    const manifest = JSON.parse(content) as VSCodeExtensionManifest;

    // Resolve NLS placeholders in displayName
    if (manifest.displayName?.startsWith("%")) {
      manifest.displayName = await resolveNLSString(extensionPath, manifest.displayName);
    }

    // Detect AI-related extensions using pre-compiled regex (single pass)
    const descLower = manifest.description?.toLowerCase() ?? "";
    const nameLower = manifest.name?.toLowerCase() ?? "";

    const isAIRelated = (
      manifest.keywords?.some(k => AI_KEYWORD_PATTERN.test(k)) ||
      manifest.categories?.some(c => AI_KEYWORD_PATTERN.test(c)) ||
      AI_KEYWORD_PATTERN.test(descLower) ||
      AI_KEYWORD_PATTERN.test(nameLower) ||
      manifest.contributes?.commands?.some((cmd: any) =>
        AI_KEYWORD_PATTERN.test(cmd.title || "") || AI_KEYWORD_PATTERN.test(cmd.command || "")
      ) ||
      manifest.activationEvents?.some(e =>
        e.includes("onLanguageModel") || e.includes("onChatParticipant")
      )
    );

    return {
      ...manifest,
      aiRelated: {
        providesAICommands: manifest.contributes?.commands?.some((cmd: any) =>
          AI_KEYWORD_PATTERN.test(cmd.title || "")
        ) || false,
        hasLanguageModel: manifest.activationEvents?.some(e => e.includes("onLanguageModel")) || false,
        providesChatParticipants: manifest.contributes?.["chatParticipants"] !== undefined,
        usesLanguageModel: isAIRelated || false,
      }
    };
  } catch {
    return null;
  }
}

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
  } catch {
    return [];
  }
}

async function discoverJetBrainsPlugins(root: IDERoot): Promise<IDEExtensionTarget[]> {
  if (!(await dirExists(root.path))) return [];

  try {
    const entries = await readdir(root.path, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    // Parse all plugins concurrently
    const results = await Promise.all(
      dirs.map(async (entry): Promise<IDEExtensionTarget | null> => {
        const pluginPath = join(root.path, entry.name);
        const metaInfPath = join(pluginPath, "META-INF", "plugin.xml");
        const rootPluginPath = join(pluginPath, "plugin.xml");

        // Try both paths concurrently
        const [metaExists, rootExists] = await Promise.all([
          stat(metaInfPath).then(() => true, () => false),
          stat(rootPluginPath).then(() => true, () => false),
        ]);

        const pluginXmlPath = metaExists ? metaInfPath : rootExists ? rootPluginPath : null;
        if (!pluginXmlPath) return null;

        const content = await readFile(pluginXmlPath, "utf-8").catch(() => null);
        if (!content) return null;

        return {
          name: XML_NAME_RE.exec(content)?.[1] || entry.name,
          path: pluginPath,
          ide: root.ide,
          extensionId: XML_ID_RE.exec(content)?.[1] || entry.name,
          version: XML_VERSION_RE.exec(content)?.[1],
          publisher: XML_VENDOR_RE.exec(content)?.[1],
        };
      })
    );

    return results.filter((r): r is IDEExtensionTarget => r !== null);
  } catch {
    return [];
  }
}

async function discoverZedExtensions(root: IDERoot): Promise<IDEExtensionTarget[]> {
  if (!(await dirExists(root.path))) return [];

  try {
    const entries = await readdir(root.path, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());

    // Parse all Zed extension manifests concurrently
    const results = await Promise.all(
      dirs.map(async (entry): Promise<IDEExtensionTarget | null> => {
        const extPath = join(root.path, entry.name);
        try {
          const content = await readFile(join(extPath, "extension.json"), "utf-8");
          const manifest = JSON.parse(content);
          return {
            name: manifest.name || entry.name,
            path: extPath,
            ide: root.ide,
            extensionId: manifest.id || entry.name,
            version: manifest.version,
            publisher: manifest.author,
          };
        } catch {
          return null;
        }
      })
    );

    return results.filter((r): r is IDEExtensionTarget => r !== null);
  } catch {
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
