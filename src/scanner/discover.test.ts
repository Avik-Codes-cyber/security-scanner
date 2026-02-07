import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { discoverSkills } from "./discover";

describe("discoverSkills", () => {
    let testDir: string;

    beforeAll(() => {
        testDir = mkdtempSync(join(tmpdir(), "scanner-test-"));

        // Create test skill structure
        const skill1 = join(testDir, "skill1");
        const skill2 = join(testDir, "nested", "skill2");

        Bun.write(join(skill1, "SKILL.md"), "# Test Skill 1");
        Bun.write(join(skill2, "SKILL.md"), "# Test Skill 2");
    });

    afterAll(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    test("discovers skills in directory", async () => {
        const skills = await discoverSkills(testDir, {
            includeSystem: false,
            fullDepth: false,
        });

        expect(skills.length).toBeGreaterThanOrEqual(1);
        expect(skills.some(s => s.name === "skill1")).toBe(true);
    });

    test("discovers skills recursively with fullDepth", async () => {
        const skills = await discoverSkills(testDir, {
            includeSystem: false,
            fullDepth: true,
        });

        expect(skills.length).toBeGreaterThanOrEqual(2);
        expect(skills.some(s => s.name === "skill1")).toBe(true);
        expect(skills.some(s => s.name === "skill2")).toBe(true);
    });

    test("returns empty array for non-existent directory", async () => {
        const skills = await discoverSkills("/non/existent/path", {
            includeSystem: false,
            fullDepth: false,
        });

        expect(Array.isArray(skills)).toBe(true);
        expect(skills.length).toBe(0);
    });
});
