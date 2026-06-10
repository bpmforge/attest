---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

<!--
OWASP_TRACKER template — used by /security audit modes.
Copy this content into docs/security/OWASP_TRACKER.md at the start of every audit pass.
Referenced from: agents/security-auditor.md ('Initialize Tracker' step).
-->

# OWASP Audit Tracker
Project: <project-name>
Started: <timestamp>
Auditor: security-auditor
Codebase root: <PROJECT_ROOT>
Total files scanned (Phase 1): <N>
Primary language: <lang>
Framework: <framework>

## Semgrep Triage Summary
<!-- Filled in after Step 6 triage -->
Total Semgrep findings: ⏳
  REAL:           ⏳
  FALSE POSITIVE: ⏳
  UNVERIFIED:     ⏳

## OWASP Pass Progress

| # | Category                        | Status      | Passes | Confidence | Findings |
|---|---------------------------------|-------------|--------|------------|----------|
| A01 | Broken Access Control        | ⏳ PENDING  | 0      | —          | —        |
| A02 | Cryptographic Failures       | ⏳ PENDING  | 0      | —          | —        |
| A03 | Injection                    | ⏳ PENDING  | 0      | —          | —        |
| A04 | Insecure Design              | ⏳ PENDING  | 0      | —          | —        |
| A05 | Security Misconfiguration    | ⏳ PENDING  | 0      | —          | —        |
| A06 | Vulnerable Components        | ⏳ PENDING  | 0      | —          | —        |
| A07 | Authentication Failures      | ⏳ PENDING  | 0      | —          | —        |
| A08 | Data Integrity Failures      | ⏳ PENDING  | 0      | —          | —        |
| A09 | Logging & Monitoring         | ⏳ PENDING  | 0      | —          | —        |
| A10 | SSRF                         | ⏳ PENDING  | 0      | —          | —        |

Gate: ALL categories must reach ✅ DONE (confidence ≥ 7) before the report is written.
Any category at ⚠️ BLOCKED (< 5 after 3 passes) stops the audit — surface to user.

## Attack Chain Analysis
<!-- Filled in after Phase 5b -->
Chains found: ⏳
  CRITICAL: ⏳
  HIGH: ⏳
  Systemic enablers: ⏳
  See: docs/security/attack-chains.md

---

## A01: Broken Access Control
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Does every HTTP route have an auth check applied BEFORE the handler executes?
- [ ] Do any queries fetch a resource by ID without filtering by owner (IDOR)?
- [ ] Are admin/privileged functions gated by role checks, not just hidden in the UI?
- [ ] Can a lower-privilege user call higher-privilege endpoints directly?
- [ ] Are access control checks duplicated at the API layer, not just the UI?

### Grep runs
<!-- One row per grep executed — fill in as you go -->
| Pattern | Matches | Files read | Notes |
|---------|---------|------------|-------|

### Files read
<!-- List every file you opened during this pass -->

### Semgrep findings for A01
<!-- From triage-working.md, REAL findings mapped to A01 -->

### Manual findings
<!-- Findings discovered by grep/read that Semgrep missed -->

### Pass log
<!-- One entry per pass attempt -->

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A02: Cryptographic Failures
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Are passwords/secrets stored with strong hashes (bcrypt/argon2), not MD5/SHA1?
- [ ] Is sensitive data encrypted at rest?
- [ ] Is TLS enforced, no fallback to HTTP?
- [ ] Are crypto keys in env vars, not hardcoded?
- [ ] Are there any custom crypto implementations?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### Semgrep findings for A02

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A03: Injection
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Are ALL database queries parameterized — no string concatenation into SQL?
- [ ] Is user input ever passed to shell/subprocess commands?
- [ ] Is user input ever rendered into HTML without escaping?
- [ ] Can user input traverse file paths to access arbitrary files?
- [ ] Is user input ever used in template engines without auto-escaping?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### Semgrep findings for A03

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A04: Insecure Design
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Are rate limits applied to auth endpoints (login, password reset, OTP)?
- [ ] Is there brute-force protection / account lockout?
- [ ] Are business logic flows tamper-resistant (can a user skip steps)?
- [ ] Is there server-side validation for all operations, not just client-side?
- [ ] Are critical operations atomic — no race condition / TOCTOU risk?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### Semgrep findings for A04

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A05: Security Misconfiguration
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Are CORS policies restrictive — not wildcard or open to untrusted origins?
- [ ] Are security headers present (HSTS, CSP, X-Frame-Options)?
- [ ] Do error responses leak stack traces / internal paths in production?
- [ ] Are debug modes disabled in production?
- [ ] Are default credentials / keys changed from vendor defaults?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### Semgrep findings for A05

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A06: Vulnerable Components
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Are there known CVEs in current dependency versions?
- [ ] Are any dependencies severely outdated (major version behind)?
- [ ] Are dependencies pinned to exact versions?
- [ ] Are there unmaintained dependencies (no release > 18 months)?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### CVEs found (from osv-scanner / npm audit / pip-audit)

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A07: Authentication Failures
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Are passwords hashed with bcrypt/argon2/scrypt — not MD5/SHA1/base64?
- [ ] Are JWTs validated for algorithm (rejects alg:none), signature, and expiry?
- [ ] Are session tokens httpOnly, Secure, SameSite=Strict/Lax?
- [ ] Are there protections against credential stuffing on login?
- [ ] Is the password reset flow secure (time-limited, single-use, no email enumeration)?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### Semgrep findings for A07

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A08: Data Integrity Failures
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Are CI/CD configs protected against unauthorized modification?
- [ ] Are packages installed from verified sources with integrity checks?
- [ ] Is deserialization of untrusted data guarded?
- [ ] Are lockfiles committed to the repo?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### Semgrep findings for A08

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A09: Logging & Monitoring Failures
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Are authentication events logged (success, failure, logout)?
- [ ] Are authorization failures logged?
- [ ] Are logs sanitized against log injection (CRLF, ANSI)?
- [ ] Is PII/sensitive data excluded from logs?
- [ ] Are there monitoring/alerting hooks for suspicious activity?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### Semgrep findings for A09

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## A10: SSRF
Status: ⏳ PENDING
Pass count: 0
Current confidence: —

### Mandatory questions
- [ ] Does the app make outbound HTTP requests to URLs from user input?
- [ ] Are there allowlists restricting which hosts/IPs the app can reach?
- [ ] Can SSRF reach internal services (metadata APIs, admin panels)?
- [ ] Are redirects followed without validation?
- [ ] Are there webhook or URL-preview features?

### Grep runs
| Pattern | Matches | Files read | Notes |

### Files read

### Semgrep findings for A10

### Manual findings

### Pass log

### Confidence score: —
### Verdict: ⏳ PENDING

---

## Final Gate

All categories ≥ 7 confidence: ⏳ NOT YET
Report may be written: ⏳ NOT YET
