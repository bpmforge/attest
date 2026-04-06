# Contributing — How to Add New Experts

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

### Step 4: Update README

Add your expert to the table in README.md.

### Step 5: Test

1. Install the package: `./install.sh --project`
2. Open OpenCode in a test project
3. Run your slash command
4. Verify the agent follows its methodology
5. Test with at least 2 different LLM providers

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
