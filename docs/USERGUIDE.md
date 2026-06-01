# User Guide

How to use the BPM OpenCode Experts. For *what* each expert is, see [FEATURES.md](FEATURES.md).

## Table of contents

- [Install](#install)
- [Core concepts](#core-concepts)
- [Typical workflows](#typical-workflows)
- [Per-expert usage](#per-expert-usage)
  - [`/sdlc` — SDLC workflow (4 modes)](#sdlc)
  - [`/code` — Doc-driven implementation](#code)
  - [`/git-expert` — Git & forges](#git-expert)
  - [`/security` — Security audit](#security)
  - [`/review-code` — Code health](#review-code)
  - [`/research` — Deep research](#research)
  - [`/test-expert` — Testing](#test-expert)
  - [`/perf` — Performance](#perf)
  - [`/dba` — Databases](#dba)
  - [`/ux` — UX & accessibility](#ux)
  - [`/api-design` — API design](#api-design)
  - [`/containers` — Containers](#containers)
  - [`/devops` — SRE & CI/CD](#devops)
  - [`/frontend` — Visual design & polish](#frontend)
  - [`/explore` — Codebase archaeology](#explore)
  - [`/design-options` — Architecture trade-offs](#design-options)
  - [`/simplify` — Quick simplification pass](#simplify)
  - [`/steward` — Project intelligence steward](#steward)

---

## Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh                  # copies agents, skills, tools into ~/.config/opencode/
./install.sh --link           # symlink instead of copy (for development — edits apply immediately)
./install.sh --semgrep        # also auto-install Semgrep + community rule repos
./install.sh --project        # install into .opencode/ in current directory instead of global
```

The installer:
- Copies (or symlinks) `agents/`, `skills/`, `references/`, `commands/`, `hooks/`, `scripts/` into `~/.config/opencode/`
- Installs the custom TypeScript tools in `tools/` and runs `npm install` for dependencies
- Safely merges Context7 MCP config into your existing `opencode.json`
- Checks for Semgrep (and optionally installs it) for `security-auditor`
- Prompts to clone 4 community Semgrep rule repos (~10-50 MB each)

Uninstall with `./uninstall.sh`.

---

## Core concepts

### Agents vs skills vs commands

- **Agents** are the actual workers — they have system prompts, tools, and behavior.
- **Skills** are thin triggers — a `SKILL.md` with frontmatter that maps a `/name` to an agent plus default arguments.
- **Commands** are slash-command variants used by `/sdlc` subcommands (`/sdlc init`, `/sdlc onboard`, `/sdlc feature`, `/sdlc status`).

When you type `/review-code --debt` into OpenCode, the skill dispatcher looks up `skills/review-code/SKILL.md`, reads the `agent: code-reviewer` field, and invokes the `code-reviewer` agent with `--debt` as an argument.

### Multi-agent execution model

Long-running agents (all 10 specialists + `sdlc-lead`) use a two-mode execution pattern to prevent timeouts and silent hangs:

**Orchestrator mode (default)** — the agent announces its phase plan upfront, then spawns one sub-task per phase using the `task` tool. Each sub-task runs in under 90 seconds, writes its findings to `docs/work/<agent>/<slug>/phaseN.md`, and returns. The orchestrator prints `✓ Phase N: [finding]` after each completes. You see work as a sequence of fast completions, never a silent 5-minute block.

```
▶ Phase 1: Understanding codebase...
✓ Phase 1 complete: 3 services identified, PostgreSQL 15, REST API with 24 endpoints

▶ Phase 2: Researching best practices...
✓ Phase 2 complete: Found 3 relevant patterns for event sourcing
...
```

**`--phase: N name` mode** — runs exactly one named phase, reads the previous phase's output file, writes its own, and returns a one-line summary. This is how the orchestrator parallelizes sequential work — you don't invoke this directly.

**Progress in the UI** — the `task` tool updates its label in real time:
```
task: db-architect — 45s — ✓ Phase 2 complete: PostgreSQL best practices identified
```

If you see a task label ticking up but no output yet, the agent is working — it will announce results phase by phase.

### Modes

Most experts take a `--mode` flag that selects which pass to run. Modes are cheap to add — they share the agent's reference checklist and reporting templates but differ in emphasis and output file. See each expert's section below.

### Where reports go

Every expert writes its output to a predictable location under `docs/`:

| Expert | Output dir |
|---|---|
| `coding-agent` | `docs/improve/VERIFY_ITEM_[n].md` + implementation files |
| `code-reviewer` | `docs/reviews/CODE_REVIEW_<date>.md` etc. |
| `security-auditor` | `docs/security/` |
| `git-expert` | `docs/git/` |
| `researcher` | `docs/research/` |
| `sdlc-lead` | `docs/` (VISION.md, SCOPE.md, etc. per phase) |
| `test-engineer` | `docs/test/` |
| `performance-engineer` | `docs/PERFORMANCE_REPORT.md` + `docs/performance/PERF_TRACKER.md` |
| `db-architect` | `docs/db/` |
| `ux-engineer` | `docs/design/` |

These directories are gitignored by default — they are per-project generated reports, not shared source.

### Confidence gates + automated validators (v0.15.0)

Gates run in two forms, depending on whether the artifact is mechanically validatable:

**Automated validators** (deterministic coverage checks) — `scripts/validators/` has 9 validators plus a gate orchestrator. Used for any artifact where "covered or not" is an objective question: architecture diagrams, OWASP tracker rows, API route coverage, ERD table coverage, sequence-diagram coverage, inventory-row coverage, post-HANDOFF scope + manifest. Each returns exit 0 (clean) / 1 (gap) / 2 (validator errored). The `/gate` skill wraps `validate-phase-gate.sh <phase>` for the active phase.

**Confidence gates** (subjective 1-10 score) — used only for artifacts validators cannot check mechanically: narratives, research summaries, rationale. Asymmetric:
- Score < 5 on any dimension = automatic fail, surface the gap, do NOT iterate
- Score 5-6 = revise that specific dimension (max 3 revision passes)
- Score ≥ 7 = pass

When a validator says clean, the gate passes — do not second-guess. When a validator reports gaps, close the gap; do not override.

### Post-HANDOFF gates

After every specialist HANDOFF returns, the orchestrator runs three automated gates via `scripts/validators/run-handoff-gates.sh` before accepting the work:

1. **Scope** — `validate-scope.sh` confirms git writes stayed inside the assigned directory
2. **Manifest** — `validate-completion-manifest.sh` confirms the required sections + completion phrase
3. **Coverage** — domain-specific validator (architecture / api-coverage / erd-coverage / owasp / inventory) when applicable

Any gate failure returns the HANDOFF with REVISE status + the specific gap. No orchestrator judgment required.

### Scope boundary (stay-in-lane)

Each primary agent has a defined domain. If you ask `/research` to write code, or `/code` to design a schema, the agent prints a **SCOPE-BOUNDARY** block naming the right specialist (or `/sdlc` for orchestration) and stops — it does not freelance into another lane.

```
---
  SCOPE BOUNDARY — this is not <my-domain> work
---
You asked: <one-line summary>
This belongs to: <agent name> (skill: /<skill>)
Recommended next step:
  Option A — open a new session and run: /<skill> <prompt>
  Option B — go back to /sdlc and let the lead orchestrate this
---
```

**Why this matters:** scope creep across specialists is the #1 cause of muddy outputs. A researcher writing code skips the design-docs check; a coding-agent designing scope freelances on what to build; sdlc-lead reading source files bypasses the audit pipeline. The rule is at `~/.claude/agents/shared/SCOPE_BOUNDARY.md`.

Phrases like "review for gaps", "audit this", "what could we improve", "make it better", "evaluate", "find problems" route into Mode 4 (`/sdlc improve`) — never freelanced as one-shot reviews. Single-file/PR/function asks bypass Mode 4 and go to `/review-code` directly.

### Research backbone

Native Claude Code `WebSearch` and `WebFetch` work fine, but the project prefers MCP-backed research when registered:

1. `playwright-search_web_research(...)` — multi-engine search (DDG + Brave + Bing) → paragraph-ranked extraction → 24h cache. Default for any new investigation.
2. `playwright-search_web_fetch(url, ...)` — for known URLs.
3. `pullmd_read_url(url, render="force")` — fallback when (2) returns garbage / empty / errors. Especially for JS-heavy SPAs, Cloudflare-protected pages, and Reddit threads (4-stage pipeline: Reddit handler → Cloudflare native MD → Readability + Trafilatura → headless Playwright).
4. Native `WebSearch` / `WebFetch` — only as a last resort if no MCPs are registered.
5. If everything fails → surface `RESEARCH BLOCKED`. Do not loop.

Full surface at `~/.claude/agents/shared/RESEARCH_TOOLS.md`.

### Browser automation backbone

For navigating to a running app, taking screenshots, and verifying UI:

1. `browser_navigate(url)` + `browser_screenshot()` — navigate and capture. Works headless and in CI.
2. `browser_snapshot()` — accessibility tree dump. No vision model required. Use to verify structure without reading pixels.
3. `browser_fill` / `browser_click` / `browser_wait_for` — form testing and interaction flows.
4. `playwright-mcp` replaces `claude-in-chrome` for all automated/cross-model use cases.

Full protocol at `~/.claude/agents/shared/BROWSER_TESTING.md`. Configuration at `docs/MCP_GUIDE.md`.

### Memory & code search

Cross-session tools that persist beyond the context window:

- `session_restore()` — load prior project decisions/constraints on session start
- `memory_store(...)` — save a decision, pattern, or bug fix for future sessions
- `session_save(...)` — persist session summary on session end
- `code_search("query")` — semantic search over the codebase
- `code_symbols(kind?, name_filter?)` — browse what exists (functions, classes, interfaces)
- `code_outline("file")` — structural outline of a file
- `code_references("SymbolName")` — find usages

Full protocols at `~/.claude/agents/shared/MEMORY_PRIMER.md` and `docs/MCP_GUIDE.md`.

---

## Typical workflows

### New project from scratch
```
/sdlc init my-app "Short description of what it is"
```
`sdlc-lead` runs a discovery interview, calls `git-expert --init` (repo bootstrap + branch protection on `main`), creates a `sdlc/setup` branch, then walks through Phase 0 → Phase 3 with git checkpoints after every phase. After Phase 3 gate passes, `sdlc/setup` merges to `main` via PR. Phase 4 feature work runs on `feat/[slug]` branches. Expect 6–8 agent delegations across the full run.

### Existing codebase you don't understand
```
/sdlc onboard             # default: --quick pass, ~15 min
/sdlc onboard --quick     # explicit quick pass, 7-step high-level
/sdlc onboard --deep      # Ralph Wiggum inventory loop, ~45-90 min
```
`sdlc-lead` creates a `docs/onboard` branch, runs `git-expert --inspect` first (hot files, commit history), detects if the project has a UI, then produces architecture docs and an onboarding guide. If UI-bearing, `ux-engineer --audit` runs automatically. All produced docs are committed via PR to `main`.

**`--deep` mode** (`agents/shared/RALPH_WIGGUM_LOOP.md`) runs the quick pass first, then enumerates every unit of the codebase — routes, tables, services, P0 flows, entry points — into `docs/onboard/INVENTORY.md`, produces one artifact per row, and re-iterates on any uncovered rows. Blocks until `./scripts/validators/validate-phase-gate.sh onboard-deep` exits clean. Three sub-skills trigger the individual steps:

| Skill | Step | Effect |
|-------|------|--------|
| `/onboard-inventory` | D1 | Produce `docs/onboard/INVENTORY.md` |
| `/onboard-verify`    | D3 | Run validators, report gaps |
| `/onboard-gap-fill`  | D4 | Emit focused HANDOFFs for uncovered rows only |

Reach for `--deep` before contract bids, diligence reviews, security-sensitive takeovers.

### Add a feature to an existing project
```
/sdlc feature "OAuth refresh token support"
```
`sdlc-lead` runs a discovery interview → creates `feat/[slug]` branch → impact analysis → design → implement → `test-engineer` → `code-reviewer --review` → `ux-engineer --review` (if UI) → commit + draft PR → squash merge to `main`. A CRITICAL or HIGH UX finding blocks the PR.

### Audit and improve an existing system
```
/sdlc improve
/sdlc improve "ux"
/sdlc improve "performance"
```
`sdlc-lead` creates an `improve/[slug]` branch, runs a discovery interview to determine which audits to run, runs targeted specialist audits (UX, code quality, performance, security, DB), synthesizes findings into a ranked backlog with S/M/L sizing, and lets you pick which items to execute. Each item is verified by the same specialist that found it. All work committed via PR to `main`.

### Cut a release
```
/git-expert --release
```
Computes next semver from conventional commits since last tag, generates Keep-a-Changelog entry, creates signed annotated tag, pushes to all remotes, drafts GitHub + Gitea releases.

### Hunt a regression
```
/git-expert --inspect
```
Use the bisect harness or pickaxe (`-S` / `-G`) to find when a bug was introduced.

### Recover lost work
```
/git-expert --recover
```
Inspects the reflog, explains the plan, then executes recovery with your confirmation.

---

## Per-expert usage

### `/sdlc`
Modes: `init`, `onboard`, `feature`, `improve`, `status`, `gate`

```
/sdlc init my-app "AI assistant for developers"
/sdlc onboard
/sdlc feature "Magic link login"
/sdlc improve                   # full audit across all dimensions
/sdlc improve "ux"              # UX audit only
/sdlc improve "performance"     # performance audit only
/sdlc improve "security"        # security audit only
/sdlc improve "code-quality"    # code quality audit only
/sdlc status                    # show current phase + gate state
/sdlc gate                      # check gate requirements
```

**Git branching:** Every mode creates the right branch automatically before touching any file. `main` is always production-ready — nothing lands there without a PR. The git discipline is automatic; you don't have to think about it.

```
init    → sdlc/setup  (phases 0-3) → feat/[slug] (phase 4)
onboard → docs/onboard
feature → feat/[slug]
improve → improve/[slug]
```

Gate control:
```
/gate check                     # check gate requirements
/gate approve                   # approve current phase
/gate bypass                    # emergency bypass (use sparingly)
```

Outputs go under `docs/` — `VISION.md`, `SCOPE.md`, `RISKS.md`, `USER_PERSONAS.md`, `SRS.md`, `USER_STORIES.md`, `TECH_STACK.md`, `ARCHITECTURE.md`, `DATABASE.md`, `THREAT_MODEL.md`, `SECURITY_CONTROLS.md`.

---

### `/code`

Invoke the coding agent to implement from SDLC design documents.

```
/code                             # implement — will ask which design docs to use
/code implement the auth service  # implement a specific task
```

**Requires design docs to exist first.** If none exist, run `/sdlc feature "<description>"` first to produce them.

**What happens before a line of code is written:**
1. Reads all SDLC design docs (ARCHITECTURE.md, SRS.md, TECH_STACK.md, IMPROVEMENT_*_DESIGN.md)
2. Reads 2–3 existing files in the target directory to match patterns
3. Verifies every library API via Context7 MCP (`resolve-library-id` + `get-library-docs`)

**Tech stack constraint:** If `docs/TECH_STACK.md` exists, the agent will only use libraries listed there. Any deviation is flagged in the Completion Manifest for your approval — never silently adopted.

**The anti-slop checklist (self-audited before reporting done):**
- No try-catch outside system boundaries
- No abstractions with <2 real implementations
- No single-use helper functions (inlined)
- No what-comments (only why, when non-obvious)
- No unused imports
- No scope beyond what the spec asked for
- All tech choices match TECH_STACK.md

**Completion Manifest** — at the end of every task the agent produces:
```
Files produced:       [path — N lines — what it does]
API verifications:    [library@version — function verified]
Tech stack compliance: PASS / [deviations flagged]
Anti-slop audit:      PASSED / [N issues found and fixed]
Test result:          [command] → PASS/FAIL
Deferred:             [anything noticed but out of scope]
```

**Distinct from:**
- `/review-code` — audits code *after* it's written
- `/devops` — CI/CD, ops, deployment (not application code)
- `/test-expert` — test strategy and coverage analysis

---

### `/git-expert`
Modes: `--init`, `--feature`, `--release`, `--recover`, `--inspect`, `--sync`

```
/git-expert --init              # bootstrap new repo (run before first commit)
/git-expert --feature           # branch + atomic commits + draft PR
/git-expert --release           # semver + changelog + signed tag
/git-expert --recover           # reflog rescue
/git-expert --inspect           # blame, pickaxe, bisect
/git-expert --sync              # multi-remote fetch + prune + mirror
```

Safety rails (always enforced, cannot be bypassed silently):
- NEVER force-pushes main / release branches
- NEVER `--no-verify` to skip hooks
- Scans staged files for secrets before every commit
- Saves reflog backup to `/tmp/reflog-backup-<ts>.txt` before destructive ops
- Requires explicit user confirmation for destructive ops (with the exact recovery command printed)

Reference: `references/git-workflow-checklist.md`. Output: `docs/git/*.md`.

### `/security`
**Depth flags:** `--quick` (default) / `--deep`
**Focused modes:** `--owasp`, `--semgrep`, `--threat-model`, `--deps`

```
/security                       # --quick by default: phases 1-3, ~10 min
/security --quick               # explicit: single-pass OWASP + semgrep scan
/security --deep                # Ralph Wiggum loop: ~45-90 min, all OWASP + all semgrep rules + iterative attack-chain
/security --owasp               # OWASP Top 10 pass only
/security --semgrep             # deep static analysis only
/security --threat-model        # STRIDE threat model only
/security --deps                # dependency vulnerability audit only
```

**`--quick`** (default) — phases 1-3: understand → automated scan → OWASP once-over. ~10 min.

**`--deep`** — full Ralph Wiggum loop over every OWASP category iterated to confidence ≥ 7, every custom semgrep rule file walked, iterative attack-chain until a full pass finds no new chains. Blocks until `./scripts/validators/validate-phase-gate.sh security-deep` exits clean. Use before production deploys, compliance audits, post auth/crypto/input changes, CVE-reachability checks.

Runs as a 5-phase orchestrator: understand → automated scan (Semgrep + deps) → OWASP manual (10 passes) → verify findings → **attack chain analysis** → write report.

**Attack chain analysis (Phase 5b):** After all individual findings are verified, the agent builds a pre/post-condition inventory and tests finding pairs and triples for multi-step exploit paths. Chains get their own `C-N` finding entries with combined severity (often higher than any single link) and a "break the chain" remediation priority. Nine chain patterns are tested explicitly: recon→targeted attack, XSS→session hijack, SSRF→pivot, path traversal→credential theft, auth bypass→privilege escalation, and more.

**Semgrep setup:**
- Custom gap-filler rules (98 rules across C#, Kotlin, Swift, Rust, PHP, C++) installed to `~/.config/opencode/.semgrep/` — loaded automatically per detected language
- Community rules: `scripts/update-semgrep-rules.sh` clones Trail of Bits, elttam, GitLab, 0xdea to `~/.semgrep/rules/`
- Offline scanning: `scripts/cache-registry-packs.sh` then `semgrep-full-audit.sh --offline`

Reports use the skeleton-first format — actionable intel first, verbatim code quotes for every finding, concrete exploitation walkthroughs. Output: `docs/security/`.

### `/review-code`
Modes: `--review` (default), `--debt`, `--consolidate`, `--patterns`

```
/review-code                    # full 7-dimension health pass
/review-code --debt             # leverage-sorted tech-debt register
/review-code --consolidate      # DRY + error-handling consolidation proposals
/review-code --patterns         # cross-codebase pattern drift audit
/review-code src/auth/          # target a specific directory
```

The 7 dimensions: Complexity, Duplication/DRY, Error Handling (silent-failure hunter), Type Safety, Pattern Consistency, Naming, Comment Accuracy. Verdict rubric: APPROVED / APPROVED WITH SUGGESTIONS / NEEDS REVISION / REJECT.

Reference: `references/code-health-checklist.md`. Output: `docs/reviews/`.

### `/research`
Modes: `--quick`, `--deep`, `--compare`

```
/research --quick "what is OAuth 2.1"
/research --deep "competitive landscape for AI coding assistants"
/research --compare "Postgres vs MySQL for event sourcing"
```

The researcher uses **orchestrator mode** by default — it announces a question-by-question plan, researches each question as a sub-task, and prints a one-line finding after each:

```
Research plan for [topic]:
  Q1: Market size and top players
  Q2: Pricing models
  Q3: API quality
Starting Q1...
✓ Q1 complete: Market is $2.4B, dominated by GitHub Copilot (40%). [source]
Starting Q2...
```

Produces a report with source evaluation (credibility + recency + bias), cross-references, and a final recommendation. Output: `docs/research/`.

**When called from sdlc-lead:** researcher is a heavyweight specialist (multi-phase, 5–15 min). `sdlc-lead` delegates it via HANDOFF — the same pattern as every other specialist. Open a new conversation, paste the HANDOFF prompt, and return with "researcher done" when complete. Do NOT run it as a background task or expect it to complete inline.

### `/test-expert`
Modes: `--strategy`, `--unit`, `--e2e`, `--coverage`

```
/test-expert --strategy         # test strategy before coding
/test-expert --unit src/auth/   # write unit tests for a module
/test-expert --e2e              # write Playwright e2e flows
/test-expert --coverage         # coverage analysis with gap report
```

Reference: `references/playwright-config.md`. Output: `docs/test/`.

### `/ui-verify`

Live browser verification using `playwright-mcp`. Navigates your running app, takes screenshots, reads accessibility snapshots, and verifies flows. Works with any LLM — no vision model required.

```
/ui-verify http://localhost:3000                   # smoke pass — main routes, screenshots
/ui-verify http://localhost:3000 --use-cases       # verify P0 use cases from USE_CASES.md
/ui-verify http://localhost:3000 --flow "login"    # single flow end-to-end
/ui-verify http://localhost:3000 --regression      # post-change regression check
```

**Distinct from `/test-expert --e2e`:** test-expert writes `.spec.ts` files. `/ui-verify` runs the browser NOW against your running server and tells you what it sees — immediate visual feedback, no test framework needed.

**Requires:** `playwright-mcp` registered. Check: `claude mcp list | grep playwright`.

Output: `docs/test/UI_VERIFICATION_REPORT.md` — per-flow PASS/FAIL/WARN table, step observations, accessibility findings.

### `/perf`

```
/perf                           # full 7-phase profiling run (understand → static analysis → profile → fix → verify → document)
/perf --profile                 # profile current state, flame graph, hot paths
/perf --benchmark               # measure vs NFR targets
/perf --optimize src/pipeline/  # optimize a specific module (profile first)
```

**What it does:**

1. **Phase 1 — Understand the problem** — reads CLAUDE.md, checks for prior reports, quantifies the complaint ("slow" → specific operation + P95 latency target). Initializes `docs/performance/PERF_TRACKER.md` — a persistent session tracker that survives context loss.

2. **Phase 1b — Static analysis** — detects anti-patterns without running the code. Starts by enumerating all source files (`find . -type f ...`) so it knows the full scope. Then runs 5 targeted grep scans:
   - O(n²) nested loops — `.find()` inside `for`
   - N+1 query patterns — DB call inside a loop
   - `try/catch` performance anti-patterns (try/catch inside loops → V8 de-opt; exceptions as control flow; individual `await try/catch` blocking parallelism; double stack capture from re-throw after log)
   - Blocking I/O in async paths (`readFileSync` etc. on the request path)
   - Hot-path allocations (JSON.parse, object spread, string concat in loops)
   
   Every finding requires a `read()` of the exact lines — no findings from grep output alone. A **coverage confidence loop** after all 5 scans cross-checks grep coverage against the source file list, re-passes if < 7/10 confidence (max 3 attempts).

3. **Phases 2–5** — profile → identify hotspot → fix → verify with before/after benchmarks.

4. **Phase 6 — Full report** — writes `docs/PERFORMANCE_REPORT.md` with a mandatory template: executive summary, baseline measurements table, one block per static finding (verbatim code + loop bound + specific impact + concrete fix), profiler results, fix before/after code, final benchmark (P50/P95), regression check table, deferred backlog with effort/priority, data size thresholds, coverage verdict, handoffs recommended.

**Output files:**
- `docs/performance/PERF_TRACKER.md` — live session tracker (updated after every phase)
- `docs/PERFORMANCE_REPORT.md` — final full report

**Key rules:**
- Static findings from Phase 1b are **suspects** — always confirmed with a profiler before being fixed
- Phase 5 (verify-fix) uses a raised confidence threshold of 8/10 — a fix without before/after numbers is not verified
- The confidence gate reads from `PERF_TRACKER.md`, not from context memory — safe to resume interrupted sessions

**try/catch and performance** — the agent explicitly checks whether error-handling constructs are costing you performance, which is distinct from whether they're *correct* (that's `code-reviewer`'s job). If the same `try/catch` also swallows errors, the report will recommend a `code-reviewer` handoff for the correctness angle.

### `/dba`
Modes: `--design`, `--migrate`, `--tune`, `--review`

```
/dba --design "user + session + audit tables"
/dba --migrate                  # generate migration from current schema
/dba --tune "SELECT * FROM orders WHERE ..."    # query optimization
/dba --review                   # review existing schema for issues
```

Output: `docs/db/`.

### `/ux`
Modes: `--design`, `--review`, `--audit`

```
/ux --design "onboarding flow for new users"
/ux --review src/components/SettingsPanel.tsx
/ux --audit                     # WCAG 2.2 AA accessibility audit
```

Reference: `references/design-review-checklist.md`. Output: `docs/design/`.

### `/api-design`
Modes: `--design`, `--review`, `--version`, `--document`

```
/api-design --design "REST API for task management"
/api-design --review src/routes/
/api-design --version           # plan a major version bump
/api-design --document          # generate OpenAPI from code
```

Reference: `references/rest-api-checklist.md`.

### `/containers`
Modes: `--build`, `--compose`, `--debug`, `--optimize`

```
/containers --build             # write / fix Dockerfile
/containers --compose           # docker-compose / podman-compose config
/containers --debug             # debug a failing container
/containers --optimize          # production image size + layers
```

### `/devops`
Modes: `--cicd`, `--monitor`, `--runbook`, `--incident`

```
/devops --cicd                  # CI/CD pipeline (GitHub Actions, Gitea Actions, etc.)
/devops --monitor               # monitoring + alerting setup
/devops --runbook "deploy to prod"
/devops --incident              # incident response playbook
```

### `/frontend`
Modes: `--implement`, `--polish`, `--system`

```
/frontend --implement           # implement UX_SPEC.md + STYLE_GUIDE.md into production components
/frontend --polish              # take existing UI and elevate typography, color, spacing, motion
/frontend --system              # create or refactor design token system (colors, fonts, spacing, shadows)
/frontend                       # auto-detect: --polish if UI exists, --system if no tokens found
```

Used by `sdlc-lead` in Phase 3 after the UX spec is approved, and in `/sdlc improve "frontend"`. Distinct from `/ux`: UX handles workflows and accessibility; frontend handles visual implementation and polish.

### `/explore`

```
/explore                        # trace a feature or concept end-to-end through the codebase
```

Codebase archaeology — finds all entry points for a feature, traces call chains, maps the data flow, and produces a file:line blast radius map. Use this before `/sdlc feature` or any time you need to understand how something works before touching it. Produces `docs/explore/EXPLORE_[slug].md`.

### `/design-options`

```
/design-options                 # generate 2-3 architecture alternatives with trade-offs
```

Architecture decision tool. Before committing to an approach, generates 2-3 alternatives with explicit trade-offs (cost, complexity, reversibility, fit with team constraints). Prevents building the wrong thing well. Use during `/sdlc` Phase 3 or any time you face a "how should we build this?" decision. Output: `docs/DESIGN_OPTIONS_[topic].md`.

### `/simplify`

```
/simplify                       # quick review of recent changes for reuse opportunities and over-engineering
```

Scoped to what just changed (git diff). Faster than `/review-code` — looks for: duplicated logic that could reuse an existing abstraction, over-engineered solutions where a simpler approach would do, and obvious quality gaps introduced in the last edit session.

### `/steward`

```
/steward                        # audit CLAUDE.md / AGENTS.md against actual codebase, capture session learnings
```

Project intelligence lifecycle. CLAUDE.md and AGENTS.md drift from the actual codebase as code evolves and decisions are made in conversation but never written down. The steward audits them for gaps, captures learnings from the current session, and updates project docs to stay aligned with reality. Use after any major session or when docs feel stale.

---

## Tips

- **Let experts hand off.** If `code-reviewer` finds a security issue, it will flag it and hand off to `security-auditor` rather than fix it. Run the handoff expert next.
- **Every expert reads its reference checklist at the start of every invocation.** If you want to change behavior, edit the reference — not the agent prompt.
- **Confidence gates exist to protect you.** A failed gate means the report isn't trustworthy yet. Read the specific gap the expert surfaces and resolve it before using the report.
- **Expert output dirs are gitignored** — they are per-project generated reports, not shared source. Commit them yourself only if you want to.
- **For destructive git operations, read the whole confirmation prompt.** `git-expert` prints the recovery command before every destructive op — save that command before confirming.
- **If a task looks frozen, check the label.** The `task` tool updates its title in real time — `task: db-architect — 45s — ▶ Phase 3...` means it's alive and working. True hangs show no elapsed time increase.
- **`sdlc-lead` delegates everything.** It never writes code itself — it orchestrates. When it says "delegating to `test-engineer`", expect a `task:` label to appear and resolve in under 2 minutes per phase.
- **Phase files accumulate in `docs/work/`.** Each `--phase: N` sub-task writes its findings to `docs/work/<agent>/<slug>/phaseN.md`. If an agent stops early, the phase files show you exactly where it got to.
