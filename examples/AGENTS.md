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
