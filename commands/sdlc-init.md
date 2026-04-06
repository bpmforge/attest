---
name: sdlc-init
description: "Initialize a new project with SDLC phases"
arguments:
  - name: name
    description: "Project name"
    required: true
  - name: description
    description: "Project description"
    required: true
---

Initialize a new software project called "{{name}}" with description: "{{description}}"

Follow the SDLC Lead agent methodology:
1. Create docs/sdlc/ directory structure
2. Generate Phase 0 (Ideation): VISION.md
3. Generate Phase 1 (Planning): SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md
4. Report gate status for each phase
5. Ask if ready to proceed to Phase 2 (Requirements)

Architecture principles to enforce:
- Feature-sliced directory structure
- Interface-driven design with dependency injection
- Mermaid diagrams for all documentation
- Modular code with clear boundaries
