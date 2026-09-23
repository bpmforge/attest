[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Frontend Design](13-frontend-design.md)  |  [Container Ops →](15-container-ops.md)

---

# 5.14 SRE Engineer

**File:** `agents/sre-engineer.md` | **Skill:** `/devops`

Produces runbooks, CI/CD pipelines, monitoring configurations, and incident response procedures. Scoped to deploy and operate concerns — Dockerfile and image work belongs to container-ops.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant SRE as sre-engineer
    participant FS as File System
    participant SH as Shell

    LEAD->>SRE: HANDOFF (scope + mode flag)
    SRE->>FS: Read LOOP_PREVENTION.md + TECH_STACK.md + ARCHITECTURE.md
    SRE->>FS: Phase 1 - Glob docker-compose.yml, CI configs, deploy scripts
    SRE->>FS: Read existing runbooks and monitoring configs
    SRE->>FS: Identify deployment target and failure domains

    SRE->>FS: Phase 2 - Read deploy scripts, check service dependencies
    SRE->>SH: Identify monitoring gaps

    SRE->>SRE: Phase 3 - Plan: state goal, risks, blast radius

    alt "--runbook" flag
        loop Per procedure (3-pass)
            SRE->>FS: Pass 1 - Write procedure steps
            SRE->>FS: Pass 2 - Add verify-it-worked after each step
            SRE->>FS: Pass 3 - Add rollback for each step
            SRE->>SRE: Walk-through from scratch
        end
    else "--cicd" flag
        SRE->>FS: Write 10-stage pipeline (Lint, Type, Unit, Build, Integration,
        SRE->>FS: Security scan, Deploy staging, Smoke, Deploy prod, Post-verify)
    else "--monitor" flag
        SRE->>FS: Define four golden signals (Latency, Traffic, Errors, Saturation)
        SRE->>FS: Set thresholds from baselines (2x P95 warn, 5x P95 critical)
    else "--incident" flag
        SRE->>FS: Write Detect, Triage, Communicate, Mitigate, Resolve, Review flow
        SRE->>FS: Include blameless post-mortem template (within 48h)
    end

    SRE->>SH: Phase 5 - Validate YAML/JSON syntax, check script shebangs
    SRE->>SRE: Verify rollback procedures completeness
    SRE->>FS: Phase 6 - Write ops report to docs/ops/
    SRE->>FS: Write Completion Manifest
    SRE-->>LEAD: Completion phrase + manifest
```

## Runbook Quality Gate (3-pass per procedure)

Each runbook procedure must have three passes before it is accepted:
1. **Steps** — what to do
2. **Verify** — how to confirm each step worked
3. **Rollback** — how to undo each step

Any step requiring unstated knowledge → add context, restart loop.

## Deliverables

| File | Mode |
|------|------|
| Runbook markdown in `docs/ops/` | `--runbook` |
| CI/CD YAML pipeline | `--cicd` |
| Monitoring + alert config | `--monitor` |
| Incident response procedure + post-mortem template | `--incident` |

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Frontend Design](13-frontend-design.md)  |  [Container Ops →](15-container-ops.md)
