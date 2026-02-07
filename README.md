# Security Scanner

Security Scanner (`securityscanner`) is a high-performance Bun + TypeScript CLI that scans agent skill repositories, browser extension folders, and MCP (Model Context Protocol) servers/static exports for unsafe or malicious behavior. It discovers `SKILL.md` directories across common agent ecosystems, can optionally scan installed browser extensions, applies signature-based rules, and runs an additional heuristic layer for supply-chain and secret-detection risks. Optimized for both CI usage and fast local audits with parallel scanning and intelligent caching.

## Features
- **High Performance**: Parallel file scanning with worker threads, indexed rule engine, and file hash-based caching
- **Flexible Storage**: Choose between JSON or SQLite backends for scan history
- Recursive skill discovery across multiple agent ecosystems
- Optional scanning of installed browser extensions (Chromium-based browsers like Chrome/Edge/Brave/Vivaldi/Opera/Arc where present; Firefox unpacked extensions only)
- Optional scanning of installed IDE extensions (VS Code, Cursor, Windsurf, JetBrains family)
- MCP scanning:
  - Remote MCP server scanning over JSON-RPC HTTP (tools/prompts/resources/instructions)
  - Offline/static scanning from MCP JSON exports (`--tools`, `--prompts`, `--resources`, `--instructions`)
- Signature-based detection for prompt injection, command injection, data exfiltration, secrets, obfuscation, privilege abuse, and resource abuse
- Additional security layer with heuristics for high-entropy secrets and risky install scripts
- Human-readable table output, JSON output, SARIF output, and failure thresholds
- Built-in TUI for live progress and findings with real-time updates
- **Comprehensive report generation** (HTML, JSON, CSV formats with customizable output directory)
- Scan result storage and history tracking with comparison support

## Usage
```bash
securityscanner scan .
securityscanner scan . --json
securityscanner scan . --fail-on high
securityscanner scan . --fix
securityscanner scan . --system
securityscanner scan . --skills-dir /path/to/skills
securityscanner scan . --use-behavioral --enable-meta
securityscanner scan . --format sarif --output results.sarif
securityscanner scan-all ./skills --recursive --use-behavioral
securityscanner scan-all ./skills --fail-on-findings --format sarif --output results.sarif
securityscanner scan . --extensions
securityscanner watch .

# Generate reports (HTML, JSON, CSV)
securityscanner scan . --report-dir ./reports
securityscanner scan . --report-dir ./reports --report-format html,json,csv
securityscanner scan /path/to/project --report-dir /tmp/security-reports --report-format html
securityscanner scan . --save --report-dir ./scans --report-format html,json

# MCP remote scan (HTTP JSON-RPC)
securityscanner mcp remote https://your-mcp-server/mcp --format json
securityscanner mcp remote https://your-mcp-server/mcp --scan tools,instructions --tui
securityscanner mcp remote https://your-mcp-server/mcp --bearer-token "$TOKEN" --header "X-API-Key: abc123"

# MCP static scan (offline/CI)
securityscanner mcp static --tools tools.json --prompts prompts.json --format table

# MCP configs on this machine (no network calls)
securityscanner mcp known-configs --format table
securityscanner mcp config ~/.cursor/mcp.json --format json

# MCP configs with server connections
securityscanner mcp known-configs --connect --format json
securityscanner mcp config ~/.cursor/mcp.json --connect --format table

# Scan with IDE extensions (VS Code, Cursor, JetBrains, etc.)
securityscanner scan . --ide-extensions
securityscanner scan . --extensions --ide-extensions  # Both browser and IDE extensions

# Save scan results for later reference
securityscanner scan . --save --tag "release-check" --notes "Pre-deployment security scan"
securityscanner scan . --save --compare-with <previous-scan-id>

# View scan history
securityscanner history                    # List recent scans
securityscanner history <scan-id>          # Show scan details
securityscanner history stats              # Show statistics
securityscanner history --json             # Output history as JSON
```

## Performance & Configuration

The scanner includes several performance optimizations that can be configured via environment variables:

### Parallel Scanning
Distributes file scanning across multiple CPU cores for faster processing.
```bash
# Enable/disable (default: enabled)
export SCANNER_PARALLEL_ENABLED=true

# Number of workers (default: CPU count, max 8)
export SCANNER_PARALLEL_WORKERS=4

# Minimum files before using parallel mode (default: 10)
export SCANNER_PARALLEL_THRESHOLD=10
```

### File Caching
Caches scan results based on file hashes to avoid re-scanning unchanged files.
```bash
# Enable/disable (default: enabled)
export SCANNER_CACHE_ENABLED=true

# Cache expiration in milliseconds (default: 7 days)
export SCANNER_CACHE_MAX_AGE=604800000

# Custom cache directory
export SCANNER_CACHE_DIR=/path/to/cache
```

### Storage Backend
Choose between JSON files or SQLite database for scan history.
```bash
# Backend: "json" or "sqlite" (default: json)
export SCANNER_STORAGE_BACKEND=sqlite

# Custom SQLite database path
export SCANNER_SQLITE_PATH=/path/to/scans.db

# Maximum stored scans (default: 100 for JSON, 1000 for SQLite)
export SCANNER_MAX_STORED_SCANS=1000
```

### Performance Examples

