# Security Scanner

Security Scanner (`securityscanner`) is a high-performance Bun + TypeScript CLI that scans agent skill repositories, browser extension folders, and MCP (Model Context Protocol) servers/static exports for unsafe or malicious behavior. It discovers `SKILL.md` directories across common agent ecosystems, can optionally scan installed browser extensions, applies signature-based rules, and runs an additional heuristic layer for supply-chain and secret-detection risks. Optimized for both CI usage and fast local audits with parallel scanning and intelligent caching.

## Features
- **High Performance**: Parallel file scanning with worker threads, indexed rule engine, and file hash-based caching
- **Confidence Scoring**: AI-powered confidence scores (0-100%) for each finding with filtering capabilities
- **Flexible Storage**: Choose between JSON or SQLite backends for scan history
- **Unicode Support**: Handles emoji, CJK characters, RTL text, and multiple encodings (UTF-8, UTF-16, Latin-1)
- **Incremental Scanning**: Only rescans modified files based on timestamps or git diff
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

# Interactive mode - select targets and configure options interactively
securityscanner interactive .
securityscanner i .  # Short alias
securityscanner i    # Will prompt for path and all options

# Confidence scoring - show and filter by confidence
securityscanner scan . --show-confidence
securityscanner scan . --min-confidence 0.7  # Only show findings with 70%+ confidence
securityscanner scan . --min-confidence 0.8 --format json

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

## CI/CD & Releases

### Automated Releases

The project includes GitHub Actions workflows for automated building and releasing:

**Release Workflow** (`.github/workflows/release.yml`)
- Triggers on version tags (e.g., `v1.0.0`) or manual dispatch
- Builds binaries for multiple platforms:
  - Linux x64
  - macOS x64 (Intel)
  - macOS ARM64 (Apple Silicon)
  - Windows x64
- Creates GitHub releases with all binaries attached
- Generates release notes automatically

**CI Workflow** (`.github/workflows/ci.yml`)
- Runs on every push to `main` or `develop` branches
- Tests and builds on Linux, macOS, and Windows
- Validates binary functionality

### Creating a Release

To create a new release:

```bash
# Tag the release
git tag v1.0.0
git push origin v1.0.0

# Or create and push in one command
git tag v1.0.0 && git push origin v1.0.0
```

The GitHub Actions workflow will automatically:
1. Build binaries for all platforms
2. Create a GitHub release
3. Upload all binaries to the release
4. Generate release notes from commits

### Manual Release Trigger

You can also trigger a release manually from the GitHub Actions tab:
1. Go to Actions → Build and Release
2. Click "Run workflow"
3. Select the branch
4. Click "Run workflow"

### Download Pre-built Binaries

Once released, binaries are available at:
```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest
```

Download the appropriate binary for your platform:
- `securityscanner-linux-x64` - Linux
- `securityscanner-darwin-x64` - macOS Intel
- `securityscanner-darwin-arm64` - macOS Apple Silicon
- `securityscanner-windows-x64.exe` - Windows

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

## Confidence Scoring

The Security Scanner includes an intelligent confidence scoring system that helps you prioritize findings and reduce false positives.

### How It Works

Each finding is assigned a confidence score (0-100%) based on multiple factors:
- **Source**: Signature-based findings (higher confidence) vs heuristic findings (lower confidence)
- **Context**: Test files, comments, and file types affect confidence
- **Severity**: Critical findings get additional scrutiny
- **Entropy**: For secret detection, higher entropy = higher confidence
- **Match specificity**: Longer, more specific matches score higher

### Confidence Indicators

- **● 80-100%** (Green) - High confidence, likely valid
- **◐ 60-79%** (Cyan) - Medium confidence, review recommended
- **◑ 40-59%** (Yellow) - Low confidence, may be false positive
- **○ 0-39%** (Red) - Very low confidence, likely false positive

### Usage Examples

```bash
# Show confidence scores for all findings
securityscanner scan . --show-confidence

# Filter out low-confidence findings (only show 70%+ confidence)
securityscanner scan . --min-confidence 0.7

# Strict mode: only show high-confidence findings (80%+)
securityscanner scan . --min-confidence 0.8

# Combine with other options
securityscanner scan . --show-confidence --enable-meta --format json
```

### Benefits

- **Reduce noise**: Filter out likely false positives automatically
- **Prioritize work**: Focus on high-confidence findings first
- **Better CI/CD**: Set confidence thresholds to fail builds only on reliable findings
- **Learn patterns**: See why findings have low confidence to improve your code

