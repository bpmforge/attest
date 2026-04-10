# Security Audit Report Template

This template is the contract for `docs/security/SECURITY_AUDIT_<date>.md`. The `scripts/semgrep-to-report-skeleton.py` script generates most of it automatically from scan JSON — the security auditor agent fills in the manual analysis fields.

## Why this format

A good security report must be:

1. **Actionable** — the developer can start fixing immediately without extra research
2. **Verifiable** — every finding has a specific test to confirm the fix works
3. **Prioritized** — the reader knows what to fix first and why
4. **Traceable** — every finding links back to how it was found (rule ID, scan tool, manual pass)
5. **Readable by non-devs** — CRITICAL/HIGH findings have business-impact translations
6. **Self-improving** — the audit captures patterns as custom rules for next time

A report that just lists "SQL injection in src/auth.ts" is not enough. A developer receiving that has to go figure out:
- What line is it on?
- What does the code look like right now?
- What specific input is tainted?
- How does the attacker actually exploit it?
- What's the fix?
- How do I verify the fix works?
- Is this pattern anywhere else in the codebase?
- How important is this compared to the other findings?

Every one of those questions must be answered IN the report, not left to the developer.

---

## Full Report Structure

```markdown
# Security Audit Report
**Date:** YYYY-MM-DD
**Project:** [name]
**Auditor:** AI Security Auditor
**Scope:** [what was covered — full repo / specific module / git diff]
**Baseline:** [commit hash of prior audit, if repeat audit — or "first audit"]

---

## Executive Summary

**Total findings: N**

| Severity | Count | Action Window |
|----------|------:|---------------|
| CRITICAL |     2 | Fix before deploy |
| HIGH     |     5 | Fix this sprint |
| MEDIUM   |     9 | Fix within 30 days |
| LOW      |     7 | Backlog |
| INFO     |     3 | Document only |

**Delta from last audit (YYYY-MM-DD):**
- Previous total: 47
- Current total: 26
- Change: −21 (14 fixed, 3 accepted-risk, 7 still open, 2 new)

**Most critical immediate action:** [name the #1 finding and the fastest path to mitigation]

**Time to exploit (most likely attacker):** [e.g., "< 1 hour for #1, unauthenticated internet attacker using curl"]

**Attacker profile needed:** [unauthenticated? insider? needs valid session? physical access?]

**Business impact if unfixed:** [translate tech findings to business risk — PII exposure, payment bypass, GDPR violation, data loss, RCE]

**Overall risk posture:** [one sentence: safe to deploy? safe to scale? safe to open to public traffic?]

---

## Finding Summary

| # | Severity | Title | File | Line | OWASP | Source | Status |
|---|----------|-------|------|-----:|-------|--------|--------|
| 1 | CRITICAL | SQL injection in login | `src/auth/login.ts` | 42 | A03 | Semgrep | Open |
| 2 | CRITICAL | Leaked AWS key in .env.example | `.env.example` | 15 | A02 | gitleaks | Open |
| 3 | HIGH | Missing auth on admin route | `src/routes/admin.ts` | 87 | A01 | Manual | Open |
| 4 | HIGH | Vulnerable dependency: `lodash@4.17.11` | `package.json` | - | A06 | osv-scanner | Open |

---

## Findings

[One section per finding — see per-finding format below]

---

## Cross-Module Pattern Analysis

Group findings by root cause. If the same pattern appears in 3+ places, that's an architectural issue, not individual bugs.

**Example:**
> "Missing input validation appears in 8 endpoints (#3, #7, #11, #14, #19, #22, #25, #27).
> This is a systemic gap, not an individual oversight. Recommendation: create a
> `validateInput()` middleware in `src/middleware/validation.ts` and apply to all
> routes that accept user data. Fixing these individually would take ~16h; the
> middleware approach is ~4h and prevents future instances."

---

## Action Plan

Ordered checklist prioritized by severity AND dependency (if fix #3 enables fix #1, do #3 first).

### Immediate (next 24h)
- [ ] **#1: Fix SQL injection** in `src/auth/login.ts:42` — parameterize the query (S, ~1h)
- [ ] **#2: Rotate leaked AWS key** — delete from git history, rotate, notify team (M, ~3h)

### This Sprint (7-14 days)
- [ ] **#3: Add auth middleware** to admin routes (S, ~2h)
- [ ] **#4: Upgrade lodash** to 4.17.21 (S, ~30min — test suite will catch any breakage)
- [ ] **#5–8: Input validation middleware** (M, ~4h — blocks fixes #5, #6, #7, #8)

### Within 30 Days
- [ ] **#9–17: Deprecated crypto and weak hashing** — audit usage, migrate to bcrypt (L)

### Backlog
- [ ] **#18–26: LOW findings** — schedule alongside regular feature work

---

## Confidence Scores (Agent Reasoning Loop)

| OWASP Category | Confidence (1-10) | Passes | Notes |
|----------------|------------------:|-------:|-------|
| A01 Broken Access Control | 8 | 2 | All routes checked, some indirect paths (via middleware composition) flagged as low confidence |
| A02 Cryptographic Failures | 9 | 1 | Complete — hashing, TLS config, secrets all verified |
| A03 Injection | 7 | 2 | SQL + command covered; XSS in template engine flagged for manual review |
| A04 Insecure Design | 6 | 3 | Surfaced to user: rate limiting not implemented, needs architectural decision |
| A05 Security Misconfiguration | 8 | 1 | Dockerfile, nginx, CORS all reviewed |
| A06 Vulnerable Components | 9 | 1 | osv-scanner + npm audit both clean after #4 fix |
| A07 Auth Failures | 8 | 1 | JWT validation, session handling verified |
| A08 Data Integrity | 7 | 2 | CI/CD pinning, package lock file present |
| A09 Logging & Monitoring | 5 | 3 | ⚠️ No central audit log — surfaced as finding #12 |
| A10 SSRF | 8 | 1 | Outbound HTTP calls traced, URL allowlist present |

---

## Scan Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| Semgrep JSON | `docs/security/semgrep-results.json` | Full finding detail for Semgrep |
| SARIF | `docs/security/semgrep-results.sarif` | Upload to GitHub Security tab |
| gitleaks | `docs/security/gitleaks.json` | Current-code secret scan |
| gitleaks history | `docs/security/gitleaks-history.json` | Git history secret scan |
| osv-scanner | `docs/security/osv.json` | Dependency CVEs |
| Scan log | `docs/security/semgrep-scan-<timestamp>.log` | Raw tool output |
| Triage file | `docs/security/TRIAGE.md` | Fixed / false-positive / accepted-risk tracking |
| Last audit | `docs/security/LAST_AUDIT.json` | Baseline for next audit |
```

