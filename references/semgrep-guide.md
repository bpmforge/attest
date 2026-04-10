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

## Two-Tier Scan Strategy

Don't run one big scan for every situation. Use two tiers:

### Tier 1 — Fast (CI / continuous feedback)
**Goal:** < 60 seconds. High signal, low noise. Runs on every commit.

```bash
semgrep scan \
  --config p/ci \
  --config p/secrets \
  --config p/<language> \
  --metrics=off
```

- `p/ci` is optimized for CI: Semgrep's curated set of high-precision rules
- Only secrets + one language pack — everything else is deferred to the deep audit
- Target use: pre-commit hook, PR check, save-on-write

### Tier 2 — Deep (manual audit, before-deploy gate)
**Goal:** 5-15 minutes. Full coverage. Runs on `/security` invocation.

```bash
semgrep scan \
  --config p/owasp-top-ten \
  --config p/security-audit \
  --config p/secrets \
  --config p/default \
  --config p/<language> \
  --config p/<framework> \
  --config p/dockerfile \
  --config p/kubernetes \
  --config p/github-actions \
  --config ~/.cache/semgrep-community/trailofbits \
  --config ~/.cache/semgrep-community/elttam \
  --config ~/.cache/semgrep-community/gitlab/<language> \
  --config .semgrep/project-rules \
  --json --sarif --metrics=off \
  -o docs/security/semgrep-results.json
```

The `hooks/semgrep-full-audit.sh` script handles all of this automatically — detects language, framework, IaC presence, and composes the right config list.

---

## Framework Auto-Detection

Beyond language packs, framework-specific packs catch framework anti-patterns the language packs miss:

| Framework | Detect via | Pack |
|-----------|-----------|------|
| Express | `"express"` in `package.json` | `p/express` |
| Next.js | `"next"` in `package.json` | `p/nextjs` |
| React | `"react"` in `package.json` | `p/react` |
| Django | `django` in `requirements.txt` | `p/django` |
| Flask | `flask` in `requirements.txt` | `p/flask` |
| Ruby on Rails | `rails` in `Gemfile` | `p/rails` |
| Spring Boot | `spring-boot` in `pom.xml` | `p/spring` |
| Gin | `github.com/gin-gonic/gin` in `go.mod` | `p/gin` |

**Example finding only a framework pack catches:**
- `p/nextjs` flags `getServerSideProps` using user input to fetch internal URLs → SSRF
- `p/django` flags `@csrf_exempt` on state-mutating views → CSRF
- `p/express` flags routes without `helmet()` middleware → missing security headers

---

## Infrastructure-as-Code Rules

If the project has infra code, include these:

| IaC Type | Detect via | Pack |
|----------|-----------|------|
| Docker | `Dockerfile*` exists | `p/dockerfile` |
| Terraform | `*.tf` files | `p/terraform` |
| Kubernetes | `k8s/` or `kubernetes/` or `helm/` | `p/kubernetes` |
| GitHub Actions | `.github/workflows/*.yml` | `p/github-actions` |
| Ansible | `playbooks/*.yml` | `p/ansible` |

**Examples of findings:**
- `p/dockerfile` — running as root, missing `HEALTHCHECK`, `curl | bash` anti-pattern, `apt-get` without version pinning
- `p/github-actions` — `${{ github.event.pull_request.title }}` in shell commands (script injection), unpinned action versions (`@main` instead of `@v4.1.2`), excessive `GITHUB_TOKEN` permissions
- `p/kubernetes` — containers running as root, privileged containers, missing resource limits, hostPath mounts

---

## Community Rule Sources

The official Registry is good, but the highest-signal rules come from independent security firms. See `semgrep-community-rules.md` for the full list, clone commands, and pinning strategy. Summary:

| Source | Focus | License | Status |
|--------|-------|---------|--------|
| **Trail of Bits** | Go, Python, JS/TS, Dockerfile, Solidity | AGPLv3 | HIGHEST PRIORITY |
| **elttam** | JavaScript/TypeScript taint tracking | MIT | HIGH |
| **GitLab SAST** | Multi-language (rules powering GitLab SAST) | MIT | HIGH |
| **0xdea** | C/C++ memory safety | MIT | HIGH for C/C++ projects |

Install with `hooks/update-semgrep-rules.sh` (clones to `~/.cache/semgrep-community/`). Pin commits in `.semgrep/community-rules.lock`. Refresh quarterly.

---

## Baseline Scanning (Repeat Audits)

For a repeat audit, you don't want to re-report every finding from last time. Use `--baseline-ref` to only surface NEW findings since a git reference:

```bash
# Only findings new since the last audit commit
semgrep scan --config ... --baseline-ref <last-audit-commit>

# Only findings new since the last release tag
semgrep scan --config ... --baseline-ref v2.1.0

# For PR review — only findings on changed lines
semgrep scan --config ... --baseline-ref origin/main
```

