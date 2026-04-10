---
name: review
description: 'Multi-pass cross-expert review with per-pass confidence scoring — coordinates code-reviewer + security-auditor + performance-engineer in parallel, only delivers a verdict when all 3 score ≥ 7.'
---

# Multi-Pass Code Review

Performs a comprehensive code review by coordinating 3 expert agents in parallel:

1. **Code Quality** — `code-reviewer` agent: patterns, maintainability, naming, complexity, tech debt
2. **Security** — `security-auditor` agent: OWASP Top 10, input validation, auth, secrets
3. **Performance** — `performance-engineer` agent: bottlenecks, N+1 queries, caching, memory

**Usage:**
- `/review` — Full multi-pass review of recent changes (git diff)
- `/review src/api/` — Review a specific directory

---

## How It Runs (Parallel Delegation)

Use the `task` tool to spawn all 3 agents in parallel — do not run them sequentially.

```
task(agent="code-reviewer",       prompt="Review <target> for quality, patterns, tech debt. Write findings to docs/reviews/CODE_REVIEW_<date>.md", timeout=180)
task(agent="security-auditor",    prompt="Audit <target> for OWASP Top 10 issues, input validation, secrets. Write findings to docs/security/SECURITY_AUDIT_<date>.md", timeout=180)
task(agent="performance-engineer",prompt="Profile <target> for bottlenecks, N+1 queries, memory hotspots. Write findings to docs/perf/PERF_REPORT_<date>.md", timeout=180)
```

Wait for all 3 to return, then aggregate their findings into a single report.

---

## Pass Confidence Loop (Asymmetric — Easy to Fail, Harder to Pass)

Each of the 3 passes is confidence-scored independently:

- **Score < 5** on any pass = **automatic fail** — surface to user with the specific gap. Do NOT deliver the verdict.
- **Score 5-6** = revise that pass (re-run the agent with additional scope / different patterns, max 3 iterations)
- **Score ≥ 7** = pass accepted

For each pass, rate two dimensions 1-10:
- **Coverage** — Did the agent inspect every file/function its domain cares about?
- **Signal** — Are the findings specific and actionable, or vague?

**Verifier isolation:** Treat each agent's output as independent evidence. Do NOT let one agent's findings bias how you rate another. Each agent scored its own subtasks — you rate the PASS's coverage of your target, not the agent's internal confidence.

Only after all 3 passes score ≥ 7 on both Coverage and Signal, aggregate and deliver the final verdict.

---

## Output Format

### Severity Summary

```
Review Summary
  CRITICAL:  2
  HIGH:      5
  MEDIUM:    8
  LOW:       3
  Total:    18

Pass Confidence Scores (all must be ≥ 7 to deliver):
  Code Quality:  Coverage 8 / Signal 9  ✓
  Security:      Coverage 9 / Signal 8  ✓
  Performance:   Coverage 7 / Signal 7  ✓

Verdict: CHANGES REQUESTED (2 critical issues must be resolved)
```

### Findings

Group by severity (CRITICAL → HIGH → MEDIUM → LOW) with file:line references and specific fix recommendations. Include the source agent for each finding ("via code-reviewer", "via security-auditor", "via performance-engineer") so the user can dig into the full per-agent report.

---

## Verdict Rules

- **REVIEW INCOMPLETE** — any pass scored < 7 on Coverage or Signal (surface the gap, do NOT deliver a verdict)
- **CHANGES REQUESTED** — any CRITICAL, or HIGH > 3
- **APPROVED WITH SUGGESTIONS** — only MEDIUM/LOW findings, all passes ≥ 7
- **APPROVED** — no findings, all passes ≥ 7

---

## Write Findings to Files

Each sub-agent writes its own report to `docs/{reviews,security,perf}/...` as instructed.
This skill aggregates their findings into `docs/reviews/MULTIPASS_REVIEW_<date>.md` with a summary table and cross-references to each sub-report.

**Local LLMs have no memory between sessions** — the file outputs are the durable artifacts. The conversation summary is only for the immediate turn.
