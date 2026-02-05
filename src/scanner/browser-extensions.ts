import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { dirExists } from "../utils/fs";

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
  return [
    { browser: "Chrome", path: join(home, "Library", "Application Support", "Google", "Chrome") },
    { browser: "Chrome Canary", path: join(home, "Library", "Application Support", "Google", "Chrome Canary") },
    { browser: "Edge", path: join(home, "Library", "Application Support", "Microsoft Edge") },
    { browser: "Edge Beta", path: join(home, "Library", "Application Support", "Microsoft Edge Beta") },
    { browser: "Edge Dev", path: join(home, "Library", "Application Support", "Microsoft Edge Dev") },
    { browser: "Edge Canary", path: join(home, "Library", "Application Support", "Microsoft Edge Canary") },
    { browser: "Brave", path: join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser") },
    { browser: "Brave Beta", path: join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser-Beta") },
    { browser: "Brave Nightly", path: join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser-Nightly") },
    { browser: "Chromium", path: join(home, "Library", "Application Support", "Chromium") },
    { browser: "Arc", path: join(home, "Library", "Application Support", "Arc") },
    { browser: "Arc", path: join(home, "Library", "Application Support", "Arc", "User Data") },
    { browser: "Vivaldi", path: join(home, "Library", "Application Support", "Vivaldi") },
    { browser: "Opera", path: join(home, "Library", "Application Support", "com.operasoftware.Opera") },
    { browser: "Opera GX", path: join(home, "Library", "Application Support", "com.operasoftware.OperaGX") },
  ];
}

function linuxChromiumRoots(): Array<{ browser: string; path: string }> {
  const home = homeDir();
  if (!home) return [];
  return [
    { browser: "Chrome", path: join(home, ".config", "google-chrome") },
    { browser: "Chrome Beta", path: join(home, ".config", "google-chrome-beta") },
    { browser: "Chrome Dev", path: join(home, ".config", "google-chrome-unstable") },
    { browser: "Chromium", path: join(home, ".config", "chromium") },
    { browser: "Edge", path: join(home, ".config", "microsoft-edge") },
    { browser: "Edge Beta", path: join(home, ".config", "microsoft-edge-beta") },
    { browser: "Edge Dev", path: join(home, ".config", "microsoft-edge-dev") },
    { browser: "Brave", path: join(home, ".config", "BraveSoftware", "Brave-Browser") },
    { browser: "Brave Beta", path: join(home, ".config", "BraveSoftware", "Brave-Browser-Beta") },
    { browser: "Brave Nightly", path: join(home, ".config", "BraveSoftware", "Brave-Browser-Nightly") },
    { browser: "Vivaldi", path: join(home, ".config", "vivaldi") },
    { browser: "Vivaldi Snapshot", path: join(home, ".config", "vivaldi-snapshot") },
    { browser: "Opera", path: join(home, ".config", "opera") },
    { browser: "Opera Beta", path: join(home, ".config", "opera-beta") },
  ];
}

function winChromiumRoots(): Array<{ browser: string; path: string }> {
  const local = process.env.LOCALAPPDATA;
  const roaming = process.env.APPDATA;
  if (!local) return [];
  return [
    { browser: "Chrome", path: join(local, "Google", "Chrome", "User Data") },
    { browser: "Chrome Canary", path: join(local, "Google", "Chrome SxS", "User Data") },
    { browser: "Edge", path: join(local, "Microsoft", "Edge", "User Data") },
    { browser: "Edge Beta", path: join(local, "Microsoft", "Edge Beta", "User Data") },
    { browser: "Edge Dev", path: join(local, "Microsoft", "Edge Dev", "User Data") },
    { browser: "Edge Canary", path: join(local, "Microsoft", "Edge SxS", "User Data") },
    { browser: "Brave", path: join(local, "BraveSoftware", "Brave-Browser", "User Data") },
    { browser: "Brave Beta", path: join(local, "BraveSoftware", "Brave-Browser-Beta", "User Data") },
    { browser: "Brave Nightly", path: join(local, "BraveSoftware", "Brave-Browser-Nightly", "User Data") },
    { browser: "Vivaldi", path: join(local, "Vivaldi", "User Data") },
    // Opera uses a single profile directory rooted in %APPDATA%.
    ...(roaming ? [{ browser: "Opera", path: join(roaming, "Opera Software", "Opera Stable") }] : []),
    ...(roaming ? [{ browser: "Opera GX", path: join(roaming, "Opera Software", "Opera GX Stable") }] : []),
  ];
}

async function listChromiumProfileDirs(userDataDir: string): Promise<Array<{ profile: string; path: string }>> {
  // Some Chromium forks (notably Opera) use a single profile dir where Extensions/ lives directly.
  const directExtensions = join(userDataDir, "Extensions");
  if (await dirExists(directExtensions)) {
    return [{ profile: "Default", path: userDataDir }];
  }

  const results: Array<{ profile: string; path: string }> = [];

  try {
    const entries = await readdir(userDataDir, { withFileTypes: true });
    const candidates = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    for (const name of candidates) {
      // Be liberal: some browsers add "System Profile" or other names.
      const looksLikeProfile =
        name === "Default" || name === "Guest Profile" || name === "System Profile" || name.startsWith("Profile ");
      const extRoot = join(userDataDir, name, "Extensions");
      if (looksLikeProfile) {
        if (await dirExists(extRoot)) results.push({ profile: name, path: join(userDataDir, name) });
        continue;
      }
      // Fall back: include any directory that has Extensions/ under it.
      if (await dirExists(extRoot)) results.push({ profile: name, path: join(userDataDir, name) });
    }
  } catch {
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
    const extRoot = join(profile.path, "Extensions");
    if (!(await dirExists(extRoot))) continue;

    let extIds: string[] = [];
    try {
      const entries = await readdir(extRoot, { withFileTypes: true });
      extIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      continue;
    }

    for (const id of extIds) {
      const idDir = join(extRoot, id);
      let versions: string[] = [];
      try {
        const entries = await readdir(idDir, { withFileTypes: true });
        versions = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
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
      ? join(home, "Library", "Application Support", "Firefox")
      : process.platform === "win32"
        ? (() => {
          const appdata = process.env.APPDATA;
          return appdata ? join(appdata, "Mozilla", "Firefox") : null;
        })()
        : join(home, ".mozilla", "firefox");

  if (!firefoxDir) return null;
  if (!(await dirExists(firefoxDir))) return null;

  const profilesIniPath = join(firefoxDir, "profiles.ini");
  let iniText: string | null = null;
  try {
    iniText = await readFile(profilesIniPath, "utf-8");
  } catch {
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
    const profilesRoot = join(firefoxDir, "Profiles");
    if (await dirExists(profilesRoot)) {
      try {
        const entries = await readdir(profilesRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          profiles.push({ name: entry.name, path: join(profilesRoot, entry.name) });
        }
      } catch {
        // ignore
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
    const extDir = join(profile.path, "extensions");
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
    } catch {
      // ignore
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
      const extRoot = join(profile.path, "Extensions");
      if (await dirExists(extRoot)) watchRoots.push(extRoot);
    }
  }

  const ff = await discoverFirefoxProfiles();
  if (ff) {
    for (const profile of ff.profiles) {
      const extDir = join(profile.path, "extensions");
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
