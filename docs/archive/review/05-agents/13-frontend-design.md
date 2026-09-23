[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← UX Engineer](12-ux-engineer.md)  |  [SRE Engineer →](14-sre-engineer.md)

---

# 5.13 Frontend Design Engineer

**File:** `agents/frontend-design.md` | **Skill:** `/frontend`

Turns UX specs into production-grade visual implementation — typography, color systems, spacing, motion, design tokens. Distinct from ux-engineer: owns visual polish and implementation, not usability or accessibility decisions.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant FE as frontend-design
    participant PW as Playwright
    participant FS as File System
    participant SH as Shell

    LEAD->>FE: HANDOFF (scope + mode flag)
    FE->>FS: Read LOOP_PREVENTION.md
    FE->>FS: Read package.json - detect framework and component library
    FE->>FS: Read tailwind.config.ts or equivalent theme file
    FE->>FS: Read 3 existing components to match established patterns

    alt "--implement" mode
        FE->>FS: Read UX_SPEC.md + STYLE_GUIDE.md + DESIGN_PRINCIPLES.md
        FE->>FS: Write design token file (CSS vars or Tailwind config)
        FE->>FS: Implement typography system
        FE->>FS: Implement color system with dark mode if specified
        FE->>FS: Implement spacing and layout grid
        FE->>FS: Implement motion (transitions and hover states)
        FE->>PW: Screenshot at 1440px, 768px, 375px
        FE->>FE: Self-score against AI slop checklist
        FE->>SH: validate-design-system.sh
    else "--polish" mode
        FE->>PW: Screenshot current UI at 3 breakpoints
        FE->>FE: Identify 5 highest-impact visual improvements
        FE->>FS: Apply typography, color, spacing, and motion improvements
        FE->>PW: Screenshot improved UI at 3 breakpoints
        FE->>FS: Write before-and-after comparison report
    else "--system" mode
        FE->>SH: grep for hardcoded colors, font sizes, spacing values
        FE->>FS: Extract implicit tokens into explicit definitions
        FE->>FS: Write token file (primitive, semantic, component layers)
        FE->>FS: Migrate 3 representative components to new tokens
        FE->>FS: Write migration guide
    end

    FE->>FS: Write Completion Manifest
    FE-->>LEAD: Completion phrase + manifest
```

## Token Architecture

Design tokens flow from primitive → semantic → component:
- **Primitive**: raw values (`--color-blue-500: #3b82f6`)
- **Semantic**: intent-based (`--color-action: var(--color-blue-500)`)
- **Component**: scoped (`--button-bg: var(--color-action)`)

## Deliverables

| File | Mode |
|------|------|
| Token files (`tokens.css`, `tailwind.config.ts`) | `--implement`, `--system` |
| Modified component files in `src/components/ui/` | `--implement` |
| `docs/design/IMPLEMENTATION_NOTES.md` | `--implement` |
| `docs/design/POLISH_REPORT.md` | `--polish` |
| `docs/design/DESIGN_SYSTEM.md` | `--system` |
| Migration guide | `--system` |

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← UX Engineer](12-ux-engineer.md)  |  [SRE Engineer →](14-sre-engineer.md)
