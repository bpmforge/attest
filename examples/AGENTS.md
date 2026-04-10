# Project Rules

These rules apply to all AI agent interactions in this project.

## Code Quality Rules

Before writing ANY code:

1. **Read project rules first** — Read this file and any existing coding standards
2. **Read 2-3 existing files in the same directory** — Match their patterns
3. **Verify library APIs via Context7** — NEVER write from training data. Use Context7 MCP to look up current docs:
   - Call `resolve-library-id` with the library name
   - Call `get-library-docs` with a relevant topic
   - Base all code on the returned documentation
   - If Context7 is unavailable, check `node_modules/` or official docs directly
4. **Use existing utilities before creating new** — Search for existing helpers first
5. **Write tests alongside code** — Not after. Each new service gets a test file.
6. **Run lint + test after each change** — Not just type checking. Full lint and test.

## Context7 MCP Setup

For live library documentation lookup, configure Context7 in your `opencode.json`:
```json
{
  "mcp": {
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp@latest"],
      "enabled": true
    }
  }
}
```
See `references/context7-mcp.md` for full setup guide including API key and remote HTTP options.

## MemPalace MCP Setup (persistent memory for local LLMs)

Local LLMs have no memory between sessions. MemPalace fixes this — verbatim
conversation recall via ChromaDB, plus a temporal knowledge graph. 96.6%
LongMemEval R@5 in raw mode, entirely offline.

**Install:**
```bash
./scripts/install-mempalace.sh     # Installs pip package + runs init
```

Or manually: `pip install mempalace && mempalace init ~/projects/<your-project>`

**Then add to your `opencode.json`:**
```json
{
  "mcp": {
    "mempalace": {
      "type": "local",
      "command": ["python", "-m", "mempalace.mcp_server"],
      "enabled": true
    }
  }
}
```

### When to use MemPalace tools

**At the START of every session** — call `mempalace_status` first:
- Loads ~170 tokens of critical facts (team, projects, preferences, current phase)
- Returns the AAAK spec and memory protocol so the LLM learns it automatically
- Returns wing/room taxonomy so the agent knows where to look

**DURING work — before assuming context is lost:**
- `mempalace_search "<question>"` — semantic search across all verbatim history
- `mempalace_search "<question>" --wing <project>` — scope to current project (34% retrieval boost)
- `mempalace_kg_query "<entity>"` — relationships + timeline for a person, project, or topic
- `mempalace_kg_timeline "<entity>"` — chronological story (useful for "what did we decide about X?")

**AFTER any decision or milestone:**
- `mempalace_add_drawer` — file the verbatim exchange (don't summarize — raw mode is where the benchmark wins come from)
- `mempalace_kg_add` — add temporal facts ("Maya assigned_to auth-migration valid_from 2026-04-15")
- `mempalace_kg_invalidate` — mark facts as ended when they change

**For expert agents specifically:**
- Each specialist (security-auditor, code-reviewer, etc.) gets its own **wing + diary**
- After completing work, use `mempalace_diary_write` to record patterns the agent should remember for next time
- At start of work, use `mempalace_diary_read` to recall prior findings *from the same agent* (Verifier Isolation: read your own history, not another agent's reasoning)

**What NOT to do:**
- Do NOT enable AAAK mode — it currently regresses LongMemEval (84.2% vs 96.6% raw). Use raw storage.
- Do NOT enable the auto-save hooks yet — Issue #110 has an unfixed shell injection. Wait for the fix.
- Do NOT use MemPalace to store secrets, API keys, or PII in verbatim form.

## Architecture Rules

- **Feature-sliced structure** — Group by feature, not by layer
- **Interface-driven design** — Depend on interfaces, not implementations
- **Dependency injection** — Objects don't create their own dependencies
- **Clear module boundaries** — Each module has public API, private implementation, declared dependencies

## SDLC Documents

When running SDLC workflows, documents are stored in `docs/sdlc/`:
```
docs/sdlc/
  phase-0-ideation/      VISION.md
  phase-1-planning/      SCOPE.md, RISKS.md, CONSTRAINTS.md, USER_PERSONAS.md
  phase-2-requirements/  SRS.md, USER_STORIES.md
  phase-3-design/        ARCHITECTURE.md, TECH_STACK.md, DATABASE.md, API_DESIGN.md, THREAT_MODEL.md
```

## Expert Delegation

When one expert finds issues in another's domain, delegate:
- Security finds untested auth → `/test-expert`
- DBA designs schema → `/security` to review data access
- Code review finds perf issue → `/perf` to profile
- UX designs workflow → `/api-design` for endpoints

## Proactive Expert Triggers

Suggest these experts even when not explicitly requested:
- **After implementing any feature** → suggest `/review-code` and `/test-expert`
- **Before any production deploy** → suggest `/security`
- **Before choosing between 2+ tech options** → suggest `/research`
- **Before adding tables or complex queries** → suggest `/dba`
- **When slowness or timeouts appear** → suggest `/perf`
- **Before building new user-facing flows** → suggest `/ux`

## SDLC Context

When running `/sdlc`, the agent will ask you 7 questions before writing any documents.
Do not skip the Discovery Interview — your answers determine everything that follows.

Current project phase: [update this manually when phase changes]
Last gate passed: [phase name]
Open blockers: [list any]
