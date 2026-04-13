---
name: design-options
description: 'Architecture decision tool — generates 2-3 alternative approaches with explicit trade-offs before committing. Use during Phase 3 design or any time you face a "how should we build this?" decision.'
---

# Design Options — Multi-Approach Architecture

Before committing to an architecture, generate 2-3 alternative approaches
with explicit trade-offs. Prevents the most expensive kind of mistake:
building the wrong thing well.

**Usage:**
- `/design-options "how should we handle authentication?"` — Compare auth approaches
- `/design-options "monolith vs microservices for this system"` — Architecture-level
- `/design-options "state management for the dashboard"` — Component-level

## How It Works

### Phase 1: Understand the decision
```
▶ Phase 1: Understanding the decision space...
```
1. Read relevant context: DISCOVERY.md, CONSTRAINTS.md, TECH_STACK.md, SRS.md
2. Identify the constraints that narrow the options:
   - Team size and experience (from CONSTRAINTS or DISCOVERY)
   - Timeline pressure
   - Scale requirements
   - Existing infrastructure
   - Compliance requirements

### Phase 2: Generate 3 options
```
▶ Phase 2: Generating alternatives...
```

Always produce exactly 3 options:

**Option A: Minimal / Fastest Path**
- Least code, least risk, ships soonest
- Uses existing infrastructure as much as possible
- Trade-off: may accumulate tech debt, may not scale

**Option B: Clean Architecture / Best Practice**
- Follows industry best practices and patterns
- Most maintainable long-term
- Trade-off: takes longer, may over-engineer for current scale

**Option C: Pragmatic Balance**
- Best fit for THIS team, THIS timeline, THIS scale
- Borrows from A and B based on the specific constraints
- Trade-off: requires judgment calls that may need revisiting

### Phase 3: Compare on 6 dimensions
```
▶ Phase 3: Comparing trade-offs...
```

| Dimension | Option A | Option B | Option C |
|-----------|----------|----------|----------|
| **Time to implement** | fastest | slowest | medium |
| **Maintainability** | low | high | medium |
| **Scalability** | limited | excellent | good enough |
| **Team fit** | easy to learn | may need training | matches current skills |
| **Risk** | tech debt accumulates | over-engineering risk | balanced |
| **Reversibility** | easy to change later | hard (deep patterns) | moderate |

### Phase 4: Recommend with reasoning
```
▶ Phase 4: Writing recommendation...
```

Write `docs/DESIGN_OPTIONS_[topic].md`:

```markdown
# Design Options: [topic]

## Context
[2-3 sentences: what decision we're making and why it matters]

## Constraints (from DISCOVERY.md / CONSTRAINTS.md)
- Team: [size, experience]
- Timeline: [deadline, pressure]
- Scale: [current and projected]

## Option A: [name] — Minimal Path
[3-5 sentences: what it is, how it works]
**Pros:** [bullet list]
**Cons:** [bullet list]
**Best when:** [scenario where this is the right choice]

## Option B: [name] — Clean Architecture
[same structure]

## Option C: [name] — Pragmatic Balance
[same structure]

## Comparison Matrix
[the 6-dimension table from Phase 3]

## Recommendation
**I recommend Option [X]** because:
1. [Reason tied to a specific constraint from DISCOVERY.md]
2. [Reason tied to team or timeline]
3. [Reason tied to technical trade-off]

**What we'd change if:** [condition] → switch to Option [Y]

## Decision Record
When the user picks an option, write it to docs/DECISION_LOG.md:
  - Decision: [what was chosen]
  - Date: [date]
  - Context: [why this decision was made]
  - Alternatives considered: [A, B, C with one-line summaries]
  - Consequences: [what this commits us to]
```

### Integration with SDLC

The sdlc-lead should invoke `/design-options` during:
- **Phase 3 (Design):** Before writing ARCHITECTURE.md — generate options for the overall architecture
- **Mode 3 Step 2 (Feature Design):** Before committing to an implementation approach
- **Any time** a user asks "how should we..." or "what's the best way to..."

**Rules:**
- Always 3 options — not 2 (too binary) and not 4+ (analysis paralysis)
- Option C is never "just do both" — it's a specific blend with clear trade-offs
- Every recommendation ties back to a specific constraint, not general best practice
- If Context7 MCP is available, verify framework/library recommendations against latest docs
- Write the options doc BEFORE any implementation starts — this is a decision gate
