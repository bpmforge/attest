[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Test Engineer](08-test-engineer.md)  |  [API Designer →](10-api-designer.md)

---

# 5.9 Database Architect

**File:** `agents/db-architect.md` | **Skill:** `/dba`

Designs schemas, writes migrations, optimizes queries, and models ORM entities. Always begins by identifying access patterns and scale considerations before writing any SQL.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant DBA as db-architect
    participant FS as File System
    participant SH as Shell

    LEAD->>DBA: HANDOFF (scope + DB type)
    DBA->>FS: Read LOOP_PREVENTION.md
    DBA->>FS: Phase 1 — Glob schema, migration, and ORM files
    DBA->>FS: Read existing schema and detect DB type from package.json
    DBA->>DBA: Identify access patterns (read-heavy vs write-heavy)
    DBA->>FS: Write phase1.md checkpoint

    DBA->>FS: Phase 2 — Read ORM docs and naming conventions
    DBA->>SH: EXPLAIN QUERY PLAN on any slow queries

    loop Phase 3-4 — Design per table (3-pass)
        DBA->>DBA: Pass 1 — Design from requirements
        DBA->>DBA: Pass 2 — Verify access patterns covered by indexes
        DBA->>DBA: Pass 3 — Check cascade behavior and N+1 risk
        alt Any access pattern requires full table scan
            DBA->>DBA: Fix schema and re-check
        end
    end

    DBA->>FS: Write up.sql migration
    DBA->>FS: Write down.sql migration (must reverse up.sql exactly)
    DBA->>FS: Write ORM model files (one per table)
    DBA->>FS: Write CRUD operation implementations

    DBA->>DBA: Phase 5 — Verify FK references, index alignment
    DBA->>SH: validate-erd-coverage.sh
    alt Validator reports gaps
        DBA->>FS: Fix and re-run until exit 0
    end

    DBA->>FS: Phase 6 — Write DATABASE.md (ERD + index strategy)
    DBA->>FS: Write Completion Manifest
    DBA-->>LEAD: Completion phrase + manifest
```

## Schema Design Rules

- 3NF minimum — denormalize only with explicit performance justification
- Every migration has a paired `down.sql` that fully reverses `up.sql`
- Indexes derived from access patterns, not guessed
- N+1 patterns flagged at design time via ORM model review

## Deliverables

- `up.sql` + `down.sql` migration files (sequentially numbered)
- ORM model files (one per table)
- CRUD operation implementations
- `docs/DATABASE.md` — Mermaid ERD, query patterns, index strategy, migration convention, security notes

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Test Engineer](08-test-engineer.md)  |  [API Designer →](10-api-designer.md)
