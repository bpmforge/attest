# Features

This document describes what every agent, skill, reference document, and tool in this repo is for. Use it as a catalog — if you want to know *how* to use them, see [USERGUIDE.md](USERGUIDE.md) instead.

## Table of contents

- [Agents (14)](#agents)
- [Skills (20)](#skills)
- [Reference documents (11)](#reference-documents)
- [Custom tools (18)](#custom-tools)
- [Commands (4)](#commands)
- [Hooks](#hooks)

---

## Agents

Every agent lives in `agents/<name>.md`. All agents share: frontmatter (`description`, `mode: primary`), "how you think" section, progress announcements, micro-step execution, phase-by-phase workflow, orchestrator + `--phase` sub-task mode, confidence gate-loop, reader-simulation pass, and verifier-isolation clause.

### Multi-agent execution model

All long-running agents support two execution modes that prevent timeouts and silent hangs:

- **Orchestrator mode (default)** — agent announces its phase plan upfront, then spawns one `task(agent=self, prompt="--phase: N name ...")` sub-task per phase. Each sub-task writes findings to `docs/work/<agent>/<slug>/phaseN.md` and returns in under 90 s. The orchestrator prints `✓ Phase N: [finding]` after each returns. Total work is visible as a sequence of fast completions.
- **`--phase: N name` mode** — runs exactly one named phase, reads the previous phase's output file as context, writes its own output file, returns a one-line summary. No sub-spawning. Used by the orchestrator to parallelise sequential work.

Progress is shown in the `task` tool label in real time: `task: db-architect — 45s — ✓ Phase 2 complete: PostgreSQL best practices identified`.

### `sdlc-lead` — Program manager & lead architect (`mode: primary`)

Orchestrates the full SDLC across 4 operating modes. Delegates every technical task to specialist agents — never does technical work itself. Enforces strict git branching discipline: `main` = production, every mode starts with a typed branch and ends with a PR.

- **Mode 1 (`/sdlc init`)** — new project from scratch, Phases 0–5. Discovery interview → competitive research → planning → requirements → design → implementation → review. Phases 0–3 docs commit to `sdlc/setup` branch; merged to `main` via PR before Phase 4. Feature branches cut from updated `main`.
- **Mode 2 (`/sdlc onboard`)** — understand an existing codebase. Creates `docs/onboard` branch. Starts with `git-expert --inspect` (hot files, history). Detects UI-bearing status. Produces full architecture + onboarding docs. Commits via PR to `main`.
- **Mode 3 (`/sdlc feature`)** — add a feature. Discovery interview → impact analysis → design → implement on `feat/[slug]` branch → verify → document → squash merge to `main` via PR.
- **Mode 4 (`/sdlc improve`)** — audit and improve an existing system. Discovery interview determines which dimensions to audit. Runs specialist audits (UX, code quality, performance, security, DB). Synthesizes findings into a prioritized S/M/L backlog. Executes approved items on `improve/[slug]` branch. PR at end. Optional focus: `"ux"`, `"performance"`, `"security"`, `"code-quality"`.

Phase 3 (Design) produces both `docs/API_DESIGN.md` (human-readable narrative) and `docs/api/openapi.yaml` (validated OpenAPI 3.0 spec). The spec is a gate requirement — Phase 3 cannot pass until it exists and passes `swagger-cli validate` with 0 errors.

Enforces confidence-based gates (asymmetric: < 5 fail, 5–6 revise max 3×, ≥ 7 pass) and Inter-Phase Check-In protocol at every phase boundary.

### `coding-agent` — Doc-driven implementation engineer (`mode: primary`)

Implements code from SDLC design documents. Called by `sdlc-lead` via HANDOFF for all implementation work — never invents features, never introduces unlisted tech, never writes from API training-data assumptions.

**Four Laws (enforced before writing any code):**
1. **Read the design docs first** — ARCHITECTURE.md, SRS.md, DATABASE.md, API_DESIGN.md, IMPROVEMENT_*_DESIGN.md are the spec. Nothing gets built that isn't in the spec.
2. **Verify every library API via Context7** — calls `resolve-library-id` + `get-library-docs` for every external library before use. If Context7 is unavailable, checks `node_modules/` source directly.
3. **Match existing patterns** — reads 2–3 existing files in the target directory first; matches their structure, naming, imports, and error-handling style.
4. **Follow TECH_STACK.md** — reads `docs/TECH_STACK.md` in Phase 1. All library/framework choices must match. Flags deviations in the Completion Manifest rather than silently adopting new tech.

**Anti-slop rules (enforced on every file):**
- No try-catch outside system boundaries (user input, external APIs, file I/O)
- No abstractions with fewer than 2 real implementations
- No single-use helper functions (inline them)
- No what-comments (only why, only when non-obvious)
- No unused imports, no scope creep, no speculative generalization
- Trust the framework — don't re-implement what it provides

**6-phase execution:** Read design docs → Verify APIs via Context7 → Implement → Test → Self-audit → Report

**Produces:** Implementation files + `VERIFY_ITEM_[n].md` Completion Manifest (files produced, API verifications, tech stack compliance, anti-slop audit result, test result, deferred items)

**Distinct from:** `code-reviewer` (audits after implementation), `test-engineer` (test strategy), `sre-engineer` (CI/CD and ops — NOT application code)

---

### `git-expert` — Git & forge operations (`mode: primary`)

Called by `sdlc-lead` at every phase boundary to commit docs, create branches, cut releases, and inspect history. Six modes:

- **`--init`** — bootstrap repo, `.gitignore`, remotes, hooks, branch protection
- **`--feature`** — branch creation, atomic commits, conventional-commit messages, draft PR on Gitea + GitHub
- **`--release`** — semver bump, Keep-a-Changelog, signed tag, GitHub + Gitea releases
- **`--recover`** — reflog-based rescue (bad reset, detached HEAD, deleted branch)
- **`--inspect`** — history forensics (blame, pickaxe, bisect, hot-file detection)
- **`--sync`** — multi-remote prune + mirror

Never force-pushes protected branches, never `--no-verify`, scans for secrets before every commit.

### `researcher` — Professional research analyst (`mode: primary`)

Three execution modes:

- **Orchestrator (default)** — breaks multi-question tasks into sub-tasks, announces plan, spawns `--single` per question, reports each finding as it returns
- **`--single: <question>`** — researches exactly one question (30–60 s), appends finding to output file, no sub-spawning
- **`--plan: <topic>`** — returns a numbered question list only, no searching

### `security-auditor` — Security assessments (`mode: primary`)

OWASP Top 10, threat modeling, Semgrep scans, dependency audits. Runs as 5-phase orchestrator: understand → automated scan → OWASP + STRIDE manual → verify → **attack chain analysis** → report.

- **Phase 5b: Attack Chain Analysis** — After all individual findings are verified, runs a second-order pass that builds a pre-condition/post-condition inventory of every real finding, then tests pairs and triples for exploitable multi-step chains. Each discovered chain (e.g., "Info Disclosure → Credential Reuse → Admin Takeover") gets a `C-N` finding entry in the final report with step-by-step attack narrative, a severity bump rule (often higher than any individual link), and a single "break the chain" remediation priority. Tests 9 classic chain patterns: recon→targeted attack, auth bypass→privilege escalation, XSS→session hijack, SSRF→internal pivot, path traversal→credential theft, misconfiguration→enumeration, weak crypto→forgery, race condition+business logic, CVE+reachability.
- **Custom gap-filler rules** (98 rules, 6 languages) installed to user's personal store at `~/.config/opencode/.semgrep/` — C#, Kotlin, Swift, Rust, PHP, and C++ bridge rules loaded automatically per detected language.
- **Offline scanning** — `--offline` flag uses cached registry packs at `~/.semgrep/registry-cache/`. Pre-populate with `scripts/cache-registry-packs.sh`.
- **Community rules** cached at `~/.semgrep/rules/{trailofbits,elttam,gitlab,0xdea}`. Install with `scripts/update-semgrep-rules.sh`.

### `code-reviewer` — Code health review (`mode: primary`)

Four user modes (`--review`, `--debt`, `--consolidate`, `--patterns`), executed as 4-phase orchestrator internally: understand → tooling → review passes → report.

### `ux-engineer` — UX design & accessibility (`mode: primary`)

- **`--design`** — greenfield component/workflow design, WCAG 2.2 AA, style guide, UX spec
- **`--review`** — heuristic review of existing UI, called by `sdlc-lead` after code review on UI features
- **`--audit`** — WCAG accessibility audit, called by `sdlc-lead` in Mode 2 (if UI-bearing) and Mode 3 verify

### `test-engineer` — Test strategy & implementation (`mode: primary`)

Runs as 6-phase orchestrator: understand → research → plan → write tests → verify → report. Modes: `--strategy`, `--unit`, `--e2e`, `--coverage`.

### `performance-engineer` — Performance profiling (`mode: primary`)

Profile first, optimize second. 7-phase orchestrator: understand → **static analysis** → profile → identify hotspot → fix → verify → document. Never optimizes without measurement.

Key capabilities added in v0.7.0:

- **`PERF_TRACKER.md`** — persistent session tracker written at Phase 1, updated after every phase. Survives context loss and session restarts. Stored at `docs/performance/PERF_TRACKER.md`. Tracks: progress summary (7 rows with status/confidence), baseline metrics, static analysis findings, profiler results, hotspot log, before/after benchmark table.

- **Phase 1b — Static Analysis Pass** — runs before any profiler. Five grep scans across all source files detect performance anti-patterns without executing code. Scans:
  1. **O(n²) nested loops** — `.find()` / `.filter()` inside `for` / `forEach`
  2. **N+1 query patterns** — DB/fetch call inside a loop
  3. **try/catch performance anti-patterns** — four language-specific patterns:
     - A: `try/catch` inside tight loop → V8 de-optimization (5-20x slowdown in Node.js)
     - B: Exception-driven control flow in hot paths → 100-1000× vs a guard check
     - C: Individual `try/catch` per `await` → prevents `Promise.allSettled` parallelism
     - D: Re-throw after logging → double stack capture cost
     - Python: EAFP misuse in hot loops → use `.get()` / guard check
     - Go: `errors.New()` in hot loop → sentinel error allocated once at init
     - Rust: `unwrap()` panic path in hot loop → `filter_map` / `.ok()`
  4. **Blocking I/O in async paths** — `readFileSync`, `execSync`, etc. inside request handlers
  5. **Hot-path allocations** — `JSON.parse`, object spread, string concat inside tight loops

- **Coverage confidence loop** — after all 5 scans, the agent cross-checks its grep coverage against a `find`-generated source file list, answers a 9-question checklist, and rates coverage 1-10. Re-passes if < 7 (max 3 attempts); surfaces `⚠️ BLOCKED` to user if still < 7.

- **Verbatim code mandate** — every finding requires a `read(filePath=..., offset=..., limit=...)` call before it's recorded. Findings from grep output alone are prohibited. Each finding's "Verbatim code" block shows the exact lines from `read()`.

- **Full report template (Phase 6)** — `docs/PERFORMANCE_REPORT.md` follows a mandatory template with: executive summary, baseline measurements table, one `STATIC-NNN` block per finding (verbatim code + loop bound + specific impact + concrete fix + profiler confirmation status), profiler results table, fix before/after verbatim code, final benchmark (P50/P95 before and after), regression check table, remaining bottlenecks backlog (with S/M/L effort + P0/P1/P2 priority), data size thresholds, coverage verdict, and handoffs recommended.

- **Confidence gate reads from tracker file** — gate prints a 7-row table derived from `PERF_TRACKER.md`, not from context memory. Phase 5 (verify-fix) uses a raised threshold of 8/10 — a fix without before/after numbers is not verified.

### `db-architect` — Database design (`mode: primary`)

6-phase orchestrator: understand data → research → plan → design + implement → verify → report. Modes: `--design`, `--migrate`, `--tune`, `--review`.

### `api-designer` — API design (`mode: primary`)

6-phase orchestrator: understand → research → design → document → verify → write docs. REST + GraphQL, contracts, versioning, pagination, error shapes.

### `container-ops` — Container operations (`mode: primary`)

6-phase orchestrator: understand → research → plan → execute → verify → report. Podman/Docker, Dockerfiles, compose, networking, image optimization.

### `sre-engineer` — Site reliability (`mode: primary`)

6-phase orchestrator: understand → research → plan → execute → verify → report. CI/CD pipelines, monitoring, incident response, runbooks.

### `frontend-design` — Frontend design engineer (`mode: primary`)

Bridges UX specification and production UI. Turns design tokens and component specs into code that looks intentional — not AI-generated. Three modes:

- **`--implement`** — turns `UX_SPEC.md` + `STYLE_GUIDE.md` into production components
- **`--polish`** — takes existing UI and elevates typography, color, spacing, motion
- **`--system`** — creates or refactors a design token system (colors, typography, spacing, shadows)

Distinct from `ux-engineer`: UX handles usability, workflows, and accessibility; this agent handles visual polish and implementation. Called by `sdlc-lead` in Phase 3 (after UX spec is approved) and Mode 4 (`/sdlc improve "frontend"`).

---

## Skills

Skills are thin triggers that live in `skills/<name>/SKILL.md`. Each skill maps to an agent and accepts mode flags. Users invoke skills with `/skill-name [flags]`.

| Skill | Agent | Purpose |
|---|---|---|
| `/sdlc` | `sdlc-lead` | Full SDLC workflow (init / onboard / feature) |
| `/code` | `coding-agent` | Implement from SDLC design docs — API verification, anti-slop enforcement, tech stack compliance |
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
| `/simplify` | `code-reviewer` | Simplification-focused pass on recent changes |
| `/explore` | `sdlc-lead` (inline) | Codebase archaeology — trace a feature end-to-end, map blast radius |
| `/design-options` | `sdlc-lead` (inline) | Generate 2-3 architecture alternatives with trade-offs before committing |
| `/frontend` | `frontend-design` | Visual polish, design tokens, typography, color, spacing, motion |
| `/steward` | `sdlc-lead` (inline) | Audit CLAUDE.md / AGENTS.md alignment, capture session learnings |

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
