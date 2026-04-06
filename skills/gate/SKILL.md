---
name: gate
description: 'Manage SDLC phase gates and approvals'
---

# SDLC Gate Management

Check or manage phase gate requirements for the current SDLC project.

**Usage:**
- `/gate` or `/gate check` — Check if current phase exit criteria are met
- `/gate approve` — Mark current phase as approved and advance
- `/gate bypass` — Emergency bypass with documented reason

**How it works:**
1. Reads the `docs/sdlc/` directory structure
2. Checks each phase's required deliverables exist and have content (>50 lines)
3. Reports PASS/FAIL for each gate criterion
4. Recommends next actions for any failures
