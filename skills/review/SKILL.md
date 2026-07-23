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

## How It Runs (Parallel HANDOFFs)

> **`task()` does not work in OpenCode.** Emit all 3 HANDOFF blocks in one message. The user opens 3 concurrent sessions. Wait for all 3 to return before aggregating.

**Step 1 — Write a HANDOFF manifest** so you can track which are pending:
```
write(filePath="docs/work/HANDOFF_MANIFEST_review_<date>.md", content="
| # | Agent | Output file | Status |
|---|-------|-------------|--------|
| 1 | code-reviewer | docs/reviews/CODE_REVIEW_<date>.md | PENDING |
| 2 | security-auditor | docs/security/SECURITY_AUDIT_<date>.md | PENDING |
| 3 | performance-engineer | docs/perf/PERF_REPORT_<date>.md | PENDING |
")
```

**Step 2 — Emit all 3 HANDOFFs in one message.**

Write each block below to its own `docs/work/HANDOFF_<agent>.md`, then print this pointer. Nothing
addressed to the user goes *inside* the `════` delimiters — the specialist reads that body as its
task and will relay any `USER:` line straight back at you.

```
── 3 HANDOFFS READY ──────────────────────────
Open each agent and paste its one line:

  /review-code   SDLC-TASK for code-reviewer: read docs/work/HANDOFF_code-reviewer.md and execute it.
  /security      SDLC-TASK for security-auditor: read docs/work/HANDOFF_security-auditor.md and execute it.
  /perf          SDLC-TASK for performance-engineer: read docs/work/HANDOFF_performance-engineer.md and execute it.

Come back with all 3 report paths and I'll aggregate.
──────────────────────────────────────────────
```

Each paste line **must start with `SDLC-TASK for`** — that prefix is the trigger the specialist
matches to enter Bounded Task Mode. A bare "open /review-code, it reads …" pointer is not reliable:
smaller models fall through to their default mode and hand the task back instead of running it.

```
════════════════════════════════════════════════════════════
HANDOFF #1 → code-reviewer  |  run by: code-reviewer via /review-code
════════════════════════════════════════════════════════════
SDLC-TASK for code-reviewer:

ROLE: You are a senior code reviewer focused on maintainability and correctness.

CONTEXT:
- agents/shared/BOUNDED_TASK_CONTRACT.md
- <target files or git diff>

YOUR TASK: Review <target> for code quality issues: complexity, DRY violations, error handling gaps, type invariants, naming, tech debt. Rate coverage and signal 1-10. Write findings only — do not fix.

PRODUCE:
- docs/reviews/CODE_REVIEW_<date>.md — findings table (severity, file:line, description, recommendation)

Print exactly: "code-reviewer done -- <N> findings: <critical> critical, <high> high"
Then stop.
════════════════════════════════════════════════════════════
END HANDOFF #1
════════════════════════════════════════════════════════════

════════════════════════════════════════════════════════════
HANDOFF #2 → security-auditor  |  run by: security-auditor via /security
════════════════════════════════════════════════════════════
SDLC-TASK for security-auditor:

ROLE: You are a senior security engineer performing a targeted code audit.

CONTEXT:
- agents/shared/BOUNDED_TASK_CONTRACT.md
- <target files>

YOUR TASK: Audit <target> for OWASP Top 10 issues — injection, broken auth, sensitive data exposure, input validation gaps, hardcoded secrets. Rate coverage and signal 1-10. Write findings only — do not fix.

PRODUCE:
- docs/security/SECURITY_AUDIT_<date>.md — findings table (severity, OWASP category, file:line, description)

Print exactly: "security-auditor done -- <N> findings: <critical> critical, <high> high"
Then stop.
════════════════════════════════════════════════════════════
END HANDOFF #2
════════════════════════════════════════════════════════════

════════════════════════════════════════════════════════════
HANDOFF #3 → performance-engineer  |  run by: performance-engineer via /perf
════════════════════════════════════════════════════════════
SDLC-TASK for performance-engineer:

ROLE: You are a senior performance engineer. Measure first, optimize second.

CONTEXT:
- agents/shared/BOUNDED_TASK_CONTRACT.md
- <target files>

YOUR TASK: Profile <target> for performance issues: N+1 queries, missing indexes, blocking I/O in hot paths, memory leaks, inefficient loops, missing caching. Write findings only — do not fix.

PRODUCE:
- docs/perf/PERF_REPORT_<date>.md — findings table (severity, file:line, issue, expected impact)

Print exactly: "performance-engineer done -- <N> findings: <critical> critical, <high> high"
Then stop.
════════════════════════════════════════════════════════════
END HANDOFF #3
════════════════════════════════════════════════════════════
```

**Step 3 — When all 3 return:** Read the HANDOFF manifest, mark all DONE, then read all 3 output files and aggregate.

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
