import { readdir } from "fs/promises";
import { join } from "path";
import { dirExists } from "../../../utils/fs";
import { debugWarn } from "../../../utils/error-handling";
import { BROWSER_PATHS } from "../../../constants";
import { getChromiumRoots } from "./platform-roots";
import { discoverChromiumExtensions, listChromiumProfileDirs } from "./chromium-discovery";
import { discoverFirefoxProfiles } from "./firefox-discovery";

export type ExtensionTarget = {
  name: string;
  path: string;
  browser: string;
  profile?: string;
  id?: string;
  version?: string;
};

async function discoverFirefoxExtensions(): Promise<ExtensionTarget[]> {
  const result = await discoverFirefoxProfiles();
  if (!result) return [];

  const targets: ExtensionTarget[] = [];
  for (const profile of result.profiles) {
    const extDir = join(profile.path, BROWSER_PATHS.FIREFOX_EXTENSIONS_DIR);
    if (!(await dirExists(extDir))) continue;

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
      debugWarn(`Warning: Failed to read Firefox extensions directory ${extDir}`, error);
    }
  }

  return targets;
}

export async function discoverBrowserExtensions(extraRoots?: string[]): Promise<ExtensionTarget[]> {
  const targets: ExtensionTarget[] = [];
  const roots = getChromiumRoots();

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
  const roots = getChromiumRoots();
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
