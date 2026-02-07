/**
 * Centralized constants for the security scanner
 */

// ============================================================================
// File Size Limits
// ============================================================================

export const FILE_SIZE_LIMITS = {
    /** Maximum file size to scan (5MB) */
    MAX_SCAN_BYTES: 5 * 1024 * 1024,
    /** Threshold for using streaming (10MB) */
    STREAMING_THRESHOLD: 10 * 1024 * 1024,
} as const;

// ============================================================================
// Scanning Limits
// ============================================================================

export const SCAN_LIMITS = {
    /** Maximum findings per rule per file */
    MAX_FINDINGS_PER_RULE_PER_FILE: 20,
    /** Maximum heuristic findings */
    MAX_HEURISTIC_FINDINGS: 10,
} as const;

// ============================================================================
// Directory and File Patterns
// ============================================================================

export const SKIP_DIRS = ["node_modules", ".git", "dist", "build", "__pycache__"];

export const SCAN_EXTENSIONS = new Set([".py", ".ts", ".js", ".mjs", ".cjs", ".sh", ".bash"]);

export const SPECIAL_FILES = new Set(["SKILL.md", "manifest.json", "package.json"]);

export const BINARY_EXTENSIONS = new Set([
    ".exe",
    ".bin",
    ".dll",
    ".so",
    ".dylib",
    ".jar",
    ".crx",
    ".xpi",
    ".zip",
]);

// ============================================================================
// Skill Discovery Paths
// ============================================================================

export const LOCAL_SKILL_DIRS = [
    "skills",
    "skills/.curated",
    "skills/.experimental",
    "skills/.system",
    ".skills",
    ".agent/skills",
    ".agents/skills",
    ".claude/skills",
    ".cline/skills",
    ".codebuddy/skills",
    ".codex/skills",
    ".commandcode/skills",
    ".continue/skills",
    ".cursor/skills",
    ".github/skills",
    ".goose/skills",
    ".iflow/skills",
    ".junie/skills",
    ".kilocode/skills",
    ".kiro/skills",
    ".mcp/skills",
    ".mux/skills",
    ".neovate/skills",
    ".opencode/skills",
    ".openhands/skills",
    ".pi/skills",
    ".qoder/skills",
    ".roo/skills",
    ".trae/skills",
    ".windsurf/skills",
    ".zencoder/skills",
];

export const SYSTEM_SKILL_DIRS = [
    ".codex/skills",
    ".claude/skills",
    ".cursor/skills",
    ".continue/skills",
    ".agents/skills",
    ".agent/skills",
    ".mcp/skills",
    ".github/skills",
    ".windsurf/skills",
    ".roo/skills",
    ".opencode/skills",
    ".openhands/skills",
    ".goose/skills",
    ".junie/skills",
    ".kiro/skills",
    ".kilocode/skills",
    ".qoder/skills",
    ".pi/skills",
    ".cline/skills",
    ".codebuddy/skills",
    ".commandcode/skills",
    ".mux/skills",
    ".neovate/skills",
    ".trae/skills",
    ".zencoder/skills",
    ".skills",
];

// ============================================================================
// Browser Extension Paths
// ============================================================================

export const BROWSER_PATHS = {
    /** Chromium profile names */
    CHROMIUM_PROFILE_NAMES: ["Default", "Guest Profile", "System Profile"] as const,

    /** Chromium profile prefix */
    CHROMIUM_PROFILE_PREFIX: "Profile ",

    /** Extensions directory name */
    EXTENSIONS_DIR: "Extensions",

    /** Firefox profiles.ini filename */
    FIREFOX_PROFILES_INI: "profiles.ini",

    /** Firefox extensions directory name */
    FIREFOX_EXTENSIONS_DIR: "extensions",

    /** Firefox Profiles directory name */
    FIREFOX_PROFILES_DIR: "Profiles",
} as const;

/**
 * Browser root paths for macOS
 */
export const MAC_BROWSER_ROOTS = [
    { browser: "Chrome", path: ["Library", "Application Support", "Google", "Chrome"] },
    { browser: "Chrome Canary", path: ["Library", "Application Support", "Google", "Chrome Canary"] },
    { browser: "Edge", path: ["Library", "Application Support", "Microsoft Edge"] },
    { browser: "Edge Beta", path: ["Library", "Application Support", "Microsoft Edge Beta"] },
    { browser: "Edge Dev", path: ["Library", "Application Support", "Microsoft Edge Dev"] },
    { browser: "Edge Canary", path: ["Library", "Application Support", "Microsoft Edge Canary"] },
    { browser: "Brave", path: ["Library", "Application Support", "BraveSoftware", "Brave-Browser"] },
    { browser: "Brave Beta", path: ["Library", "Application Support", "BraveSoftware", "Brave-Browser-Beta"] },
    { browser: "Brave Nightly", path: ["Library", "Application Support", "BraveSoftware", "Brave-Browser-Nightly"] },
    { browser: "Chromium", path: ["Library", "Application Support", "Chromium"] },
    { browser: "Arc", path: ["Library", "Application Support", "Arc"] },
    { browser: "Arc", path: ["Library", "Application Support", "Arc", "User Data"] },
    { browser: "Vivaldi", path: ["Library", "Application Support", "Vivaldi"] },
    { browser: "Opera", path: ["Library", "Application Support", "com.operasoftware.Opera"] },
    { browser: "Opera GX", path: ["Library", "Application Support", "com.operasoftware.OperaGX"] },
] as const;

