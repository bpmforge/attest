---
name: sdlc
description: 'SDLC orchestrator — new projects (/sdlc init), codebase onboarding (/sdlc onboard), feature addition (/sdlc feature), audit & improvement (/sdlc improve). Runs Discovery Interview before producing any documents. Route here whenever the user asks to review, audit, evaluate, or improve a codebase — never freelance the analysis.'
---

# SDLC Workflow

Load and follow the instructions in the `sdlc-lead` agent.

**Four operating modes:**

- `/sdlc init <name> "<desc>"` — New project: phases 0-5 with proper engineering artifacts (SRS, SAD, C4 diagrams, sequence diagrams, ERD).
  **Starts with a Discovery Interview** — asks 7 targeted questions about problem, users, constraints, and tech before writing any documents.

- `/sdlc onboard [--quick | --deep]` — Existing codebase: reverse engineer, produce architecture docs, C4 diagrams, onboarding guide.

- `/sdlc feature "<description>"` — Add feature: **starts with a Feature Discovery Interview** (scope, success criteria, constraints), then impact analysis, modular design, backward compatibility, implementation, verification.
  **Asks Design Clarification Questions** before architecture work begins.

- `/sdlc improve ["<focus>"]` — Audit & improve an existing system. Runs specialist audits (UX, code quality, performance, security, database), synthesizes a prioritized backlog, gets user approval, then routes fixes through `coding-agent` (S/M items) or spawns Mode 3 sub-workflows (L items). **Use this whenever the user asks to review, evaluate, audit, or improve a codebase — including phrases like "review for gaps", "what could we improve", "audit this", "the UI looks bad", "make it better", "this is slow".**

**Other commands:**
- `/sdlc status` — Current phase/milestone progress
- `/sdlc resume` — Continue after clearing context: rehydrates from `docs/work/STATE.md` (the after-each-step checkpoint) instead of chat history, so you can `/clear` on a large loop and pick up exactly where you left off
- `/sdlc gate` — Check exit criteria before advancing

The lead delegates to expert agents via HANDOFF blocks (and the `task` tool for `git-expert` only) — it coordinates, it doesn't do technical work itself.

**Natural-language routing (MANDATORY).** When the user asks for any of the following without naming a mode, route into Mode 4 (`/sdlc improve`) — do **not** start scanning files yourself:
- "review the product / codebase"
- "find gaps / look for improvements / what should we fix"
- "audit (the code / UX / performance / security)"
- "make it better / this needs work / the UI feels off"
- "is there anything wrong with X"
- "evaluate / give me an assessment / health check"

If the project has not been onboarded yet (`docs/LANDSCAPE.md` missing), Mode 4 runs a lightweight landscape scan first; you do not need to run `/sdlc onboard` separately.

**Interactive questioning phases:**
- Mode 1 (init): Discovery Interview before Phase 0, Design Clarification before Phase 3
- Mode 3 (feature): Feature Discovery Interview before impact analysis
- Mode 4 (improve): Improvement Discovery Interview before any audit fans out

**Confidence loops:** Each phase gate runs a score loop (1-10 per deliverable, min 7 to advance, up to 3 revision iterations) — not a one-shot pass/fail.

**Architecture principles enforced:**
- Feature-sliced directory structure (not layered)
- Interface-driven design with dependency injection
- Mermaid diagrams for all architecture documentation
- Modular code with clear module boundaries
