# Semgrep Security Scanning Guide

**Last updated:** 2026-04-06
**Semgrep version:** OSS (open-source, Apache 2.0)
**Repo:** https://github.com/semgrep/semgrep

## What is Semgrep

Semgrep is an AST-based (Abstract Syntax Tree) static analysis tool. Unlike grep/regex scanning which matches text, Semgrep understands code structure — it knows what's a function call, a variable assignment, a string literal. This means it catches vulnerabilities that regex would miss and produces far fewer false positives.

**Key advantage over grep:** `hashlib.md5(...)` matches ANY call to `hashlib.md5()` regardless of whitespace, line breaks, or argument formatting. Grep would need multiple regex patterns to catch the same variants.

## Installation

```bash
# macOS
brew install semgrep

# pip (any platform)
pip install semgrep

# Docker
docker run -v $(pwd):/src returntocorp/semgrep semgrep scan --config auto
```

## Core CLI Commands

### Full Security Scan (recommended starting point)
```bash
# Auto-detect language and apply recommended security rules
semgrep scan --config auto

# Use specific OWASP rules
semgrep scan --config p/owasp-top-ten

# Multiple rule packs
semgrep scan --config p/owasp-top-ten --config p/security-audit --config p/secrets

# Scan specific directory
semgrep scan --config auto src/

# JSON output for report generation
semgrep scan --config auto --json -o semgrep-results.json

# SARIF output (for GitHub Security tab, etc.)
semgrep scan --config auto --sarif -o semgrep-results.sarif

# Only scan changed files (CI optimization)
semgrep scan --config auto --diff-depth 1
```

### Comprehensive Security Audit Command
```bash
# The full security audit command — run ALL security-relevant rule packs
semgrep scan \
  --config p/owasp-top-ten \
  --config p/security-audit \
  --config p/secrets \
  --config p/default \
  --json \
  -o docs/security/semgrep-results.json \
  2>&1 | tee docs/security/semgrep-scan.log
```

## Rule Packs (Registry)

Rules are hosted at https://semgrep.dev/explore. Use `--config p/<pack-name>`.

### Security-Focused Rule Packs

| Pack | Command | What It Finds |
|------|---------|---------------|
| **OWASP Top 10** | `p/owasp-top-ten` | All 10 OWASP categories |
| **Security Audit** | `p/security-audit` | Broad security patterns |
| **Secrets** | `p/secrets` | Hardcoded API keys, passwords, tokens |
| **Default** | `p/default` | Semgrep's recommended rules |
| **CI** | `p/ci` | Optimized for CI pipelines (fast, high-signal) |

### Language-Specific Security Packs

| Language | Pack | Focus |
|----------|------|-------|
| JavaScript/TypeScript | `p/javascript` | XSS, prototype pollution, eval |
| Python | `p/python` | SQL injection, command injection, pickle |
| Go | `p/golang` | Race conditions, unsafe pointers, crypto |
| Java | `p/java` | Deserialization, JNDI, SQL injection |
| Ruby | `p/ruby` | Mass assignment, CSRF, SQL injection |
| Rust | `p/rust` | Unsafe blocks, memory issues |
| PHP | `p/php` | SQL injection, file inclusion, XSS |

### OWASP Pack → Category Mapping

| OWASP Category | What Semgrep Catches |
|----------------|---------------------|
| A01: Broken Access Control | Missing auth checks, IDOR patterns, CORS misconfig |
| A02: Cryptographic Failures | Weak hashing (MD5/SHA1), hardcoded keys, insecure TLS |
| A03: Injection | SQL injection, command injection, XSS, LDAP injection, template injection |
| A04: Insecure Design | Missing rate limiting patterns, business logic issues |
| A05: Security Misconfiguration | Debug mode enabled, default credentials, verbose errors |
| A06: Vulnerable Components | Known CVE patterns in dependency usage |
| A07: Auth Failures | Weak JWT validation, session issues, credential exposure |
| A08: Data Integrity | Insecure deserialization, unsigned updates |
| A09: Logging Failures | Sensitive data in logs, missing audit trails |
| A10: SSRF | Unvalidated URL inputs to HTTP clients |

## JSON Output Format

When using `--json`, each finding has this structure:

```json
{
  "results": [
    {
      "check_id": "javascript.express.security.audit.xss.mustache-escape",
      "path": "src/api/routes.ts",
      "start": { "line": 42, "col": 5 },
      "end": { "line": 42, "col": 38 },
      "extra": {
        "message": "User input flows into response without escaping, enabling XSS",
        "severity": "HIGH",
        "metadata": {
          "owasp": ["A03:2021 - Injection"],
          "cwe": ["CWE-79: Cross-site Scripting"],
          "confidence": "HIGH",
          "references": ["https://owasp.org/..."]
        },
        "lines": "  res.send(`Hello ${req.query.name}`);"
      }
    }
  ],
  "errors": [],
  "stats": {
    "findings": 12,
    "errors": 0,
    "total_time": 3.2
  }
}
```

