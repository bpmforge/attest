[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Researcher](11-researcher.md)  |  [Frontend Design →](13-frontend-design.md)

---

# 5.12 UX Engineer

**File:** `agents/ux-engineer.md` | **Skill:** `/ux`

Three invocation modes: greenfield design (`--design`), live PR review (`--review`), and accessibility audit (`--audit`). Uses Playwright for live screenshots when available; falls back to static analysis with a warning.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant UX as ux-engineer
    participant PW as Playwright
    participant FS as File System
    participant SH as Shell

    LEAD->>UX: HANDOFF (scope + mode flag)
    UX->>FS: Read design-review-checklist.md + LOOP_PREVENTION.md
    UX->>SH: Check Playwright availability
    UX->>FS: Detect component library (shadcn, MUI, Tailwind, etc.)
    UX->>FS: Read 2-3 existing components

    alt "--design" mode
        UX->>FS: Read VISION + PERSONAS + USER_STORIES + TECH_STACK
        UX->>UX: Commit to aesthetic direction with justification
        UX->>FS: Write DESIGN_PRINCIPLES.md
        UX->>FS: Write STYLE_GUIDE.md
        UX->>FS: Write UX_SPEC.md
        UX->>SH: validate-ux-spec.sh
    else "--review" mode
        UX->>FS: Read PR description and diff
        alt Playwright available
            UX->>PW: Screenshot at 1440px, 768px, 375px
            PW-->>UX: Screenshots per breakpoint
        end
        UX->>UX: Phase 1 — Interaction and user flow
        UX->>UX: Phase 2 — Responsiveness
        UX->>UX: Phase 3 — Visual polish
        UX->>UX: Phase 4 — Accessibility (WCAG 2.2 AA)
        UX->>UX: Phase 5 — Robustness
        UX->>UX: Phase 6 — Code health
        UX->>UX: Phase 7 — Content and console
        UX->>FS: Write UX_REVIEW.md (Blocker, High, Medium, Nit)
    else "--audit" mode
        UX->>UX: WCAG 2.2 AA audit (perceivable, operable, understandable, robust)
        UX->>FS: Write ACCESSIBILITY_AUDIT.md
    end

    UX->>FS: Write Completion Manifest
    UX-->>LEAD: Completion phrase + manifest
```

## Finding Severity

| Level | Meaning |
|-------|---------|
| Blocker | Prevents task completion or fails WCAG AA |
| High-Priority | Significant friction or accessibility regression |
| Medium-Priority | Inconsistency or usability issue |
| Nit | Cosmetic, no user impact |

## Deliverables

| File | Mode |
|------|------|
| `docs/design/DESIGN_PRINCIPLES.md` | `--design` |
| `docs/design/STYLE_GUIDE.md` | `--design` |
| `docs/design/UX_SPEC.md` | `--design` |
| `docs/UX_REVIEW.md` + screenshots | `--review` |
| `docs/ACCESSIBILITY_AUDIT.md` | `--audit` |

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Researcher](11-researcher.md)  |  [Frontend Design →](13-frontend-design.md)
