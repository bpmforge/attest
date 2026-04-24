# Validators

Shell scripts that enforce SDLC deliverable completeness without orchestrator judgment. Each validator:

- Takes an optional `<project-root>` argument (defaults to `pwd`)
- Emits a gap list to stderr (human-readable)
- Emits a JSON envelope to stdout (machine-readable)
- Exits `0` if clean, `1` if gaps found, `2` if the validator itself errored

## Contract

```bash
./validate-<name>.sh [project-root]
```

Stdout JSON schema:
```json
{
  "validator": "validate-architecture",
  "gaps": 2,
  "exit": 1,
  "items": [
    {"category": "missing-diagram", "detail": "C3 component diagram not found"},
    {"category": "placeholder", "detail": "ARCHITECTURE.md contains PLACEHOLDER markers"}
  ]
}
```

## Validators

| Script | Checks |
|--------|--------|
| `validate-architecture.sh` | 6 diagram types present, Mermaid syntax valid, HLA overview, no placeholders |
| `validate-owasp.sh` | All 10 OWASP categories present, confidence >= 7, status DONE, attack-chains.md present |
| `validate-api-coverage.sh` | Every route in source has a row in API_DESIGN.md AND openapi.yaml |
| `validate-erd-coverage.sh` | Every table/model has an ERD entry; erDiagram mermaid block present |
| `validate-sequence-coverage.sh` | Every P0 use case has a sequence diagram |
| `validate-inventory.sh` | Every row in INVENTORY.md has a corresponding artifact |
| `validate-scope.sh` | Git writes stay inside assigned directory (post-HANDOFF gate) |
| `validate-completion-manifest.sh` | HANDOFF manifest has required sections + completion phrase |
| `validate-phase-gate.sh` | Orchestrator that runs all validators for a given phase |

## Orchestrator usage

```bash
# Phase gates
./validate-phase-gate.sh phase-3        # Design phase
./validate-phase-gate.sh onboard-deep   # Deep onboard mode
./validate-phase-gate.sh security-deep  # Deep security mode
./validate-phase-gate.sh phase-5        # Release gate
```

## Platform support

- macOS (bash 3.2.57+)
- Linux (bash 4+)
- Windows via WSL2

## Known limits

- Route discovery is best-effort across Express/Fastify/Next.js/FastAPI/Go. Custom frameworks will be missed.
- Table discovery covers Prisma, TypeORM, Sequelize, Knex, SQLAlchemy, Django, raw SQL. GORM structs detected via `gorm:` tag grep (imperfect).
- `validate-sequence-coverage.sh` looks for UC-NN identifiers above/in sequenceDiagram mermaid blocks. False negatives possible if the convention differs.

## Adding a validator

1. Create `validate-<name>.sh` in this directory
2. Source `_lib.sh` at the top
3. Call `validator_init "<name>"` first
4. Call `gap "<category>" "<detail>"` for every gap
5. Call `validator_exit` at the end
6. `chmod +x` the script
7. If it belongs to a phase gate, add it to the case statement in `validate-phase-gate.sh`

## Bash 3.2 gotchas

macOS ships with bash 3.2.57, which has quirks:

- Triple-backticks inside `[[ ... ]]` comparisons or double-quoted strings mis-parse. Workaround: bind the literal to a variable via `printf '%s' '...'` first, then compare via `"$var"`.
- UTF-8 box-drawing characters and em-dashes in double-quoted strings can cause `unexpected EOF` parse errors. Workaround: use ASCII in code; unicode in output is fine via `printf` format strings.
- Keep scripts `shellcheck` clean.
