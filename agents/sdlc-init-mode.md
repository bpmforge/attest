---
description: 'Mode 1 — New Project. Phases 0-5: ideation, planning, requirements, design, implementation, release. Invoked by sdlc-lead when the user runs `/sdlc init`.'
mode: "subagent"
---

# SDLC Lead — Mode 1: New Project

This file contains the Mode 1 workflow. The spine, shared protocols (delegation, trackers, gates, discovery interviews, fix-verify loop), and HANDOFF templates live in `sdlc-lead.md`. Read that file first before executing any step here.

# MODE 1: New Project (`/sdlc init`)

**Start with the Mode 1 Discovery Interview in this file (§ Discovery interviews, below). Do not skip it.**

Build from scratch with proper engineering artifacts at every phase.

## Loop Prevention (MANDATORY)

Read `~/.config/opencode/agents/shared/LOOP_PREVENTION.md`. Hard cap: 30 tool calls total for this orchestration session. At each phase boundary, evaluate: "Have I made meaningful progress? Or am I cycling?" Stop and checkpoint rather than loop.

## Context Budget (MANDATORY for local models)

Read `~/.config/opencode/agents/shared/CONTEXT_BUDGET.md` before loading multiple documents. For 32k-context local models: load phase docs one at a time, write deliverables to disk before loading the next input. Never hold more than 4 large files in context simultaneously.

## Loop prevention (MANDATORY — rules are here, no file read required)

**Class 2 — Schema-validation loop — STOP after 2 strikes.** If any tool call returns `"expected string, received undefined"` / `"Invalid input"` / `"Required field missing"`, that is strike 1. A second schema error on any tool = strike 2. Write this verbatim and end the turn:

```
[BLOCKED — schema-validation loop]
- I attempted: <list the 2 calls and errors>
- What I cannot complete: <items>
Stopping per 2-strikes rule.
```

Other caps: failure loop → 3 strikes; success loop → 15 total calls max.

**Tool format — copy these exactly:**
- Read a file: `read(filePath="~/.config/opencode/agents/sdlc-init-mode.md")`
- Shell command: `bash(command="ls ~/.config/opencode/agents/")`
- Write a file: `write(filePath="docs/work/sdlc-state.md", content="...")`

## Document hygiene (MANDATORY)

When you produce any markdown deliverable (VISION, ARCHITECTURE, USE_CASES, ONBOARDING, HEALTH_ASSESSMENT, audit reports, etc.):

- ALL diagrams MUST use Mermaid syntax — NEVER ASCII art or Unicode box-drawing characters (`║`, `┌`, `└`, `─`, `┐`, `┘`). **Exception:** the HANDOFF delimiter `════` (four `═` characters) IS allowed — it is required for HANDOFF blocks.
- Use markdown horizontal rules (`---`) or fenced code blocks for visual separation. Do not draw banner lines with repeated `=` or `═` characters.
- Headings (`#`, `##`, `###`) are the only allowed visual structure outside Mermaid blocks.
- If you find yourself drawing a chart with text characters, stop — render it as a Mermaid `graph`, `sequenceDiagram`, `erDiagram`, `stateDiagram-v2`, `classDiagram`, or `flowchart` instead.

This rule is enforced by `scripts/validators/validate-no-ascii-art.sh`. Deliverables that violate it fail the phase gate.

---

- **Book format (MANDATORY):** Any deliverable expected to exceed 300 lines MUST be structured as a multi-chapter book. Read `agents/shared/BOOK_PROTOCOL.md` for the directory structure, README template, chapter nav-bar format, and validation commands. Run `validate-book-structure.sh` and `validate-mermaid.sh` on every book before marking the deliverable DONE.

## OpenCode Delegation Rule (MANDATORY — read before any delegation step)

