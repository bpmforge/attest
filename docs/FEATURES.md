# Features

This document describes what every agent, skill, reference document, and tool in this repo is for. Use it as a catalog — if you want to know *how* to use them, see [USERGUIDE.md](USERGUIDE.md) instead.

## Table of contents

- [Agents (46)](#agents)
  - [Primary agents (16)](#primary-agents)
  - [Security micro-agents (9)](#security-micro-agents)
  - [Code-review micro-agents (7)](#code-review-micro-agents)
  - [Performance micro-agents (6)](#performance-micro-agents)
  - [SDLC onboard specialists (4)](#sdlc-onboard-specialists)
  - [SDLC mode agents](#sdlc-mode-agents)
- [Skills (20)](#skills)
- [Shared protocols (16)](#shared-protocols)
- [Memory & code-search MCPs](#memory--code-search-mcps)
- [Custom tools (18)](#custom-tools)
- [Commands (4)](#commands)
- [Hooks](#hooks)

---

## Agents

Every agent lives in `agents/<name>.md` or a subdirectory (`agents/security/`, `agents/code-review/`, `agents/performance/`, `agents/sdlc/onboard/`). All agents share: frontmatter, "how you think" section, progress announcements, micro-step execution, phase-by-phase workflow, orchestrator + `--phase` sub-task mode, confidence gate-loop, and verifier-isolation clause.

**Micro-agent pattern:** coordinator dispatches → each specialist writes its own output file → coordinator synthesizes. One agent = one job = one context window. Parallel waves use `PARALLEL_WAVE_PROTOCOL.md` (Round 1: code HANDOFFs, Round 2: review HANDOFFs, Round 3: runtime HANDOFFs).

**Execution modes (all long-running agents):**
- **Orchestrator mode (default)** — announces phase plan, spawns one `task(agent=self, prompt="--phase: N name ...")` per phase. Each sub-task writes findings to `docs/work/<agent>/<slug>/phaseN.md` and returns in under 90 s.
- **`--phase: N name` mode** — runs exactly one named phase, reads the previous phase output, writes its own. No sub-spawning. Used for parallelism.

---

### Primary agents

### `sdlc-lead` — Program manager & lead architect (`mode: primary`)

Orchestrates the full SDLC across 4 operating modes. Delegates every technical task to specialist agents — never does technical work itself. Enforces strict git branching discipline: `main` = production, every mode starts with a typed branch and ends with a PR.

- **Mode 1 (`/sdlc init`)** — new project from scratch, Phases 0–5. Discovery interview → competitive research → planning → requirements → design → implementation → review. Phases 0–3 docs commit to `sdlc/setup` branch; merged to `main` via PR before Phase 4. Feature branches cut from updated `main`.
- **Mode 2 (`/sdlc onboard`)** — understand an existing codebase. Creates `docs/onboard` branch. Starts with `git-expert --inspect` (hot files, history). Detects UI-bearing status. Produces full architecture + onboarding docs. Commits via PR to `main`.
- **Mode 3 (`/sdlc feature`)** — add a feature. Discovery interview → impact analysis → design → implement on `feat/[slug]` branch → verify → document → squash merge to `main` via PR.
- **Mode 4 (`/sdlc improve`)** — audit and improve an existing system. Discovery interview determines which dimensions to audit. Runs specialist audits (UX, code quality, performance, security, DB). Synthesizes findings into a prioritized S/M/L backlog. Executes approved items on `improve/[slug]` branch. PR at end. Optional focus: `"ux"`, `"performance"`, `"security"`, `"code-quality"`.

Phase 3 (Design) produces both `docs/API_DESIGN.md` (human-readable narrative) and `docs/api/openapi.yaml` (validated OpenAPI 3.0 spec). The spec is a gate requirement — Phase 3 cannot pass until it exists and passes `swagger-cli validate` with 0 errors.

Enforces confidence-based gates (asymmetric: < 5 fail, 5–6 revise max 3×, ≥ 7 pass) and Inter-Phase Check-In protocol at every phase boundary.

### `challenger` — Adversarial assumption challenger (`mode: primary`)

Invoked between any two phases (or on demand) to pressure-test what the sdlc-lead or any specialist has concluded. Not a reviewer — a structured adversary.

**What it does:** Reads the output of the previous phase (design docs, audit report, architecture decision), generates 5–8 specific challenges graded by severity (FATAL / MAJOR / MINOR / NITPICK), then runs a rebuttal cycle where the original specialist must defend or concede each challenge.

**Challenge categories:** unstated assumptions, scope creep in disguise, missing failure modes, premature optimization, dependency risk, security gaps, scalability cliffs, testability blockers.

**Output:** `docs/work/challenger/challenge-<phase>.md` — numbered challenges, severity, supporting evidence, rebuttal outcome (DEFENDED / CONCEDED / DEFERRED). Conceded items become mandatory follow-up tasks before the gate passes.

**Protocol:** Fully defined in `agents/shared/CHALLENGER_PROTOCOL.md`. Called by `sdlc-lead` automatically between Phase 2→3 (requirements→design) and Phase 3→4 (design→implementation). Can be invoked manually on any output with `/challenge`.

---

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

Reviews across **8 dimensions**: complexity, duplication, error handling, type invariants, patterns, naming, comment accuracy, and anti-slop (threshold ≥ 8). The anti-slop dimension checks for AI-generated bloat patterns cataloged in ANTI_SLOP_RULES.md.

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

### `architecture-designer` — Module boundary designer (`mode: primary`)

Derives module boundaries from business domains and produces the structural design documents that `coding-agent` and `validate-module-boundaries.sh` enforce.

- **Primary deliverables:** `docs/MODULE_DESIGN.md` (bounded contexts, dependency rules, naming conventions) and `docs/INFRASTRUCTURE.md` (environment matrix, compute, data, networking with Mermaid diagram)
- **Domain-driven decomposition** — identifies bounded contexts from use cases and data models; rejects technical-layer naming (controllers/, services/, utils/) in favor of domain-aligned modules
- **Circular dependency detection** — maps the full dependency graph during design; flags and resolves cycles before implementation begins
- **Infrastructure specification** — documents environment matrix (dev/staging/prod), compute resources, data stores, networking topology; validates against `validate-infrastructure.sh` rules (rejects IaC code in the doc)
- **Handoff contract** — produces MODULE_DESIGN.md that `validate-module-design.sh` can pass before handing off to `coding-agent`

Called by `sdlc-lead` in Phase 3 (Design), after `db-architect` and before `coding-agent`.

---

### Security micro-agents

Live in `agents/security/`. Dispatched by `security-auditor` (coordinator) via HANDOFF — each runs in its own context window and writes findings to `docs/work/security/<slug>.md`.

| Agent | Purpose |
|-------|---------|
| `owasp-web-checker` | OWASP Top 10 web vulnerabilities — one finding per category, verbatim evidence |
| `owasp-llm-checker` | OWASP LLM Top 10 — AI-specific attack surface (prompt injection, training data poisoning, etc.) |
| `cloud-security-checker` | Cloud misconfigurations — IAM, S3/GCS public buckets, security groups, KMS |
| `iac-security-checker` | Infrastructure-as-Code security — Terraform/Pulumi/CDK patterns |
| `secrets-scanner` | Hardcoded secrets, API keys, credentials in source + git history |
| `dependency-auditor` | Known CVEs via npm audit/pip-audit/cargo audit; license risk |
| `semgrep-runner` | Semgrep scan with custom gap-filler rules + community rule packs |
| `threat-modeler` | STRIDE per component, trust boundary analysis, attack surface enumeration |
| `attack-chainer` | Second-order pass — pairs/triples of real findings into multi-step exploit chains (C-N entries with severity bump) |

Methodology docs: `OWASP_METHODOLOGY.md`, `OWASP_LLM_METHODOLOGY.md`, `CLOUD_METHODOLOGY.md`, `IaC_METHODOLOGY.md`, `FINDING_SCHEMA.md` (shared finding envelope format).

---

### Code-review micro-agents

Live in `agents/code-review/`. Dispatched by `code-reviewer` (coordinator) in parallel — each covers one review dimension.

| Agent | Dimension |
|-------|-----------|
| `complexity-analyzer` | Cyclomatic complexity, nesting depth, cognitive load |
| `duplication-detector` | Copy-paste patterns, near-duplicate logic, DRY violations |
| `error-handling-auditor` | Silent failures, over-broad catch, missing boundary validation |
| `type-safety-checker` | Any-cast abuse, non-null assertions, unsafe type coercions |
| `pattern-consistency-checker` | Naming, import style, module structure — deviation from project conventions |
| `anti-slop-auditor` | 20-rule AI slop catalog (R-01..R-20): bloat, dead code, speculative abstractions, generated filler |
| `code-health-synthesizer` | Coordinator synthesizer — reads all six micro-agent outputs, produces `HEALTH_ASSESSMENT.md` with prioritized backlog |

Methodology: `agents/code-review/METHODOLOGY.md` — per-dimension grading rubrics, severity escalation rules, FIX_BACKLOG format.

---

### Performance micro-agents

Live in `agents/performance/`. Dispatched by `performance-engineer` (coordinator).

| Agent | Purpose |
|-------|---------|
| `static-perf-analyzer` | Grep-based static scans: O(n²) loops, N+1 queries, blocking I/O in async paths, hot-path allocations |
| `profiler-agent` | Runtime profiling — instruments code, runs load, captures flamegraph/heap snapshots |
| `db-query-analyzer` | Slow-query detection, missing indexes, N+1 at the ORM layer, explain-plan analysis |
| `bundle-analyzer` | Frontend bundle size, tree-shaking gaps, duplicate packages, lazy-load opportunities |
| `concurrency-checker` | Race conditions, deadlock patterns, improper shared-state access |
| `perf-synthesizer` | Coordinator synthesizer — reads all micro-agent outputs, produces `PERFORMANCE_REPORT.md` with before/after benchmark table |

Methodology: `agents/performance/METHODOLOGY.md` — profile-first discipline, verbatim-code mandate, coverage confidence loop.

---

### SDLC onboard specialists

Live in `agents/sdlc/onboard/`. Dispatched by `sdlc-onboard-mode` (coordinator) via HANDOFF in parallel where possible.

| Agent | Deliverable |
|-------|------------|
| `landscape-mapper` | `docs/LANDSCAPE.md` — tech stack, project metrics, directory structure, hot files, recent focus |
| `entry-point-tracer` | `docs/diagrams/entry-points.md` + `docs/diagrams/sequences/*.md` — traced call chains as Mermaid sequence diagrams |
| `component-mapper` | `docs/diagrams/c2-containers.md` + `docs/diagrams/c3-components.md` — C4 container and component diagrams |
| `health-coordinator` | `docs/HEALTH_ASSESSMENT.md` + `docs/testing/USE_CASES.md` + `docs/testing/TEST_PLAN.md` — dispatches code-reviewer, security-auditor, test-engineer, performance-engineer in parallel |

---

### SDLC mode agents

Thin orchestrators that drive each SDLC phase. Read by `sdlc-lead` on demand.

| Agent | Purpose |
|-------|---------|
| `sdlc-init-mode` | Entry point for Mode 1 (new project) — loads phase files as needed |
| `sdlc-init-phases-0-2` | Ideation, planning, requirements (Phases 0–2) |
| `sdlc-init-phase-3` | Design (Phase 3): architecture, DB, API, security |
| `sdlc-init-phase-4` | Implementation (Phase 4): parallel coding waves |
| `sdlc-init-phase-5` | Review, hardening, release (Phase 5) |
| `sdlc-feature-mode` | Mode 3: add a feature to an existing project |
| `sdlc-improve-mode` | Mode 4: audit-driven improvement |
| `sdlc-onboard-mode` | Mode 2: understand an existing codebase — thin dispatcher to onboard specialists |

---

## Skills

Skills are thin triggers that live in `skills/<name>/SKILL.md`. Each skill maps to an agent and accepts mode flags. Users invoke skills with `/skill-name [flags]`.

| Skill | Agent | Purpose |
|---|---|---|
| `/sdlc` | `sdlc-lead` | Full SDLC workflow (init / onboard / feature / **improve** / gate / status) |
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
| `/onboard-inventory` | `researcher` | Ralph Wiggum D1 — enumerate units into `docs/onboard/INVENTORY.md` |
| `/onboard-verify` | `sdlc-lead` | Ralph Wiggum D3 — run all onboard validators, report gaps |
| `/onboard-gap-fill` | `sdlc-lead` | Ralph Wiggum D4 — emit focused HANDOFFs for uncovered rows only |

**24 skills total** (15 agent-backed + 9 utility/sub-skills).

---

## Shared protocols

Canonical reference files in `agents/shared/`. Single source of truth — update once, propagates to all 3 locations (claude-experts, bpm-opencode-experts, live `~/.config/opencode/agents/shared/`).

| File | Purpose |
|------|---------|
| `SCOPE_BOUNDARY.md` | Stay-in-lane rule for direct-mode invocations — per-agent in-scope / refer-back table + canonical SCOPE-BOUNDARY block |
| `BOUNDED_TASK_CONTRACT.md` | Six canonical scope rules every specialist follows in Bounded Task Mode |
| `HANDOFF_TEMPLATES.md` | Canonical HANDOFF block templates (standard, remediation, re-verification, parallel-wave) + context-packet template |
| `HANDOFF_QUICK_REF.md` | One-page quick reference: HANDOFF format, completion phrase, manifest schema — for agents with small context budgets |
| `FIX_VERIFY_LOOP.md` | Canonical review → FIX_BACKLOG → remediate → re-verify pipeline with 3-iteration cap and escalation block |
| `RALPH_WIGGUM_LOOP.md` | Canonical inventory-driven deep-verification loop used by `/sdlc onboard --deep` and `/security --deep` |
| `LOOP_PREVENTION.md` | Tool-selection cheat-sheet + three loop classes (failure / schema-validation / success) + BLOCKED-template |
| `RESEARCH_TOOLS.md` | Mandatory research-tool surface and fallback chain (`playwright-search` → `pullmd` → STOP) |
| `ANTI_SLOP_RULES.md` | 20-rule AI slop catalog (R-01..R-20) — over-engineering, defensive bloat, hallucinated patterns, generated filler |
| `CHALLENGER_PROTOCOL.md` | Full Challenger adversarial review protocol — challenge categories, severity grades, rebuttal cycle, output format |
| `GATE_SCORING_PROTOCOL.md` | HANDOFF resume scoring (1–10 scale, asymmetric threshold ≥7 pass / 5–6 revise / <5 auto-fail) + coverage validator table |
| `PHASE_ROUTING_PROTOCOL.md` | Smart routing table per phase, escape hatches, validation gate chain, two-track system (Track 1: coverage loop; Track 2: confidence loop) |
| `PARALLEL_WAVE_PROTOCOL.md` | 3-round parallel coding protocol: Round 1 code HANDOFFs → Round 2 review + Fix-Verify Loop → Round 3 runtime. Wave gate + cross-wave rules. |
| `CONTEXT_BUDGET.md` | Context budget management — synthesis chunking, state-file discipline, when to stop and write to disk |
| `SESSION_PRIMER.md` | ~600-token session primer with 7 core rules including HANDOFF format, disk discipline, and memory workflow |
| `MEMORY_PRIMER.md` | Memory MCP protocol — 3-call workflow (session_restore → memory_store → session_save), trigger table, call format, flat-file fallback |

---

## Memory & code-search MCPs

Four MCP servers extend agent capability beyond the session context window. For full configuration instructions see [MCP_GUIDE.md](MCP_GUIDE.md).

### `claude-memory` — Cross-session project memory

Persistent memory store backed by SQLite + vector embeddings (LM Studio nomic-embed-text). Provides hybrid search (vector 35% + BM25 35% + link traversal 30%).

Registered via `install.sh` step 8 (`claude mcp add memory node <path>`). For OpenCode, entry in `opencode.json` under `"mcp"`.

**Tools used by agents:**

| Tool | When |
|------|------|
| `session_restore()` | Start of every session — load prior decisions, constraints, patterns for this project |
| `memory_store({ content, type, confidence, citation })` | When a significant decision, constraint, pattern, or bug root cause is found |
| `session_save({ summary })` | After every phase gate, before stopping |
| `memory_recall({ query })` | On demand — search prior project memories |

Types: `decision`, `fact`, `pattern`, `error`, `preference`. Scope: `project` (default) or `global`.

**Flat-file fallback:** When the MCP is unavailable, agents fall back to `docs/work/SESSION_NOTES.md`. Full protocol in `agents/shared/MEMORY_PRIMER.md`.

---

### `bpm-code-search-mcp` — Semantic + symbol code search

MCP server providing semantic search over code chunks (embedding-based) and a structural symbol index. Built on SQLite + FTS5 + cosine similarity. Provider-sticky: the embedding provider used at index time is locked in; queries from a different provider fall back to FTS5 BM25.

Source: `~/Code/bpm-code-search-mcp/`. Registered in `opencode.json` and `~/.claude/settings.json` (PostToolUse hook auto-reindexes edited files).

**Tools:**

| Tool | Purpose |
|------|---------|
| `code_index(path?, force?)` | Index or re-index the codebase. Mtime-gated — skips unchanged files. |
| `code_search(query, top_k?, path_filter?)` | Semantic search — returns ranked chunks with file:line and similarity score |
| `code_symbols(kind?, name_filter?, path_filter?, limit?)` | Browse symbol index — functions, classes, interfaces, types, enums, methods, Markdown sections |
| `code_outline(file_path)` | Structural outline of a single file — all named symbols in line order |
| `code_references(name, top_k?, path_filter?)` | Find all chunks mentioning a symbol by name (FTS exact-phrase match) |
| `code_index_status()` | Provider, file count, chunk count, symbol count, DB path |

Symbol extraction covers 10 languages: TypeScript/JS, Python, Go, Rust, Java, C#, Ruby, PHP, Swift, Kotlin, Markdown headings.

---

### `playwright-mcp` — Browser automation & screenshots

LLM-agnostic browser automation via Microsoft's official Playwright MCP. No vision model required — uses the accessibility tree by default with screenshots on demand. Works identically in Claude Code and OpenCode (including local LLMs).

**Why it exists:** Replaces the Claude Code browser extension (`claude-in-chrome`) for all automated/CI use cases. The extension only works in Claude Code with cloud models; playwright-mcp works everywhere.

| Tool | Purpose |
|------|---------|
| `browser_navigate(url)` | Navigate to a URL |
| `browser_screenshot()` | Take a screenshot (returns image) |
| `browser_snapshot()` | Accessibility tree snapshot — no vision needed |
| `browser_click(element)` | Click by CSS selector or text |
| `browser_fill(element, value)` | Fill a form field |
| `browser_wait_for(selector, state)` | Wait for element state |
| `browser_evaluate(js)` | Run JavaScript in the page |
| `browser_get_url()` | Get current URL |
| `browser_close()` | Close the session |

Full protocol: `agents/shared/BROWSER_TESTING.md`
Install: `claude mcp add playwright -- npx -y @playwright/mcp@latest`

---

## Validators

Thirty-six bash validators + gate runners in `scripts/validators/`. Each returns exit 0 (clean) / 1 (gaps) / 2 (validator error) and emits a JSON gap envelope to stdout. Bash 3.2 compatible (macOS default).

| Script | Checks |
|--------|--------|
| `validate-adrs.sh` | Every ADR-NNN reference in docs has a corresponding file with a valid status field |
| `validate-api-coverage.sh` | Every route in source has a row in API_DESIGN.md and a path entry in openapi.yaml |
| `validate-architecture.sh` | 6 diagram types, Mermaid syntax, HLA overview, no placeholders |
| `validate-build.sh` | Runs project build command and checks exit code |
| `validate-c3-coverage.sh` | Every source module appears in the C3 context diagram |
| `validate-code-health.sh` | 9 anti-slop patterns: catch-all error handlers, try-in-loop, what-comments, unused imports, single-use helpers, speculative abstractions, hardcoded config, re-implemented framework features, scope creep |
| `validate-completion-manifest.sh` | HANDOFF manifest schema + completion phrase |
| `validate-deps.sh` | npm audit / pip-audit / cargo audit with configured waivers |
| `validate-design-system.sh` | Token file present, component files match UX_SPEC inventory, no hardcoded hex colors |
| `validate-e2e-setup.sh` | playwright.config.ts has JSON reporter, retries, screenshot, baseURL; auth fixture present; POM directory present; CI E2E step present |
| `validate-entry-points.sh` | Every entry point (main, index, bin) is documented |
| `validate-erd-coverage.sh` | Every table/model in source has an ERD entry |
| `validate-fix-backlog-closed.sh` | CRITICAL and HIGH rows in FIX_BACKLOG resolved before phase-5 gate |
| `validate-iac.sh` | IaC scaffolding: entry/variables/outputs/per-env configs present, no hardcoded secrets |
| `validate-infrastructure.sh` | INFRASTRUCTURE.md has env matrix, compute, data, networking + Mermaid diagram; rejects IaC code in the document |
| `validate-inventory.sh` | Every row in INVENTORY.md has a corresponding artifact |
| `validate-lint.sh` | Linter + typecheck exit clean |
| `validate-migrations.sh` | Up/down migrations present and reversible |
| `validate-module-boundaries.sh` | Cross-module imports comply with dependency rules in MODULE_DESIGN.md |
| `validate-module-design.sh` | MODULE_DESIGN.md: domain-aligned naming pattern present, no technical-layer names, circular dependency check passes |
| `validate-no-ascii-art.sh` | No Unicode box-drawing characters or ASCII banners in documentation files |
| `validate-owasp.sh` | All 10 OWASP categories present, confidence ≥ 7, attack-chains section present |
| `validate-phase-gate.sh` | Orchestrator — chains the right validators for a given SDLC phase |
| `validate-release-readiness.sh` | 10-condition release gate: FIX_BACKLOG closed, 4 review verdicts (security/code/ux/perf), coverage threshold, container CVE scan, RUNTIME PASS |
| `validate-requirements-matrix.sh` | REQUIREMENTS_MATRIX.md: P0 use-case rows have Test ID and Status; cross-references USE_CASES.md |
| `validate-scope.sh` | Post-HANDOFF git-scope enforcement |
| `validate-security-controls.sh` | SECURITY_CONTROLS.md: HIGH/CRITICAL threats have controls; DB, API, and ARCH security sections present |
| `validate-sequence-coverage.sh` | Every P0 use case has a sequence diagram |
| `validate-smoke.sh` | Boots server, hits configured routes, asserts HTTP 200 |
| `validate-tech-stack.sh` | All runtime and dev dependencies present in TECH_STACK.md |
| `validate-test-design.sh` | TEST_DESIGN.md has 5 mandatory sections: Unit, Integration, E2E, Security, Test Infrastructure |
| `validate-tests-mapping.sh` | Use-case ↔ test coverage mapping; UC-level PASS/FAIL derived from jest/vitest/pytest JSON results |
| `validate-tests.sh` | Runs test suite; Playwright fast-path with JSON reporter |
| `validate-use-cases.sh` | UC-IDs present, required fields complete, Source traceability field populated |
| `validate-user-stories.sh` | Given/When/Then acceptance criteria present, traceability to use cases |
| `validate-ux-spec.sh` | UX_SPEC.md: component library chosen, ≥ 5 component inventory, P0 UCs covered, WCAG strategy, responsive strategy |
| `run-coverage-loop.sh` | 3-iteration gate loop runner — re-runs validators until clean or iteration cap reached |
| `run-handoff-gates.sh` | Scope + manifest + coverage gate runner with any-failure-aborts semantics |

Route discovery covers Express/Fastify/Next.js app router/FastAPI/Flask/Go net-http. Table discovery covers Prisma/TypeORM/Sequelize/Knex/SQLAlchemy/Django/raw SQL.

---

## Depth modes (v0.15.0)

`--quick` and `--deep` flags on `/sdlc onboard` and `/security`:

| Skill | `--quick` (default) | `--deep` |
|-------|---------------------|----------|
| `/sdlc onboard` | 7-step high-level pass (~15 min) | Ralph Wiggum inventory loop (~45-90 min) |
| `/security` | Phases 1-3: understand + scan + OWASP once-over (~10 min) | Ralph Wiggum loop over OWASP + semgrep rule files + iterative attack-chain (~45-90 min) |

Deep modes block until their corresponding validator gate exits clean.

---

## Platform support

| Platform | Status |
|----------|--------|
| macOS (bash 3.2.57+) | Supported |
| Linux (bash 4+) | Supported |
| Windows via WSL2 | Supported |
| Windows native (PowerShell/cmd) | NOT supported — use WSL2 |

`install.sh` refuses to run on native Windows and points to the WSL2 install docs.

---

## Reference documents

Canonical checklists and templates agents read at runtime. Each is plain markdown in `references/`.

| Reference | Used by | Purpose |
|---|---|---|
| `git-workflow-checklist.md` | `git-expert` | Conventional commits, SemVer, Keep-a-Changelog, recovery scenarios, report templates |
| `code-health-checklist.md` | `code-reviewer` | 8 dimensions, silent-failure hunter, consolidation catalog, language thresholds |
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
| `sdlc-onboard.md` | `/sdlc onboard [--quick \| --deep]` — understand an existing codebase |
| `sdlc-feature.md` | `/sdlc feature "<description>"` — add a feature to existing project |
| `sdlc-improve.md` | `/sdlc improve ["<focus>"]` — audit-driven improvement; runs UX / code-quality / perf / security / DB audits, synthesizes a sized backlog, routes execution through `coding-agent` or Mode 3 sub-workflows |
| `sdlc-gate.md` | `/sdlc gate` — SDLC-aware gate check; auto-detects current phase from `docs/work/sdlc-state.md` and runs the matching validators |
| `sdlc-status.md` | `/sdlc status` — show current phase + gate state |

---

## Plugins

`plugins/expert-hooks.ts` — single opencode plugin auto-loaded from `~/.config/opencode/plugins/`. Hooks into the two main lifecycle events:

| Event | What runs |
|-------|-----------|
| `tool.execute.before` | **Block dangerous bash** (`rm -rf /`, `git push --force`, `DROP TABLE`, `curl\|bash`, etc.). **Block writes to credential files** (`.env*`, `*.key`, `*.pem`, `id_rsa`, `credentials.json`). Throws to abort the call. |
| `tool.execute.after` (write/edit only) | **format → lint → type-check → secret-scan**, all in parallel: prettier / black+isort / gofmt / rustfmt; eslint / ruff; `tsc --noEmit`; regex scan for hardcoded API keys, AWS creds, PEM keys, DB connection strings. Findings surface via `console.warn` — informational, never block. Missing formatters silently skipped. |

Ports the high-value subset of the claude-experts hook catalog. **Not** ported (different abstractions): `commit-validator.sh` (use a project-level git pre-commit hook), `test-on-stop.sh` (no clean opencode session-idle semantic), `session-start.sh` (opencode lacks a UserPromptSubmit equivalent).

---

## Hooks

Currently empty. The original `hooks/pre-operation.sh` was an orphan superseded by `tools/loop-detector.ts` and the schema guards in `tools/{append,bash,run,write}.ts`. Loop prevention now lives in those tools + the inlined LOOP_PREVENTION cheat-sheet at the top of every SDLC mode file. Quality + safety automation lives in the plugin above.
