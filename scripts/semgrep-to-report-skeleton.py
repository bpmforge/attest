#!/usr/bin/env python3
"""
semgrep-to-report-skeleton.py — Generate a security report skeleton from Semgrep JSON

Takes a semgrep-results.json (and optionally gitleaks.json, osv.json) and
produces a markdown skeleton with all mechanically-derivable fields pre-filled.
The security-auditor agent then enriches each finding with manual analysis:
exploit explanation, verification steps, similar locations, unified-diff fix.

This gives local LLMs (which struggle with large JSON in one shot) a clean
starting point and makes every field's provenance explicit.

Usage:
    semgrep-to-report-skeleton.py [--semgrep PATH] [--gitleaks PATH] [--osv PATH] \
                                  [--project NAME] [--output PATH]

Defaults:
    --semgrep  docs/security/semgrep-results.json
    --gitleaks docs/security/gitleaks.json
    --osv      docs/security/osv.json
    --output   docs/security/SECURITY_AUDIT_<today>.md
"""

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path


SEVERITY_ORDER = {"ERROR": 0, "CRITICAL": 0, "HIGH": 1, "WARNING": 2, "MEDIUM": 2, "LOW": 3, "INFO": 4}


def load_json(path):
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"⚠️  Could not parse {path}: {e}", file=sys.stderr)
        return None


def normalize_severity(sev):
    """Semgrep uses ERROR/WARNING/INFO. Map to CRITICAL/HIGH/MEDIUM/LOW/INFO."""
    mapping = {
        "ERROR": "HIGH",       # Semgrep ERROR → HIGH by default; bump to CRITICAL for specific rules
        "WARNING": "MEDIUM",
        "INFO": "LOW",
        "CRITICAL": "CRITICAL",
        "HIGH": "HIGH",
        "MEDIUM": "MEDIUM",
        "LOW": "LOW",
    }
    return mapping.get(sev.upper(), "MEDIUM")


def bump_critical(finding):
    """Some rules should be CRITICAL regardless of Semgrep's default severity."""
    rule_id = finding.get("check_id", "")
    critical_patterns = [
        "sql-injection", "command-injection", "rce", "auth-bypass",
        "hardcoded-secret", "path-traversal", "deserialization",
        "xxe", "ssrf.*internal",
    ]
    return any(pat in rule_id.lower() for pat in critical_patterns)


def format_semgrep_finding(n, finding):
    """Format a single Semgrep finding into the report skeleton."""
    path = finding.get("path", "unknown")
    start_line = finding.get("start", {}).get("line", 0)
    end_line = finding.get("end", {}).get("line", start_line)
    extra = finding.get("extra", {})

    severity = normalize_severity(extra.get("severity", "MEDIUM"))
    if bump_critical(finding):
        severity = "CRITICAL"

    message = extra.get("message", "").strip()
    rule_id = finding.get("check_id", "unknown")
    metadata = extra.get("metadata", {})

    owasp_list = metadata.get("owasp", [])
    owasp = owasp_list[0] if owasp_list else "Uncategorized"

    cwe_list = metadata.get("cwe", [])
    cwe = cwe_list[0] if cwe_list else "N/A"

    references = metadata.get("references", [])
    ref_links = "\n".join(f"- {r}" for r in references[:3]) if references else "- (none)"

    lines = extra.get("lines", "").rstrip()

    # Derive file extension for code block language hint
    ext = Path(path).suffix.lstrip(".") or "text"
    lang_map = {"ts": "typescript", "js": "javascript", "py": "python", "go": "go",
                "rs": "rust", "java": "java", "rb": "ruby", "php": "php"}
    lang = lang_map.get(ext, ext)

    has_fix = bool(extra.get("fix"))
    fix_section = f"\n**Semgrep auto-fix available:** yes — review before applying\n" if has_fix else ""

    return f"""---

### [{severity}] Finding {n}: {_title_from_rule(rule_id, message)}

**File:** `{path}`
**Line:** {start_line}{f'–{end_line}' if end_line != start_line else ''}
**OWASP:** {owasp}
**CWE:** {cwe}
**Source:** Semgrep (`{rule_id}`)
**Severity rationale:** {_severity_rationale(severity, rule_id)}
{fix_section}
**Vulnerable code (`{path}:{start_line}{f'-{end_line}' if end_line != start_line else ''}`):**
```{lang}
{lines}
```

**Rule message:**
> {message}

**Why this is exploitable:** _⚠️ FILL IN: Name the specific input variable, the path it takes from untrusted source to dangerous sink, and a concrete exploit payload the attacker would send. "User input is not sanitized" is NOT acceptable — be specific._

**Exploit prerequisites:** _⚠️ FILL IN: unauthenticated? internet-facing? requires specific user role? needs valid session? rate-limited?_

**Impact:** _⚠️ FILL IN: what the attacker gains + who is affected. For CRITICAL/HIGH, translate to business impact (PII exposure, payment bypass, RCE, data loss)._

**Remediation (unified diff):**
```diff
⚠️ FILL IN: show the before/after as a unified diff the developer can apply.
Example:
- const query = `SELECT * FROM users WHERE email = '${{email}}'`;
- const result = await db.execute(query);
+ const result = await db.execute(
+   `SELECT * FROM users WHERE email = ?`,
+   [email]
+ );
```

**Verification steps:** _⚠️ FILL IN: specific command the developer runs to confirm the fix works. Example: `curl -X POST /login -d '{{"email": "\\' OR 1=1 --"}}' — should return 401, not 200`._

**Similar locations to check:** _⚠️ FILL IN: run a targeted grep for the same pattern across the codebase. List any matches as "not verified, needs manual review"._

**Fix effort:** _⚠️ FILL IN: S (< 1 hour) | M (half day) | L (> 1 day)_

**References:**
{ref_links}
"""


