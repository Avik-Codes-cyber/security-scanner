import { readdir } from "fs/promises";
import { join } from "path";
import { dirExists } from "../../../utils/fs";
import { BROWSER_PATHS } from "../../../constants";
import { debugWarn } from "../../../utils/error-handling";
import type { ExtensionTarget } from "./index";

export async function listChromiumProfileDirs(userDataDir: string): Promise<Array<{ profile: string; path: string }>> {
    const directExtensions = join(userDataDir, BROWSER_PATHS.EXTENSIONS_DIR);
    if (await dirExists(directExtensions)) {
        return [{ profile: BROWSER_PATHS.CHROMIUM_PROFILE_NAMES[0], path: userDataDir }];
    }

    const results: Array<{ profile: string; path: string }> = [];

    try {
        const entries = await readdir(userDataDir, { withFileTypes: true });
        const candidates = entries.filter((e) => e.isDirectory()).map((e) => e.name);

        for (const name of candidates) {
            const looksLikeProfile =
                BROWSER_PATHS.CHROMIUM_PROFILE_NAMES.includes(name as any) ||
                name.startsWith(BROWSER_PATHS.CHROMIUM_PROFILE_PREFIX);
            const extRoot = join(userDataDir, name, BROWSER_PATHS.EXTENSIONS_DIR);
            if (looksLikeProfile) {
                if (await dirExists(extRoot)) results.push({ profile: name, path: join(userDataDir, name) });
                continue;
            }
            if (await dirExists(extRoot)) results.push({ profile: name, path: join(userDataDir, name) });
        }
    } catch (error) {
        debugWarn(`Warning: Failed to list Chromium profile directories in ${userDataDir}`, error);
        return [];
    }

    return results;
}

function tokenizeVersion(value: string): Array<string | number> {
    return value
        .split(/[^A-Za-z0-9]+/g)
        .filter(Boolean)
        .map((tok) => (/^\d+$/.test(tok) ? Number(tok) : tok.toLowerCase()));
}

function compareVersions(a: string, b: string): number {
    const ta = tokenizeVersion(a);
    const tb = tokenizeVersion(b);
    const len = Math.max(ta.length, tb.length);

    for (let i = 0; i < len; i++) {
        const va = ta[i];
        const vb = tb[i];
        if (va === undefined) return -1;
        if (vb === undefined) return 1;

        if (typeof va === "number" && typeof vb === "number") {
            if (va !== vb) return va < vb ? -1 : 1;
            continue;
        }

        const sa = String(va);
        const sb = String(vb);
        if (sa !== sb) return sa < sb ? -1 : 1;
    }

    if (a === b) return 0;
    return a < b ? -1 : 1;
}

export async function discoverChromiumExtensions(root: { browser: string; path: string }): Promise<ExtensionTarget[]> {
    const targets: ExtensionTarget[] = [];
    if (!(await dirExists(root.path))) return targets;

    const profiles = await listChromiumProfileDirs(root.path);
    for (const profile of profiles) {
        const extRoot = join(profile.path, BROWSER_PATHS.EXTENSIONS_DIR);
        if (!(await dirExists(extRoot))) continue;

        let extIds: string[] = [];
        try {
            const entries = await readdir(extRoot, { withFileTypes: true });
            extIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        } catch (error) {
            debugWarn(`Warning: Failed to read extensions directory ${extRoot}`, error);
            continue;
        }

        for (const id of extIds) {
            const idDir = join(extRoot, id);
            let versions: string[] = [];
            try {
                const entries = await readdir(idDir, { withFileTypes: true });
                versions = entries.filter((e) => e.isDirectory()).map((e) => e.name);
            } catch (error) {
                debugWarn(`Warning: Failed to read extension versions in ${idDir}`, error);
                continue;
            }

            if (versions.length === 0) continue;
            const latest = versions.slice().sort(compareVersions).at(-1)!;
            const versionDir = join(idDir, latest);
            targets.push({
                name: `${root.browser} ${id}@${latest} (${profile.profile})`,
                path: versionDir,
                browser: root.browser,
                profile: profile.profile,
                id,
                version: latest,
            });
        }
    }

    return targets;
}