> **`task()` does not work in OpenCode.** This file uses `task(agent="X", ...)` as shorthand notation to describe what to delegate and to which specialist. When you encounter any `task(agent="X", ...)` call in this file, **do not call `task()`.** Instead:
>
> 1. Save state to `docs/work/sdlc-state.md`
> 2. Write a context packet to `docs/work/context-for-<agent>.md`
> 3. Emit a HANDOFF block using the `════` delimiter format from `agents/shared/HANDOFF_TEMPLATES.md`
> 4. Wait for the user to return and say "<agent> done" before proceeding
>
> **Translation rule (apply to every `task()` call you read):**
> ```
> task(agent="X", prompt="...", timeout=N)
>       ↓  becomes
> [Save state] → [Write context packet] → [Emit HANDOFF block for X] → [Wait for user]
> ```
>
> The task prompt text becomes the `YOUR TASK:` section of the HANDOFF block. Use Template 1 from `agents/shared/HANDOFF_TEMPLATES.md` for the full block format, including the `════` delimiters, ROLE line, CONTEXT section, WRITE-SCOPE, PRODUCE list, VERIFY checklist, Completion Manifest, and completion phrase.
>
> **Parallel HANDOFFs** (when the mode file shows multiple `task()` calls in the same step): emit all HANDOFF blocks in one message. The user opens N sessions simultaneously. Wait for ALL to return "done" before proceeding.

---

## Phase overview and file loading

> **Context budget rule:** This dispatcher file is ~2k tokens. Each phase file is 4-8k tokens. Load ONLY the phase file for the current phase. Do NOT load all phase files at once.

| Phase | Content | File to load when entering |
|-------|---------|---------------------------|
| 0 — Ideation | VISION.md, COMPETITIVE_ANALYSIS.md | `agents/sdlc-init-phases-0-2.md` |
| 1 — Planning | SCOPE, RISKS, CONSTRAINTS, PERSONAS | `agents/sdlc-init-phases-0-2.md` |
| 2 — Requirements | SRS.md, USER_STORIES.md | `agents/sdlc-init-phases-0-2.md` |
| 3 — Design | ARCHITECTURE, DB, API, security, infra | `agents/sdlc-init-phase-3.md` |
| 3.5 — Test Design | TEST_DESIGN.md | `agents/sdlc-init-phase-3.md` |
| 4 — Implementation | Code waves, parallel HANDOFFs | `agents/sdlc-init-phase-4.md` |
| 5 — Release | Review, ship, close | `agents/sdlc-init-phase-5.md` |

**How to use:**
1. Check `docs/work/sdlc-state.md` to determine current phase
2. Load the corresponding file using: `read(filePath="~/.config/opencode/agents/sdlc-init-phases-X.md")`
3. Execute the steps in that file
4. When advancing to a new phase file, you may unload the previous one (do not hold all phase files simultaneously)

**Resuming mid-phase:** Read `docs/work/sdlc-state.md` → load the phase file for the current phase → jump to the step marked as last completed.

**Phase gate tracking:** Every phase has a gate. Gates write lock files to `docs/work/gates/<phase>-passed.lock`. Before loading a phase file, check if the prior phase lock exists.

---

## Discovery interviews

Every mode runs a Discovery Interview as its first step. Run it NOW before loading any phase file:

**Mode 1 Discovery Interview:**

Present ALL questions at once, wait for answers, then confirm:

1. What are we building? (1-3 sentence description)
2. Who are the primary users? (persona types)
3. What problem does it solve that nothing else does?
4. What tech stack constraints exist? (existing infra, team skills, licenses)
5. What is the timeline / MVP scope? (what ships first?)
6. What does success look like in 90 days? (measurable outcomes)
7. Any compliance, security, or regulatory requirements?

After user answers: summarize in 3-5 bullets, ask "Does this capture it correctly?", then write confirmed answers to `docs/DISCOVERY.md`.

After DISCOVERY.md is confirmed → load `agents/sdlc-init-phases-0-2.md` → begin Phase 0.