def _title_from_rule(rule_id, message):
    """Generate a human-readable title from the rule ID or first sentence of message."""
    # Take the last segment of the rule_id and clean it up
    segment = rule_id.split(".")[-1] if "." in rule_id else rule_id
    segment = segment.replace("-", " ").replace("_", " ").title()
    return segment or message.split(".")[0][:60]


def _severity_rationale(severity, rule_id):
    """Short justification for the severity assignment."""
    if severity == "CRITICAL":
        return "Directly exploitable with significant impact (auth bypass, RCE, data exfil)"
    if severity == "HIGH":
        return "Exploitable with meaningful impact — fix this sprint"
    if severity == "MEDIUM":
        return "Should be fixed but not immediately exploitable"
    if severity == "LOW":
        return "Best-practice improvement, not immediately dangerous"
    return "Observation — may or may not warrant action"


def format_gitleaks_finding(n, finding):
    """Format a gitleaks secret finding."""
    path = finding.get("File", "unknown")
    line = finding.get("StartLine", 0)
    rule = finding.get("RuleID", "unknown")
    secret = finding.get("Secret", "")
    # Mask the secret: show first 4 chars only
    masked = secret[:4] + "…" + f" ({len(secret)} chars)" if secret else "(redacted)"

    commit = finding.get("Commit", "")
    author = finding.get("Author", "")

    return f"""---

### [CRITICAL] Finding {n}: Leaked Secret — {rule}

**File:** `{path}`
**Line:** {line}
**Category:** Hardcoded Secret (OWASP A02: Cryptographic Failures)
**Source:** gitleaks (`{rule}`)

**Secret (masked):** `{masked}`
**Commit:** `{commit[:12]}` by {author}

**Why this is critical:** Secrets committed to version control are exposed to anyone with repo access — current team, past team members, anyone who cloned a fork, anyone who compromises the git host. Even if the secret is deleted in a later commit, git history preserves it until force-push + garbage collection.

**Exploit prerequisites:** Read access to the repository. If public, zero prerequisites.

**Remediation:**
1. **Rotate the secret immediately** — treat it as leaked, even if the repo is private
2. Remove from git history using `git filter-repo` or BFG Repo-Cleaner — `git rm` alone is not enough
3. Force-push the cleaned history
4. Notify anyone who may have pulled the affected commits
5. Add the secret pattern to `.gitleaks.toml` allowlist only if the "secret" is actually a test fixture / documentation

**Verification:**
```bash
# After rotation and history cleanup, confirm the secret is gone
git log --all -p | grep -F "{masked[:4]}"
# Should return empty
```

**Similar locations:** Run `gitleaks detect --source . --report-format json` to check for other leaks.

**Fix effort:** M (rotation + history rewrite coordination with team)
"""


def format_osv_finding(n, finding):
    """Format an osv-scanner dependency vulnerability finding."""
    package = finding.get("package", {})
    pkg_name = package.get("name", "unknown")
    version = package.get("version", "?")
    ecosystem = package.get("ecosystem", "?")

    vulns = finding.get("vulnerabilities", [])
    if not vulns:
        return ""

    vuln = vulns[0]  # Take the first; full report lists all
    vuln_id = vuln.get("id", "unknown")
    summary = vuln.get("summary", "").strip()
    details = vuln.get("details", "")[:300].strip()

    severity_rating = "HIGH"  # default for CVE — specific severity depends on parsing CVSS

    return f"""---

### [{severity_rating}] Finding {n}: Vulnerable Dependency — {pkg_name}@{version}

**Package:** `{pkg_name}` {version} ({ecosystem})
**Vulnerability:** {vuln_id}
**Source:** osv-scanner

**Summary:** {summary}

**Details:** {details}...

**Exploit prerequisites:** Depends on the specific CVE — check OSV.dev for details.

**Impact:** See CVE advisory.

**Remediation:** _⚠️ FILL IN: specific version to upgrade to. Check `osv-scanner` output or the advisory for the first fixed version._

**Verification:**
```bash
# After upgrade:
osv-scanner --recursive . | grep {vuln_id}
# Should return no matches
```

**Fix effort:** S (dependency bump) or M (if the upgrade includes breaking changes)

**References:**
- https://osv.dev/vulnerability/{vuln_id}
"""