**How it works:** Semgrep runs the scan on the current code AND on the baseline ref, then diffs the findings. Only findings that appear in the current scan but not in the baseline are reported.

**Tracking:** After each audit, save the commit hash. The security-auditor agent stores this in `docs/security/LAST_AUDIT.json`:

```json
{
  "commit": "abc123def4567890",
  "timestamp": "2026-04-10T14:23:00Z",
  "findings_total": 47,
  "findings_by_severity": {"HIGH": 3, "MEDIUM": 12, "LOW": 32}
}
```

Next audit uses this commit as the baseline.

---

## Finding Triage

Not every finding needs to be fixed. Some are false positives, some are accepted risks. Track them in `docs/security/TRIAGE.md`:

```markdown
# Security Finding Triage

## Fixed
| Finding | Rule ID | File:Line | Fixed In | By |
|---------|---------|-----------|----------|-----|
| SQL injection in login | javascript.express.sqli | src/auth.ts:42 | 2026-04-05 | alice |

## False Positives
| Finding | Rule ID | File:Line | Reason | Suppressed With |
|---------|---------|-----------|--------|-----------------|
| eval() in template engine | javascript.lang.eval | src/template.ts:88 | Template engine uses eval internally, input is validated upstream at src/router.ts:15 | `// nosemgrep: javascript.lang.eval` |

## Accepted Risk
| Finding | Rule ID | File:Line | Justification | Owner | Expires |
|---------|---------|-----------|---------------|-------|---------|
| MD5 used in non-crypto context | python.lang.md5 | src/cache_key.py:23 | Used for cache key only, not security | user | 2026-10-01 |
```

**Agent integration:** Before reporting a finding, check TRIAGE.md. If the finding matches a `Fixed` row → don't report. If it matches `False Positive` → report at INFO level with the justification. If it matches `Accepted Risk` and the expiry hasn't passed → report at INFO with the owner/expiry. If accepted-risk expiry has passed → bump to original severity and flag for re-review.

---

## Complementary Tools

Semgrep is strong at AST-based pattern matching, but it's not the only tool in the audit. Use these alongside:

### Secrets (Semgrep is a baseline, not a replacement)
| Tool | When to use | Why |
|------|-------------|-----|
| **gitleaks** | Every audit — scans git history | Catches secrets leaked in old commits that were reverted but not force-pushed. Semgrep only sees current code. |
| **trufflehog** | When you want to verify secrets | Actually calls the API associated with a found key to see if it's live. Eliminates false positives for expired keys. |

```bash
# gitleaks — scan entire git history
gitleaks detect --source . --report-format json --report-path docs/security/gitleaks.json

# trufflehog — verify live secrets
trufflehog git file://$(pwd) --json --only-verified > docs/security/trufflehog.json
```

### Dependencies / SCA
| Tool | When to use | Why |
|------|-------------|-----|
| **osv-scanner** | Primary dep audit | Google's scanner using OSV.dev — widest ecosystem coverage, freshest CVE data |
| `npm audit` / `pip-audit` / `cargo audit` | Language-native fallback | Fine as secondary, missing some ecosystems |
| **Trivy** | Container image scan | Scans built images for OS-level and application CVEs |

```bash
# osv-scanner — cross-ecosystem
osv-scanner --recursive . --format json -o docs/security/osv.json

# Trivy — container image
trivy image myimage:latest --format json -o docs/security/trivy.json
```

### SBOM (Software Bill of Materials)
| Tool | Output | Why |
|------|--------|-----|
| **syft** | CycloneDX / SPDX | Required for SOC2, SLSA, supply-chain attestation |

```bash
# Generate SBOM in CycloneDX format
syft packages . -o cyclonedx-json=docs/security/sbom.cdx.json
```

### License Compliance
| Language | Tool |
|----------|------|
| JavaScript | `license-checker` |
| Python | `pip-licenses` |
| Go | `go-licenses check ./...` |
| Rust | `cargo-deny check licenses` |

Catches GPL-contamination issues in commercial code.

### Dockerfile Linting (Complement to `p/dockerfile`)
| Tool | Why |
|------|-----|
| **hadolint** | Catches layer optimization, best practices, missing tags — different coverage from Semgrep's Dockerfile rules |

```bash
hadolint Dockerfile --format json > docs/security/hadolint.json
```

---

## Project-Specific Custom Rules (Lifecycle)

Community rules catch generic patterns. Every codebase also has **unique anti-patterns** — conventions specific to your architecture:

- "All DB access must go through `repository/` — never `db.query()` directly"
- "Auth middleware must be `requireAuth()`, not `authenticate()` (legacy)"
- "Session tokens must be in httpOnly cookies, never localStorage"
- "Never import from `legacy/` directory in new code"

**Store in `.semgrep/project-rules/`** — version-controlled. Every time the audit finds a manual pattern, capture it as a custom rule. Next audit catches it automatically — the audit gets smarter over time.

**Lifecycle:**
1. Manual review finds pattern X that Semgrep didn't catch
2. Write a rule for X in `.semgrep/project-rules/pattern-x.yaml`
3. Add test fixtures in `.semgrep/project-rules/tests/pattern-x.test.ts` (good and bad examples)
4. Run `semgrep scan --test .semgrep/project-rules/` to verify rule fires on bad, doesn't fire on good
5. Commit the rule. Next audit includes it automatically.

**Rule testing** — every custom rule MUST have a test:

```yaml
# .semgrep/project-rules/missing-auth.yaml
rules:
  - id: missing-auth-middleware
    pattern: |
      app.$METHOD($PATH, (req, res) => { ... })
    pattern-not: |
      app.$METHOD($PATH, requireAuth, (req, res) => { ... })
    message: Route handler missing auth middleware
    severity: HIGH
    languages: [javascript, typescript]