```bash
# Maximum performance for large codebases
export SCANNER_PARALLEL_ENABLED=true
export SCANNER_PARALLEL_WORKERS=16
export SCANNER_CACHE_ENABLED=true
export SCANNER_STORAGE_BACKEND=sqlite
securityscanner scan /large/project

# CI/CD environment (fresh scan every time)
export SCANNER_CACHE_ENABLED=false
export SCANNER_PARALLEL_ENABLED=true
securityscanner scan . --fail-on high

# Development (fast rescans with caching)
export SCANNER_CACHE_ENABLED=true
securityscanner scan .
```

**Performance Gains:**
- Parallel scanning: 3-5x faster on multi-core systems
- Indexed rules: 40-60% reduction in rule matching time
- File caching: 90%+ speedup for incremental scans (unchanged files)
- SQLite storage: 10-100x faster queries for scan history

See [SCALABILITY.md](SCALABILITY.md) and [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for detailed documentation.

## Build
```bash
bun install
bun run build
```

The compiled binary is `./securityscanner`.

## Report Generation

The Security Scanner can generate comprehensive security reports in multiple formats, automatically saved to your specified directory with timestamped filenames.

### Available Report Formats

**HTML Report** (`--report-format html`)
- Beautiful, styled report with dark theme
- Summary cards showing severity breakdowns
- Detailed findings table with severity badges
- Responsive design for all screen sizes
- Ready for sharing and archiving

**JSON Report** (`--report-format json`)
- Structured, machine-readable format
- Includes metadata (timestamp, hostname, platform)
- Detailed findings with line numbers and rules
- Perfect for CI/CD pipeline integration
- Can be parsed by downstream tools

**CSV Report** (`--report-format csv`)
- Spreadsheet-compatible format
- Easily imported into Excel, Google Sheets, etc.
- Scan metadata header followed by findings
- Simple columnar format for data analysis

### Report Generation Examples

```bash
# Generate HTML and JSON reports in ./reports directory
securityscanner scan /path/to/project --report-dir ./reports

# Generate all formats (HTML, JSON, CSV)
securityscanner scan . --report-dir ./reports --report-format html,json,csv

# Save findings locally AND generate reports
securityscanner scan . --save --report-dir ./scans --report-format html

# Generate only HTML report
securityscanner scan . --report-dir /tmp/security-reports --report-format html
```

### Report Output

After scanning completes, the scanner displays:
```
📄 Report Generated:
  HTML: /path/to/reports/security-scan-2026-02-06.html
  JSON: /path/to/reports/security-scan-2026-02-06.json
  CSV: /path/to/reports/security-scan-2026-02-06.csv
```

## TUI (Terminal User Interface)

The Security Scanner includes an enhanced TUI that activates automatically in TTY environments (disabled for JSON output). The TUI provides:

- **Live Progress Bar** - Real-time visualization of scan progress with percentage
- **Real-time Findings** - Findings are displayed as they are discovered
- **Severity Badges** - Color-coded severity indicators with emoji (🔴 🟠 🟡 🔵)
- **Target Summary** - Shows current target being scanned and progress
- **Completed Targets Table** - Summary of all completed scans with finding counts
- **Elapsed Time** - Real-time timer showing how long the scan has taken

Press `Ctrl+C` to safely interrupt the scan.

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
- The TUI activates automatically when running in a TTY (disabled for `--json`). Progress, findings, and scan statistics are displayed in real-time.
- Rules live at `src/rules/signatures.yaml`.
- The compiled binary embeds rules; you can override with `SECURITYSCANNER_RULES=/path/to/signatures.yaml`.
- `--fix` comments out matched lines in supported file types (`.md`, `.txt`, `.rst`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.py`, `.sh`, `.bash`, `.js`, `.ts`, `.mjs`, `.cjs`). JSON files are skipped (no comments in JSON). Heuristic-only findings are also skipped.
- `--system` adds common user-level skill folders (e.g., `~/.codex/skills`, `~/.cursor/skills`).
- `--skills-dir` lets you add extra roots to scan (repeatable).
- `watch` mode prints a notification when new findings appear.
- `--enable-meta` applies a lightweight meta-analyzer to reduce duplicate findings.
- `--extensions` discovers installed Chromium-based extensions by scanning the per-profile `Extensions/` folders (and single-profile roots like Opera). For Firefox, only unpacked extension directories are scanned (not `.xpi` archives).
- `--ide-extensions` discovers installed IDE extensions from VS Code, Cursor, Windsurf, JetBrains IDEs, and other editors across macOS, Linux, and Windows.
- `--report-dir <dir>` generates comprehensive security reports in your specified directory. Reports include timestamp-prefixed filenames and are available in multiple formats.
- `--report-format <fmt>` specifies report output formats (comma-separated): `html` (beautiful styled report), `json` (structured data), `csv` (spreadsheet-compatible). Default: `html,json`.
- `--save` stores scan results locally (max 100 scans retained automatically). Storage location: `~/Library/Application Support/securityscanner/` (macOS), `~/.config/securityscanner/` (Linux), or `%LOCALAPPDATA%/securityscanner/` (Windows).
- `--tag` and `--notes` add metadata to saved scans for easier filtering and identification.
- `--compare-with <id>` compares current scan findings against a previous scan, showing added, removed, and unchanged findings.
