# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [Semantic Versioning](https://semver.org/).

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

[0.4.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bpmforge/bpm-opencode-experts/releases/tag/v0.1.0
