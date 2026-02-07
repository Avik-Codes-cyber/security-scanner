import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { getHomeDir } from "../../../utils/platform";
import { dirExists } from "../../../utils/fs";
import { debugWarn } from "../../../utils/error-handling";
import { FIREFOX_ROOTS, BROWSER_PATHS } from "../../../constants";

export type FirefoxProfile = { name?: string; path: string };

function parseIni(raw: string): Record<string, Record<string, string>> {
    const sections: Record<string, Record<string, string>> = {};
    let current: string | null = null;

    for (const line of raw.split(/\r?\n/g)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;

        const header = trimmed.match(/^\[(.+)\]$/);
        if (header) {
            current = header[1]!;
            sections[current] = sections[current] ?? {};
            continue;
        }

        const kv = trimmed.match(/^([^=]+)=(.*)$/);
        if (kv && current) {
            sections[current]![kv[1]!.trim()] = kv[2]!.trim();
        }
    }

    return sections;
}

export async function discoverFirefoxProfiles(): Promise<{ firefoxDir: string; profiles: FirefoxProfile[] } | null> {
    const home = getHomeDir();
    if (!home) return null;

    const firefoxDir =
        process.platform === "darwin"
            ? join(home, ...FIREFOX_ROOTS.darwin)
            : process.platform === "win32"
                ? (() => {
                    const appdata = process.env.APPDATA;
                    return appdata ? join(appdata, ...FIREFOX_ROOTS.win32) : null;
                })()
                : join(home, ...FIREFOX_ROOTS.linux);

    if (!firefoxDir) return null;
    if (!(await dirExists(firefoxDir))) return null;

    const profilesIniPath = join(firefoxDir, BROWSER_PATHS.FIREFOX_PROFILES_INI);
    let iniText: string | null = null;
    try {
        iniText = await readFile(profilesIniPath, "utf-8");
    } catch (error) {
        debugWarn(`Warning: Failed to read Firefox profiles.ini at ${profilesIniPath}`, error);
        iniText = null;
    }

    const profiles: FirefoxProfile[] = [];

    if (iniText) {
        const ini = parseIni(iniText);
        for (const [section, values] of Object.entries(ini)) {
            if (!section.toLowerCase().startsWith("profile")) continue;
            const rel = values.IsRelative === "1" || values.IsRelative?.toLowerCase() === "true";
            const p = values.Path;
            if (!p) continue;
            const profilePath = rel ? join(firefoxDir, p) : p;
            profiles.push({ name: values.Name, path: profilePath });
        }
    }

    // Fallback: enumerate Profiles/ on macOS and Windows if profiles.ini is missing
    if (profiles.length === 0 && (process.platform === "darwin" || process.platform === "win32")) {
        const profilesRoot = join(firefoxDir, BROWSER_PATHS.FIREFOX_PROFILES_DIR);
        if (await dirExists(profilesRoot)) {
            try {
                const entries = await readdir(profilesRoot, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    profiles.push({ name: entry.name, path: join(profilesRoot, entry.name) });
                }
            } catch (error) {
                debugWarn(`Warning: Failed to read Firefox Profiles directory ${profilesRoot}`, error);
            }
        }
    }

    return { firefoxDir, profiles };
}
