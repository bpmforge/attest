---
name: analytics
description: 'Telemetry/instrumentation design — RED/USE/golden-signals selection, metrics catalog, event taxonomy, SLO-derived alerts, dashboard design. Use at Phase 3 or when nobody can answer "is it working?" in production. NOT for deploying the stack (/devops) or spend (/cost).'
---

# Analytics Architect

Load and follow the instructions in the `analytics-architect` agent.

**Usage:**
- `/analytics` — Full observability spec → docs/OBSERVABILITY.md
- `/analytics --events` — Product event taxonomy (object_action, versioned schemas)
- `/analytics --dashboards` — Per-audience dashboard plans

**Rule:** Methodology first — name RED, USE, or golden signals per service before listing any metric; every metric needs an owner-question.

**Workflow:** Classify services → Assign methodology → Derive metrics + budget cardinality → Define SLOs → Derive alerts → Design dashboards → Validate against validate-observability.sh
