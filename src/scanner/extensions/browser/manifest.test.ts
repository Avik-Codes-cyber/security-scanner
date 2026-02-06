import { describe, expect, test } from "bun:test";
import { analyzeExtensionManifest } from "./manifest";

describe("analyzeExtensionManifest", () => {
  test("flags <all_urls> host access", () => {
    const manifest = JSON.stringify({
      manifest_version: 3,
      name: "x",
      version: "1.0.0",
      host_permissions: ["<all_urls>"],
    });
    const findings = analyzeExtensionManifest("/tmp/manifest.json", manifest);
    expect(findings.some((f) => f.ruleId === "EXT_MANIFEST_ALL_URLS" && f.severity === "HIGH")).toBe(true);
  });

  test("flags nativeMessaging as CRITICAL", () => {
    const manifest = JSON.stringify({
      manifest_version: 2,
      name: "x",
      version: "1.0.0",
      permissions: ["nativeMessaging"],
    });
    const findings = analyzeExtensionManifest("/tmp/manifest.json", manifest);
    expect(findings.some((f) => f.ruleId === "EXT_MANIFEST_NATIVE_MESSAGING" && f.severity === "CRITICAL")).toBe(true);
  });

  test("flags unsafe CSP", () => {
    const manifest = JSON.stringify({
      manifest_version: 2,
      name: "x",
      version: "1.0.0",
      content_security_policy: "script-src 'self' 'unsafe-eval'; object-src 'self'",
    });
    const findings = analyzeExtensionManifest("/tmp/manifest.json", manifest);
    expect(findings.some((f) => f.ruleId === "EXT_MANIFEST_CSP_UNSAFE" && f.severity === "HIGH")).toBe(true);
  });

  test("ignores non-extension manifest.json", () => {
    const nonExt = JSON.stringify({ name: "x" });
    const findings = analyzeExtensionManifest("/tmp/manifest.json", nonExt);
    expect(findings.length).toBe(0);
  });
});