```

```typescript
// .semgrep/project-rules/missing-auth.test.ts
// ruleid: missing-auth-middleware
app.get('/admin', (req, res) => { res.send('admin') });

// ok: missing-auth-middleware
app.get('/admin', requireAuth, (req, res) => { res.send('admin') });
```

```bash
semgrep scan --test .semgrep/project-rules/
# Should print: 2 ✓
```

---

## Autofix (OPT-IN ONLY)

Semgrep supports automated fixes for rules that include a `fix:` field. **In this agent, autofix is opt-in and restricted:**

**Rules:**
1. Default: **never autofix**. The agent reports findings, the user decides.
2. Opt-in via `--autofix` flag on the invocation (e.g., `/security --autofix` or `hooks/semgrep-full-audit.sh --autofix`).
3. Even with opt-in: **never autofix HIGH or CRITICAL findings**. Security fixes need human review. A flawed autofix for SQL injection could introduce a subtle bug.
4. Autofix only applies to `WARNING` and `INFO` severity rules: unused imports, deprecated API calls, missing type annotations, style issues.
5. Always dry-run first: `--autofix-dryrun` prints what would change without applying.

**Why the restriction:** Autofixing a security finding means the agent is making a security decision without the user seeing it. For anything that matters, the cost of a wrong fix is higher than the cost of a human reading the finding.

---

## Metrics Opt-Out

Semgrep phones home with scan metadata by default. For privacy-sensitive projects, always pass `--metrics=off`. Our `hooks/semgrep-full-audit.sh` sets this by default.

---

## `.semgrepignore` (Not `--exclude`)

For persistent excludes, use a committed `.semgrepignore` file rather than command-line `--exclude` flags. The file is shared with the team:

```
# .semgrepignore — same syntax as .gitignore
node_modules/
vendor/
dist/
build/
*.min.js
coverage/
**/__generated__/**
**/*_pb.py
**/*_pb2.py
test/fixtures/
```

---

## SARIF Output (GitHub Security Tab, etc.)

Semgrep can emit SARIF alongside JSON:

```bash
semgrep scan --config ... --sarif-output docs/security/semgrep.sarif
```

Upload the SARIF file to GitHub's Security tab via `github/codeql-action/upload-sarif` in a workflow. Findings appear in PR reviews automatically.

---

## Integration Checklist for Security Agent

1. **Preflight:**
   - `Bash which semgrep` — verify installed
   - `Bash [ -d ~/.cache/semgrep-community/trailofbits ] || scripts/update-semgrep-rules.sh` — verify community rules cached
   - `Bash scripts/update-semgrep-rules.sh --verify` — if `.semgrep/community-rules.lock` exists
2. **Detect project characteristics:**
   - Language (package.json, go.mod, Cargo.toml, requirements.txt, pom.xml, Gemfile, composer.json)
   - Framework (grep package.json / requirements.txt for known framework names)
   - IaC presence (Dockerfile, *.tf, k8s/, .github/workflows/)
3. **Pick scan tier:** `/security` → deep; `/security --fast` → fast
4. **Run the scan:** Use `scripts/semgrep-full-audit.sh` — handles config composition automatically
5. **Baseline (repeat audits):** Use `--baseline-ref` with commit from `docs/security/LAST_AUDIT.json`
6. **Parse JSON output:** Extract findings by severity, group by OWASP category
7. **Check triage:** Read `docs/security/TRIAGE.md`, suppress/downgrade findings already triaged
8. **Run complementary tools:** gitleaks, osv-scanner, trivy (if containers), syft (if compliance required)
9. **Cross-reference with manual findings:** Semgrep catches patterns, manual review catches logic
10. **Write custom rules:** For project-specific patterns found during manual review → `.semgrep/project-rules/`
11. **Generate report:** Combine all findings into `docs/security/SECURITY_AUDIT_<date>.md`
12. **Update `LAST_AUDIT.json`** with the commit hash for next audit's baseline
