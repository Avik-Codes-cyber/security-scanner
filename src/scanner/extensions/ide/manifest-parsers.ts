import { readFile, stat } from "fs/promises";
import { join } from "path";
import { IDE_PATTERNS } from "../../../constants";
import { debugWarn } from "../../../utils/error-handling";

const AI_KEYWORD_PATTERN = IDE_PATTERNS.AI_KEYWORD;
const XML_ID_RE = IDE_PATTERNS.XML.ID;
const XML_NAME_RE = IDE_PATTERNS.XML.NAME;
const XML_VERSION_RE = IDE_PATTERNS.XML.VERSION;
const XML_VENDOR_RE = IDE_PATTERNS.XML.VENDOR;

export interface VSCodeExtensionManifest {
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
        const key = value.slice(1, -1);
        return nls[key] || value;
    } catch (error) {
        debugWarn(`Warning: Failed to resolve NLS string "${value}" in ${extensionPath}`, error);
        return value;
    }
}

export async function parseVSCodeExtension(extensionPath: string): Promise<VSCodeExtensionManifest | null> {
    try {
        const packageJsonPath = join(extensionPath, "package.json");
        const content = await readFile(packageJsonPath, "utf-8");
        const manifest = JSON.parse(content) as VSCodeExtensionManifest;

        if (manifest.displayName?.startsWith("%")) {
            manifest.displayName = await resolveNLSString(extensionPath, manifest.displayName);
        }

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
    } catch (error) {
        debugWarn(`Warning: Failed to parse VS Code extension at ${extensionPath}`, error);
        return null;
    }
}

export async function parseJetBrainsPlugin(pluginPath: string, entryName: string): Promise<{ name: string; extensionId: string; version?: string; publisher?: string } | null> {
    const metaInfPath = join(pluginPath, "META-INF", "plugin.xml");
    const rootPluginPath = join(pluginPath, "plugin.xml");

    const [metaExists, rootExists] = await Promise.all([
        stat(metaInfPath).then(() => true, () => false),
        stat(rootPluginPath).then(() => true, () => false),
    ]);

    const pluginXmlPath = metaExists ? metaInfPath : rootExists ? rootPluginPath : null;
    if (!pluginXmlPath) return null;

    const content = await readFile(pluginXmlPath, "utf-8").catch(() => null);
    if (!content) return null;

    return {
        name: XML_NAME_RE.exec(content)?.[1] || entryName,
        extensionId: XML_ID_RE.exec(content)?.[1] || entryName,
        version: XML_VERSION_RE.exec(content)?.[1],
        publisher: XML_VENDOR_RE.exec(content)?.[1],
    };
}

export async function parseZedExtension(extPath: string, entryName: string): Promise<{ name: string; extensionId: string; version?: string; publisher?: string } | null> {
    try {
        const content = await readFile(join(extPath, "extension.json"), "utf-8");
        const manifest = JSON.parse(content);
        return {
            name: manifest.name || entryName,
            extensionId: manifest.id || entryName,
            version: manifest.version,
            publisher: manifest.author,
        };
    } catch (error) {
        debugWarn(`Warning: Failed to parse Zed extension at ${extPath}`, error);
        return null;
    }
}
