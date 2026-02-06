import type { Finding, ScanResult, Severity } from "../types";

function severityToLevel(sev: Severity): "error" | "warning" | "note" {
  switch (sev) {
    case "CRITICAL":
    case "HIGH":
      return "error";
    case "MEDIUM":
      return "warning";
    case "LOW":
    default:
      return "note";
  }
}

function buildRules(findings: Finding[]) {
  const rules = new Map<string, { id: string; name: string; shortDescription: { text: string } }>();
  for (const finding of findings) {
    if (!rules.has(finding.ruleId)) {
      rules.set(finding.ruleId, {
        id: finding.ruleId,
        name: finding.ruleId,
        shortDescription: { text: finding.message },
      });
    }
  }
  return Array.from(rules.values());
}

function buildResults(findings: Finding[]) {
  return findings.map((finding) => {
    const result: any = {
      ruleId: finding.ruleId,
      level: severityToLevel(finding.severity),
      message: { text: finding.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: finding.file },
          },
        },
      ],
    };

    if (finding.line) {
      result.locations[0].physicalLocation.region = {
        startLine: finding.line,
      };
    }

    return result;
  });
}

export function toSarif(result: ScanResult): string {
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Security Scanner",
            rules: buildRules(result.findings),
          },
        },
        results: buildResults(result.findings),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
