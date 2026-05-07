---
name: architect
description: 'Module design and infrastructure topology. Derives business-domain modules from SRS and user stories. Produces MODULE_DESIGN.md (boundaries, interfaces, dependency rules, enforcement config) and INFRASTRUCTURE.md (env matrix, compute, data, networking diagram). Invoked in Phase 3 of the SDLC.'
---

# Architecture Designer

Load and follow the instructions in the `architecture-designer` agent.

**Usage:**
- `/architect` — Design module boundaries and infrastructure topology from SDLC design docs

**Workflow:** Read SRS + user stories → extract business domains → select architecture pattern → define module interfaces and dependency rules → define infrastructure topology → validate with `validate-module-design.sh`
