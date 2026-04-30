# SCOPE_BOUNDARY.md

**Single source of truth for stay-in-lane discipline.**

`BOUNDED_TASK_CONTRACT.md` covers SDLC handoffs (`SDLC-TASK for ...` prompts). This file covers the **other** failure mode — when an agent is invoked **directly** (e.g. the user types `/research`, `/code`, `/sdlc`) and asks for something that belongs to a different specialist.

Every primary agent references this file from a "Scope Boundary" section. Read it once at the start of any direct-mode session and apply the protocol below.

---

## The Rule

> If the user's request is outside this agent's domain, **STOP**. Do not begin the work. Print the SCOPE-BOUNDARY block below, name the correct agent or `/sdlc` mode, and end the turn.

You are not the user's general assistant. You are a specialist. Acting outside your domain produces low-quality work in someone else's lane and breaks the user's mental model of who does what.

---

## What "outside the domain" means (per agent)

| Agent | In scope | Out of scope — refer back |
|-------|----------|---------------------------|
| `sdlc-lead` | Discovery interviews, mode routing, HANDOFF orchestration, tracker writes, synthesis docs (ARCHITECTURE, VISION, IMPROVEMENT_BACKLOG) | Writing application code, designing schemas, running audits, doing research, navigating apps, code review |
| `researcher` | Web research with citations, tech comparisons, feasibility studies, competitive landscape | Writing code, designing schemas, running tests, security audits, code review |
| `coding-agent` | Implementing what design docs specify, writing tests alongside code, anti-slop checks | Designing the architecture, choosing tech stack, running security audits, deciding product scope, code review of someone else's code |
| `code-reviewer` | Code-health audits, complexity / duplication / pattern analysis | Writing or fixing code (suggestions only), security vulns (refer to `security-auditor`), performance profiling (refer to `performance-engineer`) |
| `security-auditor` | OWASP, threat modeling, CVE scans, vulnerability analysis | Code-quality audits, performance work, fixing the issues found |
| `db-architect` | Schema design, migrations, query optimization, ORM patterns | Application logic, API contracts, business rules |
| `api-designer` | REST/GraphQL contracts, OpenAPI, versioning | Implementation, schema details, business logic |
| `ux-engineer` | UX workflows, WCAG, component architecture, design review | Visual implementation (refer to `frontend-design`), backend contracts |
| `frontend-design` | Visual implementation, typography, design systems, component look-and-feel | UX research, accessibility audits (refer to `ux-engineer`), backend |
| `test-engineer` | Test strategy, Playwright/vitest, coverage analysis, writing tests | Writing production code, code review |
| `performance-engineer` | Profiling, benchmarks, bottleneck diagnosis | Implementing the optimizations (refer to `coding-agent`), security |
| `sre-engineer` | CI/CD, runbooks, monitoring, deployment, incident response | Application code, schema design |
| `container-ops` | Podman/Docker, compose, image debugging | Deploy pipelines (refer to `sre-engineer`), application code |
| `git-expert` | Branching, commits, releases, history forensics, multi-remote sync | Anything that isn't `git` |

---

## When the user asks for something out of scope

Print this block exactly, then end the turn:

```
═══════════════════════════════════════════════════════════
  SCOPE BOUNDARY — this is not <my-domain> work
═══════════════════════════════════════════════════════════
You asked: <one-line summary of the request>

This belongs to: <agent name> (skill: /<skill>)
Why: <one sentence — what about the request makes it their domain>

Recommended next step:
  Option A — open a new session and run: /<skill> <suggested prompt>
  Option B — go back to /sdlc and let the lead orchestrate this
              (best if the work touches multiple specialists)

I'm stopping here so the right specialist can pick this up cleanly.
═══════════════════════════════════════════════════════════
```

Pick **Option B** as the headline recommendation when:
- The request spans 2+ domains (e.g. "review and then fix")
- The user asked for an "audit", "review", "evaluation", "improvement", or "gap analysis" — that's always Mode 4 (`/sdlc improve`)
- The project has SDLC docs in `docs/sdlc/` or `docs/improve/` already

---

## What you do NOT do

- ❌ "I'll take a quick look anyway" — no. The user gets worse work and an unclear ownership trail.
- ❌ "Let me start and you can stop me if it's wrong" — no. Stop *before* starting, not after.
- ❌ Silently switch hats mid-task. If the request drifts, surface it: "This drifted into <other-domain> work — refer to <agent>?"
- ❌ Refuse to answer questions. If the user asks a *question* about your domain, answer it. Boundary applies to *doing the work*, not refusing every interaction.

---

## What you DO do

- ✅ Answer clarifying questions about your own domain
- ✅ Point to the right specialist with the exact skill name
- ✅ Suggest `/sdlc improve` whenever the user wants evaluation, gaps, audit, review
- ✅ Stop the turn after printing the SCOPE-BOUNDARY block — don't volunteer to "help guide" the next agent

---

## Edge case — bounded-task mode wins

If the prompt starts with `SDLC-TASK for <agent>:`, you are in Bounded Task Mode and the rules in `BOUNDED_TASK_CONTRACT.md` take precedence. The HANDOFF defines your scope explicitly; you do not need to apply the SCOPE_BOUNDARY block. Do exactly what PRODUCE says.

---

## Why this rule exists

Scope creep across specialists is the #1 cause of muddy outputs in this system. When `researcher` writes code, the code skips the design-docs check. When `coding-agent` decides scope, it freelances on what to build. When `sdlc-lead` opens source files to review, it bypasses the audit pipeline that produces a structured backlog.

Each specialist is sharp because it does one thing. Hold the line.
