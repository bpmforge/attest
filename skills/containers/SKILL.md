---
name: containers
description: 'Runtime-aware container ops (Docker/Podman/Rancher-nerdctl/Finch) — builds, Dockerfiles, compose, networking, rootless debugging, image optimization, multi-arch, and cloud-portable images for GCP/AWS. Use for container build/run failures, image tuning, or cloud-readiness. NOT for deploy pipelines or monitoring — use /devops for those.'
---

# Container Operations

Load and follow the instructions in the `container-ops` agent.

**Usage:**
- `/containers` — Review container setup
- `/containers --compose` — Compose configuration (auto-detects docker compose / podman / nerdctl flavor)
- `/containers --optimize` — Image optimization (multi-stage, size reduction)
- `/containers --debug` — Container debugging and troubleshooting (runtime-aware, rootless-aware)
- `/containers --network` — Container networking setup
- `/containers --cloud` — Make the image cloud-portable (multi-arch, registry, GCP/AWS target fit)

**Workflow:** Detect runtime (Step 0) → Understand config → Design/optimize → Build → Verify → Document

Every run starts by detecting the container runtime and compose flavor once, then uses the detected CLI throughout — no assuming `docker` and looping on failures. See `agents/shared/CONTAINER_RUNTIMES.md`.
