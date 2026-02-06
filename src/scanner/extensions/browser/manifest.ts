import { basename } from "path";
import type { Finding } from "../../types.ts";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function hasAny(list: string[], needle: string): boolean {
  return list.some((v) => v === needle);
}

function hasAllUrls(list: string[]): boolean {
  return list.some((v) => v === "<all_urls>" || v === "*://*/*" || v === "http://*/*" || v === "https://*/*");
}

function pushFinding(out: Finding[], finding: Omit<Finding, "source">) {
  out.push({ ...finding, source: "heuristic" });
}

export function analyzeExtensionManifest(filePath: string, content: string): Finding[] {
  if (basename(filePath) !== "manifest.json") return [];

  let parsed: any = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const mv = parsed?.manifest_version;
  if (mv !== 2 && mv !== 3) return [];

  const findings: Finding[] = [];

  const permissions = asStringArray(parsed?.permissions);
  const hostPermissions = asStringArray(parsed?.host_permissions);
  const mv2HostsInPermissions = permissions.filter((p) => typeof p === "string" && (p.includes("://") || p === "<all_urls>"));
  const allHostList = [...hostPermissions, ...mv2HostsInPermissions];

  if (hasAllUrls(allHostList)) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_ALL_URLS",
      severity: "HIGH",
      message: "Extension requests <all_urls> host access (broad website access).",
      file: filePath,
      category: "extension_manifest",
      remediation: "Restrict host permissions to the smallest set of required domains/paths.",
    });
  }

  if (hasAny(permissions, "nativeMessaging")) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_NATIVE_MESSAGING",
      severity: "CRITICAL",
      message: "Extension requests nativeMessaging (can communicate with native applications).",
      file: filePath,
      category: "extension_manifest",
      remediation: "Avoid nativeMessaging unless absolutely required; review native host registration and IPC boundaries.",
    });
  }

  if (hasAny(permissions, "debugger")) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_DEBUGGER",
      severity: "CRITICAL",
      message: "Extension requests debugger permission (can instrument pages and intercept data).",
      file: filePath,
      category: "extension_manifest",
      remediation: "Remove debugger permission unless required for trusted internal tooling; audit all debugger usage.",
    });
  }

  if (hasAny(permissions, "webRequestBlocking")) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_WEBREQUEST_BLOCKING",
      severity: "HIGH",
      message: "Extension requests webRequestBlocking (can modify and block network requests).",
      file: filePath,
      category: "extension_manifest",
      remediation: "Prefer declarativeNetRequest when possible; restrict scopes and review request manipulation logic.",
    });
  }

  if (hasAny(permissions, "proxy")) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_PROXY",
      severity: "HIGH",
      message: "Extension requests proxy permission (can route browser traffic).",
      file: filePath,
      category: "extension_manifest",
      remediation: "Remove proxy permission if unnecessary; otherwise ensure strict controls and transparency to users.",
    });
  }

  if (hasAny(permissions, "history") || hasAny(permissions, "cookies")) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_HISTORY_OR_COOKIES",
      severity: "HIGH",
      message: "Extension requests history/cookies access (sensitive user data).",
      file: filePath,
      category: "extension_manifest",
      remediation: "Minimize sensitive permissions; document rationale and ensure data is not transmitted externally.",
    });
  }

  if (parsed?.externally_connectable) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_EXTERNAL_CONNECTABLE",
      severity: "MEDIUM",
      message: "externally_connectable is configured (external origins may message the extension).",
      file: filePath,
      category: "extension_manifest",
      remediation: "Restrict allowed origins and validate message contents; avoid exposing privileged actions.",
    });
  }

  const war = parsed?.web_accessible_resources;
  const warStrings = Array.isArray(war) ? war.filter((x: any) => typeof x === "string") : [];
  const warObjects = Array.isArray(war) ? war.filter((x: any) => x && typeof x === "object") : [];
  const warResources = [
    ...warStrings,
    ...warObjects.flatMap((o: any) => asStringArray(o.resources)),
  ];
  const warMatches = warObjects.flatMap((o: any) => asStringArray(o.matches));

  const hasBroadWar =
    warResources.some((r) => r === "*" || r === "/*" || r.includes("*")) ||
    hasAllUrls(warMatches);

  if (hasBroadWar) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_WEBA_ACCESSIBLE_BROAD",
      severity: "MEDIUM",
      message: "web_accessible_resources appears broad (resources widely exposed to web pages).",
      file: filePath,
      category: "extension_manifest",
      remediation: "Restrict web_accessible_resources to the minimum set of required resources and matches.",
    });
  }

  const cspRaw = parsed?.content_security_policy;
  const csp =
    typeof cspRaw === "string"
      ? cspRaw
      : typeof cspRaw?.extension_pages === "string"
        ? cspRaw.extension_pages
        : "";

  if (csp && (csp.includes("unsafe-eval") || csp.includes("unsafe-inline"))) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_CSP_UNSAFE",
      severity: "HIGH",
      message: "content_security_policy contains unsafe-eval or unsafe-inline.",
      file: filePath,
      category: "extension_manifest",
      remediation: "Remove unsafe CSP directives; avoid eval and inline scripts, and use nonce/hash-based policies where needed.",
    });
  }

  const updateUrl = typeof parsed?.update_url === "string" ? parsed.update_url : "";
  if (updateUrl.startsWith("http://")) {
    pushFinding(findings, {
      ruleId: "EXT_MANIFEST_UPDATE_URL_INSECURE",
      severity: "HIGH",
      message: "update_url uses insecure HTTP.",
      file: filePath,
      category: "extension_manifest",
      remediation: "Use HTTPS for update_url to prevent downgrade/MITM risks.",
    });
  }

  return findings;
}