---

## Per-Finding Format (MANDATORY — every field required)

```markdown
---

### [SEVERITY] Finding N: [Specific Title — not generic]

**File:** `src/path/to/file.ts`
**Line:** 42–46
**OWASP:** A03:2021 — Injection
**CWE:** CWE-89: SQL Injection
**Source:** Semgrep (`javascript.lang.security.audit.sql-injection.tainted-sql-string`)
**Severity rationale:** Directly exploitable with significant impact (auth bypass, data exfiltration)

**Vulnerable code (`src/path/to/file.ts:42-46`):**
```typescript
const email = req.body.email;
const query = `SELECT * FROM users WHERE email = '${email}'`;
const result = await db.execute(query);
return result.rows[0];
```
[MUST be verbatim from the file — use Read tool to copy, never paraphrase]

**Why this is exploitable:**
The `email` variable comes from `req.body.email` on line 40 and flows directly into a template-literal SQL query on line 43 with no sanitization. An attacker sending `POST /login` with body `{"email": "' OR '1'='1' --"}` will cause the query to become `SELECT * FROM users WHERE email = '' OR '1'='1' --'`, which returns the first user in the table — bypassing authentication entirely. With `email = "'; DROP TABLE users; --"`, the attacker can execute arbitrary SQL.
[MUST name: the specific tainted variable, the specific flow from source to sink, a concrete exploit payload, and the specific impact]

