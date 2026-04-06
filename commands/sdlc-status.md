---
description: "Show current SDLC project status"
---

Check the current SDLC project status:

1. Read the docs/sdlc/ directory structure
2. Check which phases have deliverables
3. Validate each deliverable has content (>50 lines)
4. Report current phase, completed deliverables, and gate status
5. Recommend next actions

Output format:
```
Project: [Name]
Mode: [init | onboard | feature]
Phase: [0-5] ([Phase Name])

Deliverables:
  Phase 0 (Ideation):     [STATUS]
  Phase 1 (Planning):     [STATUS]
  Phase 2 (Requirements): [STATUS]
  Phase 3 (Design):       [STATUS]
  Phase 4 (Implementation): [STATUS]

Gate Status: [PASS/BLOCKED]
Next Action: [Recommendation]
```
