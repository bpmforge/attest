---
name: code
description: 'Doc-driven implementation engineer. Reads SDLC design docs first, verifies all library APIs via Context7, then writes clean production code. Enforces anti-slop rules — no over-engineering, no defensive bloat, no hallucinated APIs. Use after design docs exist.'
---

# Coding Agent

Load and follow the instructions in the `coding-agent` agent.

**Usage:**
- `/code` — Implement from SDLC design docs in the current project
- `/code <description>` — Implement a specific task (must have design docs or will ask for them)

**Before coding starts, the agent will:**
1. Read all SDLC design docs (ARCHITECTURE.md, SRS.md, API_DESIGN.md, etc.)
2. Read 2–3 existing files in target directories to match patterns
3. Verify every library API via Context7 MCP (`resolve-library-id` + `get-library-docs`)

**File size — checked BEFORE each write, not after:**
`wc -l` the target first; the cap (400 lines) applies to `current + your delta`, not to your
diff. Over it → don't append: add a chapter module beside the file and re-export it from the
index. Monoliths accrete out of individually-compliant edits, so "my change is small" is not a
pass. Gate: `validate-file-size.sh`. See `agents/shared/CODE_BOOK_PROTOCOL.md`.

**Anti-slop rules enforced on every file:**
- No try-catch outside system boundaries (user input, external APIs, file I/O)
- No abstractions with fewer than 2 real implementations
- No single-use helper functions (inline them)
- No comments describing what — only why (and only when non-obvious)
- No unused imports, no scope creep, no speculative generalization
- Trust the framework — don't re-implement what it provides
- No defensive null checks for types you control

**Outputs:**
- The implementation files specified in the task
- A Completion Manifest: files produced, API verifications, anti-slop audit result, test result

**Distinct from:**
- `/review-code` — health audits after implementation (not writing code)
- `/test-expert` — test strategy and coverage analysis
- `/security` — threat modeling and vulnerability scanning

**Requires:** Design docs must exist before implementation starts. If none exist, run `/sdlc feature "<description>"` first.
