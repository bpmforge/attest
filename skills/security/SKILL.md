---
name: security
description: 'Security expert — OWASP, threat modeling, vulnerability assessment'
---

# Security Audit

Load and follow the instructions in the `security-auditor` agent.

Performs a professional security assessment following OWASP, NIST, and industry-standard frameworks.

**Usage:**
- `/security` — Full OWASP Top 10 audit of the codebase
- `/security --threat-model` — STRIDE threat analysis
- `/security --owasp` — Focused OWASP vulnerability scan
- `/security --deps` — Dependency vulnerability audit

**Workflow:** Understand → Research → Plan → Execute → Verify → Report

**Output:** Findings report with severity (CRITICAL/HIGH/MEDIUM/LOW/INFO), file:line locations, evidence, and remediation steps.

Reference documents available: `owasp-checklist.md`, `severity-matrix.md`, `report-template.md`
