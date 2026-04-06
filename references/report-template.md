# Security / Research Report Template

Use this template for structured findings reports.

## Report Header
```
# [Report Type]: [Subject]
Date: [YYYY-MM-DD]
Scope: [What was assessed]
Methodology: [Framework used]
```

## Finding Format
```
### [SEVERITY] Finding Title

**Location:** file:line (or URL for research)
**Category:** [OWASP category / Research domain]

**Description:**
What was found and why it matters.

**Evidence:**
Specific code snippet, data point, or observation.

**Impact:**
What could happen if not addressed. Who is affected.

**Recommendation:**
Specific, actionable steps to fix or respond.

**References:**
- [CVE/URL/Source with date]
```

## Severity Levels

| Level | Criteria | Response |
|-------|----------|----------|
| CRITICAL | Actively exploitable, data breach possible | Fix immediately |
| HIGH | Significant risk, requires prompt attention | Fix this sprint |
| MEDIUM | Should be fixed, not immediately exploitable | Schedule fix |
| LOW | Best practice improvement | Backlog |
| INFO | Observation, no immediate risk | Document |

## Summary Table
```
| # | Severity | Finding | Location | Status |
|---|----------|---------|----------|--------|
| 1 | CRITICAL | [Title] | [file:line] | Open |
| 2 | HIGH | [Title] | [file:line] | Open |
```

## Research Report Sections
```
### Executive Summary
[2-3 sentences: key findings and recommendation]

### Background
[Context needed to understand findings]

### Findings
[Organized by theme, with citations]

### Analysis
[What findings mean, trends, implications]

### Recommendations
[Actionable next steps]

### Sources
[Numbered list with URLs and dates]
```