### Key Fields for Report Generation

| Field | Use In Report |
|-------|--------------|
| `check_id` | Rule identifier — categorize findings |
| `path` + `start.line` | File:line reference |
| `extra.severity` | LOW / MEDIUM / HIGH / CRITICAL |
| `extra.message` | Finding description |
| `extra.metadata.owasp` | OWASP category mapping |
| `extra.metadata.cwe` | CWE number |
| `extra.lines` | Code snippet (evidence) |

## Parsing Results for Report

```bash
# Count findings by severity
cat semgrep-results.json | jq '.results | group_by(.extra.severity) | map({severity: .[0].extra.severity, count: length})'

# List all CRITICAL/HIGH findings
cat semgrep-results.json | jq '[.results[] | select(.extra.severity == "HIGH" or .extra.severity == "CRITICAL") | {rule: .check_id, file: .path, line: .start.line, severity: .extra.severity, message: .extra.message}]'

# Group by OWASP category
cat semgrep-results.json | jq '[.results[] | {owasp: .extra.metadata.owasp[0], file: .path, line: .start.line, severity: .extra.severity}] | group_by(.owasp)'
```

## Writing Custom Rules

Create project-specific rules in `.semgrep/` or `semgrep-rules/`:

```yaml
# semgrep-rules/custom-auth-check.yaml
rules:
  - id: missing-auth-middleware
    patterns:
      - pattern: |
          app.$METHOD($PATH, (req, res) => { ... })
      - pattern-not: |
          app.$METHOD($PATH, authMiddleware, (req, res) => { ... })
      - pattern-not: |
          app.$METHOD($PATH, authenticate, (req, res) => { ... })
    message: >
      Route handler missing authentication middleware.
      All endpoints should use authMiddleware or authenticate.
    severity: HIGH
    languages: [javascript, typescript]
    metadata:
      owasp: ["A01:2021 - Broken Access Control"]
      cwe: ["CWE-862: Missing Authorization"]

  - id: no-sql-string-concat
    patterns:
      - pattern: |
          $DB.query(`...${$VAR}...`)
      - pattern-not-inside: |
          $DB.query($PARAM, [...])
    message: >
      SQL query uses string interpolation instead of parameterized queries.
      Use parameterized queries to prevent SQL injection.
    severity: CRITICAL
    languages: [javascript, typescript]
    metadata:
      owasp: ["A03:2021 - Injection"]
      cwe: ["CWE-89: SQL Injection"]
```

Run custom rules:
```bash
semgrep scan --config ./semgrep-rules/ --config p/owasp-top-ten
```

## Taint Tracking (Advanced)

Semgrep can track data flow from user input (sources) to dangerous operations (sinks):

```yaml
rules:
  - id: tainted-sql-query
    mode: taint
    pattern-sources:
      - pattern: req.query.$PARAM
      - pattern: req.body.$PARAM
      - pattern: req.params.$PARAM
    pattern-sinks:
      - pattern: $DB.query($SINK, ...)
    message: User input flows into SQL query without sanitization
    severity: CRITICAL
    languages: [javascript, typescript]
```

## False Positive Handling

```javascript
// nosemgrep: rule-id-here
const legit = eval(trustedCode); // This is intentional

// Or suppress all rules for a line:
// nosemgrep
const x = dangerousButIntentional();
```

**Best practice:** Don't suppress — fix. Only use `nosemgrep` with a comment explaining WHY.

## Performance

- Semgrep scans at ~10,000-20,000 lines/second
- A 100K LOC codebase typically scans in 10-30 seconds
- `--config auto` is slower than specific packs (downloads all rules)
- For CI: use `--config p/ci` for fast, high-signal scans
- For full audits: use multiple specific packs

## Integration Checklist for Security Agent

1. **Check if semgrep is installed:** `Bash which semgrep || echo "Not installed"`
2. **Detect project language:** Read package.json / go.mod / Cargo.toml / requirements.txt
3. **Run the comprehensive scan:** Use OWASP + security-audit + secrets + language-specific pack
4. **Parse JSON output:** Extract findings by severity, group by OWASP category
5. **Cross-reference with manual findings:** Semgrep catches patterns, manual review catches logic
6. **Write custom rules:** For project-specific patterns found during manual review
7. **Generate report:** Combine semgrep findings + manual findings into unified report
