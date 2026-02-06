import type { Finding } from "./types.ts";

type JsFinding = { ruleId: string; severity: Finding["severity"]; message: string; index: number; remediation: string };

function indexToLine(content: string, index: number): number {
  if (index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < content.length && i < index; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

function stripJsComments(content: string): string {
  // Removes comments but keeps strings intact (needed for patterns like createElement('script')).
  let out = "";
  let i = 0;

  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escape = false;

  while (i < content.length) {
    const ch = content[i]!;
    const next = i + 1 < content.length ? content[i + 1]! : "";

    if (inSingle || inDouble || inTemplate) {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\\\") {
        escape = true;
      } else if (inSingle && ch === "'") {
        inSingle = false;
      } else if (inDouble && ch === "\"") {
        inDouble = false;
      } else if (inTemplate && ch === "`") {
        inTemplate = false;
      }
      i++;
      continue;
    }

    if (ch === "'" ) { inSingle = true; out += ch; i++; continue; }
    if (ch === "\"") { inDouble = true; out += ch; i++; continue; }
    if (ch === "`") { inTemplate = true; out += ch; i++; continue; }

    // line comment
    if (ch === "/" && next === "/") {
      while (i < content.length && content[i] !== "\n") i++;
      continue;
    }
    // block comment
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < content.length) {
        if (content[i] === "*" && i + 1 < content.length && content[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function stripJsCommentsAndStrings(content: string): string {
  // Replaces comments and strings with whitespace to keep indices stable for line calculation.
  let out = "";
  let i = 0;
  let state: "normal" | "single" | "double" | "template" | "line" | "block" = "normal";
  let escape = false;

  const push = (c: string) => (out += c);
  const wsLike = (c: string) => (c === "\n" ? "\n" : " ");

  while (i < content.length) {
    const ch = content[i]!;
    const next = i + 1 < content.length ? content[i + 1]! : "";

    if (state === "line") {
      if (ch === "\n") {
        state = "normal";
        push("\n");
      } else {
        push(" ");
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (ch === "*" && next === "/") {
        push(" ");
        push(" ");
        i += 2;
        state = "normal";
        continue;
      }
      push(wsLike(ch));
      i++;
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      push(wsLike(ch));
      if (escape) {
        escape = false;
      } else if (ch === "\\\\") {
        escape = true;
      } else if (state === "single" && ch === "'") {
        state = "normal";
      } else if (state === "double" && ch === "\"") {
        state = "normal";
      } else if (state === "template" && ch === "`") {
        state = "normal";
      }
      i++;
      continue;
    }

    // normal
    if (ch === "/" && next === "/") {
      push(" ");
      push(" ");
      i += 2;
      state = "line";
      continue;
    }
    if (ch === "/" && next === "*") {
      push(" ");
      push(" ");
      i += 2;
      state = "block";
      continue;
    }

    if (ch === "'") { state = "single"; push(" "); i++; continue; }
    if (ch === "\"") { state = "double"; push(" "); i++; continue; }
    if (ch === "`") { state = "template"; push(" "); i++; continue; }

    push(ch);
    i++;
  }

  return out;
}

function jsFindEvalAndFunction(code: string): JsFinding[] {
  const findings: JsFinding[] = [];
  const re = /\b(eval\s*\(|new\s+Function\s*\()/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    findings.push({
      ruleId: "CODE_JS_EVAL_OR_FUNCTION",
      severity: "HIGH",
      message: "Use of eval() or new Function() detected.",
      index: m.index,
      remediation: "Avoid dynamic code execution. Use safer parsing/dispatch patterns instead of eval/new Function.",
    });
    if (findings.length >= 5) break;
  }
  return findings;
}

function jsFindDynamicScriptInjection(noComment: string): JsFinding[] {
  const create = /createElement\s*\(\s*['"`]script['"`]\s*\)/g;
  const srcAssign = /\.src\s*=\s*/g;
  const c = create.exec(noComment);
  const s = srcAssign.exec(noComment);
  if (c && s) {
    return [{
      ruleId: "CODE_JS_DYNAMIC_SCRIPT_INJECT",
      severity: "HIGH",
      message: "Dynamic <script> injection detected (createElement('script') + .src=).",
      index: c.index,
      remediation: "Avoid dynamically injecting remote scripts; prefer bundled assets and enforce strict CSP.",
    }];
  }
  return [];
}

function jsFindExfilPatterns(noComment: string, original: string): JsFinding[] {
  const sources = [
    /\bdocument\.cookie\b/g,
    /\blocalStorage\b/g,
    /\bchrome\.storage\b/g,
    /\bchrome\.cookies\b/g,
  ];
  const sinks = [
    /\bfetch\s*\(/g,
    /\bXMLHttpRequest\b/g,
    /\bnew\s+WebSocket\b/g,
  ];

  const sourceLines: number[] = [];
  const sinkLines: number[] = [];

  for (const re of sources) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(noComment)) !== null) {
      sourceLines.push(indexToLine(original, m.index));
      if (sourceLines.length > 20) break;
    }
  }
  for (const re of sinks) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(noComment)) !== null) {
      sinkLines.push(indexToLine(original, m.index));
      if (sinkLines.length > 20) break;
    }
  }

  if (sourceLines.length === 0 || sinkLines.length === 0) return [];

  const within = 80;
  let close = false;
  for (const s of sourceLines) {
    for (const k of sinkLines) {
      if (Math.abs(s - k) <= within) {
        close = true;
        break;
      }
    }
    if (close) break;
  }

  const high = close || (sourceLines.length > 1 && sinkLines.length > 1);
  return [{
    ruleId: "CODE_JS_EXFIL_SOURCES_TO_NETWORK",
    severity: high ? "HIGH" : "MEDIUM",
    message: "Potential data exfiltration pattern: sensitive browser data sources used alongside network APIs.",
    index: noComment.search(/\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b/),
    remediation: "Ensure sensitive data is not transmitted externally. Validate destinations and minimize data access.",
  }];
}

export function analyzeCode(filePath: string, content: string, fileType: string): Finding[] {
  const findings: Finding[] = [];

  if (fileType === "javascript" || fileType === "typescript") {
    const noComments = stripJsComments(content);
    const stripped = stripJsCommentsAndStrings(content);

    const jsFindings: JsFinding[] = [
      ...jsFindEvalAndFunction(stripped),
      ...jsFindDynamicScriptInjection(noComments),
      ...jsFindExfilPatterns(noComments, content),
    ];

    for (const f of jsFindings) {
      const idx = typeof f.index === "number" && f.index >= 0 ? f.index : 0;
      findings.push({
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
        file: filePath,
        line: indexToLine(content, idx),
        category: "code_scan",
        remediation: f.remediation,
        source: "heuristic",
      });
    }
  } else if (fileType === "python") {
    const shellTrue = /subprocess\.(run|call|Popen|check_output)\s*\([\s\S]{0,400}?shell\s*=\s*True/g;
    const pickle = /\bpickle\.(loads?|load)\s*\(/g;

    let m: RegExpExecArray | null;
    if ((m = shellTrue.exec(content)) !== null) {
      findings.push({
        ruleId: "CODE_PY_SUBPROCESS_SHELL_TRUE",
        severity: "HIGH",
        message: "subprocess call uses shell=True (command injection risk).",
        file: filePath,
        line: indexToLine(content, m.index),
        category: "code_scan",
        remediation: "Avoid shell=True. Pass argv as a list and validate/escape any user-controlled input.",
        source: "heuristic",
      });
    }

    if ((m = pickle.exec(content)) !== null) {
      findings.push({
        ruleId: "CODE_PY_UNSAFE_DESERIALIZE",
        severity: "HIGH",
        message: "pickle deserialization detected (unsafe for untrusted data).",
        file: filePath,
        line: indexToLine(content, m.index),
        category: "code_scan",
        remediation: "Avoid pickle with untrusted data. Use safe serialization formats (JSON) and strict schemas.",
        source: "heuristic",
      });
    }
  } else if (fileType === "bash") {
    const remotePipe = /\b(curl|wget)\b[\s\S]{0,200}?\|\s*(sh|bash)\b/g;
    const m = remotePipe.exec(content);
    if (m) {
      findings.push({
        ruleId: "CODE_SH_REMOTE_PIPE",
        severity: "CRITICAL",
        message: "Remote content is piped directly to a shell (curl/wget | sh/bash).",
        file: filePath,
        line: indexToLine(content, m.index),
        category: "code_scan",
        remediation: "Never pipe remote content to a shell. Download, verify (hash/signature), then execute explicitly.",
        source: "heuristic",
      });
    }
  }

  return findings;
}

