[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Performance Engineer](06-performance-engineer.md)  |  [Test Engineer →](08-test-engineer.md)

---

# 5.7 Architecture Designer

**File:** `agents/architecture-designer.md` | **Skill:** `/architect`

Produces the structural blueprint — module design and infrastructure topology — from SDLC documents. Does not write application code, schemas, or API contracts; defines the structure that other specialists fill in.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant ARCH as architecture-designer
    participant FS as File System
    participant SH as Shell

    LEAD->>ARCH: HANDOFF (SRS + USER_STORIES + TECH_STACK + DESIGN_CONTEXT)
    ARCH->>FS: Read BOUNDED_TASK_CONTRACT.md
    ARCH->>FS: Read all context files listed in HANDOFF

    ARCH->>ARCH: Extract bounded contexts from SRS and USER_STORIES
    ARCH->>ARCH: Map capabilities to modules (domain-named, not layer-named)
    ARCH->>ARCH: Choose architecture pattern (cite DESIGN_CONTEXT signals)
    ARCH->>ARCH: Define public interfaces in the project language

    ARCH->>FS: Write MODULE_DESIGN.md
    Note over ARCH: Includes: pattern ADR, module inventory,
    Note over ARCH: interfaces, plugin points, allowed imports,
    Note over ARCH: feature addition recipe, linter config

    ARCH->>ARCH: Derive infrastructure from DESIGN_CONTEXT deployment env
    ARCH->>FS: Write INFRASTRUCTURE.md
    Note over ARCH: Includes: environment matrix, compute, data,
    Note over ARCH: networking Mermaid diagram, operational concerns

    ARCH->>ARCH: Run pre-completion checklist (10 items MODULE_DESIGN + 6 items INFRASTRUCTURE)
    ARCH->>SH: validate-module-design.sh
    alt Validator reports gaps
        ARCH->>FS: Fix gaps and re-run until exit 0
    end

    ARCH->>SH: validate-book-structure.sh (if output > 300 lines)
    ARCH->>SH: validate-mermaid.sh
    ARCH->>FS: Write Completion Manifest
    ARCH-->>LEAD: Completion signal with module count and pattern name
```

## Pattern Selection

| Signal from DESIGN_CONTEXT | Pattern chosen |
|----------------------------|---------------|
| External integrations dominant | Ports and Adapters |
| Complex business rules | Domain-Driven Design |
| Large independent frontend | Frontend-Backend separation |
| Event-heavy or async | Event-Driven |
| Simple CRUD, small team | Layered monolith |
| Mixed concerns | Modular monolith |

## Deliverables

- `docs/MODULE_DESIGN.md` — pattern + ADR, module inventory, interface contracts, plugin points, dependency rules, linter enforcement config
- `docs/INFRASTRUCTURE.md` — environment matrix, compute, data layer, networking diagram (Mermaid), operational concerns

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Performance Engineer](06-performance-engineer.md)  |  [Test Engineer →](08-test-engineer.md)
