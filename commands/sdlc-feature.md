---
description: "Add a feature to an existing system with impact analysis"
---

Add the following feature to the existing system: "{{description}}"

Follow the SDLC Lead agent Mode 3 methodology:

0. **Feature Discovery Interview** — Ask the user 7 targeted questions (problem, users, "done" criteria, constraints, priority, existing patterns, concerns). Present all at once and WAIT for answers before proceeding.
1. **Impact Analysis** — Map affected components, data changes, API changes, risk assessment. Run confidence loop (rate 1-10, repeat if < 7, max 3 passes).
2. **Design** — Sequence diagrams, component changes, backward compatibility check. Ask Design Clarification Questions if deployment/caching/async concerns weren't covered. Run design confidence loop.
3. **Implement** — Following existing patterns, with tests alongside code
4. **Verify** — Run tests, security review, performance check
5. **Document** — Update architecture docs to reflect changes
