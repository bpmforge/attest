---
name: migration-planner
description: 'Database migration planner — compares two schema states (files or git refs), produces ordered migration steps with rollback plan per step. Proactive: before any schema change that touches existing tables.'
---

# Migration Planner

Load and follow the instructions in the `migration-planner` agent.

**Usage:**
- `/migration-planner` — Plan an ordered, reversible migration between two schema states

**Workflow:** Read "from" schema + target schema → sequence ordered steps → attach explicit rollback per step → flag destructive operations (DROP/RENAME/type change) for expand-contract → verify reversibility
