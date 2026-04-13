# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [Semantic Versioning](https://semver.org/).

## [0.7.0] — 2026-04-13

Performance engineer deep upgrade: persistent session tracker, pre-profiling static analysis pass with try/catch performance anti-patterns, coverage confidence loop, and mandatory full report template. Also fixes stale `mode: subagent` references across all docs.

### Added

- **`PERF_TRACKER.md` — persistent performance session tracker** (`cd5357b`) — Written at Phase 1, updated after every phase via `edit()`. Stored at `docs/performance/PERF_TRACKER.md`. Survives context loss and session restarts. Tracks: 7-row progress summary (status/confidence per phase), baseline metrics, static analysis findings, profiler results, hotspot log, before/after benchmark table (filled across phases 2, 4, 5). Status transitions: `⏳ PENDING` → `✅ DONE` / `🔄 RE-PASS` / `⚠️ BLOCKED`.

- **Phase 1b — Static Analysis Pass** (`cd5357b`) — New phase between "understand problem" and "profile". Runs 5 grep scans against all source files to detect performance anti-patterns statically, before any profiler runs. Source file inventory (`find . -type f ...`) runs first so the agent knows the full scope.

  Scan 1 — **O(n²) nested loops**: `.find()` / `.filter()` / `.some()` inside `for` / `forEach`.
  
  Scan 2 — **N+1 query patterns**: DB/fetch call inside a loop; suggests `findMany` + `Map` pre-build.
  
  Scan 3 — **try/catch performance anti-patterns** (four patterns, four languages):
  - Pattern A: `try/catch` inside tight loop → V8 cannot apply JIT optimizations (inlining, hidden class caching, escape analysis) → 5-20x slowdown. Fix: move try/catch outside loop or use `Promise.allSettled`.
  - Pattern B: Exception-driven control flow in hot paths (e.g. `try { JSON.parse } catch` called 10,000×/req) → 100-1000× slower than a guard check.
  - Pattern C: Individual `try/catch` per `await` → each `await` blocks on completion, preventing `Promise.allSettled` parallelism. Three 200ms calls = 600ms serial vs 200ms parallel.
  - Pattern D: Re-throw after logging → stack captured twice (on throw + on re-throw); noisy logs + perf cost.
  - Python: EAFP misuse — `try/except KeyError` in hot loop instead of `.get(default)`.
  - Go: `errors.New()` in hot loop → heap allocation per call; fix with sentinel error at init.
  - Rust: `unwrap()` panic path in tight loop → `filter_map` / `.ok()` avoids panic overhead.
  
  Scan 4 — **Blocking I/O in async paths**: `readFileSync`, `execSync`, `bcrypt.hashSync` etc. inside request handlers. Blocks Node.js event loop for all concurrent requests.
  
  Scan 5 — **Hot-path allocations**: `JSON.parse` per request on static data, object spread in tight loops, string concatenation loops instead of buffers.

- **Coverage confidence loop** (`eaed023`) — After all 5 scans, agent cross-checks grep coverage against the source file list with a 9-question checklist (all scans run? all hits read? all extensions covered? absence-of-findings suspicious?). Rates coverage 1-10. Re-passes with broader patterns if < 7 (max 3 attempts). Prints a mandatory `Phase 1b Coverage Verdict` block. Sets `⚠️ BLOCKED` and surfaces to user if still < 7 after 3 passes.

- **Verbatim code mandate on all findings** (`eaed023`) — Every finding in every scan now requires `read(filePath=..., offset=<line-5>, limit=20)` before the finding is recorded. Each finding's block has a `Verbatim code (lines N–M):` section with exact output from `read()`. Findings from grep output alone are explicitly prohibited.

