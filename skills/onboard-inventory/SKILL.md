---
name: onboard-inventory
description: 'Ralph Wiggum deep-onboard: Step D1 — enumerate every unit in the codebase (ROUTE / TABLE / SERVICE / FLOW / ENTRY) into docs/onboard/INVENTORY.md. Triggered by /sdlc onboard --deep or invoked directly for inventory refresh.'
---

# Onboard Inventory

Produces `docs/onboard/INVENTORY.md` — the authoritative list of units that must be covered by the deep-onboard flow.

## Usage

- `/onboard-inventory` — enumerate from the current working directory
- `/onboard-inventory <path>` — enumerate from a specific project root
- `/onboard-inventory --full` — re-inventory everything even when `INVENTORY.md` exists

## What it does

1. Load `agents/shared/BOUNDED_TASK_CONTRACT.md` and `agents/shared/RALPH_WIGGUM_LOOP.md`
2. HANDOFF to `researcher` agent with the inventory-producer template (see `agents/sdlc-onboard-mode.md` Step D1)
3. Produce `docs/onboard/INVENTORY.md` with one row per unit

## Incremental refresh

If `docs/onboard/INVENTORY.md` exists and `--full` is not set, do not re-walk the tree: follow "Incremental Inventory" in `agents/sdlc-onboard-mode.md`. Re-inventory only directories touched since the header's `Inventory-SHA:` (`git diff --name-only <sha>..HEAD` grouped by top-level directory), keep existing IDs, and mark rows in untouched directories `carried-forward`. Always write `Inventory-SHA: <full HEAD sha>` under the title.

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

Header (under the title): `Inventory-SHA: <40-char sha>`. Status is `PENDING`, `DONE`, or `carried-forward` (row untouched since the recorded sha).

## When done

Run `~/.config/opencode/scripts/validators/validate-inventory.sh` to confirm the inventory itself is well-formed (parseable table, valid categories).
