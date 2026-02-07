import { join } from "path";
import { getHomeDir } from "../../../utils/platform";

export type IDERoot = { ide: string; path: string };

let _cachedAllRoots: { vsCode: IDERoot[]; jetBrains: IDERoot[]; zed: IDERoot[] } | null = null;

export function getAllRoots(): { vsCode: IDERoot[]; jetBrains: IDERoot[]; zed: IDERoot[] } {
    if (_cachedAllRoots) return _cachedAllRoots;

    const home = getHomeDir();
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
