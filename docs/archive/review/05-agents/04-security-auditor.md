[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Coding Agent](03-coding-agent.md)  |  [Code Reviewer →](05-code-reviewer.md)

---

# 5.4 Security Auditor

**File:** `agents/security-auditor.md` | **Skill:** `/security`

OWASP-aligned security engineer. Two depth modes: `--quick` (3 phases, one pass per category) and `--deep` (6 phases + iterative attack-chain analysis). Never guesses — verifies every finding against actual code before reporting.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant SEC as security-auditor
    participant SH as Shell
    participant FS as File System

    LEAD->>SEC: HANDOFF (scope + depth flag)
    SEC->>FS: Read LOOP_PREVENTION.md

    alt "--deep" flag
        SEC->>FS: Read OWASP_METHODOLOGY.md
    end

    SEC->>FS: Phase 1 - Read entry points, auth flows, data flows
    SEC->>FS: Write phase1.md checkpoint

    SEC->>SH: Phase 2 - semgrep --config per rule file
    SEC->>SH: Dependency audit + secret scan
    SEC->>SEC: Triage each finding (REAL, FALSE POSITIVE, UNVERIFIED)

    loop Phase 3 - OWASP Manual (per category)
        SEC->>FS: Verify finding against actual code
        alt "--deep" mode
            SEC->>SEC: Iterate until confidence >= 7 (max 3 passes)
        else "--quick" mode
            SEC->>SEC: Single pass per category
        end
    end

    SEC->>SEC: Phase 4 - Cross-check and deduplicate findings

    alt "--deep" flag
        loop Phase 5 - Attack chain analysis (max 3 iterations)
            SEC->>SEC: Chain verified findings into multi-step exploits
            SEC->>SEC: Test finding pairs and triples
        end
        SEC->>SH: validate-phase-gate.sh security-deep
    end

    SEC->>FS: Phase 6 - Write OWASP_TRACKER.md
    SEC->>FS: Write attack-chains.md (deep mode only)
    SEC->>FS: Write final-report.md
    SEC->>FS: Write Completion Manifest
    SEC-->>LEAD: Completion phrase + manifest
```

## Phase Breakdown

| Phase | `--quick` | `--deep` |
|-------|-----------|---------|
| 1 — understand-target | Yes | Yes |
| 2 — automated-scan | Yes | Yes |
| 3 — owasp-manual | 1 pass per category | Iterate to confidence >= 7 |
| 4 — verify-findings | Yes | Yes |
| 5 — attack-chain | No | Yes — pairs and triples |
| 6 — write-report | Yes | Yes + attack-chains.md |
| D1-D5 deep loop | No | Yes — validate-owasp.sh gate |

## Deliverables

| File | When |
|------|------|
| `docs/security/OWASP_TRACKER.md` | Both modes |
| `docs/security/final-report.md` | Both modes |
| `docs/security/attack-chains.md` | `--deep` only |
| `docs/THREAT_MODEL.md` | SDLC Phase 3 HANDOFF |
| `docs/SECURITY_CONTROLS.md` | SDLC Phase 3 HANDOFF |

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Coding Agent](03-coding-agent.md)  |  [Code Reviewer →](05-code-reviewer.md)
