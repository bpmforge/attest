[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← SRE Engineer](14-sre-engineer.md)  |  [Git Expert →](16-git-expert.md)

---

# 5.15 Container Ops

**File:** `agents/container-ops.md` | **Skill:** `/containers`

Builds, debugs, and optimizes container images and compose configurations for Podman and Docker. Scoped to image and container concerns — deploy pipelines belong to sre-engineer.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant CONT as container-ops
    participant FS as File System
    participant SH as Shell

    LEAD->>CONT: HANDOFF (scope + mode flag)
    CONT->>FS: Read LOOP_PREVENTION.md + TECH_STACK.md
    CONT->>FS: Phase 1 - Glob Dockerfiles, docker-compose.yml, .dockerignore
    CONT->>SH: podman ps -a (check container state)
    CONT->>SH: podman images (check current image sizes)

    CONT->>SH: Phase 2 - podman logs --tail 50 (if debugging)
    CONT->>SH: trivy image (CVE scan if Trivy available)

    CONT->>CONT: Phase 3 - Plan changes and identify risks

    alt "--build" or default
        loop Per Dockerfile (3-pass)
            CONT->>FS: Pass 1 - Functionality (builds and runs)
            CONT->>FS: Pass 2 - Security (non-root, no secrets in layers)
            CONT->>FS: Pass 3 - Optimization (multi-stage, layer caching)
        end
        alt Image > 500MB
            CONT->>CONT: Force optimization pass
        end
    else "--debug" flag
        CONT->>SH: podman inspect and podman exec
        CONT->>CONT: Check port conflicts, volume permissions, missing env vars
    else "--compose" flag
        CONT->>FS: Write compose file (one service per concern)
        CONT->>CONT: Internal networks, named volumes, .env for secrets
        CONT->>CONT: Health checks, unless-stopped policy, resource limits
    else "--optimize" flag
        CONT->>CONT: Alpine or distroless base, combine RUN commands
        CONT->>CONT: npm ci --omit=dev, multi-stage build
    end

    CONT->>SH: Phase 5 - podman build . (verify syntax)
    CONT->>SH: podman-compose config (verify compose syntax)
    CONT->>SH: trivy image (final CVE scan)
    CONT->>FS: Phase 6 - Write CONTAINER_REPORT.md
    CONT->>FS: Write Completion Manifest
    CONT-->>LEAD: Completion phrase + manifest
```

## Dockerfile Quality Gate (3-pass)

| Pass | Focus |
|------|-------|
| 1 — Functionality | Does it build and run? |
| 2 — Security | Non-root user, no secrets in layers, minimal base |
| 3 — Optimization | Multi-stage, layer caching, minimal final image size |

Image size gate: any typical web app image over 500MB triggers a mandatory optimization pass.

## Deliverables

- `Dockerfile` (new or updated, multi-stage)
- `docker-compose.yml` or `podman-compose.yml`
- `.dockerignore`
- `docs/ops/CONTAINER_REPORT.md` — before/after image sizes, service architecture, security concerns

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← SRE Engineer](14-sre-engineer.md)  |  [Git Expert →](16-git-expert.md)
