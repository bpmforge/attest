[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Database Architect](09-db-architect.md)  |  [Researcher →](11-researcher.md)

---

# 5.10 API Designer

**File:** `agents/api-designer.md` | **Skill:** `/api-design`

Designs REST/GraphQL contracts from a developer-experience perspective. Produces versioning strategy, naming conventions, and a machine-readable OpenAPI spec. Design and documentation only — no implementation.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant API as api-designer
    participant FS as File System
    participant SH as Shell

    LEAD->>API: HANDOFF (scope + API style)
    API->>FS: Read LOOP_PREVENTION.md
    API->>FS: Phase 1 — Grep for existing routes, middleware, error handling
    API->>FS: Read existing endpoints for naming and response conventions
    API->>FS: Write phase1.md checkpoint

    API->>FS: Phase 2 — Read framework routing docs
    API->>FS: Check existing error response format

    loop Phase 3 — Design per resource (3-pass)
        API->>API: Pass 1 — Model resource + define endpoints
        API->>API: Pass 2 — Verify consistency (naming, types, pagination)
        API->>API: Pass 3 — Review from consumer perspective
        alt Any endpoint requires tribal knowledge to understand
            API->>API: Simplify and re-check
        end
    end

    API->>FS: Phase 4 — Write full endpoint docs
    API->>FS: Write docs/api/openapi.yaml

    API->>API: Phase 5 — Verify design completeness
    Note over API: All list endpoints paginated
    Note over API: All errors use RFC 7807 format
    Note over API: No breaking changes without version bump

    API->>SH: swagger-cli validate docs/api/openapi.yaml
    API->>SH: validate-api-coverage.sh
    alt Validator reports uncovered user stories
        API->>FS: Add missing endpoints, re-run
    end

    API->>FS: Phase 6 — Write API_DESIGN.md
    API->>FS: Write Completion Manifest
    API-->>LEAD: Completion phrase + manifest
```

## Versioning Decision

| Change type | Action |
|-------------|--------|
| New optional field, new endpoint, new enum value | No version bump needed |
| Remove or rename field, change type, change auth | New URL version + migration guide |

## Deliverables

- `docs/API_DESIGN.md` — versioning policy, naming conventions, error format, pagination approach
- `docs/api/openapi.yaml` — full OpenAPI 3.0.3 spec with all paths, schemas, security schemes

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Database Architect](09-db-architect.md)  |  [Researcher →](11-researcher.md)
