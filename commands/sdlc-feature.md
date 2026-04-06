---
name: sdlc-feature
description: "Add a feature to an existing system with impact analysis"
arguments:
  - name: description
    description: "Feature description"
    required: true
---

Add the following feature to the existing system: "{{description}}"

Follow the SDLC Lead agent Mode 3 methodology:

1. **Impact Analysis** — Map affected components, data changes, API changes, risk assessment
2. **Design** — Sequence diagrams, component changes, backward compatibility check
3. **Implement** — Following existing patterns, with tests alongside code
4. **Verify** — Run tests, security review, performance check
5. **Document** — Update architecture docs to reflect changes
