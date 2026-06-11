---
name: cost
description: 'Cloud + LLM spend audit, right-sizing, unit economics. Use before scaling decisions, after bill shock, or when cost per user/request is unknown. RULE: every recommendation quantified in $/month — never "cheaper". NOT for performance — use /perf.'
---

# Cost Engineer

Load and follow the instructions in the `cost-engineer` agent.

**Usage:**
- `/cost` — Full spend audit → COST_AUDIT_<date>.md
- `/cost --rightsize` — Compute/instance right-sizing from observed utilization
- `/cost --unit` — Unit-economics model (cost per user/request/job)

**Rule:** Measure current spend before recommending anything — bill export or priced inventory, never guesses.

**Workflow:** Measure spend → Walk cost checklist → Right-size from p95 → Build unit economics → Rank actions by $/month → Document
