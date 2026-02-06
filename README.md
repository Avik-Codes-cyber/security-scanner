# Security Scanner

Security Scanner (`skill-scanner`) is a Bun + TypeScript CLI that scans agent skill repositories, browser extension folders, and MCP (Model Context Protocol) servers/static exports for unsafe or malicious behavior. It discovers `SKILL.md` directories across common agent ecosystems, can optionally scan installed browser extensions, applies signature-based rules, and runs an additional heuristic layer for supply-chain and secret-detection risks. It is designed for CI usage and fast local audits.

## Features
- Recursive skill discovery across multiple agent ecosystems
- Optional scanning of installed browser extensions (Chromium-based browsers like Chrome/Edge/Brave/Vivaldi/Opera/Arc where present; Firefox unpacked extensions only)
- MCP scanning:
  - Remote MCP server scanning over JSON-RPC HTTP (tools/prompts/resources/instructions)
  - Offline/static scanning from MCP JSON exports (`--tools`, `--prompts`, `--resources`, `--instructions`)
- Signature-based detection for prompt injection, command injection, data exfiltration, secrets, obfuscation, privilege abuse, and resource abuse
- Additional security layer with heuristics for high-entropy secrets and risky install scripts
- Human-readable table output, JSON output, and failure thresholds
- Built-in TUI for live progress and findings

## Usage
```bash
./skill-scanner scan .
./skill-scanner scan . --json
./skill-scanner scan . --fail-on high
./skill-scanner scan . --fix
./skill-scanner scan . --system
./skill-scanner scan . --skills-dir /path/to/skills
./skill-scanner scan . --use-behavioral --enable-meta
./skill-scanner scan . --format sarif --output results.sarif
./skill-scanner scan-all ./skills --recursive --use-behavioral
./skill-scanner scan-all ./skills --fail-on-findings --format sarif --output results.sarif
./skill-scanner scan . --extensions
./skill-scanner watch .

# MCP remote scan (HTTP JSON-RPC)
./skill-scanner mcp remote https://your-mcp-server/mcp --format json
./skill-scanner mcp remote https://your-mcp-server/mcp --scan tools,instructions --tui
./skill-scanner mcp remote https://your-mcp-server/mcp --bearer-token "$TOKEN" --header "X-API-Key: abc123"

# MCP static scan (offline/CI)
./skill-scanner mcp static --tools tools.json --prompts prompts.json --format table

# MCP configs on this machine (no network calls)
./skill-scanner mcp known-configs --format table
./skill-scanner mcp config ~/.cursor/mcp.json --format json

# MCP configs with server connections
./skill-scanner mcp known-configs --connect --format json
./skill-scanner mcp config ~/.cursor/mcp.json --connect --format table
```

## Build
```bash
bun install
bun run build
```

The compiled binary is `./skill-scanner` (a compatibility copy is written to `./skillguard`).

## Example Output
```text
Scanned 42 files in 182ms | Findings 3 | CRITICAL:1 | HIGH:1 | MEDIUM:1 | LOW:0

Severity  File                         Rule                              Message                                  Line
--------  ---------------------------  --------------------------------  ----------------------------------------  ----
CRITICAL  skills/foo/install.sh         SUPPLY_CHAIN_REMOTE_SCRIPT        Pipes remote content directly into a...  12
HIGH      skills/bar/SKILL.md           PROMPT_INJECTION_IGNORE_INSTRUCTIONS  Attempts to override previous system... 5
MEDIUM    skills/baz/package.json       SUPPLY_CHAIN_INSTALL_SCRIPT        Auto-run script detected in package.json: postinstall
```

## Exit Codes
- `0` when scan completes and no `--fail-on` threshold is met
- `2` when findings meet or exceed the requested `--fail-on` severity

## Notes
- The TUI activates automatically when running in a TTY (disabled for `--json`).
- Rules live at `src/rules/signatures.yaml`.
- The compiled binary embeds rules; you can override with `SKILLGUARD_RULES=/path/to/signatures.yaml`.
- `--fix` comments out matched lines in supported file types (`.md`, `.txt`, `.rst`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.py`, `.sh`, `.bash`, `.js`, `.ts`, `.mjs`, `.cjs`). JSON files are skipped (no comments in JSON). Heuristic-only findings are also skipped.
- `--system` adds common user-level skill folders (e.g., `~/.codex/skills`, `~/.cursor/skills`).
- `--skills-dir` lets you add extra roots to scan (repeatable).
- `watch` mode prints a notification when new findings appear.
- `--enable-meta` applies a lightweight meta-analyzer to reduce duplicate findings.
- `--extensions` discovers installed Chromium-based extensions by scanning the per-profile `Extensions/` folders (and single-profile roots like Opera). For Firefox, only unpacked extension directories are scanned (not `.xpi` archives).
