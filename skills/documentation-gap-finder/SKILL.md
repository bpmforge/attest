---
name: documentation-gap-finder
description: 'Documentation gap finder — scans source exports against existing docs, lists undocumented public functions/classes/API endpoints, stale doc references, and coverage percentage. Proactive: before a public release or when onboarding new contributors.'
---

# Documentation Gap Finder

Load and follow the instructions in the `documentation-gap-finder` agent.

**Usage:**
- `/documentation-gap-finder` — Audit public surface for undocumented, stale, or missing docs

**Workflow:** Enumerate public surface (exported functions/classes, HTTP routes, CLI commands) → cross-check against docs/ + README → flag undocumented, stale, and contradicted references → report coverage % and a prioritized "document these first" list (report gaps, do not write the docs)
