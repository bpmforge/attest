# OWASP Top 10 Quick-Reference Checklist (2021)

Use this checklist during security audits. Check each item systematically.

## A01: Broken Access Control
- [ ] All endpoints require authentication
- [ ] Authorization checks on every resource access
- [ ] No IDOR (Insecure Direct Object Reference) — users can't access others' data
- [ ] Admin functions properly gated
- [ ] CORS policy restrictive (not `*`)
- [ ] Directory listing disabled
- [ ] Rate limiting on sensitive endpoints

## A02: Cryptographic Failures
- [ ] No hardcoded secrets in source code
- [ ] Data encrypted in transit (TLS 1.2+)
- [ ] Sensitive data encrypted at rest
- [ ] Password hashing: bcrypt/argon2 (not MD5/SHA1)
- [ ] No sensitive data in URLs or logs
- [ ] Proper key management and rotation

## A03: Injection
- [ ] All SQL queries parameterized
- [ ] No user input in shell commands (command injection)
- [ ] HTML output escaped (XSS prevention)
- [ ] Path traversal protection on file operations
- [ ] LDAP/XML/template injection vectors checked

## A04: Insecure Design
- [ ] Rate limiting on login/registration
- [ ] Account lockout after failed attempts
- [ ] Business logic tamper-resistant
- [ ] Threat model exists for critical flows
- [ ] Security requirements in design docs

## A05: Security Misconfiguration
- [ ] Default credentials changed
- [ ] Unnecessary features/ports disabled
- [ ] Error messages don't expose internals
- [ ] Security headers set (CSP, X-Frame-Options, etc.)
- [ ] Debug mode disabled in production
- [ ] Permissions follow least privilege

## A06: Vulnerable and Outdated Components
- [ ] Dependencies checked for known CVEs
- [ ] Versions pinned in lock files
- [ ] Automated dependency scanning in CI
- [ ] Unused dependencies removed
- [ ] Components from trusted sources only

## A07: Identification and Authentication Failures
- [ ] Session management secure (httpOnly, secure, sameSite)
- [ ] JWTs validated (algorithm, expiration, signature)
- [ ] Password complexity requirements enforced
- [ ] MFA available for sensitive operations
- [ ] Session invalidation on logout/password change

## A08: Software and Data Integrity Failures
- [ ] CI/CD pipeline secured against tampering
- [ ] Dependencies verified (checksums, signatures)
- [ ] Auto-update mechanisms verified
- [ ] Serialization/deserialization validated

## A09: Security Logging and Monitoring Failures
- [ ] Security events logged (login, permission denial, errors)
- [ ] Logs protected from tampering
- [ ] Alerting on suspicious activity
- [ ] Log format structured (JSON) for analysis
- [ ] No sensitive data in logs

## A10: Server-Side Request Forgery (SSRF)
- [ ] User input cannot control outbound request URLs
- [ ] Internal services not accessible via SSRF
- [ ] URL allowlisting for external requests
- [ ] DNS rebinding protection
