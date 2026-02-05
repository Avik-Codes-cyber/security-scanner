import { readdir } from "fs/promises";
import { basename, dirname, join, resolve, isAbsolute } from "path";
import matter from "gray-matter";
import type { Skill } from "./types.ts";
import { dirExists, fileExists, isInSkippedDir, readText, sanitizePath } from "../utils/fs.ts";

const SKIP_DIRS = ["node_modules", ".git", "dist", "build", "__pycache__"];

const LOCAL_SKILL_DIRS = [
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

const SYSTEM_SKILL_DIRS = [
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

export type DiscoverSkillsOptions = {
  includeSystem?: boolean;
  extraSkillDirs?: string[];
  fullDepth?: boolean;
};

async function loadSkill(skillDir: string): Promise<Skill | null> {
  const skillPath = join(skillDir, "SKILL.md");
  if (!(await fileExists(skillPath))) return null;

  try {
    const content = await readText(skillPath);
    const { data } = matter(content);
    const name = typeof data?.name === "string" && data.name.trim() !== "" ? data.name.trim() : basename(skillDir);

    return {
      name,
      path: skillDir,
      content,
    };
  } catch {
    return null;
  }
}

async function scanImmediateDirs(searchRoot: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const sanitizedRoot = sanitizePath(searchRoot);

  if (!(await dirExists(sanitizedRoot))) {
    return skills;
  }

  const rootSkill = await loadSkill(sanitizedRoot);
  if (rootSkill) {
    skills.push(rootSkill);
  }

  try {
    const entries = await readdir(sanitizedRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.includes(entry.name)) continue;
      const skill = await loadSkill(join(sanitizedRoot, entry.name));
      if (skill) skills.push(skill);
    }
  } catch {
    // Directory missing or unreadable
  }

  return skills;
}

async function findAllSkills(basePath: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const seenPaths = new Set<string>();
  const sanitizedBase = sanitizePath(basePath);

  const glob = new Bun.Glob("**/SKILL.md");
  for await (const match of glob.scan({ cwd: sanitizedBase, onlyFiles: true })) {
    if (isInSkippedDir(match, SKIP_DIRS)) continue;
    const skillDir = dirname(join(sanitizedBase, match));
    if (seenPaths.has(skillDir)) continue;
    const skill = await loadSkill(skillDir);
    if (skill) {
      skills.push(skill);
      seenPaths.add(skillDir);
    }
  }

  return skills;
}

function getHomeDir(): string | null {
  if (process.env.HOME) return process.env.HOME;
  if (process.env.USERPROFILE) return process.env.USERPROFILE;
  if (process.env.HOMEDRIVE && process.env.HOMEPATH) {
    return join(process.env.HOMEDRIVE, process.env.HOMEPATH);
  }
  return null;
}

export function getSearchRoots(basePath: string, options?: DiscoverSkillsOptions): string[] {
  const resolved = sanitizePath(resolve(basePath));
  const roots: string[] = [resolved];

  for (const dir of LOCAL_SKILL_DIRS) {
    roots.push(resolve(resolved, dir));
  }

  if (options?.extraSkillDirs?.length) {
    for (const extra of options.extraSkillDirs) {
      if (!extra) continue;
      const resolvedExtra = isAbsolute(extra) ? extra : resolve(resolved, extra);
      roots.push(sanitizePath(resolvedExtra));
    }
  }

  if (options?.includeSystem) {
    const home = getHomeDir();
    if (home) {
      for (const dir of SYSTEM_SKILL_DIRS) {
        roots.push(sanitizePath(resolve(home, dir)));
      }
    }
  }

  return Array.from(new Set(roots));
}

export async function discoverSkills(basePath: string, options?: DiscoverSkillsOptions): Promise<Skill[]> {
  const searchRoots = getSearchRoots(basePath, options);
  const skills: Skill[] = [];
  const seen = new Map<string, Skill>();

  for (const searchRoot of searchRoots) {
    const found = await scanImmediateDirs(searchRoot);
    for (const skill of found) {
      if (!seen.has(skill.path)) {
        seen.set(skill.path, skill);
        skills.push(skill);
      }
    }
  }

  if (skills.length === 0 || options?.fullDepth) {
    for (const searchRoot of searchRoots) {
      if (!(await dirExists(searchRoot))) {
        continue;
      }
      const fallback = await findAllSkills(searchRoot);
      for (const skill of fallback) {
        if (!seen.has(skill.path)) {
          seen.set(skill.path, skill);
          skills.push(skill);
        }
      }
    }
  }

  return skills;
}
