[🏠 Index](README.md)  |  [← SDLC Workflow](06-sdlc-workflow.md)  |  [Validation Gate System →](08-validators.md)

---

# 7. HANDOFF Delegation Protocol

Since `task()` does not work in OpenCode, all agent delegation uses explicit HANDOFF blocks.

### 7.1 HANDOFF Lifecycle

```mermaid
sequenceDiagram
    participant U as User
    participant LEAD as sdlc-lead
    participant DISK as Filesystem
    participant SPEC as Specialist Agent
    participant VAL as Validators

    LEAD->>DISK: Write docs/work/sdlc-state.md<br/>(mode, phase, awaiting agent, next step)
    LEAD->>DISK: Write docs/work/context-for-agent.md<br/>(full context packet)
    LEAD->>U: Emit HANDOFF block with ════ delimiters
    Note over U: User opens new OpenCode session,<br/>types /skill, pastes HANDOFF body

    U->>SPEC: "SDLC-TASK for agent-name: ..."
    SPEC->>DISK: Read BOUNDED_TASK_CONTRACT.md
    SPEC->>DISK: Read context-for-agent.md
    SPEC->>DISK: Execute multi-phase workflow
    SPEC->>DISK: Write files within WRITE-SCOPE only
    SPEC->>DISK: Write Completion Manifest
    SPEC-->>U: Print verbatim completion phrase

    U->>LEAD: "[agent] done"
    LEAD->>DISK: Read docs/work/sdlc-state.md (confirm which agent)
    LEAD->>VAL: run-handoff-gates.sh --scope --manifest [--coverage]

    VAL->>VAL: Gate 1: git status within WRITE-SCOPE
    VAL->>VAL: Gate 2: Completion Manifest schema valid
    VAL->>VAL: Gate 3: Coverage validator (optional)

    alt All gates pass
        VAL-->>LEAD: exit 0
        LEAD->>LEAD: Score 1-10
        alt Score >= 7
            LEAD->>DISK: Append DELEGATION_LOG.md DONE
            LEAD->>LEAD: Continue to next step
        else Score 5-6
            LEAD->>U: Request revision (up to 3x)
        else Score < 5
            LEAD->>U: Auto-fail - specific corrections needed
        end
    else Gate fails
        VAL-->>LEAD: exit 1 + JSON gap list
        LEAD->>U: Return gaps to specialist for REVISE
    end
```

### 7.2 HANDOFF Block Format

```mermaid
flowchart LR
    A["════════════════\nHANDOFF #N -> agent\nUSER: copy below\n════════════════"] --> B["SDLC-TASK for agent-name:\n\nROLE: ...\n\nCONTEXT:\n- BOUNDED_TASK_CONTRACT.md\n- context-for-agent.md\n- relevant source files\n\nWRITE-SCOPE:\n- dir/ only\n\nYOUR TASK:\n2-4 sentence description\n\nPRODUCE:\n- exact output files\n\nWhen done print exactly:\n'agent done - ...'"] --> C["════════════════\nEND HANDOFF #N\n════════════════"]
```

---

---

[🏠 Index](README.md)  |  [← SDLC Workflow](06-sdlc-workflow.md)  |  [Validation Gate System →](08-validators.md)
