---
name: onboard-verify
description: 'Ralph Wiggum deep-onboard: Step D3 — run all onboard validators and report uncovered inventory rows. Thin wrapper over ~/.config/opencode/scripts/validators/validate-phase-gate.sh onboard-deep.'
---

# Onboard Verify

Runs every onboard-relevant validator and reports which inventory rows are uncovered. Does NOT produce new artifacts -- verification only.

## Usage

- `/onboard-verify` — verify the current project
- `/onboard-verify <path>` — verify a specific project root

## What it runs

```bash
~/.config/opencode/scripts/validators/validate-phase-gate.sh onboard-deep
```

Which chains:

- `validate-inventory.sh` — every INVENTORY row has an artifact
- `validate-architecture.sh` — 6 diagram types, Mermaid valid, HLA overview
- `validate-erd-coverage.sh` — tables in code appear in ERD
- `validate-sequence-coverage.sh` — P0 flows have sequence diagrams

## Output

A gap table:

```
GAP REPORT -- onboard-deep

| ID   | Category | Description          | Missing artifact                                 |
|------|----------|----------------------|--------------------------------------------------|
| R-05 | ROUTE    | DELETE /api/orders/* | not in API_DESIGN.md                             |
| T-03 | TABLE    | audit_log            | not in any ERD source                            |
| F-02 | FLOW     | UC-02 user signup    | no sequence diagram mentioning UC-02             |

3 gap(s). Run /onboard-gap-fill to remediate.
```

If no gaps: loop is closed.