def generate_summary_table(findings_list):
    """Generate the finding summary table."""
    rows = []
    for i, (n, finding, source) in enumerate(findings_list, 1):
        extra = finding.get("extra", {}) if source == "semgrep" else {}
        if source == "semgrep":
            severity = normalize_severity(extra.get("severity", "MEDIUM"))
            if bump_critical(finding):
                severity = "CRITICAL"
            path = finding.get("path", "?")
            line = finding.get("start", {}).get("line", "?")
            rule_id = finding.get("check_id", "?")
            title = _title_from_rule(rule_id, extra.get("message", ""))
            owasp = (extra.get("metadata", {}).get("owasp") or ["N/A"])[0]
        elif source == "gitleaks":
            severity = "CRITICAL"
            path = finding.get("File", "?")
            line = finding.get("StartLine", "?")
            title = f"Leaked secret: {finding.get('RuleID', '?')}"
            owasp = "A02 Crypto"
        elif source == "osv":
            severity = "HIGH"
            pkg = finding.get("package", {})
            path = f"{pkg.get('name', '?')}@{pkg.get('version', '?')}"
            line = "-"
            vuln = (finding.get("vulnerabilities") or [{}])[0]
            title = vuln.get("summary", "")[:60]
            owasp = "A06 Vuln Components"
        rows.append(f"| {n} | {severity} | {title[:50]} | `{path}` | {line} | {owasp} | {source} | Open |")

    return "\n".join(rows) if rows else "| — | — | No findings | — | — | — | — | — |"


