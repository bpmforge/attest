---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# FINDING_SCHEMA.md

**Shared finding schema for all security specialists.**

Every specialist agent writes findings in this format. The attack-chainer reads all specialist output files and links findings whose `yields` match another finding's `preconditions` — this is the mechanism that produces cross-domain exploit chains.

---

## JSON Schema

```json
{
  "id": "string",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "category": "semgrep | owasp-web | owasp-llm | threat-model | secrets | cloud | iac | dependency",
  "title": "string",
  "file": "string (path:line, or 'N/A' for config/design findings)",
  "tool": "string (semgrep | manual | checkov | trivy | kics | trufflehog | npm-audit | etc)",
  "preconditions": ["string", "..."],
  "yields": ["string", "..."],
  "asset": "string",
  "evidence": "string (file:line citation, tool output, or URL)",
  "status": "REAL | FP | UNVERIFIED",
  "remediation": "string (one-line fix)"
}
```

## Field Definitions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Stable identifier: `<CATEGORY>-<NNN>` e.g. `OWASP-003`, `IaC-012`, `LLM-007` |
| `severity` | Yes | CRITICAL / HIGH / MEDIUM / LOW per CVSS-informed table below |
| `category` | Yes | Source domain — used by attack-chainer to group and link |
| `title` | Yes | One-line description: verb + component + impact ("Missing auth check on /admin/users") |
| `file` | Yes | `src/path/file.ts:47` — always specific. Never a directory. |
| `tool` | Yes | What found it. `manual` if found by code reading, not automated scan |
| `preconditions` | Yes | What an attacker needs BEFORE exploiting this finding. Array of strings. |
| `yields` | Yes | What the attacker GAINS after exploiting this finding. Array of strings. |
| `asset` | Yes | The resource/data at risk: "users table", "AWS S3 bucket", "JWT secret key" |
| `evidence` | Yes | Citation that backs the finding — file:line, tool output snippet, or URL |
| `status` | Yes | REAL (confirmed), FP (false positive), UNVERIFIED (needs human check) |
| `remediation` | Yes | Concrete one-line fix. "Add `Authorization` header check before route handler." |

---

## Severity Calibration

| Severity | Criteria |
|----------|---------|
| **CRITICAL** | Exploitable remotely, no auth required, direct data loss or RCE |
| **HIGH** | Exploitable with low privilege or local access; significant data exposure |
| **MEDIUM** | Requires specific conditions; limited impact or difficult to chain |
| **LOW** | Defense-in-depth, best-practice gaps, informational |

---

## Preconditions / Yields — Attack Chain Vocabulary

Use consistent terms so the attack-chainer can match them:

**Common preconditions:**
- `"can send HTTP requests to <endpoint>"`
- `"authenticated as low-privilege user"`
- `"network access to <service>"`
- `"can write to <path/store>"`
- `"has access to AWS/GCP credentials"`
- `"can read git history"`

**Common yields:**
- `"read access to <resource>"`
- `"write access to <resource>"`
- `"arbitrary code execution"`
- `"valid session token"`
- `"AWS/GCP credentials"`
- `"PII exfiltration"`
- `"privilege escalation to <role>"`
- `"lateral movement to <service>"`

---

## Markdown Report Format (per specialist)

Each specialist writes findings to its output file as a Markdown table + detail sections:

```markdown
# <Domain> Findings — <project> — <date>
**Specialist:** <agent-name> | **Status:** complete | **Findings:** N REAL, N UNVERIFIED, N FP

## Summary Table

| ID | Sev | Title | File | Status |
|----|-----|-------|------|--------|
| OWASP-001 | CRITICAL | SQL injection in search endpoint | src/api/search.ts:47 | REAL |

## OWASP-001 — CRITICAL — SQL injection in search endpoint

**File:** `src/api/search.ts:47`
**Tool:** semgrep / manual
**Preconditions:** can send HTTP POST to /api/search
**Yields:** arbitrary SQL execution, full database read
**Asset:** products table, users table
**Evidence:** `src/api/search.ts:47` — `db.query("SELECT * FROM products WHERE name = '" + req.body.q + "'")`
**Status:** REAL
**Remediation:** Use parameterized query: `db.query("SELECT * FROM products WHERE name = ?", [req.body.q])`
```

---

## Example Cross-Domain Chain

The attack-chainer reads all specialist output files and links by `yields → preconditions`:

```
IaC-003 [HIGH] — Terraform state stored in unencrypted S3 bucket
  preconditions: ["network access to S3"]
  yields: ["read access to terraform.tfstate"]

SECRETS-001 [CRITICAL] — AWS access key in terraform.tfstate
  preconditions: ["read access to terraform.tfstate"]
  yields: ["AWS credentials for prod account"]

CLOUD-004 [HIGH] — IAM role allows s3:GetObject on * 
  preconditions: ["AWS credentials for prod account"]
  yields: ["read access to all S3 buckets", "PII exfiltration"]

OWASP-007 [MEDIUM] — Broken access control on /api/export
  preconditions: ["authenticated as low-privilege user"]
  yields: ["read access to export endpoint"]

→ Chain: IaC-003 → SECRETS-001 → CLOUD-004 → full PII exfiltration
   Severity: CRITICAL (chain escalates IaC HIGH to chain CRITICAL)
```
