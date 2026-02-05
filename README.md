# Skillguard

Skillguard is a Bun + TypeScript CLI that scans agent skill repositories for unsafe or malicious behavior. It discovers `SKILL.md` directories across common agent ecosystems, applies signature-based rules, and runs an additional heuristic layer for supply-chain and secret-detection risks. It is designed for CI usage and fast local audits.

## Features
- Recursive skill discovery across multiple agent ecosystems
- Signature-based detection for prompt injection, command injection, data exfiltration, secrets, obfuscation, privilege abuse, and resource abuse
- Additional security layer with heuristics for high-entropy secrets and risky install scripts
- Human-readable table output, JSON output, and failure thresholds
- Built-in TUI for live progress and findings

## Usage
```bash
bun run src/cli.ts scan .
bun run src/cli.ts scan . --json
bun run src/cli.ts scan . --fail-on high
bun run src/cli.ts scan . --fix
bun run src/cli.ts scan . --system
bun run src/cli.ts scan . --skills-dir /path/to/skills
bun run src/cli.ts scan . --use-behavioral --enable-meta
bun run src/cli.ts scan . --format sarif --output results.sarif
bun run src/cli.ts scan-all ./skills --recursive --use-behavioral
bun run src/cli.ts scan-all ./skills --fail-on-findings --format sarif --output results.sarif
bun run src/cli.ts scan . --fix
bun run src/cli.ts watch .
```

## Build
```bash
bun install
bun run build
```

The compiled binary is `./skillguard`.

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
- `--fix` comments out matched lines in supported file types (`.md`, `.txt`, `.rst`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.py`, `.sh`, `.bash`, `.js`, `.ts`, `.mjs`, `.cjs`).\n+  JSON files are skipped (no comments in JSON). Heuristic-only findings are also skipped.
- `--system` adds common user-level skill folders (e.g., `~/.codex/skills`, `~/.cursor/skills`).
- `--skills-dir` lets you add extra roots to scan (repeatable).
- `watch` mode prints a notification when new findings appear.
- `--use-llm` and `--use-aidefense` are reserved flags (not implemented yet).
- `--enable-meta` applies a lightweight meta-analyzer to reduce duplicate findings.
