---
name: steward
description: 'Project intelligence steward — audits CLAUDE.md / AGENTS.md alignment with actual codebase, captures session learnings, updates project docs. Use after major sessions or when docs feel stale.'
---

# Steward — Project Intelligence Lifecycle

Keeps project documentation aligned with reality. CLAUDE.md and AGENTS.md drift
from the actual codebase as code evolves and decisions are made in conversation
but never written down. This skill fixes that.

**Usage:**
- `/steward` — Full audit: check docs vs code, surface drift, update
- `/steward capture` — Capture learnings from this session into project docs
- `/steward audit` — Audit-only: report drift without fixing

## How It Works

### `/steward audit` — Find the Drift

```
▶ Phase 1: Reading project docs...
```
1. Read CLAUDE.md (or AGENTS.md in OpenCode projects)
2. Read README.md, package.json, any docs/*.md files referenced

```
▶ Phase 2: Checking alignment with code...
```
3. For each claim in the docs, verify against the actual codebase:
   - **Tech stack:** Does package.json match what docs say? (e.g., docs say "React 18" but package.json has "react": "^19")
   - **File structure:** Does the directory structure match what docs describe? (e.g., docs say `src/features/` but code uses `src/modules/`)
   - **Commands:** Do the documented commands actually work? (e.g., `npm run test:e2e` referenced but not in scripts)
   - **Patterns:** Do the coding standards in docs match what the code actually does? (e.g., docs say "max 150 lines per component" but 15 components exceed it)
   - **Features:** Are all documented features still present? Any undocumented features?
   - **Dependencies:** Are documented dependencies current? Any deprecated?

```
▶ Phase 3: Reporting drift...
```
4. Write `docs/STEWARD_REPORT.md`:
```markdown
# Steward Report — [date]

## Drift Found
| Doc section | What it says | What code shows | Fix |
|-------------|-------------|----------------|-----|
| Tech stack | React 18 | React 19.1.0 | Update docs |
| Test command | `npm run test:e2e` | Script doesn't exist | Add script or fix docs |
| File limit | 150 lines | 15 files exceed | Update limit or refactor |

## Undocumented
- src/features/requirements/ — new feature, not in CLAUDE.md
- AI provider dual-source (aiSettings vs ai_providers) — known tech debt, not documented

## Stale
- "Phase 4 Backlog" section references completed items
- Deployment instructions reference old container names
```

### `/steward capture` — Save Session Learnings

After a productive session, capture what was learned:

1. Read recent git history (`git log --oneline -20`)
2. Read any docs/audits/ or docs/reviews/ files created this session
3. Identify decisions, patterns, and constraints that should be in CLAUDE.md
4. Write the updates:
   - New patterns discovered → add to coding standards section
   - New features built → add to features list
   - Decisions made → add to architecture decisions section
   - Known issues found → add to known issues section
   - Commands changed → update the commands section

### `/steward` (full) — Audit + Fix

Run audit, then apply fixes:
1. Update version numbers and tech stack references
2. Add undocumented features to the features list
3. Remove stale references
4. Add session learnings
5. Commit the updates

**Rules:**
- Never delete information — mark stale content as `(archived)` or move to a `## Historical` section
- Every update has a reason — don't rewrite docs for style, only for accuracy
- If uncertain about a drift finding, flag it as "verify with team" rather than auto-fixing
- Write findings to disk immediately — don't accumulate