**Exploit prerequisites:**
- Unauthenticated (endpoint is the login handler)
- Internet-facing (production API at `api.example.com/login`)
- No rate limiting on the endpoint (verified — see finding #12)
- No WAF in front of the API

**Impact:**
- **Technical:** Authentication bypass → read/write access to any user account
- **Business:** Complete compromise of user data (~50k accounts per USER_PERSONAS.md).
  Under GDPR, this would be a reportable breach with potential fines up to 4% of
  annual revenue. Customer trust damage would likely exceed the direct cost.

**Remediation (unified diff):**
```diff
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -40,6 +40,6 @@
   const email = req.body.email;
-  const query = `SELECT * FROM users WHERE email = '${email}'`;
-  const result = await db.execute(query);
+  const result = await db.execute(
+    `SELECT * FROM users WHERE email = ?`,
+    [email]
+  );
   return result.rows[0];
```

**Verification steps:**
1. Apply the fix
2. Run unit test: `npm test -- auth/login.test.ts` (add a test case that sends `"' OR 1=1 --"` as email — should return 401)
3. Manual: `curl -X POST https://localhost:3000/login -d '{"email": "\\'' OR 1=1 --", "password": "test"}' -H 'Content-Type: application/json'` — must return 401, not 200
4. Check DB query logs: the parameterized query should show `email = '\\'' OR 1=1 --'` as a literal string, not executed as SQL

**Similar locations to check:**
Ran `grep -rn "db.execute(.*\\${" src/` and found 3 other locations using the same pattern:
- `src/orders/list.ts:87` — **VERIFIED** also vulnerable, filed as Finding #5
- `src/reports/generate.ts:234` — parameterized correctly, safe
- `src/admin/user-search.ts:51` — **NEEDS MANUAL REVIEW** — input comes from session, not request body, but session data is settable via another endpoint

**Fix effort:** S (~1 hour including test)

**Similar findings in this report:** #5 (same pattern, different file)

**References:**
- https://owasp.org/www-community/attacks/SQL_Injection
- https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- Semgrep rule: https://semgrep.dev/r?q=javascript.lang.security.audit.sql-injection.tainted-sql-string
```

---

## Enforcement Rules (agent MUST follow)

1. **Verbatim code blocks** — The "Vulnerable code" block MUST be the exact lines from the file, retrieved via the Read tool. Never paraphrase. Include the line range in the header (e.g., `file.ts:42-46`).

2. **Specific exploit language** — "Why this is exploitable" must name (a) the tainted variable, (b) the path from untrusted source to dangerous sink, (c) a concrete exploit payload, (d) the specific impact. "User input is not sanitized" is not acceptable.

3. **Unified diff remediation** — The fix must be a unified diff the developer can apply. Not a generic pattern. Fixing THIS code.

4. **Verification is mandatory** — Every finding needs a specific command or test the developer runs to confirm the fix works. "Add a test" is not enough — give the specific test case.

5. **Similar locations check** — For every finding, the agent MUST run at least one grep for similar patterns and report the results. This catches systemic issues.

6. **Business impact for CRITICAL/HIGH** — The "Impact" section must include a business-language translation for non-dev stakeholders. "SQL injection" is tech language; "complete compromise of customer data, reportable GDPR breach" is business language.

7. **Source traceability** — Every finding must cite its source (Semgrep rule ID, gitleaks rule, osv ID, or "Manual — OWASP A0X pass"). No orphan findings.

8. **UNVERIFIED marker** — If a field cannot be filled in concretely, the finding is marked **UNVERIFIED** in the summary table and excluded from the Action Plan. Vague findings don't ship — they get re-reviewed or dropped.

---

## Template vs Skeleton Workflow

The agent's workflow:

1. Run scans (Phase 2) → `docs/security/*.json`
2. Run `scripts/semgrep-to-report-skeleton.py` → generates report skeleton with mechanical fields pre-filled
3. For each finding in the skeleton, fill in the `⚠️ FILL IN` fields using manual analysis:
   - Use Read tool to get the vulnerable code verbatim (the skeleton has the Semgrep snippet, but re-read the file for context lines)
   - Trace the tainted variable from source to sink
   - Write the exploit payload and verify it makes sense
   - Compose the unified diff fix
   - Run the "similar locations" grep
   - Write the verification command
4. Write the Executive Summary (risk posture, time-to-exploit, business impact)
5. Write the Cross-Module Pattern Analysis
6. Write the Action Plan
7. Fill in the Confidence Scores table
8. Re-read the whole report as a skeptical fresh reader (Reader Simulation from Phase 6)
9. Run the Reasoning Loop — any category < 7 → re-pass or surface to user
10. Save `docs/security/LAST_AUDIT.json` with the commit hash for next audit's baseline

---

## Severity Assignment

| Level | Criteria | Action |
|-------|----------|--------|
| CRITICAL | Directly exploitable with high impact (RCE, auth bypass, data exfiltration, full compromise) | Fix before deploy |
| HIGH | Exploitable with meaningful impact (significant data exposure, privilege escalation) | Fix this sprint |
| MEDIUM | Should be fixed, not immediately exploitable (missing defense in depth, logging gap, config drift) | Fix within 30 days |
| LOW | Best-practice improvement (style, minor info disclosure) | Backlog |
| INFO | Observation, no immediate risk (documentation gap, educational) | Document only |

**When in doubt, bump severity up.** "Is this exploitable by an unauthenticated internet attacker?" If yes, it's at least HIGH. If the impact is data exposure or code execution, it's CRITICAL.

---

## What NOT to Include

- **No speculation** — if you can't write a concrete exploit, don't claim it's a vulnerability
- **No "might be"** — findings are either CONFIRMED or UNVERIFIED, never "possibly exploitable"
- **No generic recommendations** — "use secure coding practices" is not a fix, "use parameterized queries instead of string interpolation in `src/auth/login.ts:42`" is
- **No padding** — a 5-finding report with real content is better than a 50-finding report with boilerplate
- **No CVSS theater** — if you don't know the exact vector, don't make one up. Use the severity categories above.
