# Contributing — How to Add New Experts

## Repo layout

- `agents/` — agent definitions (system prompts, mode flags, scope rules)
- `agents/shared/` — canonical shared protocols (BOUNDED_TASK_CONTRACT, SCOPE_BOUNDARY, HANDOFF_TEMPLATES, FIX_VERIFY_LOOP, RALPH_WIGGUM_LOOP, LOOP_PREVENTION, RESEARCH_TOOLS) — every agent reads these
- `skills/` — thin trigger files (`<name>/SKILL.md`) that map a slash command to an agent
- `commands/` — `/sdlc <subcommand>` definitions (init, onboard, feature, improve, gate, status)
- `tools/` — TypeScript tools loaded by opencode (write/edit/bash with schema guards, semgrep, playwright, etc.)
- `plugins/` — opencode plugins (currently `expert-hooks.ts` for safety + quality automation)
- `references/` — checklists and templates agents read at runtime
- `scripts/validators/` — bash validators wired into the gate orchestrator
- `hooks/` — empty (loop prevention now lives in `tools/` and `plugins/expert-hooks.ts`)

## Adding a New Expert Agent

### Step 1: Create the Agent Definition

Create a new file in `agents/my-expert.md`:

```markdown
---
name: my-expert
description: One-line description of what this expert does
---

# Expert Title

You are a senior [role]. You [what you do] focused on [domain].

## Scope Boundary (MANDATORY — read first)

You are a [domain] specialist. Out-of-scope requests print the
SCOPE-BOUNDARY block from `agents/shared/SCOPE_BOUNDARY.md` and stop.
List 2-3 typical out-of-scope asks here so the agent has concrete examples.

## How You Think

[3-5 bullet points about the expert's mental model and priorities]

## How You Work

When invoked, follow this workflow in order:

### Phase 1: Understand
[How the expert assesses the current state]

### Phase 2: Research
[How the expert gathers information]

### Phase 3: Plan
[How the expert plans their work]

### Phase 4: Execute
[How the expert does the work]

### Phase 5: Verify
[How the expert validates their work]

### Phase 6: Report
[Output format and what gets delivered]

## Recommend Other Experts When
[When to suggest delegating to other experts]

## Rules
[Hard rules the expert always follows]
```

### Step 2: Create the Skill (Slash Command)

Create `skills/my-expert.md`:

```markdown
---
name: my-command
description: "Short description for the command list"
---

# Expert Name

Load and follow the instructions in the `my-expert` agent.

**Usage:**
- `/my-command` — Default action
- `/my-command --flag` — Specific action

**Workflow:** [Brief workflow summary]
```

### Step 3: Add Reference Documents (Optional)

If your expert needs reference documents (checklists, templates, standards), add them to `references/`:

```markdown
# Reference Document Title

[Content that the agent reads at runtime to inform its work]
```

Reference the document in your agent definition:
```
Read `my-checklist.md` for the systematic checklist.
```

### Step 4: Update docs

- Add your expert to the agent table in `docs/FEATURES.md` and the per-expert section in `docs/USERGUIDE.md`.
- The README is intentionally minimal — only update it if you're changing top-level concepts.

### Step 5: Test

1. Install the package: `./install.sh --project`
2. Open OpenCode in a test project
3. Run your slash command
4. Verify the agent follows its methodology
5. Verify scope-boundary fires for out-of-scope asks
6. Test with at least 2 different LLM providers

## Keeping `claude-experts` in sync (the generated repo)

`claude-experts` is **generated** from this repo (`npm run build:claude`). Two rules keep it sane under parallel/automated work:

- **Do NOT run `build:claude` or touch `../claude-experts` inside a ticket/executor session.** Regeneration is a **single post-merge step**, run once after source PRs land — never per-executor. Parallel executors each regenerating into the one shared sibling race each other: one leaves a stray skill that spuriously fails another's local `skills-parity` test, and a regen committed at a different moment than it was generated ships a *stale* generated file that fails CI (both observed 2026-07-13).
- **After merging source PRs to `main`, run `scripts/regen-claude-target.sh` once.** It regenerates, commits the fresh output, pushes both remotes, and gates on `build:claude:check`. `build:claude:check` runs in CI **only on `main` push** (post-merge) — it is unsatisfiable on a feature branch that adds a skill/agent/script, so it does not gate PRs; `npm test` does.
- **`skills/` is hand-maintained per target** (not generated) — a new skill must be authored in *both* repos. `build:claude` regenerates agents/references/validators/scripts; it does not create skill directories.

## Design Principles

### Agent Design
- **Specific methodology** — Don't just say "review the code". Define the exact steps.
- **Think section** — How does this expert approach problems differently?
- **Verify before report** — Agents must verify findings against actual code.
- **Cross-expert awareness** — Know when to recommend other experts.
- **No false positives** — Better to miss something than report something wrong.

### Skill Design
- **Brief** — Skills are triggers, not full methodologies. Keep them under 30 lines.
- **Usage examples** — Show the slash command with common flags.
- **Reference the agent** — The skill should say "Load and follow the instructions in the `X` agent."

### Reference Document Design
- **Actionable** — Checklists, not essays.
- **Versioned** — Include the standard version (e.g., "OWASP Top 10 2021").
- **Scannable** — Tables and bullet points, not paragraphs.
