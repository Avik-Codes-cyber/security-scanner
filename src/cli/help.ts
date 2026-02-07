/**
 * Print the help text for the CLI
 */
export function printHelp() {
  const help = `Security Scanner - Skills, Extensions, and MCP Security Scanner

Usage:
  securityscanner scan <path> [options]
  securityscanner scan-all <path> [options]
  securityscanner interactive <path> [options]  (alias: i)
  securityscanner watch <path> [options]
  securityscanner mcp remote <serverUrl> [options]
  securityscanner mcp static [options]
  securityscanner mcp config <configPath> [options]
  securityscanner mcp known-configs [options]

Options:
  --json            Output JSON report (alias for --format json)
  --format <type>   Output format: table | json | sarif
  --output <file>   Write report to file instead of stdout
  --report-dir <dir>    Generate report files in the specified directory
  --report-format <fmt> Report file formats (comma-separated): json,html,csv (default: html,json)
  --fail-on-findings  Exit non-zero if any findings are detected
  --fail-on <lvl>   Exit non-zero if findings at or above level (LOW, MEDIUM, HIGH, CRITICAL)
  --tui             Force TUI rendering
  --no-tui          Disable TUI rendering
  --fix             Comment out matched lines in supported file types (see README)
  --system          Include common system skill directories (e.g., ~/.codex/skills)
  --no-system       Exclude system skill directories
  --extensions      Include installed browser extensions (Chromium browsers + Firefox unpacked)
  --no-extensions   Exclude browser extensions
  --ide-extensions  Include installed IDE extensions (VS Code, Cursor, JetBrains, etc.)
  --no-ide-extensions  Exclude IDE extensions
  --extensions-dir  Add an extra extensions root to scan (repeatable)
  --ide-extensions-dir  Add an extra IDE extensions root to scan (repeatable)
  --skills-dir      Add an extra skills root to scan (repeatable)
  --save            Save scan results to local storage for later reference
  --tag <tag>       Add a tag to the saved scan (repeatable)
  --notes <text>    Add notes to the saved scan
  --compare-with <id>  Compare results with a previous scan by ID
  --full-depth      Always search recursively for SKILL.md (slower)
  --recursive       Alias for --full-depth
  --use-behavioral  Enable behavioral heuristic engine
  --no-behavioral   Disable behavioral heuristic engine
  --enable-meta     Enable meta-analyzer (false-positive filtering)
  --show-confidence Show confidence scores for each finding (0-100%)
  --min-confidence <n>  Filter findings below confidence threshold (0.0-1.0, e.g., 0.6 for 60%)

MCP Options (mcp remote):
  --bearer-token <t>   Bearer token (Authorization: Bearer <t>)
  --header "K: V"      Custom header (repeatable)
  --scan <csv>         tools,prompts,resources,instructions (default: tools,instructions,prompts)
  --read-resources     Read and scan resource contents (default: off)
  --mime-types <csv>   Allowed resource mime types (default: text/plain,text/markdown,text/html,application/json)
  --max-resource-bytes <n>  Max bytes to read per resource (default: 1048576)

MCP Options (mcp static):
  --tools <file>         Tools JSON file (array or {tools:[...]})
  --prompts <file>       Prompts JSON file (array or {prompts:[...]})
  --resources <file>     Resources JSON file (array or {resources:[...]})
  --instructions <file>  Instructions JSON file (string or {instructions:"..."})

MCP Options (mcp config / known-configs):
  --connect         Extract serverUrl entries and run remote scans (default: scan config file text only)

Examples:
  securityscanner scan /path/to/skill
  securityscanner interactive /path/to/skill
  securityscanner scan /path/to/skill --use-behavioral
  securityscanner scan /path/to/skill --enable-meta
  securityscanner scan /path/to/skill --show-confidence
  securityscanner scan /path/to/skill --min-confidence 0.7
  securityscanner scan /path/to/skill --report-dir ./reports
  securityscanner scan /path/to/skill --report-dir ./reports --report-format html,json,csv
  securityscanner scan-all /path/to/skills --recursive --use-behavioral
  securityscanner scan-all ./skills --fail-on-findings --format sarif --output results.sarif
  securityscanner scan . --extensions
  securityscanner scan . --report-dir /tmp/security-reports --report-format html
  securityscanner scan ./my-project --save --report-dir ./scans --report-format html,json
  securityscanner i .                        Interactive mode (short alias)
  securityscanner mcp remote https://your-server/mcp --format json
  securityscanner mcp static --tools ./tools.json --format table
  securityscanner mcp known-configs
  securityscanner mcp known-configs --connect --format json
  securityscanner history                    List recent scans
  securityscanner history --json             Output scan history as JSON
  securityscanner history <scan-id>          Show details of a specific scan
  securityscanner history --stats            Show scan statistics
  securityscanner history --delete <id>      Delete a specific scan
  securityscanner history --clear            Delete all scan history
`;

  console.log(help);
}