- **Full mandatory report template — Phase 6** (`eaed023`) — Replaces the previous 5-bullet list. `docs/PERFORMANCE_REPORT.md` must be filled in completely (placeholder dashes = incomplete). Template sections: executive summary, baseline measurements table (P50/P95, data size, method), one `STATIC-NNN` block per finding (verbatim code + loop bound + specific impact reason + concrete fix code + profiler confirmation status), profiler results table (top hot functions with file:line and time%), fix applied (before/after verbatim code + rationale), final benchmark (P50/P95 before/after + improvement factor + regression column), regression check table, known remaining bottlenecks (S/M/L effort + P0/P1/P2 priority), data size thresholds, coverage verdict (per-scan file count + finding count + confidence), handoffs recommended (expert + finding + specific reason).

- **Confidence gate reads from `PERF_TRACKER.md`** (`cd5357b`) — Gate prints a 7-row confidence table derived from the tracker file, not from context memory. Phase 5 (verify-fix) uses raised threshold of 8/10 — a fix without before/after benchmark numbers is not considered verified.

- **Resume check at Phase 2** (`cd5357b`) — `read(filePath="docs/performance/PERF_TRACKER.md")` before profiling starts; skips `✅ DONE` phases, surfaces `⚠️ BLOCKED` to user before continuing.

### Changed

- **`performance-engineer` phase count: 6 → 7** — Phase 1b (static analysis) is a distinct new phase between understand and profile. Updated orchestrator plan announcement and tracker row count.
- **`performance-engineer` handoff boundary clarified** — try/catch-in-loop: performance-engineer owns the runtime cost; code-reviewer owns the swallowed-error / correctness angle. Both agents can flag the same instance for different reasons without duplicating findings.
- **`docs/FEATURES.md`** — performance-engineer entry expanded from 1 line to full capability description. All 13 agent entries updated from `mode: subagent` → `mode: primary` (reflects the v0.5.0 change that was not reflected in docs). Agent count header corrected from 12 → 13.
- **`docs/USERGUIDE.md`** — `/perf` section expanded: full 7-phase description, Phase 1b scan list, output file paths corrected (`docs/perf/` → `docs/PERFORMANCE_REPORT.md` + `docs/performance/PERF_TRACKER.md`), try/catch and performance handoff boundary documented.



Test-driven SDLC, visual design agent, smart routing, adaptive questioning, and design compliance enforcement. Based on lessons from a real 60-test QA track on Sibling.

### Added

