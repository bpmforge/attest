---
name: review-code
description: 'Code quality audit — maintainability, patterns, tech debt, naming, error handling. Use after implementing any feature. NOT for security vulns (/security) or phase docs (/sdlc). Proactive: suggest after every feature implementation.'
---

# Code Quality Review

Load and follow the instructions in the `code-reviewer` agent.

**Usage:**
- `/review-code` — Full codebase quality review
- `/review-code src/auth/` — Review specific directory
- `/review-code --tech-debt` — Tech debt assessment

**Workflow:** Understand codebase patterns → Review target code → Assess complexity, consistency, naming, error handling → Report with severity levels

**Distinct from:** `/security` (vulnerabilities) and `/sdlc` (phase docs)
