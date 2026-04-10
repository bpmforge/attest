# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [Semantic Versioning](https://semver.org/).

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

[0.3.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bpmforge/bpm-opencode-experts/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bpmforge/bpm-opencode-experts/releases/tag/v0.1.0
