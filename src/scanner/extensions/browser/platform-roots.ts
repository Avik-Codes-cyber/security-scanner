import { join } from "path";
import { getHomeDir } from "../../../utils/platform";
import {
    MAC_BROWSER_ROOTS,
    LINUX_BROWSER_ROOTS,
    WINDOWS_BROWSER_ROOTS,
} from "../../../constants";

export function macChromiumRoots(): Array<{ browser: string; path: string }> {
    const home = getHomeDir();
    if (!home) return [];
    return MAC_BROWSER_ROOTS.map(({ browser, path }) => ({
        browser,
        path: join(home, ...path),
    }));
}

export function linuxChromiumRoots(): Array<{ browser: string; path: string }> {
    const home = getHomeDir();
    if (!home) return [];
    return LINUX_BROWSER_ROOTS.map(({ browser, path }) => ({
        browser,
        path: join(home, ...path),
    }));
}

export function winChromiumRoots(): Array<{ browser: string; path: string }> {
    const local = process.env.LOCALAPPDATA;
    const roaming = process.env.APPDATA;
    if (!local) return [];

    const roots: Array<{ browser: string; path: string }> = [];

    for (const config of WINDOWS_BROWSER_ROOTS) {
        if ("localAppData" in config) {
            roots.push({ browser: config.browser, path: join(local, ...config.localAppData) });
        } else if ("appData" in config && roaming) {
            roots.push({ browser: config.browser, path: join(roaming, ...config.appData) });
        }
    }

    return roots;
}

export function getChromiumRoots(): Array<{ browser: string; path: string }> {
    return process.platform === "darwin"
        ? macChromiumRoots()
        : process.platform === "win32"
            ? winChromiumRoots()
            : linuxChromiumRoots();
}
