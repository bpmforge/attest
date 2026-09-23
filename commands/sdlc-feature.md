---
description: "Add a feature to an existing system with impact analysis"
---

Add the following feature to the existing system: "{{description}}"

Follow the SDLC Lead agent Mode 3 methodology:

0. **Feature Discovery Interview** — Ask the user 7 targeted questions (problem, users, "done" criteria, constraints, priority, existing patterns, concerns). Present all at once and WAIT for answers before proceeding.
1. **Impact Analysis** — HANDOFF to app-cartographer (`/explore`): a file:line map of everything the feature touches (`docs/explore/EXPLORE_[feature].md`). Then decide atomic vs split (Step 1.5).
2. **Design** — db-architect / migration-planner / api-designer / security-auditor design review, as the impact calls for. Ask Design Clarification Questions if deployment/caching/async concerns weren't covered.
3. **Implement** — `feat/<slug>` branch + draft PR, failing acceptance test first, code against the design, parallel review fan-out, FIX_BACKLOG + `run-coverage-loop.sh feature`, challenger on HIGH/CRITICAL, fix-verify loop.
4. **Verify** — full suite green, FIX_BACKLOG closed.
5. **Document + merge** — update architecture/API docs, runtime validation gate (build, lint, tests, smoke, deps), git-expert squash-merges.

Diagram: `docs/flows/feature-improve.md`.