/**
 * Browser root paths for Linux
 */
export const LINUX_BROWSER_ROOTS = [
    { browser: "Chrome", path: [".config", "google-chrome"] },
    { browser: "Chrome Beta", path: [".config", "google-chrome-beta"] },
    { browser: "Chrome Dev", path: [".config", "google-chrome-unstable"] },
    { browser: "Chromium", path: [".config", "chromium"] },
    { browser: "Edge", path: [".config", "microsoft-edge"] },
    { browser: "Edge Beta", path: [".config", "microsoft-edge-beta"] },
    { browser: "Edge Dev", path: [".config", "microsoft-edge-dev"] },
    { browser: "Brave", path: [".config", "BraveSoftware", "Brave-Browser"] },
    { browser: "Brave Beta", path: [".config", "BraveSoftware", "Brave-Browser-Beta"] },
    { browser: "Brave Nightly", path: [".config", "BraveSoftware", "Brave-Browser-Nightly"] },
    { browser: "Vivaldi", path: [".config", "vivaldi"] },
    { browser: "Vivaldi Snapshot", path: [".config", "vivaldi-snapshot"] },
    { browser: "Opera", path: [".config", "opera"] },
    { browser: "Opera Beta", path: [".config", "opera-beta"] },
] as const;

/**
 * Browser root paths for Windows
 */
export const WINDOWS_BROWSER_ROOTS = [
    { browser: "Chrome", localAppData: ["Google", "Chrome", "User Data"] },
    { browser: "Chrome Canary", localAppData: ["Google", "Chrome SxS", "User Data"] },
    { browser: "Edge", localAppData: ["Microsoft", "Edge", "User Data"] },
    { browser: "Edge Beta", localAppData: ["Microsoft", "Edge Beta", "User Data"] },
    { browser: "Edge Dev", localAppData: ["Microsoft", "Edge Dev", "User Data"] },
    { browser: "Edge Canary", localAppData: ["Microsoft", "Edge SxS", "User Data"] },
    { browser: "Brave", localAppData: ["BraveSoftware", "Brave-Browser", "User Data"] },
    { browser: "Brave Beta", localAppData: ["BraveSoftware", "Brave-Browser-Beta", "User Data"] },
    { browser: "Brave Nightly", localAppData: ["BraveSoftware", "Brave-Browser-Nightly", "User Data"] },
    { browser: "Vivaldi", localAppData: ["Vivaldi", "User Data"] },
    { browser: "Opera", appData: ["Opera Software", "Opera Stable"] },
    { browser: "Opera GX", appData: ["Opera Software", "Opera GX Stable"] },
] as const;

/**
 * Firefox root paths by platform
 */
export const FIREFOX_ROOTS = {
    darwin: ["Library", "Application Support", "Firefox"],
    win32: ["Mozilla", "Firefox"], // Uses APPDATA
    linux: [".mozilla", "firefox"],
} as const;

// ============================================================================
// MCP Config Paths
// ============================================================================

export const MCP_WELL_KNOWN_CONFIGS = {
    mac: [
        "~/.codeium/windsurf/mcp_config.json",
        "~/.cursor/mcp.json",
        "~/.vscode/mcp.json",
        "~/Library/Application Support/Code/User/settings.json",
        "~/Library/Application Support/Code/User/mcp.json",
        "~/Library/Application Support/Claude/claude_desktop_config.json",
        "~/.claude.json",
        "~/.gemini/settings.json",
        "~/.kiro/settings/mcp.json",
        "~/.gemini/antigravity/mcp_config.json",
    ],
    linux: [
        "~/.codeium/windsurf/mcp_config.json",
        "~/.cursor/mcp.json",
        "~/.vscode/mcp.json",
        "~/.config/Code/User/settings.json",
        "~/.config/Code/User/mcp.json",
        "~/.claude.json",
        "~/.gemini/settings.json",
        "~/.kiro/settings/mcp.json",
        "~/.gemini/antigravity/mcp_config.json",
    ],
    windows: [
        "~/.codeium/windsurf/mcp_config.json",
        "~/.cursor/mcp.json",
        "~/.vscode/mcp.json",
        "~/AppData/Roaming/Code/User/settings.json",
        "~/AppData/Roaming/Code/User/mcp.json",
        "~/AppData/Roaming/Claude/claude_desktop_config.json",
        "~/.claude.json",
        "~/.gemini/settings.json",
        "~/.kiro/settings/mcp.json",
        "~/.gemini/antigravity/mcp_config.json",
    ],
} as const;

// ============================================================================
// IDE Extension Patterns
// ============================================================================

export const IDE_PATTERNS = {
    /** Pattern for detecting AI-related keywords in extension descriptions */
    AI_KEYWORD: /\b(ai|gpt|copilot|llm|language.model|chatgpt|claude|anthropic|openai|ollama|localai|codeium|tabnine|intellisense|assistant)\b/i,

    /** Pattern for detecting AI-related extension names */
    AI_EXTENSION: /copilot|chatgpt|claude|anthropic|codeium|tabnine|cody|continue|supermaven|cursor|ai|gpt|llm|assistant/i,

    /** XML patterns for JetBrains plugin.xml parsing */
    XML: {
        ID: /<id>([^<]+)<\/id>/,
        NAME: /<name>([^<]+)<\/name>/,
        VERSION: /<version>([^<]+)<\/version>/,
        VENDOR: /<vendor[^>]*>([^<]+)<\/vendor>/,
    },
} as const;
