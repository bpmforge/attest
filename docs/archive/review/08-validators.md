[🏠 Index](README.md)  |  [← HANDOFF Delegation Protocol](07-handoff-protocol.md)  |  [Installation Flow →](09-installation.md)

---

# 8. Validation Gate System

### 8.1 Phase Gate Structure

```mermaid
flowchart TD
    subgraph Gates["Phase Gate Chain"]
        P0["Phase 0 Gate<br/>File existence only<br/>VISION.md, COMPETITIVE_ANALYSIS.md"]
        P1["Phase 1 Gate<br/>File existence + prereq: phase-0<br/>SCOPE, RISKS, CONSTRAINTS, PERSONAS"]
        P2["Phase 2 Gate<br/>use-cases + user-stories + traceability<br/>prereq: phase-1"]
        P3["Phase 3 Gate<br/>architecture + api-coverage + sequence-coverage<br/>+ erd-coverage + c3-coverage + entry-points<br/>+ tech-stack + adrs + security-controls<br/>prereq: phase-2"]
        P35["Phase 3.5 Gate<br/>validate-test-design<br/>prereq: phase-3"]
        P4["Phase 4 Gate<br/>build + lint + tests + tests-mapping + migrations<br/>prereq: phase-3.5"]
        P5["Phase 5 Gate (Release)<br/>FIX_BACKLOG closed + reviews APPROVED<br/>+ RUNTIME PASS<br/>prereq: phase-4"]
    end

    P0 -->|"✅ lock file written"| P1
    P1 -->|"✅ lock file written"| P2
    P2 -->|"✅ lock file written"| P3
    P3 -->|"✅ lock file written"| P35
    P35 -->|"✅ lock file written"| GateB{Human Gate B}
    GateB -->|"user approves"| P4
    P4 -->|"✅ lock file written"| P5
    P5 -->|"✅ all pass"| Ship([Ship])

    subgraph Standalone["Standalone Gates"]
        OD["onboard-deep<br/>inventory + architecture<br/>+ erd-coverage + sequence-coverage"]
        SD["security-deep<br/>owasp + attack-chains"]
    end
```

### 8.2 Coverage Loop Protocol

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant CL as run-coverage-loop.sh
    participant VAL as Specific Validator
    participant SPEC as Specialist Agent

    LEAD->>CL: run-coverage-loop.sh phase-N

    loop Max 3 iterations
        CL->>VAL: Run phase-N validators
        VAL-->>CL: exit 0 (clean) or exit 1 (gaps) or exit 2 (exhausted)

        alt exit 0 - clean
            CL-->>LEAD: All rows covered
            LEAD->>LEAD: Mark tracker DONE, advance
            Note over LEAD: Loop ends
        else exit 1 - gaps remain (iter < 3)
            CL-->>LEAD: docs/work/COVERAGE_LOOP_phase_date.md
            LEAD->>LEAD: Read gap list
            LEAD->>SPEC: HANDOFF - fill specific gaps
            SPEC-->>LEAD: Gaps filled
        else exit 2 - 3 iterations exhausted
            CL-->>LEAD: Escalation block
            LEAD->>LEAD: Read RALPH_WIGGUM_LOOP.md
            LEAD->>LEAD: Offer: waiver / lower-bar / specialist / manual
        end
    end
```

### 8.3 New Validators (added 2026-06-01)

Two new validators were added during the system review session and are wired into the phase gate chain.

#### validate-mermaid.sh

Static Mermaid syntax checker. Scans all `.md` files (or a target directory) for 6 error classes before a diagram renderer ever touches them:

| Code | Pattern | Example bad input |
|------|---------|-------------------|
| M001 | Unquoted `/` in `[node label]` | `SDLC[/sdlc]` |
| M002 | Semicolons in `Note over` text | `Note over A: step one; step two` |
| M003 | Unicode `→` arrows | `A → B` |
| M004 | Unquoted `\|` in node label context | `node[\|label]` |
| M005 | Empty `[]` or `()` node labels | `A[]` |
| M006 | Unclosed mermaid fenced blocks | ` ```mermaid` with no closing ` ``` ` |

Wired into **phase-3** and **onboard-deep** gates (after `validate-no-ascii-art.sh`).

```bash
bash scripts/validators/validate-mermaid.sh .           # scan entire repo
bash scripts/validators/validate-mermaid.sh . docs/     # scan docs/ only
```

#### validate-book-structure.sh

Validates that a `docs/<slug>/` directory is a well-formed book per `BOOK_PROTOCOL.md`. Supports **2-level nesting** — flat chapter files and chapter directories with sub-chapter files.

**Book level checks:**
- `README.md` exists with a navigation table (pipe-delimited with links)
- At least 2 chapter entries (files or directories) present

**Flat chapter file checks:**
- Has `[🏠 Index]` nav bar at top and bottom
- Does not exceed 400 lines

**Chapter directory checks (sub-chapter level):**
- `README.md` present with navigation table linking to sub-pages
- At least 1 sub-chapter file (`01-*.md`, `02-*.md`, …)
- Each sub-chapter has two-breadcrumb nav bar: `[🏠 Book](../README.md) | [📖 Chapter](README.md)`
- Each sub-chapter does not exceed 400 lines
- Warns (not errors) on any 3rd-level directory nesting

```bash
bash scripts/validators/validate-book-structure.sh docs/review/
# stdout: {"ok":true,"errors":0,"warnings":0,"chapters":14,"chapter_dirs":0,...}
# stderr: validate-book-structure: PASS — .../docs/review (14 chapters, 0 with sub-pages)
```

Exits 0 (pass), 1 (structural errors), 2 (usage error). Outputs JSON findings to stdout and human summary to stderr.

---

---

[🏠 Index](README.md)  |  [← HANDOFF Delegation Protocol](07-handoff-protocol.md)  |  [Installation Flow →](09-installation.md)
