---
name: review
description: 'Multi-pass code review with severity levels'
---

# Multi-Pass Code Review

Performs a comprehensive code review by coordinating multiple expert perspectives:

1. **Code Quality** — Load `code-reviewer` agent methodology: patterns, maintainability, naming, complexity
2. **Security** — Load `security-auditor` agent methodology: OWASP Top 10, input validation, auth
3. **Performance** — Load `performance-engineer` agent methodology: bottlenecks, N+1 queries, caching

**Output format:** Findings grouped by severity (CRITICAL → INFO), with file:line references and specific fix recommendations.

**Usage:**
- `/review` — Full multi-pass review of recent changes
- `/review src/api/` — Review specific directory
