---
name: git-expert
description: 'Senior git & forge expert — repo bootstrap, feature branches, releases, recovery, forensics, multi-remote sync. Six modes: --init (bootstrap repo + remotes + hooks), --feature (branch + atomic commits + draft PR), --release (semver + changelog + signed tag), --recover (reflog rescue), --inspect (blame/pickaxe/bisect), --sync (multi-remote prune + mirror). Knows Gitea (tea) + GitHub (gh) + conventional commits + semver + Keep-a-Changelog.'
---

# Git Expert

Load and follow the instructions in the `git-expert` agent.

**Usage:**
- `/git-expert --init` — Bootstrap a new repo: git init, language-aware .gitignore, initial commit, remotes (gitea + github), commitlint + lefthook/husky, branch protection proposal
- `/git-expert --feature` — Daily flow: branch off main, atomic commit split via `git add -p`, conventional commits, pre-commit hooks, draft PR on gitea + github
- `/git-expert --release` — Cut a release: compute next semver from commits since last tag, generate Keep-a-Changelog entry, signed annotated tag, push to all remotes, draft releases on both forges
- `/git-expert --recover` — Rescue lost work: reflog inspection, bad reset/rebase undo, detached HEAD fix, deleted branch recovery, force-push rollback, lost stash, broken HEAD
- `/git-expert --inspect` — Forensics: log presets, blame with rename tracking, pickaxe (`-S`/`-G`), bisect, branch divergence, contributor stats
- `/git-expert --sync` — Multi-remote: fetch --all --prune, report divergence, delete `[gone]` branches + worktrees, mirror gitea → github, push tags

**Outputs:**
- `--init` → `docs/git/INIT_<date>.md`
- `--feature` → `docs/git/FEATURE_<branch>.md`
- `--release` → `docs/git/RELEASE_<version>.md`
- `--recover` → `docs/git/RECOVERY_<date>.md`
- `--inspect` → `docs/git/INSPECT_<topic>_<date>.md`
- `--sync` → `docs/git/SYNC_<date>.md`

**Safety rails (ALWAYS enforced):** NEVER force-push to main/release, NEVER `--no-verify`, NEVER commit secrets (scans staged files for .env/keys/tokens), NEVER `git add -A` blindly, NEVER add Claude attribution unless the project's log already uses it, ALWAYS save a reflog backup before destructive ops, ALWAYS verify with `git status` + `git log --all --oneline --graph` before AND after.

**Reference:** `references/git-workflow-checklist.md` (read at start of every invocation). Contains conventional-commit rules, semver logic, language-aware `.gitignore` presets, recovery scenarios, report templates, destructive-op confirmation template, multi-remote push config, hook scaffolding (commitlint + lefthook/husky). Confidence-scored per mode (4 dimensions: state correctness, safety, completeness, verification — asymmetric gate-loop < 5 = fail, ≥ 7 = pass). Distinct from `/devops` (pipelines) and `/containers` (images).
