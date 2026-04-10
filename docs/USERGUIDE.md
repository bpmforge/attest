# User Guide

How to use the BPM OpenCode Experts. For *what* each expert is, see [FEATURES.md](FEATURES.md).

## Table of contents

- [Install](#install)
- [Core concepts](#core-concepts)
- [Typical workflows](#typical-workflows)
- [Per-expert usage](#per-expert-usage)
  - [`/sdlc` — SDLC workflow](#sdlc)
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
`sdlc-lead` will run a discovery interview, bootstrap the repo via `git-expert --init`, then walk you through Phase 0 (Vision) → Phase 5 (Review) with gates between every phase.

### Existing codebase you don't understand
```
/sdlc onboard
```
`sdlc-lead` will produce a high-level architecture document, operation sequence diagrams, and an onboarding guide. It also calls `code-reviewer --review`, `code-reviewer --debt`, and `code-reviewer --patterns` to surface health issues.

### Add a feature to an existing project
```
/sdlc feature "OAuth refresh token support"
```
`sdlc-lead` runs a feature discovery interview → design → `git-expert --feature` (branch) → implement → `test-engineer` → `code-reviewer --review` → `git-expert --feature` (commit + draft PR).

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
Modes: `init`, `onboard`, `feature`, `status`, `validate`

```
/sdlc init my-app "AI assistant for developers"
/sdlc onboard
/sdlc feature "Magic link login"
/sdlc status                    # show current phase + gate state
/sdlc validate                  # validate all SDLC documents
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
