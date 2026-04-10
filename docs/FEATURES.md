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

Every agent lives in `agents/<name>.md`. They all share a common shape: frontmatter (description, tools, model), "how you think" section, micro-step execution, phase-by-phase workflow, confidence gate-loop, reader-simulation pass, and a verifier-isolation clause.

### `sdlc-lead` — Program manager & lead architect
Orchestrates the full software development lifecycle across 3 operating modes:

- **Mode 1 (`init`)** — new project from scratch, Phase 0 → Phase 5 with discovery interview first
- **Mode 2 (`onboard`)** — understand an existing unfamiliar codebase, produce HLA + sequence diagrams + onboarding docs
- **Mode 3 (`feature`)** — add a feature to an existing project, discovery interview → design → implement → verify

Delegates to every other expert at the appropriate phase. Enforces confidence-based gates (asymmetric < 5 fail, 5-6 revise max 3x, ≥ 7 pass) at every phase boundary plus an Inter-Phase Check-In protocol that prevents auto-advance.

### `git-expert` — Git & forge operations
Six modes for the full git lifecycle:

- **`--init`** — bootstrap a new repo (`git init`, language-aware `.gitignore`, remotes, hooks, branch protection proposal)
- **`--feature`** — daily flow (branch creation, atomic commit splitting, conventional commits, draft PR on Gitea + GitHub)
- **`--release`** — cut a release (semver bump from commit log, Keep-a-Changelog entry, signed tag, GitHub + Gitea releases)
- **`--recover`** — reflog-based rescue of lost work (bad reset, rebase, detached HEAD, deleted branch, force-push overwrite)
- **`--inspect`** — history forensics (log presets, blame with rename tracking, pickaxe, bisect, divergence)
- **`--sync`** — multi-remote maintenance (fetch all + prune, clean gone branches, mirror Gitea → GitHub)

Never force-pushes protected branches, never `--no-verify`, scans staged files for secrets before every commit, saves reflog backup before destructive ops.

### `security-auditor` — Security assessments
OWASP Top 10 coverage, threat modeling, Semgrep deep scans (community rules, framework auto-detect, two-tier), dependency audits. Produces skeleton-first security reports with verbatim code quotes and concrete exploitation walkthroughs.

### `code-reviewer` — Code health review
Four modes:

- **`--review`** — 7-dimension code health pass (Complexity, Duplication/DRY, Error Handling, Type Safety, Pattern Consistency, Naming, Comment Accuracy) with Health Dashboard + verdict
- **`--debt`** — leverage-sorted tech-debt catalog (`blocked_work × priority / cost_to_fix`)
- **`--consolidate`** — DRY + error-handling consolidation proposals using the Consolidation Catalog (central error boundary, Result types, middleware, custom error classes, decorators, defer/finally)
- **`--patterns`** — cross-codebase pattern drift audit (systemic drift only, confidence ≥ 85)

Hunts silent failures — every `try`/`catch` is a suspect.

### `ux-engineer` — UX design & accessibility
Three modes:

- **`--design`** — new component or workflow design with Nielsen Norman heuristics, WCAG 2.2 AA baseline, keyboard + screen reader considerations
- **`--review`** — heuristic review of existing UX, hierarchy/consistency/error prevention checks
- **`--audit`** — full WCAG accessibility audit with live-environment methodology (real browser, real assistive tech)

### `researcher` — Professional research analyst
Structured investigation, source evaluation (credibility + recency + bias), competitive analysis, technology comparison. Writes research reports to `docs/research/`.

### `test-engineer` — Test strategy & implementation
Playwright e2e, vitest/jest unit tests, integration tests, test strategy, coverage analysis. Modes: `--strategy`, `--unit`, `--e2e`, `--coverage`.

### `performance-engineer` — Performance profiling
Profile first, optimize second. Establishes baselines, identifies bottlenecks via flame graphs + tracing, measures impact. Never optimizes without measurement. Modes: `--profile`, `--benchmark`, `--optimize`.

### `db-architect` — Database design
Schema design, migrations, query optimization, indexing strategy, ORM models. Modes: `--design`, `--migrate`, `--tune`, `--review`.

### `api-designer` — API design
REST + GraphQL, contracts, versioning, documentation, pagination, error shapes. Modes: `--design`, `--review`, `--version`, `--document`.

### `container-ops` — Container operations
Podman/Docker, Dockerfiles, compose, networking, debugging, image optimization. Modes: `--build`, `--compose`, `--debug`, `--optimize`.

### `sre-engineer` — Site reliability
CI/CD pipelines, monitoring, incident response, runbooks, deployment strategies. Modes: `--cicd`, `--monitor`, `--runbook`, `--incident`.

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
