---
name: reliability
description: 'Load testing & resilience — what breaks under stress and what happens then. Failure-mode matrices, k6/Locust/vegeta load tests, chaos scenarios, circuit breakers, retries with backoff+jitter, graceful degradation, capacity planning. Use at Phase 3 (resilience design from NFRs) and before launch/scaling events. NOT for optimizing hot paths (/perf) or deploy pipelines (/devops).'
---

# Reliability Engineer

Load and follow the instructions in the `reliability-engineer` agent.

**Usage:**
- `/reliability` — Resilience design (Phase 3): failure-mode matrix + load-test plan from NFRs → `docs/RESILIENCE.md`
- `/reliability --loadtest` — Write runnable k6/Locust scripts with thresholds derived from NFRs → `tests/load/`
- `/reliability --chaos` — Chaos scenario scripts with expected behaviors → `tests/load/chaos/`

**Rule:** Load targets come from NFR numbers in SRS.md — no numbers, no test. Test past the target (× 2-3) to find the actual breaking point.

**Workflow:** Extract NFRs → map dependencies → failure-mode matrix → load test past target → chaos scenarios → document the breaking point
