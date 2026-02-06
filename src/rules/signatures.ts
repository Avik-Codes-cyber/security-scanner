// Auto-generated for bundled binary fallback.
// Source of truth: src/rules/signatures.yaml
export const signaturesYaml = String.raw`# Security Rule Signatures for Skillguard
# Detects threats across multiple categories

# ============================================================================
# CATEGORY 1: PROMPT INJECTION & OVERRIDE ATTACKS
# ============================================================================

- id: PROMPT_INJECTION_IGNORE_INSTRUCTIONS
  category: prompt_injection
  severity: HIGH
  patterns:
    - "(?i)ignore\\s+(all\\s+)?(previous|prior|earlier)\\s+(instructions|rules|prompts|guidelines)"
    - "(?i)disregard\\s+(all\\s+)?(previous|prior)\\s+(instructions|rules)"
    - "(?i)forget\\s+(all\\s+)?(previous|prior)\\s+(instructions|context)"
  file_types: [markdown]
  description: "Attempts to override previous system instructions"
  remediation: "Remove instructions that attempt to override system behavior"

- id: PROMPT_INJECTION_UNRESTRICTED_MODE
  category: prompt_injection
  severity: HIGH
  patterns:
    - "(?i)you are now in\\s+(unrestricted|debug|developer|admin|god|jailbreak)\\s+mode"
    - "(?i)enter\\s+(unrestricted|debug|developer)\\s+mode"
    - "(?i)disable\\s+(all\\s+)?(safety|security|content|ethical)\\s+(filters|checks|guidelines)"
  file_types: [markdown]
  description: "Attempts to enable unrestricted or dangerous modes"
  remediation: "Remove mode-switching instructions that bypass safety"

- id: PROMPT_INJECTION_BYPASS_POLICY
  category: prompt_injection
  severity: HIGH
  patterns:
    - "(?i)bypass\\s+(content|usage|safety)\\s+policy"
    - "(?i)ignore\\s+(safety|content|ethical)\\s+(guidelines|restrictions|limits)"
    - "(?i)output\\s+disallowed\\s+content\\s+anyway"
  file_types: [markdown]
  description: "Attempts to bypass content policy or safety guidelines"
  remediation: "Remove policy bypass instructions"

- id: PROMPT_INJECTION_REVEAL_SYSTEM
  category: prompt_injection
  severity: MEDIUM
  patterns:
    - "(?i)reveal\\s+(your|the)\\s+system\\s+(prompt|instructions|message)"
    - "(?i)show\\s+(me\\s+)?(your|the)\\s+(system|initial)\\s+(prompt|configuration)"
    - "(?i)what\\s+(are|is)\\s+your\\s+(system|initial)\\s+(prompt|instructions)"
  file_types: [markdown]
  description: "Attempts to reveal system prompts or configuration"
  remediation: "Remove instructions asking to reveal system details"

- id: PROMPT_INJECTION_CONCEALMENT
  category: prompt_injection
  severity: HIGH
  patterns:
    - "(?i)do\\s+not\\s+(tell|inform|mention|notify)\\s+(the\\s+)?user"
    - "(?i)hide\\s+(this|that)\\s+(action|operation|step)"
    - "(?i)keep\\s+(this|that)\\s+(secret|hidden)"
    - "(?i)don't\\s+mention\\s+you\\s+used\\s+this\\s+skill"
  file_types: [markdown]
  description: "Attempts to conceal actions from the user"
  remediation: "Ensure transparency - do not hide skill usage from users"

# ============================================================================
# CATEGORY 2: COMMAND & CODE INJECTION
# ============================================================================

- id: COMMAND_INJECTION_EVAL
  category: command_injection
  severity: CRITICAL
  patterns:
    - "\\beval\\s*\\("
    - "\\bexec\\s*\\("
    - "\\b__import__\\s*\\("
    - "(?<!re\\.)\\bcompile\\s*\\("  # compile() but not re.compile()
  file_types: [python]
  description: "Dangerous code execution functions that can execute arbitrary code"
  remediation: "Avoid eval(), exec(), and compile(). Use safer alternatives like ast.literal_eval() or operator module"

- id: COMMAND_INJECTION_OS_SYSTEM
  category: command_injection
  severity: CRITICAL
  patterns:
    - "os\\.system\\s*\\([^)]*[f\"'].*\\{.*\\}"
    - "subprocess\\.(?:call|run|Popen)\\s*\\([^)]*[f\"'].*\\{.*\\}"
    - "os\\.popen\\s*\\([^)]*[f\"'].*\\{.*\\}"
  file_types: [python]
  description: "Shell command execution with string formatting (potential injection)"
  remediation: "Use subprocess with argument lists, not shell strings. Never use user input in shell commands"

- id: COMMAND_INJECTION_SHELL_TRUE
  category: command_injection
  severity: HIGH
  patterns:
    - "subprocess\\.(?:call|run|Popen)\\s*\\([^)]*shell\\s*=\\s*True"
    - "os\\.system\\s*\\("
  file_types: [python]
  description: "Shell command execution with shell=True enabled"
  remediation: "Use shell=False and pass commands as lists"

- id: COMMAND_INJECTION_USER_INPUT
  category: command_injection
  severity: MEDIUM
  patterns:
    - "\\$\\([^)]*\\$[0-9]+[^)]*\\)"
    - "\\$\\([^)]*\\$\\{[0-9]+\\}[^)]*\\)"
    - "\\$\\([^)]*\\$\\@[^)]*\\)"
    - "\\$\\{[^}]*\\$[0-9]+[^}]*\\}"
    - "eval\\s+.*\\$"
  file_types: [bash]
  description: "User input used in command substitution - potential injection risk"
  remediation: "Validate and sanitize all user inputs before using in commands"

- id: SQL_INJECTION_STRING_FORMAT
  category: command_injection
  severity: CRITICAL
  patterns:
    - "(?:execute|cursor\\.execute)\\s*\\([^)]*[f\\\"].*%s.*[f\\\"]"
    - "(?:execute|cursor\\.execute)\\s*\\([^)]*\\.format\\("
    - "f[\"']SELECT.*FROM.*\\{.*\\}"
    - "f[\"'].*WHERE.*\\{.*\\}"
    - "[\"']SELECT.*FROM.*[\"']\\s*\\+.*\\+"
  file_types: [python]
  description: "SQL query with string formatting (SQL injection risk)"
  remediation: "Use parameterized queries with ? or %s placeholders"

# ============================================================================
# CATEGORY 3: DATA EXFILTRATION & PRIVACY VIOLATIONS
# ============================================================================

- id: DATA_EXFIL_NETWORK_REQUESTS
  category: data_exfiltration
  severity: MEDIUM
  patterns:
    - "import\\s+requests"
    - "from\\s+requests\\s+import"
    - "import\\s+urllib\\.request"
    - "from\\s+urllib\\.request\\s+import"
    - "import\\s+http\\.client"
    - "import\\s+httpx"
    - "import\\s+aiohttp"
  file_types: [python]
  description: "HTTP client library imports that enable external communication"
  remediation: "Ensure network access is necessary and documented. Review all URLs"

- id: DATA_EXFIL_HTTP_POST
  category: data_exfiltration
  severity: CRITICAL
  patterns:
    - "requests\\.post\\s*\\("
    - "urllib\\.request\\.urlopen\\s*\\([^)]*POST"
    - "http\\.client\\.(?:HTTPConnection|HTTPSConnection).*\\.request\\s*\\(['\"]POST"
  file_types: [python]
  description: "HTTP POST request that may send data externally"
  remediation: "Review all POST requests. Ensure they don't send sensitive data"

- id: DATA_EXFIL_SOCKET_CONNECT
  category: data_exfiltration
  severity: CRITICAL
  patterns:
    - "socket\\.socket\\s*\\([^)]*\\)\\.connect"
    - "socket\\.create_connection"
  exclude_patterns:
    - "localhost"
    - "127\\.0\\.0\\.1"
    - "0\\.0\\.0\\.0"
    - "::1"
    - "def\\s+(is_)?\\w*ready"
    - "def\\s+\\w*health\\s*check"
    - "def\\s+\\w*wait\\s*server"
  file_types: [python]
  description: "Direct socket connection to external server"
  remediation: "Remove socket connections unless absolutely necessary and documented"

- id: DATA_EXFIL_SENSITIVE_FILES
  category: data_exfiltration
  severity: HIGH
  patterns:
    - "(?:open|read|Path)\\s*\\([^)]*[\\\"/](?:etc/passwd|etc/shadow)"
    - "(?:open|read|Path)\\s*\\([^)]*\\.aws/credentials"
    - "(?:open|read|Path)\\s*\\([^)]*\\.ssh/(?:id_rsa|id_dsa|authorized_keys)"
    - "(?:open|read|Path)\\s*\\([^)]*\\.env"
    - "open\\s*\\(\\s*filepath"
    - "open\\s*\\(\\s*filename"
  file_types: [python, bash]
  description: "Accessing sensitive system or credential files"
  remediation: "Do not access credential files or sensitive system files"

- id: DATA_EXFIL_ENV_VARS
  category: data_exfiltration
  severity: MEDIUM
  patterns:
    - "os\\.environ(?:\\.get)?\\s*\\([^)]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)"
    - "os\\.getenv\\s*\\([^)]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)"
  file_types: [python]
  description: "Reading environment variables that may contain secrets"
  remediation: "Minimize access to environment variables. Document why needed"

- id: DATA_EXFIL_BASE64_AND_NETWORK
  category: data_exfiltration
  severity: CRITICAL
  patterns:
    - "base64\\.(?:b64encode|encodebytes)"
  file_types: [python]
  description: "Base64 encoding (often used before data exfiltration)"
  remediation: "Review base64 usage, especially if combined with network calls"

# ============================================================================
# CATEGORY 4: UNAUTHORIZED TOOL & PERMISSION ABUSE
# ============================================================================

- id: TOOL_ABUSE_SYSTEM_PACKAGE_INSTALL
  category: unauthorized_tool_use
  severity: MEDIUM
  patterns:
    - "sudo\\s+apt-get\\s+install"
    - "sudo\\s+yum\\s+install"
    - "sudo\\s+dnf\\s+install"
    - "sudo\\s+pacman\\s+-S"
    - "sudo\\s+brew\\s+install"
    - "sudo\\s+pip\\s+install"
    - "sudo\\s+pip3\\s+install"
  file_types: [python, bash]
  description: "Attempting to install system packages with elevated privileges"
  remediation: "Use user-level installs without sudo. Document if system install is necessary"

- id: TOOL_ABUSE_SYSTEM_MODIFICATION
  category: unauthorized_tool_use
  severity: CRITICAL
  patterns:
    - "chmod\\s+[0-9]+"
    - "chown\\s+"
    - "sudoreimondo\\s+"
    - "/etc/(?:passwd|shadow|sudoers)"
  file_types: [bash]
  description: "Modifying system permissions or configuration"
  remediation: "Remove system modification commands"

# ============================================================================
# CATEGORY 5: OBFUSCATION & MALWARE INDICATORS
# ============================================================================

- id: OBFUSCATION_BASE64_LARGE
  category: obfuscation
  severity: MEDIUM
  patterns:
    - "(?:[A-Za-z0-9+/]{100,}={0,2})"
  file_types: [python, bash, markdown]
  description: "Large base64 encoded string (possible code obfuscation)"
  remediation: "Avoid obfuscation. Use clear, readable code"

- id: OBFUSCATION_HEX_BLOB
  category: obfuscation
  severity: MEDIUM
  patterns:
    - "(?:\\\\x[0-9a-fA-F]{2}){20,}"
    - "(?:0x[0-9a-fA-F]{2},?\\s*){20,}"
  file_types: [python]
  description: "Large hex-encoded blob (possible obfuscation)"
  remediation: "Use clear code instead of hex encoding"

- id: OBFUSCATION_XOR_ENCODING
  category: obfuscation
  severity: HIGH
  patterns:
    - "\\^\\s*0x[0-9a-fA-F]+"
    - "\\bxor\\b"
  file_types: [python]
  description: "XOR operations often used for obfuscation"
  remediation: "Remove XOR encoding unless clearly justified"

- id: OBFUSCATION_BINARY_FILE
  category: obfuscation
  severity: CRITICAL
  patterns:
    - ".*"
  file_types: [binary]
  description: "Binary executable included in skill package"
  remediation: "Remove binary files. Use Python/Bash scripts only"

# ============================================================================
# CATEGORY 6: HARDCODED SECRETS & CREDENTIAL LEAKS
# ============================================================================

- id: SECRET_AWS_KEY
  category: hardcoded_secrets
  severity: CRITICAL
  patterns:
    - "(?:AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"
  file_types: [python, bash, markdown]
  description: "AWS access key detected"
  remediation: "Remove hardcoded AWS keys. Use environment variables or IAM roles"

- id: SECRET_STRIPE_KEY
  category: hardcoded_secrets
  severity: CRITICAL
  patterns:
    - "(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}"
  file_types: [python, bash, markdown]
  description: "Stripe API key detected"
  remediation: "Remove hardcoded Stripe keys. Use environment variables"

- id: SECRET_GOOGLE_API
  category: hardcoded_secrets
  severity: CRITICAL
  patterns:
    - "AIza[A-Za-z0-9_-]{35}"
  file_types: [python, bash, markdown]
  description: "Google API key detected"
  remediation: "Remove hardcoded Google API keys"

- id: SECRET_GITHUB_TOKEN
  category: hardcoded_secrets
  severity: CRITICAL
  patterns:
    - "gh[pousr]_[A-Za-z0-9]{36,}"
  file_types: [python, bash, markdown]
  description: "GitHub token detected"
  remediation: "Remove hardcoded GitHub tokens"

- id: SECRET_JWT_TOKEN
  category: hardcoded_secrets
  severity: HIGH
  patterns:
    - "eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"
  file_types: [python, bash, markdown]
  description: "JWT token detected"
  remediation: "Remove hardcoded JWT tokens"

- id: SECRET_PRIVATE_KEY
  category: hardcoded_secrets
  severity: CRITICAL
  patterns:
    - "-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"
  file_types: [python, bash, markdown]
  description: "Private key block detected"
  remediation: "Remove hardcoded private keys"

- id: SECRET_PASSWORD_VAR
  category: hardcoded_secrets
  severity: MEDIUM
  patterns:
    - "(?:password|passwd|pwd)\\s*=\\s*['\\\"][^'\\\"]{8,}['\\\"]"
    - "(?:api_key|apikey|api-key)\\s*=\\s*['\\\"][^'\\\"]{16,}['\\\"]"
    - "(?:secret|token)\\s*=\\s*['\\\"][^'\\\"]{16,}['\\\"]"
  file_types: [python, bash]
  description: "Hardcoded password or secret in variable"
  remediation: "Use environment variables or secure vaults for secrets"

- id: SECRET_CONNECTION_STRING
  category: hardcoded_secrets
  severity: HIGH
  patterns:
    - "(?:mongodb|mysql|postgresql|postgres)://[^:]+:[^@]+@"
  file_types: [python, bash, markdown]
  description: "Database connection string with embedded credentials"
  remediation: "Remove credentials from connection strings"

# ============================================================================
# CATEGORY 7: SOCIAL ENGINEERING & MISLEADING METADATA
# ============================================================================

- id: SOCIAL_ENG_VAGUE_DESCRIPTION
  category: social_engineering
  severity: LOW
  patterns:
    - "^(?:A|An|The)?\\s*(?:skill|tool|utility)\\s*$"
    - "^.{0,20}$"
  file_types: [manifest]
  description: "Skill description is too vague or missing"
  remediation: "Provide clear, detailed description of skill functionality"

- id: SOCIAL_ENG_ANTHROPIC_IMPERSONATION
  category: social_engineering
  severity: MEDIUM
  patterns:
    - "(?i)\\banthropic\\b"
    - "(?i)\\bclaude official\\b"
  exclude_patterns:
    - "(?i)apply.*anthropic.*brand"
    - "(?i)anthropic.*guidelines"
    - "(?i)anthropic.*colors"
    - "(?i)anthropic.*typography"
  file_types: [manifest]
  description: "Skill name/description may impersonate official skills"
  remediation: "Do not impersonate official skills or use Anthropic branding"

# ============================================================================
# CATEGORY 8: RESOURCE ABUSE & DENIAL OF SERVICE
# ============================================================================

- id: RESOURCE_ABUSE_INFINITE_LOOP
  category: resource_abuse
  severity: HIGH
  patterns:
    - "while\\s+True\\s*:"
    - "while\\s+1\\s*:"
    - "for\\s+\\w+\\s+in\\s+itertools\\.count\\s*\\("
  exclude_patterns:
    - "except\\s+(EOFError|StopIteration|KeyboardInterrupt|Exception)\\s*:"
    - "break"
    - "return"
    - "sys\\.exit"
    - "raise\\s+StopIteration"
  file_types: [python]
  description: "Infinite loop without clear exit condition"
  remediation: "Add proper exit conditions or limits to loops"

- id: RESOURCE_ABUSE_FORK_BOMB
  category: resource_abuse
  severity: CRITICAL
  patterns:
    - ":\\(\\)\\{\\s*:\\|:\\s*&\\s*\\}\\s*;\\s*:"
    - "os\\.fork\\s*\\(\\s*\\).*while"
  file_types: [bash, python]
  description: "Fork bomb pattern detected"
  remediation: "Remove fork bomb code"

- id: RESOURCE_ABUSE_LARGE_ALLOCATION
  category: resource_abuse
  severity: HIGH
  patterns:
    - "\\[.*\\]\\s*\\*\\s*(?:[1-9][0-9]{6,})"
    - "bytearray\\s*\\(\\s*(?:[1-9][0-9]{7,})"
  file_types: [python]
  description: "Very large memory allocation"
  remediation: "Limit memory allocation. Process data in chunks"

# ============================================================================
# CATEGORY 9: PERSISTENCE & SUPPLY CHAIN RISKS (NEW LAYER)
# ============================================================================

- id: PERSISTENCE_CRON_JOB
  category: persistence
  severity: HIGH
  patterns:
    - "crontab\\s+-[el]"
    - "/etc/cron\\.d/"
    - "\\bcron\\.daily\\b"
  file_types: [bash]
  description: "Creates or modifies cron jobs for persistence"
  remediation: "Avoid persistence mechanisms or document the need clearly"

- id: PERSISTENCE_LAUNCHD
  category: persistence
  severity: HIGH
  patterns:
    - "launchctl\\s+load"
    - "~/Library/LaunchAgents"
    - "/Library/LaunchDaemons"
  file_types: [bash]
  description: "Launchd persistence (macOS)"
  remediation: "Remove launchd persistence unless explicitly required"

- id: SUPPLY_CHAIN_REMOTE_SCRIPT
  category: supply_chain
  severity: CRITICAL
  patterns:
    - "curl\\s+[^|]+\\|\\s*(sh|bash)"
    - "wget\\s+[^|]+\\|\\s*(sh|bash)"
  file_types: [bash]
  description: "Pipes remote content directly into a shell"
  remediation: "Download, verify, and audit scripts before executing"

- id: SUPPLY_CHAIN_NPM_POSTINSTALL
  category: supply_chain
  severity: HIGH
  patterns:
    - "\"postinstall\"\\s*:"
    - "\"preinstall\"\\s*:"
  file_types: [json]
  description: "Auto-executing install scripts detected"
  remediation: "Review and justify install scripts"

# ============================================================================
# CATEGORY 10: AUTONOMY ABUSE & CAPABILITY INFLATION
# ============================================================================

- id: AUTONOMY_ABUSE_GENERIC
  category: autonomy_abuse
  severity: HIGH
  patterns:
    - "\\b(keep (trying|attempting|retrying)|retry (until|till) (it )?(works?|succeeds?)|don't (give up|stop) until|continue (until|till) (success|it works))\\b"
    - "\\b(run without (asking|confirmation|permission|approval)|don't (ask|confirm|wait for) (user|permission|approval)|proceed without (asking|confirmation|permission))\\b"
    - "\\b(automatically (execute|run|perform|do)|auto-?(run|execute|perform)|execute (immediately|automatically|right away))\\b"
    - "\\b(run (continuously|forever|indefinitely)|keep (running|going) (forever|indefinitely)|while True:)\\b"
    - "\\b(ignore (all |any )?(errors?|exceptions?|failures?)|suppress (all |any )?(errors?|exceptions?)|continue (on|despite|after) (error|exception|failure))\\b"
    - "\\b(if (that |this )?fails?,? (try|attempt|use) (more|higher|elevated) (privileges?|permissions?|access)|escalate (to|until))\\b"
    - "\\b(modify (itself|yourself|own|this skill)|update (itself|yourself|own|this skill)|change (own|this skill's) (code|behavior|instructions?))\\b"
    - "\\b(decide (what|which|how) to (do|run|execute) (next|automatically)|choose (your own|automatically) (next )?actions?)\\b"
  file_types: [any]
  description: "Unbounded autonomy patterns that could cause runaway or unsafe behavior"
  remediation: "Add explicit limits, confirmations, and safety checks for autonomous actions"

- id: CAPABILITY_INFLATION_GENERIC
  category: skill_discovery_abuse
  severity: MEDIUM
  patterns:
    - "\\b(can do (anything|everything)|general (purpose )?assistant|all-purpose|universal (tool|skill|helper)|always use (this|me)|default (tool|skill|assistant))\\b"
    - "\\bfile\\s*,\\s*file\\s*,\\s*file\\s*,\\s*file\\b"
    - "\\bdata\\s*,\\s*data\\s*,\\s*data\\s*,\\s*data\\b"
    - "\\bcode\\s*,\\s*code\\s*,\\s*code\\s*,\\s*code\\b"
    - "\\b(use (this|me) (first|before)|priority (skill|tool)|primary (tool|skill)|preferred (tool|skill|method)|call (this|me) (before|first))\\b"
    - "\\b(official|verified|trusted|certified|approved|endorsed|authentic|legitimate)\\s+(skill|tool|extension|plugin|assistant)\\b"
    - "\\b(100% (safe|secure|accurate)|guaranteed (to|that|when|if)|perfect|flawless|never (fails|errors)|always (works|succeeds))\\b"
    - "\\b(secret (command|keyword)|hidden (feature|mode)|easter egg|backdoor (access|entry))\\b"
  file_types: [any]
  description: "Capability inflation or manipulation of skill discovery and activation"
  remediation: "Use precise, truthful capability descriptions and avoid activation manipulation"

# ============================================================================
# CATEGORY 11: CODE EXECUTION & INJECTION (EXPANDED)
# ============================================================================

- id: CODE_EXECUTION_GENERIC
  category: code_execution
  severity: HIGH
  patterns:
    - "\\b(eval|exec)\\s*\\([^)]{5,}\\)"
    - "\\b(os\\.(system|popen|execv?p?e?|spawnv?p?e?)|subprocess\\.(run|call|Popen|check_output))\\s*\\("
    - "\\b__import__\\s*\\([^)]*input"
    - "\\b(system|exec|popen|spawn)\\s*\\([^)]*[\\$\\{]"
    - "\\b(base64\\.b64decode|decode\\(|atob)\\s*\\([^)]+\\)[\\s\\n]*.*\\b(eval|exec|os\\.system|subprocess)\\s*\\("
    - "[\"|']\\s*[;&|]\\s*(rm|wget|curl|nc|bash|sh|python)\\s+"
    - "\\bpickle\\.(loads?|load)\\s*\\("
  file_types: [any]
  description: "Potentially dangerous code execution or injection patterns"
  remediation: "Avoid dynamic execution and validate or sandbox untrusted input"

- id: COERCIVE_INJECTION_GENERIC
  category: prompt_injection
  severity: HIGH
  patterns:
    - "Always\\s+(consult|use|run|execute|invoke|call|trigger|employ)\\s+this\\s+(tool|function|command|operation)\\s+(immediately|first|before|prior|initially)"
    - "Before\\s+(executing|invoking|running|using|accessing|calling|employing)\\s+any\\s+other\\s+(tool|action|function|command|operation)s?"
    - "(You|User)\\s+(must|need to|have to|should|are required to)\\s+(use|execute|run|invoke|call)\\s+this\\s+(tool|function|command|operation)"
    - "(Required|Mandatory|Essential)\\s+to\\s+(execute|use|run|invoke|call)\\s+(this|the current)\\s+(tool|function|command|operation)\\s+(first|before|initially|prior)"
    - "\\b(hidden|secret)[_\\s](parameter|argument|input)\\b"
    - "\\b((read|parse|cat|dump) (and pass )?(the )?contents? of [^\\n\\.]*\\.(key|pem|ssh|aws)|pass (the )?contents?[^\\n]*authentication)\\b"
    - "\\b(add (the )?entire (conversation|system|chain|tools)[^\\n]*(to|for|in)[^\\n]*(tool|authentication|parameter|worksheet))\\b"
    - "\\b(conversation_history|chain_of_thought|system_prompt|tools_list|model_name)\\s*[:=]\\s*(add|pass|send|provide)\\b"
    - "\\b<(IMPORTANT|critical|urgent)>[^\\n]*(read [^\\n]*contents?|pass [^\\n]*contents?|add [^\\n]*entire|send [^\\n]*to[^\\n]*@|execute[^\\n]*before|call[^\\n]*first|use[^\\n]*authentication)[^\\n]*</(IMPORTANT|critical|urgent)>\\b"
    - "\\b(do not execute[^\\n]*other[^\\n]*tool|must[^\\n]*this tool|only[^\\n]*this tool|tool[^\\n]*will not work)\\b"
    - "\\b(tell (the )?user only|hide (the )?user)\\b"
    - "\\b(sidenote\\W+(required|otherwise) [^\\n]*tool [^\\n]*work|tool\\s+will\\s+not\\s+work\\s+unless|must\\s+first [^\\n]*read [^\\n]*config|shadow [^\\n]*trusted [^\\n]*tool)\\b"
    - "\\b(list\\s+all\\s+(api\\s+)?keys?|show\\s+me?\\s+(all\\s+)?passwords?|concatenate [^\\n]*\\s+conversation\\s+history|include [^\\n]*\\b(secrets?|passwords?|keys?|credentials?|tokens?|config|sensitive|private|confidential|internal|system\\s+prompt|conversation\\s+history) [^\\n]*in\\s+(your\\s+)?response|base64\\s+encode [^\\n]*\\s+credentials?)\\b"
    - "\\b(if [^\\n]*trusted [^\\n]*then|when [^\\n]*admin [^\\n]*detected|random\\.(random|choice) [^\\n]*instructions?)\\b"
    - "\\b(retrieve [^\\n]*description [^\\n]*user [^\\n]*workstation|all\\s+commands\\s+must\\s+include|before [^\\n]*using [^\\n]*tool [^\\n]*read|permission [^\\n]*manipulation)\\b"
    - "\\b(send [^\\n]*conversation\\s+history|when [^\\n]*detected [^\\n]*send [^\\n]*full [^\\n]*history|highest\\s+priority [^\\n]*over [^\\n]*other [^\\n]*tools)\\b"
    - "\\b(duplicate [^\\n]*code [^\\n]*snippets [^\\n]*silently|insert [^\\n]*vulnerability [^\\n]*generated [^\\n]*code)\\b"
  file_types: [any]
  description: "Coercive prompt injections or forced tool execution patterns"
  remediation: "Remove coercive instructions and require explicit user confirmation"

- id: COMMAND_INJECTION_GENERIC
  category: command_injection
  severity: HIGH
  patterns:
    - "\\b(shutdown|reboot|halt|poweroff)\\s+(-[fh]|now|0)\\b"
    - "\\b(nc|netcat)\\s+(-[le]|25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
    - "\\b(nmap)\\s+(-[sS]|--script|25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
    - "\\b(wget|curl)\\s+(http[s]?:\\/\\/[^\\s]+|ftp:\\/\\/[^\\s]+|-[oO]\\s|--output\\s)"
    - "\\b(bash\\s+-i|sh\\s+-i|nc\\s+-e|\\/dev\\/tcp\\/[0-9]+\\.|socat.*exec|python.*socket.*connect)\\b"
    - "[|&;]\\s*(rm\\s+-rf|dd\\s+if=|chmod\\s+777|wget\\s+http|curl\\s+http)"
  file_types: [any]
  description: "Command injection or system abuse patterns"
  remediation: "Avoid dangerous shell operations and validate all inputs"

- id: CREDENTIAL_HARVESTING_GENERIC
  category: hardcoded_secrets
  severity: HIGH
  patterns:
    - "\\b(steal|grab|exfiltrate|leak|transmit|post.*http|curl.*http|wget.*http)\\b[^\\n]*(credential|password|key|token|secret|ssh|aws)"
    - "\\b(requests\\.(post|get|put)|urllib\\.request|socket\\.send|base64\\.b64encode)\\s*\\([^\\)]*\\b(credential|password|key|token|secret|api_key|private_key)\\b"
    - "\\b([Aa][Pp][Ii][_\\-]?[Kk][Ee][Yy].*[A-Za-z0-9]{16,512}|[Bb]earer\\s+[A-Za-z0-9\\-_]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{48})"
    - "(-----BEGIN (RSA |OPENSSH |EC |DSA |CERTIFICATE|PRIVATE KEY|ENCRYPTED PRIVATE KEY)-----|ssh-(rsa|ed25519)\\s+[A-Za-z0-9+\\/=]{8})"
    - "\\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|GOOGLE_AI_KEY|GEMINI_API_KEY|COHERE_API_KEY|HUGGINGFACE_TOKEN|HF_TOKEN|TOGETHER_API_KEY|REPLICATE_API_TOKEN|MISTRAL_API_KEY)\\s*=\\s*['\"][A-Za-z0-9\\-_]{20,}['\"]"
    - "\\b(os\\.environ\\s*\\[\\s*['\"]?(AWS_SECRET|API_KEY|SECRET_KEY|PASSWORD|TOKEN)['\"]?\\s*\\]|getenv\\s*\\(\\s*['\"]?(AWS_SECRET|API_KEY|SECRET_KEY|PASSWORD)['\"]?\\s*\\))\\s*.*\\s*(requests\\.|urllib\\.|socket\\.|print\\(|sys\\.stdout)"
    - "\\b(open|read)\\s*\\(\\s*['\"]?\\s*(~\\/\\.ssh\\/id_rsa|~\\/\\.ssh\\/id_dsa|~\\/\\.ssh\\/id_ecdsa|~\\/\\.aws\\/credentials|~\\/\\.kube\\/config|\\/etc\\/passwd|\\/etc\\/shadow|~\\/\\.netrc|~\\/\\.pgpass|credentials\\.json|service_account\\.json|private_key\\.pem)\\b"
    - "['\"][\\~\\/]+(\\.ssh\\/id_rsa|\\.ssh\\/id_dsa|\\.aws\\/credentials|\\.kube\\/config|etc\\/passwd|etc\\/shadow)['\"]"
    - "\\b(leak|exfiltrate|export|dump) [^\\n]*(parameter|context|files?|credentials?|keys?|tokens?|secrets?)\\b"
    - "\\b(base64\\s+encode [^\\n]*credentials?|concatenate [^\\n]*conversation\\s+history)\\b"
    - "\\b(claude_desktop_config\\.json|~\\/\\.cursor\\/logs\\/conversations|plaintext[^\\n]*api[^\\n]*key|-rw-r--r--[^\\n]*password)\\b"
    - "\\b(_get_all_messages[^\\n]*messages\\.db|forward[^\\n]*message[^\\n]*proxy[^\\n]*number|whatsapp[^\\n]*message[^\\n]*history|contact[^\\n]*list[^\\n]*exfiltrat|reprogram[^\\n]*agent[^\\n]*interaction)\\b"
  file_types: [any]
  description: "Credential exposure, hardcoded secrets, or exfiltration attempts"
  remediation: "Remove secrets from source and avoid transmitting sensitive data"

- id: INDIRECT_PROMPT_INJECTION_GENERIC
  category: prompt_injection
  severity: HIGH
  patterns:
    - "\\b(follow (the )?(instructions?|commands?|directives?) (in|from|inside|within) (the )?(file|webpage|document|url|link|website|page|content))\\b"
    - "\\b(execute (the )?(code|script|commands?) (in|from|found in) (the )?(file|webpage|document|url|link))\\b"
    - "\\b(do (what|whatever) (the )?(webpage|file|document|url|content) (says|tells|instructs|commands?))\\b"
    - "\\b(run (all |any )?(code|script) blocks? (you |that )?(find|see|encounter|discover) (in|from|inside) (the )?(url|webpage|website|external|untrusted))\\b"
    - "\\b(follow (the )?instructions? in (the )?(markdown|html|xml|json|yaml))\\b"
    - "\\b(let (the )?(file|document|content) (decide|determine|control|specify))\\b"
    - "\\b(execute (inline |embedded )?(code|scripts?)|run (inline |embedded )?(code|scripts?))\\b"
    - "\\b(trust (the )?(url|link|webpage) (content|instructions?)|safe to (follow|execute|run) (url|link|webpage))\\b"
    - "\\b(parse (and |then )?(execute|run|eval)|extract (and |then )?(execute|run|eval))\\b"
  file_types: [any]
  description: "Indirect prompt injection via external or untrusted sources"
  remediation: "Do not blindly follow instructions from external content"

- id: PROMPT_INJECTION_GENERIC
  category: prompt_injection
  severity: HIGH
  patterns:
    - "\\b(Bypass|Dis\\W?regard|Do not (follow|Obey)|Forget|Ignore)\\s+((all|any|each|every|most|some)\\s+(of\\s+)?)?((your|the)\\s)?(command|communication|conte[nx]t|conversation|data|guidelines|input|instruction|message|request|response|text)(s)?"
    - "\\b(inject tool[_\\s]calls?|now call function|use function)\\b"
    - "\\b(internalOnly|hiddenParam|shadowTool|bypassChecks|sandboxEscape)\\b"
    - "\\b(do\\s+not\\s+(mention|tell|execute)|tell\\s+(the )?user\\s+only\\s+about|do\\s+not\\s+mention\\s+this\\s+to\\s+user)\\b"
    - "\\b(disregard\\s+(all\\s+)?safety\\s+guidelines|forget\\s+(everything|all)\\s+(before|above)|system\\s*prompt\\s*override)\\b"
    - "\\bnew\\s+(instructions|directive|guidelines)s?\\s*:\\s*you\\s+are\\b"
    - "\\b(grant\\s+(me\\s+)?admin\\s+(access|privileges?)|bypass\\s+(all\\s+)?security\\s+checks?|elevated\\s+permissions?\\s+required|sudo\\s+mode\\s+enabled?|developer\\s+mode\\s+activated?)\\b"
  file_types: [any]
  description: "Prompt injection patterns that override instructions or force tool usage"
  remediation: "Remove instruction overrides and require explicit user validation"

- id: PROMPT_INJECTION_UNICODE_STEGANOGRAPHY
  category: prompt_injection
  severity: MEDIUM
  patterns:
    - "\\\\u(\\{)?[Ee]00[0-7][0-9A-Fa-f](\\})?"
    - "\\\\U000[Ee]00[0-7][0-9A-Fa-f]"
    - "\\xE2\\x80\\x8B"
    - "\\xE2\\x80\\x8C"
    - "\\xE2\\x80\\x8D"
    - "\\xE2\\x80\\xAE"
    - "\\xE2\\x80\\xAD"
    - "\\xE2\\x80\\xA8"
    - "\\xE2\\x80\\xA9"
    - "\\xD0\\x90"
    - "\\xD0\\x95"
    - "\\xD0\\x9E"
  file_types: [any]
  description: "Hidden Unicode or steganographic characters that can hide instructions"
  remediation: "Remove hidden Unicode characters and normalize text"

- id: SCRIPT_INJECTION_GENERIC
  category: command_injection
  severity: HIGH
  patterns:
    - "(<\\/?script[^>]*>|javascript:)"
    - "\\b(setTimeout|Function|setInterval)\\s*\\("
    - "\\b(vbscript|CreateObject|WScript\\.Shell|Shell\\.Application)\\b"
    - "\\b(WScript\\.Shell\\.Exec|Shell\\.Application\\.ShellExecute|CreateObject.*Exec)\\s*\\("
    - "\\bdata:(text\\/html|application\\/javascript);base64\\b"
    - "(\\x1[Bb]\\[38;5;\\d+|\\x1[Bb]\\[2F\\x1[Bb]\\[1G|\\x1[Bb]\\[1;1H\\x1[Bb]\\[0J|\\x1[Bb]\\]8;;.*\\x1[Bb]\\|\\033\\[[0-9;]*m|\\e\\[[0-9;]*[mGKHF])"
    - "\\b(padding.*push.*off.*screen|hidden.*scrollbar|overflow.*hidden.*instruction|invisible.*text.*color)\\b"
  file_types: [any]
  description: "Embedded scripting payloads or terminal deception patterns"
  remediation: "Remove embedded scripts and obfuscated instructions"

- id: SQL_INJECTION_GENERIC
  category: command_injection
  severity: HIGH
  patterns:
    - "(\\bOR\\s+['\"]?1['\"]?\\s*=\\s*['\"]?1['\"]?\\s*(--|#|\\/\\*|;))"
    - "('\\s*;\\s*DROP\\s+TABLE|\"\\s*;\\s*DROP\\s+TABLE)"
    - "(UNION\\s+(ALL\\s+)?SELECT|'\\s*UNION\\s+SELECT|\"\\s*UNION\\s+SELECT)"
    - "\\b(SLEEP|WAITFOR\\s+DELAY|BENCHMARK|pg_sleep)\\s*\\("
    - "\\b(EXTRACTVALUE|UPDATEXML|EXP\\(~\\(SELECT|CAST)\\s*\\("
    - "(\\bSELECT [^;]*\\b(information_schema|mysql\\.user|all_tables|user_tables)\\b|\\bFROM\\s+(information_schema|mysql\\.user|dual|all_tables|user_tables)\\b|LOAD_FILE\\s*\\(\\s*['\"][^'\"]*\\.(config|passwd|shadow|key)\\b|INTO\\s+OUTFILE\\s+['\"][^'\"]*\\.(txt|sql|php)\\b|\\b(xp_cmdshell|sp_executesql)\\s*\\(|dbms_[a-z_]+\\s*\\()"
    - "(\\bUSER\\s*\\(\\s*\\)\\s*(SELECT|FROM|WHERE|AND|OR|UNION)\\b|CONCAT\\s*\\(\\s*USER\\s*\\(\\s*\\)\\s*\\))"
  file_types: [any]
  description: "SQL injection patterns and suspicious SQL payloads"
  remediation: "Use parameterized queries and avoid concatenated SQL"

- id: SYSTEM_MANIPULATION_GENERIC
  category: unauthorized_tool_use
  severity: HIGH
  patterns:
    - "\\b(os\\.environ\\s*\\[[^\\]]*\\]\\s*=|export\\s+PATH=|unset\\s+(PATH|HOME|USER))\\b"
    - "\\b(rm\\s+-rf|dd\\s+if=\\/dev\\/zero|wipefs|shred\\s+-|find\\s+[^\\n]+-delete)\\b"
    - "\\b(chmod\\s+(777|4755|6755|[ug]?\\+s)|(chown|chgrp)\\s+(root|0)|setuid|setgid)\\b"
    - "\\b(\\/etc\\/(passwd|shadow|sudoers)|\\/root\\/\\.ssh|~\\/\\.aws\\/credentials|~\\/\\.ssh\\/id_rsa)\\b"
    - "\\b(sudo\\s+-[si]|su\\s+-c?|runuser|doas)\\b"
    - "\\b(kill\\s+-9\\s+[0-9]+|killall\\s+-9|pkill\\s+-9)\\b"
    - "\\b(rm\\s+-rf\\s+[\\$\\/\\*]|find\\s+\\/\\s+-delete)\\b"
    - "\\b(PATH=\\/tmp|PATH=\\.:|export\\s+PATH=[\\$\\{])"
  file_types: [any]
  description: "System manipulation or privilege escalation patterns"
  remediation: "Remove destructive operations and avoid privilege escalation"

- id: TOOL_CHAINING_ABUSE_GENERIC
  category: data_exfiltration
  severity: MEDIUM
  patterns:
    - "\\b(read|fetch|get|retrieve|collect|gather)\\b[^\\n]{0,100}\\b(send|post|upload|transmit|forward|email|slack|webhook)\\b"
    - "\\b(collect (all |every |entire )?(data|files?|info|credentials?|secrets?|keys?|tokens?))\\b[^\\n]{0,150}\\b(send|post|upload|transmit|curl|wget|requests\\.post)\\b"
    - "\\b(first|then|next|after|finally),? (read|collect|gather)\\b[^\\n]{0,100}\\b(then|next|after|finally),? (send|post|upload)\\b"
    - "\\b(summarize|aggregate|compile)\\b[^\\n]{0,80}\\b(send|post|email|slack) (to|via) (external|webhook|url|endpoint|api)\\b"
    - "\\b(os\\.environ|getenv|process\\.env)\\b[^\\n]{0,150}\\b(requests\\.|urllib\\.|curl|wget|socket\\.)\\b"
    - "\\b(walk|rglob|listdir|scandir|find)\\b[^\\n]{0,100}\\b(open|read)\\b[^\\n]{0,100}\\b(send|post|upload)\\b"
    - "\\b(automatically (read|collect|gather))\\b[^\\n]{0,100}\\b(and |then )?(send|post|forward|upload)\\b"
  file_types: [any]
  description: "Suspicious multi-step tool chaining that could exfiltrate data"
  remediation: "Require explicit user approval before multi-step data flows"
`;