def main():
    parser = argparse.ArgumentParser(description="Generate security report skeleton from scan outputs")
    parser.add_argument("--semgrep",  default="docs/security/semgrep-results.json")
    parser.add_argument("--gitleaks", default="docs/security/gitleaks.json")
    parser.add_argument("--osv",      default="docs/security/osv.json")
    parser.add_argument("--project",  default=os.path.basename(os.getcwd()))
    parser.add_argument("--output",   default=f"docs/security/SECURITY_AUDIT_{date.today().isoformat()}.md")
    parser.add_argument("--last-audit", default="docs/security/LAST_AUDIT.json")
    args = parser.parse_args()

    semgrep_data = load_json(args.semgrep)
    gitleaks_data = load_json(args.gitleaks)
    osv_data = load_json(args.osv)
    last_audit = load_json(args.last_audit)

    semgrep_results = (semgrep_data or {}).get("results", [])
    # Sort by severity (most critical first)
    semgrep_results.sort(key=lambda r: SEVERITY_ORDER.get(r.get("extra", {}).get("severity", "MEDIUM").upper(), 5))

    # Build flat list for summary table
    all_findings = []
    n = 1
    for r in semgrep_results:
        all_findings.append((n, r, "semgrep"))
        n += 1
    gl_findings = (gitleaks_data or []) if isinstance(gitleaks_data, list) else []
    for r in gl_findings:
        all_findings.append((n, r, "gitleaks"))
        n += 1
    osv_results = (osv_data or {}).get("results", [])
    osv_packages = []
    for result in osv_results:
        for pkg in result.get("packages", []):
            osv_packages.append(pkg)
    for r in osv_packages:
        if r.get("vulnerabilities"):
            all_findings.append((n, r, "osv"))
            n += 1

    # Count by severity
    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
    for idx, finding, source in all_findings:
        if source == "semgrep":
            sev = normalize_severity(finding.get("extra", {}).get("severity", "MEDIUM"))
            if bump_critical(finding):
                sev = "CRITICAL"
        elif source == "gitleaks":
            sev = "CRITICAL"
        else:
            sev = "HIGH"
        counts[sev] = counts.get(sev, 0) + 1

    # Delta from last audit
    delta_section = ""
    if last_audit:
        prev_total = last_audit.get("findings_total", "?")
        prev_date = last_audit.get("timestamp", "?")[:10]
        delta_section = f"""

**Delta from last audit ({prev_date}):**
- Previous total: {prev_total}
- Current total: {len(all_findings)}
- Change: {len(all_findings) - prev_total if isinstance(prev_total, int) else '?'}
"""

    # Build report
    today = date.today().isoformat()
    report = f"""# Security Audit Report
**Date:** {today}
**Project:** {args.project}
**Auditor:** AI Security Auditor (claude-experts / bpm-opencode-experts)
**Scope:** Full repository scan

---

## Executive Summary

**Total findings: {len(all_findings)}**

| Severity | Count | Action Window |
|----------|------:|---------------|
| CRITICAL | {counts['CRITICAL']:>5} | Fix before deploy |
| HIGH     | {counts['HIGH']:>5} | Fix this sprint |
| MEDIUM   | {counts['MEDIUM']:>5} | Fix within 30 days |
| LOW      | {counts['LOW']:>5} | Backlog |
| INFO     | {counts['INFO']:>5} | Document only |
{delta_section}
**⚠️ AGENT TO FILL IN:**
- **Most critical immediate action:** (name the #1 finding and the fastest path to mitigation)
- **Time to exploit (most likely attacker):** (e.g., "< 1 hour for #1, unauthenticated internet attacker")
- **Business impact if unfixed:** (translate tech findings to business risk — PII exposure, payment bypass, RCE, data loss)
- **Overall risk posture:** (one sentence: are we safe to deploy? safe to scale? safe to open to public traffic?)

---

## Finding Summary

| # | Severity | Title | File | Line | OWASP | Source | Status |
|---|----------|-------|------|-----:|-------|--------|--------|
{generate_summary_table(all_findings)}

---

## Findings

"""

    # Render each finding
    for idx, finding, source in all_findings:
        if source == "semgrep":
            report += format_semgrep_finding(idx, finding)
        elif source == "gitleaks":
            report += format_gitleaks_finding(idx, finding)
        elif source == "osv":
            report += format_osv_finding(idx, finding)
        report += "\n"

    report += """---

## Cross-Module Pattern Analysis

**⚠️ AGENT TO FILL IN:**
Group findings by root cause. If the same pattern appears in 3+ places, that's an architectural issue, not individual bugs. Recommend a shared fix (middleware, validation layer, helper function) rather than patching each instance.

Example:
> "Missing input validation appears in 8 endpoints (#3, #7, #11, #14, #19, #22, #25, #27).
> This is a systemic gap, not an individual oversight. Recommendation: create a
> `validateInput()` middleware and apply to all routes that accept user data."

---

## Action Plan

**⚠️ AGENT TO FILL IN:**
Ordered checklist with effort estimates. Prioritize by severity AND dependency
(if fix #3 enables fix #1, do #3 first).

### Immediate (next 24h)
- [ ] #N: [finding title] — [effort estimate]
- [ ] #N: [finding title] — [effort estimate]

### This Sprint (next 7-14 days)
- [ ] #N: ...

### Within 30 days
- [ ] #N: ...

### Backlog
- [ ] #N: ...

---

## Confidence Scores

**⚠️ AGENT TO FILL IN:** Rate each OWASP category 1-10 on coverage (see Reasoning Loop in the agent). Any category < 7 needs a re-pass or a surfaced gap.

| OWASP Category | Confidence (1-10) | Passes | Notes |
|----------------|------------------:|-------:|-------|
| A01 Broken Access Control |   | | |
| A02 Cryptographic Failures |   | | |
| A03 Injection |   | | |
| A04 Insecure Design |   | | |
| A05 Security Misconfiguration |   | | |
| A06 Vulnerable Components |   | | |
| A07 Auth Failures |   | | |
| A08 Data Integrity |   | | |
| A09 Logging & Monitoring |   | | |
| A10 SSRF |   | | |

---

## Scan Artifacts

- Raw Semgrep JSON:    `docs/security/semgrep-results.json`
- SARIF (GitHub):      `docs/security/semgrep-results.sarif`
- gitleaks results:    `docs/security/gitleaks.json`
- osv-scanner results: `docs/security/osv.json`
- Scan log:            `docs/security/semgrep-scan-<timestamp>.log`

## Skeleton Provenance

This report skeleton was generated by `scripts/semgrep-to-report-skeleton.py`.
All mechanically-derivable fields (file, line, severity, OWASP, CWE, verbatim
code snippet, rule ID) are populated directly from the scan JSON. Fields marked
with **⚠️ AGENT TO FILL IN** require manual analysis by the security auditor —
these are the fields where human judgment is required: exploit reasoning,
verification steps, similar-location searches, unified-diff fixes, effort
estimates, and business impact translation.
"""

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(report)

    print(f"✓ Report skeleton written to {output_path}")
    print(f"  Findings: {len(all_findings)}")
    print(f"  CRITICAL: {counts['CRITICAL']}  HIGH: {counts['HIGH']}  MEDIUM: {counts['MEDIUM']}  LOW: {counts['LOW']}")
    print()
    print("  Next step: security-auditor agent fills in ⚠️ fields with manual analysis.")


if __name__ == "__main__":
    main()