- **`frontend-design` agent (#13)** + `/frontend` skill — Production-grade visual implementation: typography, color systems, spacing, motion. Three modes: `--implement` (turn UX specs into components), `--polish` (elevate existing generic UI), `--system` (build/refactor design tokens). Includes "AI slop" checklist to catch generic AI-generated look.
- **`/explore` skill** — Codebase archaeology: trace a feature end-to-end before modifying it. Maps entry points, call chains, data flow, blast radius with file:line references.
- **`/steward` skill** — Project intelligence lifecycle: audits CLAUDE.md/AGENTS.md alignment with actual code, captures session learnings, fixes doc drift. Three modes: `audit`, `capture`, full.
- **`/design-options` skill** — Multi-approach architecture decisions: generates 3 alternatives (minimal, clean, pragmatic) with 6-dimension trade-off matrix. Integrated into Mode 3 Step 2 and Mode 4 Step 2.5.
- **Smart Routing** — `/sdlc` without a mode keyword detects intent from natural language. "Make the frontend better" → Mode 4 with frontend scope. When ambiguous, asks ONE routing question (A/B/C/D).
- **Adaptive Questioning** — Agents learn from research and audits, then generate follow-up questions derived from what they discovered. Questions must reference something specific, affect the next step, and couldn't have been asked at start.
- **Design Compliance (MANDATORY)** — 8 code-writing agents now read TECH_STACK.md + ARCHITECTURE.md before writing code. Will NEVER introduce technologies the architect didn't choose. If they think a change is better, they flag it as a decision point.
- **API Verification (MANDATORY)** — 6 code-writing agents check Context7 MCP or node_modules before using any library API. Never guesses from training data. Prevents renamed functions, changed option shapes, moved import paths.
- **Completion Manifest protocol** — All 12 specialist agents produce structured return manifests: files produced/modified, decisions made, known issues, test results.
- **Context Packet protocol** — SDLC lead writes focused context files before every HANDOFF, front-loading specialists instead of having them re-explore the codebase.
- **USE_CASES.md + TEST_PLAN.md in all 4 modes** — Phase 2 (from requirements), Mode 2 Step 6c (from existing code), Mode 3 Step 2 (for new features), Mode 4 (per-fix regression tests).
- **E2E test writing in Phase 4** — MANDATORY test-engineer handoff writes actual E2E specs for all P0 use cases BEFORE code review starts.
- **Discovery audit** — SDLC lead walks all app pages/routes and collects errors (console, 4xx/5xx, visible error text, slow loads) before and after improvements.
- **Pre-review gate** — All P0 tests must pass before code-reviewer or security-auditor sees the code.
- **TDD in Mode 3** — Test-engineer writes failing acceptance test first, developer implements, test passes, then review.
- **Mode 4 Vision Research** — When user provides a desired state ("make it feel like Linear"), researcher studies how best products achieve that vision with the current stack. `/design-options` triggered when multiple paths exist.
- **Mode 4 Feature-scoped improvement** — `/sdlc improve "feature:payments"` traces that specific feature via `/explore`, then scopes all audits to just those files.
- **Mode 4 granular scoping** — "frontend", "backend", "feature:X", "design", or combinations.
- **`/sdlc status` enhanced** — Visual progress display with phase→deliverable mapping, test counts, gate blockers, handoff state.
- **`/sdlc gate` implemented** — Full gate check with quality scoring, test gates, failure handling rules.
- **Container-ops → SRE ordering** clarified in AGENT_PROCESS_FLOW.md.
- **Researcher progress announcements** standardized to `▶ Phase N:` format.

### Changed

- All agents use `mode: "primary"` (OpenCode 1.4.0 compatibility).
- Mode 4 discovery interview expanded: new Q3 "What should it BECOME?", granular scope options.
- Mode 3 Step 1 now uses `/explore` pattern for impact analysis.
- Mode 3 Step 2 uses `/design-options` for non-trivial features.
- HANDOFF return verification strengthened: checks completion manifest, surfaces test failures.

## [0.5.0] — 2026-04-10

Mode 4 (`/sdlc improve`), strict git branching discipline across all modes, HANDOFF block overhaul, and Bounded Task Mode on all specialist agents.

### Added

- **Mode 4 (`/sdlc improve ["<focus>"]`)** — New SDLC mode for discovery-driven improvement of existing systems. Runs targeted specialist audits (UX, code quality, performance, security, DB), synthesizes findings into a prioritized improvement backlog (S/M/L sizing), and executes approved items with the right ceremony for their size (S = direct + verify, M = design step first, L = spawn Mode 3 sub-workflow). Optional focus arg narrows scope: `"ux"`, `"performance"`, `"security"`, `"code-quality"`.
- **Git Discipline section (mandatory — all modes)** — New top-level section defining the branching model: `main` = production, no direct commits. Each mode now creates a typed branch before touching any file: `sdlc/setup` (Mode 1 phases 0–3), `docs/onboard` (Mode 2), `feat/[slug]` (Mode 3), `improve/[slug]` (Mode 4). Every mode ends with a PR — no work merges without one.
- **`sdlc/setup` branch for Mode 1** — Phases 0–3 design docs all commit to `sdlc/setup`, not `main`. After Phase 3 gate passes, the branch is merged to `main` via PR before Phase 4 implementation begins. Feature branches cut from updated `main`.
- **Mode 2 branch + PR** — `docs/onboard` branch created at Step 0. All onboarding docs committed there. PR opened at end — docs don't land on `main` without review.
- **Mode 3 explicit merge step** — After all reviews pass in Step 4, `git-expert` marks the draft PR as ready and squash-merges to `main`. Branch deleted after merge.
- **Mode 4 branch + PR** — `improve/[slug]` branch created at Step 1 before any audit work. All findings and implementation committed there. PR opened at wrap-up.
- **Bounded Task Mode on all 11 specialist agents** — `SDLC-TASK for [agent]:` prefix triggers a scoped execution mode: skip discovery, skip orchestrator phases, read only the files listed under CONTEXT, execute exactly the task in YOUR TASK, write exactly the files in PRODUCE, print the exact completion phrase, then stop. Prevents specialists from running full multi-phase workflows when invoked via HANDOFF.
- **SDLC-TASK HANDOFF format on all 33 delegation points** — Every specialist HANDOFF in `sdlc-lead` now uses the structured `SDLC-TASK for [agent]: CONTEXT / YOUR TASK / PRODUCE / completion phrase` format. Specialists execute bounded jobs without triggering their own orchestrator workflows.
- **Mode 4 Improvement Discovery Interview** — Structured interview determines which audits to run based on what's driving the improvement (user complaints, perf concerns, tech debt, security, etc.). Announces audit plan and waits for user confirmation before running any specialists.

### Changed

- **`sdlc-lead` description** updated to include Mode 4 (`/sdlc improve`).
- **`sdlc-lead` command table** updated from "Three Operating Modes" to "Four Operating Modes".
- **All Phase 0–3 git commits** now explicitly target `sdlc/setup` branch (not "current branch").
- **`sdlc-lead` Rules** — Three new rules: never commit to `main` directly, always create the mode's branch before starting, always open a PR before merging.
- **All specialist agents** changed from `mode: "subagent"` to `mode: "primary"` — fix for OpenCode 1.4.0 which hides `subagent`-mode agents from direct invocation. All 12 agents now visible in the UI.

---

## [0.4.0] — 2026-04-10

Multi-agent orchestration, real-time progress feedback, phase-splitting for long-running agents, full git and UX wiring throughout the SDLC, and a comprehensive test suite.

### Added

- **Researcher orchestrator + `--single` + `--plan` modes** — The `researcher` agent no longer runs as one silent multi-minute block. In orchestrator mode (default) it announces its plan, spawns a `--single` sub-task per question via the `task` tool, and reports each finding as it completes (`✓ Q1: ...`). `--single` researches exactly one question in 30–60 s. `--plan` returns a question list only.
- **Orchestrator + `--phase: N` mode on all 8 long-running agents** — `db-architect`, `test-engineer`, `sre-engineer`, `container-ops`, `performance-engineer`, `api-designer`, `security-auditor`, `code-reviewer` all gained the same two-mode pattern. Orchestrator announces a phase plan, spawns one sub-task per phase (each writes to `docs/work/<agent>/<slug>/phaseN.md`), reports `✓ Phase N: [finding]` after each. `--phase: N name` runs only that phase in under 90 s.
- **Progress announcements mandatory on all 10 agents** — Every agent now has a `## Progress Announcements` section requiring `▶ Phase N: [name]...` at start and `✓ Phase N complete: [summary]` at end of every phase. These surface in the `task` tool's UI label via `context.metadata`.
- **Real-time metadata on every assistant message** — `task.ts` fires `context.metadata` on every JSON event from stdout, not just on the 5 s heartbeat.
- **`scripts/test.ts`** — Comprehensive test suite replacing `validate-tools.js`. Three passes: (1) dynamically imports each `.ts` tool via Node 24 native TS, validates runtime shape; (2) parses skill frontmatter, validates name/description/agent cross-references; (3) checks agent content length and role/identity.
- **`scripts/add-orchestrator.mjs`** — Script to insert the orchestrator + phase-mode block into new agents.
- **`mode: "subagent"` frontmatter on all 11 specialist agents** — Correct classification for OpenCode native task tool when custom agent support ships. `sdlc-lead` gets `mode: "primary"`.
- **`sdlc-lead` Mode 2: git history inspection (Step 0)** — `git-expert --inspect` runs before any code is read; hot files and recent activity focus landscape mapping.
- **`sdlc-lead` Mode 2: UI detection** — Step 1 detects UI frameworks/directories, records `UI-bearing: YES/NO`.
- **`sdlc-lead` Mode 2: UX audit** — If UI-bearing, Step 6 calls `ux-engineer --audit`.
- **`sdlc-lead` Mode 2: docs commit** — Step 7 calls `git-expert` to commit all produced onboarding docs.
- **`sdlc-lead` Mode 1: git checkpoints after phases 0–3** — `git-expert` commits phase docs after each gate. Nothing advances uncommitted.
- **`sdlc-lead` Mode 3: UX review in implementation** — Step 3 calls `ux-engineer --review` after code review for UI features; CRITICAL/HIGH block the PR. Step 4 adds accessibility audit. Step 5 updates `UX_SPEC.md` and commits docs.
- **`sdlc-lead` Phase 3/4/5: explicit `task()` calls with timeouts** — All delegations now have concrete `task(agent=..., prompt=..., timeout=...)` blocks sized for orchestrator depth (480–720 s).

### Changed

- **`task.ts` max timeout 600 s → 900 s** — 6 phases × 120 s = 720 s; new cap provides headroom.
- **`task.ts` default timeout 120 s → 180 s**.
- **`tools/grep-mcp.ts`** — Fixed `require('child_process')` in ESM module; replaced with `import { exec as execCb }`.
- **`package.json`** — `"type": "module"`, test script uses `node --experimental-strip-types`.
- **`sdlc-lead` researcher calls include numbered questions** — All three research delegations provide explicit questions so orchestrator mode activates without a planning round-trip.

### Architecture note

The `task` tool spawns `opencode run --agent X --format json` as a subprocess — the correct workaround for the current OpenCode limitation where the built-in task tool only supports `general` and `explore` (custom agents not yet supported: [anomalyco/opencode#20059](https://github.com/anomalyco/opencode/issues/20059)). When OpenCode ships full custom agent support, switching to the native task tool will give proper child-session visibility in the TUI sidebar without needing `context.metadata` hacks.

---

## [0.3.0] — 2026-04-10

Major upgrade wave: new `git-expert` agent, three-mode `code-reviewer` rewrite, three-mode `ux-engineer` rewrite, deeper `security-auditor`, sdlc-lead discovery interviews, asymmetric confidence gates applied across every agent. Repository cleanup + new documentation.

### Added
- **`git-expert`** — New 6-mode agent (`--init`, `--feature`, `--release`, `--recover`, `--inspect`, `--sync`). Handles repo bootstrap, daily feature-branch flow with atomic commits and draft PRs, semver releases with Keep-a-Changelog, reflog-based recovery, history forensics (blame / pickaxe / bisect), and multi-remote sync (Gitea + GitHub). Includes secret-scanning, reflog backups before destructive ops, and explicit confirmation gates. Wired into `sdlc-lead` at Phase 0, Phase 4, Phase 5, and Mode 3.
- **`references/git-workflow-checklist.md`** — Canonical rules for conventional commits, SemVer 2.0, Keep-a-Changelog, language-aware `.gitignore` presets, recovery scenarios, report templates, and destructive-op confirmation templates.
- **`code-reviewer` four modes** — `--review` (7-dimension health pass), `--debt` (leverage-sorted tech-debt register), `--consolidate` (DRY + error-handling consolidation with Consolidation Catalog), `--patterns` (cross-codebase drift audit).
- **`references/code-health-checklist.md`** — 7 dimensions, silent-failure hunter, consolidation catalog, language thresholds, confidence scoring, report templates.
- **`ux-engineer` three modes** — `--design` (WCAG-aware component design), `--review` (Nielsen Norman heuristic pass), `--audit` (accessibility audit with live-environment methodology).
- **Discovery Interviews + Confidence Loops** on `sdlc-lead` — Mode 1 and Mode 3 now start with a mandatory interview protocol; every phase ends with a per-document confidence gate (asymmetric: < 5 = fail, 5-6 = revise max 3x, ≥ 7 = pass).
- **Inter-Phase Check-In + Research Findings Review protocols** — Prevents `sdlc-lead` from auto-advancing phases and forces it to reconcile research with prior decisions.
- **Semgrep deep upgrade** — Community rules integration, framework auto-detect, two-tier scans in `security-auditor`.
- **Skeleton-first security report format** — Rewritten to surface actionable intel first.
- **Verifier isolation + reader simulation + asymmetric gates** — Applied across all 12 agents.
- **MemPalace MCP integration** — Persistent memory for OpenCode workflows.
- Repository cleanup: `.gitignore`, `CHANGELOG.md`, shortened `README.md`, `docs/FEATURES.md`, `docs/USERGUIDE.md`.

### Changed
- **`sdlc-lead` Phase 0 now calls `git-expert --init` first** — so VISION.md is the first tracked artifact.
- **`sdlc-lead` Phase 4 calls `git-expert --feature`** per completed feature for branch + atomic commits + draft PR.
- **`sdlc-lead` Phase 5 calls `git-expert --release`** once reviews pass — semver bump + signed tag + GitHub/Gitea releases.
- Agent descriptions now use trigger-aware "pushy" language so they surface proactively.
- OpenCode-specific compatibility fixes and session-context tooling.

## [0.2.0] — 2026-04-09

End-of-day state after a major expert-depth push. 11 experts upgraded with real per-phase iteration loops, instinct patterns, deep threat modeling, verbatim code snippet enforcement, and a Mode 2 (`sdlc onboard`) overhaul with high-level architecture + operation sequence diagrams.

### Added
- **Real expert behavior** across all 11 agents — per-phase iteration, instinct patterns, deeper threat modeling.
- **Semgrep integration** in `security-auditor` — auto-install, auto-detect language, guided setup.
- **Context7 MCP** — Live library documentation lookup reference available to all agents.
- **Custom OpenCode tools** — `tools/` directory with 18 TypeScript tools (bash, grep-mcp, write, append, update, file-info, task, test-runner, playwright-test, playwright-web, semgrep-scan, semgrep-rule, simplify-file, pomodoro, run, log-parser, loop-detector, deploy).
- **Micro-loop pattern** applied to all 11 agents (Sibling lessons absorbed).
- **Detailed security + code review reports** — verbatim code quotes, concrete exploitation explanations, file:line anchors.
- **Mode 2 (`sdlc onboard`) overhaul** — high-level architecture pass, operation sequence diagrams, confidence loop.
- Local LLM compatibility fixes across all 11 agents.

### Changed
- Phase agents consolidated into a single `sdlc-lead` program manager with 3 operating modes (init, onboard, feature).
- Install script (`install.sh`) hardened: idempotent clean-reinstall, safely merges Context7 MCP into existing `opencode.json`, checks for Semgrep.
- Agent directory structure + frontmatter fixed for OpenCode compatibility.

## [0.1.0] — 2026-04-06

Initial public release of the BPM OpenCode Expert system.

### Added
- **11 specialist agents**: `sdlc-lead`, `security-auditor`, `researcher`, `test-engineer`, `db-architect`, `ux-engineer`, `sre-engineer`, `container-ops`, `code-reviewer`, `performance-engineer`, `api-designer`.
- **14 slash commands** triggering the agents: `/sdlc`, `/security`, `/research`, `/test-expert`, `/dba`, `/ux`, `/devops`, `/containers`, `/review-code`, `/perf`, `/api-design`, `/gate`, `/review`, `/simplify`.
- **6 reference documents** covering OWASP, engineering artifacts, REST APIs, Playwright, Semgrep, severity matrices.
- **Install scripts** for global (`~/.config/opencode/`) or project-level setup.
- **Full documentation**: expert guide, SDLC guide, contributing guide.
- **Interoperable** with the sibling `claude-experts` project for Claude Code — works with any LLM backend (Claude, OpenAI, Gemini, Ollama, LM Studio, 75+ providers).

[0.7.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.5.0...v0.6.0
[0.3.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bpmforge/bpm-opencode-experts/releases/tag/v0.1.0
