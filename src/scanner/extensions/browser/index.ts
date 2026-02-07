import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { dirExists } from "../../../utils/fs";
import {
  MAC_BROWSER_ROOTS,
  LINUX_BROWSER_ROOTS,
  WINDOWS_BROWSER_ROOTS,
  FIREFOX_ROOTS,
  BROWSER_PATHS,
} from "../../../constants";

export type ExtensionTarget = {
  name: string;
  path: string;
  browser: string;
  profile?: string;
  id?: string;
  version?: string;
};

function homeDir(): string | null {
  return process.env.HOME ?? process.env.USERPROFILE ?? null;
}

function macChromiumRoots(): Array<{ browser: string; path: string }> {
  const home = homeDir();
  if (!home) return [];
  return MAC_BROWSER_ROOTS.map(({ browser, path }) => ({
    browser,
    path: join(home, ...path),
  }));
}

function linuxChromiumRoots(): Array<{ browser: string; path: string }> {
  const home = homeDir();
  if (!home) return [];
  return LINUX_BROWSER_ROOTS.map(({ browser, path }) => ({
    browser,
    path: join(home, ...path),
  }));
}

function winChromiumRoots(): Array<{ browser: string; path: string }> {
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

async function listChromiumProfileDirs(userDataDir: string): Promise<Array<{ profile: string; path: string }>> {
  // Some Chromium forks (notably Opera) use a single profile dir where Extensions/ lives directly.
  const directExtensions = join(userDataDir, BROWSER_PATHS.EXTENSIONS_DIR);
  if (await dirExists(directExtensions)) {
    return [{ profile: BROWSER_PATHS.CHROMIUM_PROFILE_NAMES[0], path: userDataDir }];
  }

  const results: Array<{ profile: string; path: string }> = [];

  try {
    const entries = await readdir(userDataDir, { withFileTypes: true });
    const candidates = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    for (const name of candidates) {
      // Be liberal: some browsers add "System Profile" or other names.
      const looksLikeProfile =
        BROWSER_PATHS.CHROMIUM_PROFILE_NAMES.includes(name as any) ||
        name.startsWith(BROWSER_PATHS.CHROMIUM_PROFILE_PREFIX);
      const extRoot = join(userDataDir, name, BROWSER_PATHS.EXTENSIONS_DIR);
      if (looksLikeProfile) {
        if (await dirExists(extRoot)) results.push({ profile: name, path: join(userDataDir, name) });
        continue;
      }
      // Fall back: include any directory that has Extensions/ under it.
      if (await dirExists(extRoot)) results.push({ profile: name, path: join(userDataDir, name) });
    }
  } catch (error) {
    // Failed to read user data directory
    if (process.env.DEBUG) {
      console.warn(`Warning: Failed to list Chromium profile directories in ${userDataDir}:`, error instanceof Error ? error.message : String(error));
    }
    return [];
  }

  return results;
}

async function discoverChromiumExtensions(root: { browser: string; path: string }): Promise<ExtensionTarget[]> {
  const targets: ExtensionTarget[] = [];
  if (!(await dirExists(root.path))) return targets;

  const tokenizeVersion = (value: string): Array<string | number> => {
    return value
      .split(/[^A-Za-z0-9]+/g)
      .filter(Boolean)
      .map((tok) => (/^\d+$/.test(tok) ? Number(tok) : tok.toLowerCase()));
  };

  const compareVersions = (a: string, b: string): number => {
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
  };

  const profiles = await listChromiumProfileDirs(root.path);
  for (const profile of profiles) {
    const extRoot = join(profile.path, BROWSER_PATHS.EXTENSIONS_DIR);
    if (!(await dirExists(extRoot))) continue;

    let extIds: string[] = [];
    try {
      const entries = await readdir(extRoot, { withFileTypes: true });
      extIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (error) {
      // Failed to read extensions directory for this profile
      if (process.env.DEBUG) {
        console.warn(`Warning: Failed to read extensions directory ${extRoot}:`, error instanceof Error ? error.message : String(error));
      }
      continue;
    }

    for (const id of extIds) {
      const idDir = join(extRoot, id);
      let versions: string[] = [];
      try {
        const entries = await readdir(idDir, { withFileTypes: true });
        versions = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch (error) {
        // Failed to read version directories for this extension
        if (process.env.DEBUG) {
          console.warn(`Warning: Failed to read extension versions in ${idDir}:`, error instanceof Error ? error.message : String(error));
        }
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

type FirefoxProfile = { name?: string; path: string };

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

async function discoverFirefoxProfiles(): Promise<{ firefoxDir: string; profiles: FirefoxProfile[] } | null> {
  const home = homeDir();
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
    // Failed to read Firefox profiles.ini
    if (process.env.DEBUG) {
      console.warn(`Warning: Failed to read Firefox profiles.ini at ${profilesIniPath}:`, error instanceof Error ? error.message : String(error));
    }
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

  // Fallback: enumerate Profiles/ on macOS and Windows if profiles.ini is missing.
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
        // Failed to enumerate Firefox Profiles directory
        if (process.env.DEBUG) {
          console.warn(`Warning: Failed to read Firefox Profiles directory ${profilesRoot}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  return { firefoxDir, profiles };
}

async function discoverFirefoxExtensions(): Promise<ExtensionTarget[]> {
  const result = await discoverFirefoxProfiles();
  if (!result) return [];

  const targets: ExtensionTarget[] = [];
  for (const profile of result.profiles) {
    const extDir = join(profile.path, BROWSER_PATHS.FIREFOX_EXTENSIONS_DIR);
    if (!(await dirExists(extDir))) continue;

    // Firefox commonly stores add-ons as .xpi (zip). We do not unpack archives yet.
    // We still scan any unpacked extension directories present in this folder.
    try {
      const entries = await readdir(extDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const unpacked = join(extDir, entry.name);
        targets.push({
          name: `Firefox ${entry.name} (${profile.name ?? profile.path.split(/[\\/]/g).pop() ?? "Profile"})`,
          path: unpacked,
          browser: "Firefox",
          profile: profile.name,
          id: entry.name,
        });
      }
    } catch (error) {
      // Failed to read Firefox extensions directory
      if (process.env.DEBUG) {
        console.warn(`Warning: Failed to read Firefox extensions directory ${extDir}:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  return targets;
}

export async function discoverBrowserExtensions(extraRoots?: string[]): Promise<ExtensionTarget[]> {
  const targets: ExtensionTarget[] = [];

  const roots =
    process.platform === "darwin"
      ? macChromiumRoots()
      : process.platform === "win32"
        ? winChromiumRoots()
        : linuxChromiumRoots();

  for (const root of roots) {
    targets.push(...(await discoverChromiumExtensions(root)));
  }

  targets.push(...(await discoverFirefoxExtensions()));

  if (extraRoots?.length) {
    for (const root of extraRoots) {
      if (!root) continue;
      if (!(await dirExists(root))) continue;
      targets.push({ name: `Extensions ${root}`, path: root, browser: "Custom" });
    }
  }

  const unique = new Map<string, ExtensionTarget>();
  for (const t of targets) {
    if (!t.path) continue;
    unique.set(t.path, t);
  }

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function discoverBrowserExtensionWatchRoots(extraRoots?: string[]): Promise<string[]> {
  const roots =
    process.platform === "darwin"
      ? macChromiumRoots()
      : process.platform === "win32"
        ? winChromiumRoots()
        : linuxChromiumRoots();

  const watchRoots: string[] = [];

  for (const root of roots) {
    if (!(await dirExists(root.path))) continue;
    const profiles = await listChromiumProfileDirs(root.path);
    for (const profile of profiles) {
      const extRoot = join(profile.path, BROWSER_PATHS.EXTENSIONS_DIR);
      if (await dirExists(extRoot)) watchRoots.push(extRoot);
    }
  }

  const ff = await discoverFirefoxProfiles();
  if (ff) {
    for (const profile of ff.profiles) {
      const extDir = join(profile.path, BROWSER_PATHS.FIREFOX_EXTENSIONS_DIR);
      if (await dirExists(extDir)) watchRoots.push(extDir);
    }
  }

  if (extraRoots?.length) {
    for (const root of extraRoots) {
      if (!root) continue;
      if (await dirExists(root)) watchRoots.push(root);
    }
  }

  return Array.from(new Set(watchRoots));
}
