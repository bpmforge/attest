# Features

This document describes what every agent, skill, reference document, and tool in this repo is for. Use it as a catalog — if you want to know *how* to use them, see [USERGUIDE.md](USERGUIDE.md) instead.

## Table of contents

- [Agents (12)](#agents)
- [Skills (15)](#skills)
- [Reference documents (11)](#reference-documents)
- [Custom tools (18)](#custom-tools)
- [Commands (4)](#commands)
- [Hooks](#hooks)

---

## Agents

Every agent lives in `agents/<name>.md`. All agents share: frontmatter (`description`, `mode`), "how you think" section, progress announcements, micro-step execution, phase-by-phase workflow, orchestrator + `--phase` sub-task mode, confidence gate-loop, reader-simulation pass, and verifier-isolation clause.

### Multi-agent execution model

All long-running agents support two execution modes that prevent timeouts and silent hangs:

- **Orchestrator mode (default)** — agent announces its phase plan upfront, then spawns one `task(agent=self, prompt="--phase: N name ...")` sub-task per phase. Each sub-task writes findings to `docs/work/<agent>/<slug>/phaseN.md` and returns in under 90 s. The orchestrator prints `✓ Phase N: [finding]` after each returns. Total work is visible as a sequence of fast completions.
- **`--phase: N name` mode** — runs exactly one named phase, reads the previous phase's output file as context, writes its own output file, returns a one-line summary. No sub-spawning. Used by the orchestrator to parallelise sequential work.

Progress is shown in the `task` tool label in real time: `task: db-architect — 45s — ✓ Phase 2 complete: PostgreSQL best practices identified`.

### `sdlc-lead` — Program manager & lead architect (`mode: primary`)

Orchestrates the full SDLC across 3 operating modes. Delegates every technical task to specialist agents via `task()` with explicit timeouts — never does technical work itself.

- **Mode 1 (`/sdlc init`)** — new project from scratch, Phases 0–5. Discovery interview → competitive research → planning → requirements → design → implementation → review. Git checkpoints after every phase — nothing advances uncommitted.
- **Mode 2 (`/sdlc onboard`)** — understand an existing codebase. Starts with `git-expert --inspect` (hot files, history). Detects UI-bearing status. Produces full architecture + onboarding docs. Calls `ux-engineer --audit` if UI-bearing. Commits all docs at end.
- **Mode 3 (`/sdlc feature`)** — add a feature. Discovery interview → impact analysis → design (calls `ux-engineer --review` for UI features) → implement (branch-first, UX review before PR) → verify → document (updates `UX_SPEC.md`, commits docs).

Enforces confidence-based gates (asymmetric: < 5 fail, 5–6 revise max 3×, ≥ 7 pass) and Inter-Phase Check-In protocol at every phase boundary.

### `git-expert` — Git & forge operations (`mode: subagent`)

Called by `sdlc-lead` at every phase boundary to commit docs, create branches, cut releases, and inspect history. Six modes:

- **`--init`** — bootstrap repo, `.gitignore`, remotes, hooks, branch protection
- **`--feature`** — branch creation, atomic commits, conventional-commit messages, draft PR on Gitea + GitHub
- **`--release`** — semver bump, Keep-a-Changelog, signed tag, GitHub + Gitea releases
- **`--recover`** — reflog-based rescue (bad reset, detached HEAD, deleted branch)
- **`--inspect`** — history forensics (blame, pickaxe, bisect, hot-file detection)
- **`--sync`** — multi-remote prune + mirror

Never force-pushes protected branches, never `--no-verify`, scans for secrets before every commit.

### `researcher` — Professional research analyst (`mode: subagent`)

Three execution modes:

- **Orchestrator (default)** — breaks multi-question tasks into sub-tasks, announces plan, spawns `--single` per question, reports each finding as it returns
- **`--single: <question>`** — researches exactly one question (30–60 s), appends finding to output file, no sub-spawning
- **`--plan: <topic>`** — returns a numbered question list only, no searching

### `security-auditor` — Security assessments (`mode: subagent`)

OWASP Top 10, threat modeling, Semgrep scans, dependency audits. Runs as 4-phase orchestrator: understand → automated scan → OWASP + STRIDE manual → verify + report.

### `code-reviewer` — Code health review (`mode: subagent`)

Four user modes (`--review`, `--debt`, `--consolidate`, `--patterns`), executed as 4-phase orchestrator internally: understand → tooling → review passes → report.

### `ux-engineer` — UX design & accessibility (`mode: subagent`)

- **`--design`** — greenfield component/workflow design, WCAG 2.2 AA, style guide, UX spec
- **`--review`** — heuristic review of existing UI, called by `sdlc-lead` after code review on UI features
- **`--audit`** — WCAG accessibility audit, called by `sdlc-lead` in Mode 2 (if UI-bearing) and Mode 3 verify

### `test-engineer` — Test strategy & implementation (`mode: subagent`)

Runs as 6-phase orchestrator: understand → research → plan → write tests → verify → report. Modes: `--strategy`, `--unit`, `--e2e`, `--coverage`.

### `performance-engineer` — Performance profiling (`mode: subagent`)

Profile first, optimize second. 6-phase orchestrator: understand → profile → identify hotspot → fix → verify → document. Never optimizes without measurement.

### `db-architect` — Database design (`mode: subagent`)

6-phase orchestrator: understand data → research → plan → design + implement → verify → report. Modes: `--design`, `--migrate`, `--tune`, `--review`.

### `api-designer` — API design (`mode: subagent`)

6-phase orchestrator: understand → research → design → document → verify → write docs. REST + GraphQL, contracts, versioning, pagination, error shapes.

### `container-ops` — Container operations (`mode: subagent`)

6-phase orchestrator: understand → research → plan → execute → verify → report. Podman/Docker, Dockerfiles, compose, networking, image optimization.

### `sre-engineer` — Site reliability (`mode: subagent`)

6-phase orchestrator: understand → research → plan → execute → verify → report. CI/CD pipelines, monitoring, incident response, runbooks.

---

## Skills

Skills are thin triggers that live in `skills/<name>/SKILL.md`. Each skill maps to an agent and accepts mode flags. Users invoke skills with `/skill-name [flags]`.

| Skill | Agent | Purpose |
|---|---|---|
| `/sdlc` | `sdlc-lead` | Full SDLC workflow (init / onboard / feature) |
| `/git-expert` | `git-expert` | Git lifecycle (init / feature / release / recover / inspect / sync) |
| `/security` | `security-auditor` | OWASP audit, threat model, Semgrep scan |
| `/review-code` | `code-reviewer` | Code health review (review / debt / consolidate / patterns) |
| `/research` | `researcher` | Deep research with source evaluation |
| `/test-expert` | `test-engineer` | Test strategy, unit/e2e tests, coverage |
| `/perf` | `performance-engineer` | Profile, benchmark, optimize |
| `/dba` | `db-architect` | Schema, migrations, query tuning |
| `/ux` | `ux-engineer` | UX design, heuristic review, accessibility audit |
| `/api-design` | `api-designer` | REST/GraphQL design and review |
| `/containers` | `container-ops` | Build, compose, debug, optimize images |
| `/devops` | `sre-engineer` | CI/CD, monitoring, runbooks, incident response |
| `/gate` | `sdlc-lead` | Gate check / approve / bypass for SDLC phases |
| `/review` | `code-reviewer` + `security-auditor` | Generic review meta-skill |
| `/simplify` | `code-reviewer` | Simplification-focused pass |

---

## Reference documents

Canonical checklists and templates agents read at runtime. Each is plain markdown in `references/`.

| Reference | Used by | Purpose |
|---|---|---|
| `git-workflow-checklist.md` | `git-expert` | Conventional commits, SemVer, Keep-a-Changelog, recovery scenarios, report templates |
| `code-health-checklist.md` | `code-reviewer` | 7 dimensions, silent-failure hunter, consolidation catalog, language thresholds |
| `owasp-checklist.md` | `security-auditor` | OWASP Top 10 + verification steps |
| `semgrep-guide.md` | `security-auditor` | Semgrep setup, rule packs, two-tier scans |
| `semgrep-community-rules.md` | `security-auditor` | Community rule inventory |
| `severity-matrix.md` | `security-auditor`, `code-reviewer` | Severity scoring rubric |
| `rest-api-checklist.md` | `api-designer` | REST conventions, pagination, errors |
| `design-review-checklist.md` | `ux-engineer` | Heuristics + WCAG 2.2 baseline |
| `playwright-config.md` | `test-engineer` | Playwright setup patterns |
| `engineering-artifacts.md` | `sdlc-lead` | SDLC phase deliverables per phase |
| `report-template.md` | all agents | Common report header + confidence footer |
| `context7-mcp.md` | all agents | Live library docs via Context7 MCP |

---

## Custom tools

Custom TypeScript tools in `tools/`. OpenCode loads these at startup.

| Tool | Purpose |
|---|---|
| `bash.ts` | Bounded bash execution with timeout + output capture |
| `grep-mcp.ts` | ripgrep wrapper with structured results |
| `write.ts` / `append.ts` / `update.ts` | File write primitives |
| `file-info.ts` | Stat + size + mime detection |
| `task.ts` | Spawn sub-agent tasks |
| `test-runner.ts` | Language-aware test runner dispatch |
| `playwright-test.ts` / `playwright-web.ts` | Playwright harnesses |
| `semgrep-scan.ts` / `semgrep-rule.ts` | Semgrep scanning + custom rule authoring |
| `simplify-file.ts` | Simplification-focused rewrite |
| `pomodoro.ts` | Work-timer helper |
| `run.ts` | Generic script runner |
| `log-parser.ts` | Structured log parsing |
| `loop-detector.ts` | Detects infinite-loop patterns in agent output |
| `deploy.ts` | Deploy helper |

See `tools/CUSTOM_TOOLS_GUIDE.md` for authoring a new tool.

---

## Commands

Slash command definitions in `commands/` — subcommands of `/sdlc`:

| Command | Purpose |
|---|---|
| `sdlc-init.md` | `/sdlc init <name> "<desc>"` — start a new project |
| `sdlc-onboard.md` | `/sdlc onboard` — understand an existing codebase |
| `sdlc-feature.md` | `/sdlc feature <name>` — add a feature to existing project |
| `sdlc-status.md` | `/sdlc status` — show current phase + gate state |

---

## Hooks

Event hooks in `hooks/` run on session lifecycle events. Receive JSON on stdin; exit 2 to block an operation.

See [EXPERT_GUIDE.md](EXPERT_GUIDE.md) for the full hook catalog.
