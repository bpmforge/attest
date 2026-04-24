---
name: onboard-inventory
description: 'Ralph Wiggum deep-onboard: Step D1 — enumerate every unit in the codebase (ROUTE / TABLE / SERVICE / FLOW / ENTRY) into docs/onboard/INVENTORY.md. Triggered by /sdlc onboard --deep or invoked directly for inventory refresh.'
---

# Onboard Inventory

Produces `docs/onboard/INVENTORY.md` — the authoritative list of units that must be covered by the deep-onboard flow.

## Usage

- `/onboard-inventory` — enumerate from the current working directory
- `/onboard-inventory <path>` — enumerate from a specific project root

## What it does

1. Load `agents/shared/BOUNDED_TASK_CONTRACT.md` and `agents/shared/RALPH_WIGGUM_LOOP.md`
2. HANDOFF to `researcher` agent with the inventory-producer template (see `agents/sdlc-onboard-mode.md` Step D1)
3. Produce `docs/onboard/INVENTORY.md` with one row per unit

## Inventory schema

```markdown
| ID   | Category | Description         | Artifact            | Status   |
|------|----------|---------------------|---------------------|----------|
| R-01 | ROUTE    | POST /api/login     | /api/login          | PENDING  |
| T-01 | TABLE    | users               | users               | PENDING  |
| S-01 | SERVICE  | auth-service        | src/auth/           | PENDING  |
| F-01 | FLOW     | UC-01 user login    | auth login sequence | PENDING  |
| E-01 | ENTRY    | HTTP server startup | server/index.ts     | PENDING  |
```

## When done

Run `./scripts/validators/validate-inventory.sh` to confirm the inventory itself is well-formed (parseable table, valid categories).
