# User Guide

How to use the BPM OpenCode Experts. For *what* each expert is, see [FEATURES.md](FEATURES.md).

## Table of contents

- [Install](#install)
- [Core concepts](#core-concepts)
- [Typical workflows](#typical-workflows)
- [Per-expert usage](#per-expert-usage)
  - [`/sdlc` — SDLC workflow (4 modes)](#sdlc)
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

---

## Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh                  # symlinks into ~/.config/opencode/
```

The installer:
- Symlinks `agents/`, `skills/`, `references/`, `commands/`, `hooks/` into `~/.config/opencode/`
- Compiles and registers the custom TypeScript tools in `tools/`
- Safely merges Context7 MCP config into your existing `opencode.json`
- Checks for Semgrep (and optionally installs it) for `security-auditor`

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
| `code-reviewer` | `docs/reviews/CODE_REVIEW_<date>.md` etc. |
| `security-auditor` | `docs/security/` |
| `git-expert` | `docs/git/` |
| `researcher` | `docs/research/` |
| `sdlc-lead` | `docs/` (VISION.md, SCOPE.md, etc. per phase) |
| `test-engineer` | `docs/test/` |
| `performance-engineer` | `docs/perf/` |
| `db-architect` | `docs/db/` |
| `ux-engineer` | `docs/design/` |

These directories are gitignored by default — they are per-project generated reports, not shared source.

### Confidence gates

Every agent ends with an asymmetric confidence gate:
- Score < 5 on any dimension = automatic fail, surface the gap, do NOT iterate
- Score 5-6 = revise that specific dimension (max 3 revision passes)
- Score ≥ 7 = pass

When an expert says "gate failed", it's telling you the report isn't ready. Ask it to address the specific gap.

---

## Typical workflows

### New project from scratch
```
/sdlc init my-app "Short description of what it is"
```
`sdlc-lead` runs a discovery interview, calls `git-expert --init` (repo bootstrap + branch protection on `main`), creates a `sdlc/setup` branch, then walks through Phase 0 → Phase 3 with git checkpoints after every phase. After Phase 3 gate passes, `sdlc/setup` merges to `main` via PR. Phase 4 feature work runs on `feat/[slug]` branches. Expect 6–8 agent delegations across the full run.

### Existing codebase you don't understand
```
/sdlc onboard
```
`sdlc-lead` creates a `docs/onboard` branch, runs `git-expert --inspect` first (hot files, commit history), detects if the project has a UI, then produces architecture docs and an onboarding guide. If UI-bearing, `ux-engineer --audit` runs automatically. All produced docs are committed via PR to `main`.

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
Modes: `--owasp`, `--semgrep`, `--threat-model`, `--deps`

```
/security --owasp               # OWASP Top 10 pass
/security --semgrep             # deep static analysis (auto-installs semgrep)
/security --threat-model        # STRIDE threat model
/security --deps                # dependency vulnerability audit
```

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

### `/test-expert`
Modes: `--strategy`, `--unit`, `--e2e`, `--coverage`

```
/test-expert --strategy         # test strategy before coding
/test-expert --unit src/auth/   # write unit tests for a module
/test-expert --e2e              # write Playwright e2e flows
/test-expert --coverage         # coverage analysis with gap report
```

Reference: `references/playwright-config.md`. Output: `docs/test/`.

### `/perf`
Modes: `--profile`, `--benchmark`, `--optimize`

```
/perf --profile                 # profile current state, flame graph, hot paths
/perf --benchmark               # measure vs NFR targets
/perf --optimize src/pipeline/  # optimize a specific module (after profiling)
```

Never optimizes without measuring first. Output: `docs/perf/`.

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