**Example Output**:
```
Severity  File           Rule                  Message                Line  Confidence
--------  -------------  --------------------  ---------------------  ----  ----------
CRITICAL  config.ts      SECRET_STRIPE_KEY     Stripe API key found   42    ● 90%
HIGH      test/mock.ts   HIGH_ENTROPY_SECRET   High entropy string    15    ◑ 45%
```

## Interactive Mode

The Security Scanner includes a fully interactive mode that guides you through the entire scanning process - from choosing what to scan to configuring options.

### Features

- **Path Input** - Enter the path to scan interactively (or provide it as an argument)
- **Scan Type Selection** - Choose what to include: skills, system directories, browser extensions, IDE extensions
- **Interactive Target Selection** - Choose which specific targets to scan from discovered items
- **Multi-select Support** - Select multiple targets at once with keyboard navigation
- **Guided Configuration** - Configure all scan options through intuitive prompts
- **Visual Feedback** - Color-coded prompts and clear selection indicators
- **Keyboard Navigation** - Full keyboard support (no mouse required)

### Usage

```bash
# Start interactive mode (will prompt for path)
securityscanner interactive

# Start with a specific path
securityscanner interactive /path/to/scan

# Short alias
securityscanner i
securityscanner i .
```

### Keyboard Controls

- `↑` / `↓` - Navigate up/down through options
- `Space` - Toggle selection (in multi-select mode)
- `Enter` - Confirm selection
- `y` / `n` - Yes/No for confirmation prompts
- `Ctrl+C` - Cancel and exit

### Interactive Flow

1. **Path Input** - Enter the directory path to scan (default: current directory)
2. **Scan Type Selection** - Choose what to include:
   - Skills (SKILL.md files)
   - System skill directories (~/.codex/skills, etc.)
   - Browser extensions (Chrome, Edge, Brave, Firefox)
   - IDE extensions (VS Code, Cursor, JetBrains)
   - Recursive search depth
   - Extra skill directories
3. **Target Discovery** - Automatically discovers all available targets based on your selections
4. **Target Selection** - Choose specific targets or scan all
5. **Option Configuration** - Optionally configure:
   - Severity threshold (fail-on level)
   - Output format (table, JSON, SARIF)
   - Meta-analysis (false-positive filtering)
   - Auto-fix (comment out issues)
   - Save results with tags
   - Confidence scores (show and filter by confidence)
   - Minimum confidence threshold (0.0-1.0)
6. **Confirmation** - Review and confirm before scanning
7. **Scan Execution** - Run the scan with your selections

### Example Session

```text
🔍 Interactive Security Scanner

? Enter path to scan: ./my-project

✓ Scan path: /Users/dev/my-project

? What would you like to scan? (Space to select, Enter to confirm)
 ◉ Skills (SKILL.md files)
 ◉ System skill directories (~/.codex/skills, ~/.cursor/skills, etc.)
 ◯ Browser extensions (Chrome, Edge, Brave, Firefox)
 ◉ IDE extensions (VS Code, Cursor, JetBrains)

? Search recursively for all SKILL.md files? (slower but more thorough) (y/N) n
? Add extra skill directories to scan? (y/N) n

🔍 Discovering targets...

✓ Found 5 target(s)

🔍 Interactive Security Scanner

? Scan all 5 target(s)? (Y/n) n
? Select targets to scan: (Space to select, Enter to confirm)
 ◉ my-skill-1 (skill - /path/to/skill1)
 ◉ my-skill-2 (skill - /path/to/skill2)
 ◯ system-skill (skill - ~/.codex/skills/system)
 ◉ vscode-ext (ide-extension - /path/to/vscode)
 ◯ cursor-ext (ide-extension - /path/to/cursor)

? Configure scan options? (y/N) y
? Fail on severity level:
 ❯ None (don't fail)
   Low
   Medium
   High
   Critical

? Output format:
 ❯ Table (interactive)
   JSON
   SARIF

? Enable meta-analysis (reduce false positives)? (Y/n) y
? Auto-fix issues (comment out problematic lines)? (y/N) n
? Save scan results to database? (y/N) y
? Tags (comma-separated): release-check, pre-deploy
? Show confidence scores? (y/N) y
? Minimum confidence threshold (0.0-1.0): 0.6

? Proceed with scanning 3 target(s)? (Y/n) y

✓ Found 3 target(s)
[Scan proceeds...]
```

**For a complete walkthrough of all interactive features, see [INTERACTIVE_MODE.md](INTERACTIVE_MODE.md).**

For more technical details, see [src/cli/interactive/README.md](src/cli/interactive/README.md).

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
