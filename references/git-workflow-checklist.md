# Git Workflow Checklist

Reference for the `git-expert` agent. Covers the 6 modes, canonical rules, safety rails, multi-remote workflows, and per-mode report templates.

---

## Modes Overview

| Mode | Purpose | Primary output |
|---|---|---|
| `--init` | Bootstrap a new repo | `docs/git/INIT_<date>.md` + repo configured |
| `--feature` | Daily feature-branch workflow | `docs/git/FEATURE_<branch>.md` + branch + draft PR |
| `--release` | Cut a release (tag + changelog + notes) | `docs/git/RELEASE_<version>.md` + tag pushed |
| `--recover` | Rescue lost work (reflog, bad merge, detached HEAD) | `docs/git/RECOVERY_<date>.md` + restored state |
| `--inspect` | Forensics (blame, pickaxe, bisect, log) | `docs/git/INSPECT_<topic>_<date>.md` |
| `--sync` | Multi-remote sync + prune + clean gone branches | `docs/git/SYNC_<date>.md` |

All modes follow: **understand state → plan → confirm destructive ops → execute → verify → report**.

---

## Canonical Rules (Always Apply)

### Conventional Commits 1.0

Format: `<type>(<scope>)!: <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

- `feat` → MINOR bump
- `fix` → PATCH bump
- `!` after type/scope OR `BREAKING CHANGE:` footer → MAJOR bump
- Scope is optional but preferred (`feat(auth):`, `fix(api):`)
- Subject line ≤72 chars, imperative mood ("add" not "added"), no trailing period
- Body wraps at 72 chars, explains *why* not *what*
- Footers: `Refs: #123`, `Closes: #456`, `Co-Authored-By:`, `BREAKING CHANGE: <desc>`

### Semantic Versioning 2.0

`MAJOR.MINOR.PATCH[-prerelease][+build]`

- MAJOR: breaking change
- MINOR: new feature, backwards compatible
- PATCH: bug fix, backwards compatible
- Pre-release: `1.2.0-alpha.1`, `1.2.0-rc.2`
- Build metadata: `1.2.0+sha.abc1234`
- `0.y.z` = unstable, anything can change
- First stable = `1.0.0`

### Keep a Changelog

Sections in order: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Always keep an `[Unreleased]` section at the top. Link versions at the bottom: `[1.2.0]: https://.../compare/v1.1.0...v1.2.0`.

### Atomic Commits

One logical change per commit. If you can't describe the commit without "and", split it. Use `git add -p` (patch mode) to stage hunks individually. The test suite should pass at every commit.

### Branch Naming

`<type>/<scope>-<short-desc>` — examples: `feat/auth-oauth-refresh`, `fix/api-429-retry`, `hotfix/cve-2026-1234`. Lowercase, hyphens, no spaces. Max 50 chars. Optionally prefix with issue number: `feat/123-oauth-refresh`.

---

## Safety Rails (NEVER without explicit user confirmation)

These are destructive or externally visible. Always print what will happen and require confirmation:

| Operation | Why dangerous |
|---|---|
| `git push --force` / `--force-with-lease` to main/master/release branches | Rewrites published history |
| `git reset --hard` with uncommitted changes | Silent data loss |
| `git clean -fd` / `git clean -fdx` | Deletes untracked files (incl. .env) |
| `git branch -D <branch>` | Deletes unmerged branch |
| `git checkout .` / `git restore .` | Discards all unstaged work |
| `git rebase` on published branches | Rewrites shared history |
| `git filter-repo` / `git filter-branch` | Rewrites entire history |
| `git commit --amend` on pushed commits | Rewrites published history |
| `git update-ref -d` / ref manipulation | Can orphan commits |
| Deleting tags (`git tag -d` + push `:refs/tags/x`) | Breaks release references |

**Rules:**
- NEVER `--no-verify` to skip hooks — fix the underlying issue
- NEVER `git config --global` changes without explicit ask
- NEVER commit files matching `.env*`, `*credentials*`, `*.pem`, `*.key`, `id_rsa*`, `*.p12`, `*.pfx`
- NEVER `git add -A` / `git add .` when untracked files exist — list them first, add explicitly
- NEVER commit directly to `main`/`master` on feature work — create a branch
- NEVER force-push to protected branches
- Before any destructive op: **save a reflog snapshot** (`git reflog > /tmp/reflog-backup-$(date +%s).txt`)

### Destructive-op confirmation template

```
About to run: git reset --hard origin/main
This will DISCARD:
  - 3 uncommitted files (M: src/auth.ts, A: tests/auth.test.ts, D: old.md)
  - 2 local commits (abc123 "wip auth", def456 "fix tests")

Reflog backup saved to /tmp/reflog-backup-1234567890.txt
Recovery: git reset --hard HEAD@{1}

Proceed? (requires explicit user yes)
```

---

## Multi-Remote Workflow (Gitea Primary + GitHub Mirror)

Many teams (and this user's setup) run Gitea as the source of truth with GitHub as a public mirror. Default remote topology for `--init`:

```
origin     git@192.168.0.33:<user>/<repo>.git       (gitea, primary, push+pull)
github     git@github.com:<org>/<repo>.git           (mirror, push only)
```

### Push to both
```bash
git push origin <branch>
git push github <branch>
# or configure origin with multiple push URLs:
git remote set-url --add --push origin git@192.168.0.33:<user>/<repo>.git
git remote set-url --add --push origin git@github.com:<org>/<repo>.git
# now `git push origin` pushes to both
```

### CLI tooling
- `gh` — GitHub CLI, must be authenticated (`gh auth status`)
- `tea` — Gitea CLI, must be logged in (`tea login list`); fallback: `curl` against Gitea API with token
- User helper: `~/.claude/scripts/gitea` — creates repos, lists, API calls (see `memory/gitea-cli.md`)

### PR creation on both
```bash
gh pr create --title "..." --body "..." --draft
tea pr create --title "..." --description "..." --target main
```

---

## Mode 1: `--init` — Repo Bootstrap

### Subtask list
```
[1] Verify parent dir, confirm repo name, detect language — PENDING
[2] Run `git init` — PENDING
[3] Generate language-aware .gitignore — PENDING
[4] Create README.md skeleton, LICENSE (if user specifies), CHANGELOG.md — PENDING
[5] Configure user.name, user.email (local), signing key if available — PENDING
[6] Initial commit (`chore: initial commit`) — PENDING
[7] Create main branch, optionally develop branch — PENDING
[8] Configure remotes (gitea primary + github mirror by default) — PENDING
[9] Push initial commit to all remotes — PENDING
[10] Install commit hooks (commitlint + lefthook/husky if package.json) — PENDING
[11] Propose branch protection rules (output to report, don't auto-apply) — PENDING
[12] Write INIT report — PENDING
```

### Language-aware .gitignore presets
- Node/TS: `node_modules/`, `dist/`, `build/`, `.next/`, `.turbo/`, `coverage/`, `*.log`, `.env*`, `!.env.example`
- Python: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `dist/`, `*.egg-info/`, `.env`
- Go: `vendor/`, `*.test`, `*.out`, `bin/`, `.env`
- Rust: `target/`, `Cargo.lock` (only for libs), `.env`
- Universal: `.DS_Store`, `.idea/`, `.vscode/`, `*.swp`, `*.swo`, `.direnv/`
- Secrets (ALWAYS): `.env`, `.env.*`, `!.env.example`, `*.pem`, `*.key`, `id_rsa*`, `*credentials*`, `*.p12`, `*.pfx`

### Branch protection proposal (report only)
- Protect `main`: require PR, require status checks, require signed commits, no force push, no deletion, require linear history
- Protect `release/*`: same + require 1 approval
- Output as a checklist for the user to apply manually in Gitea/GitHub UI or via API

### Report template
```markdown
# Repo Init Report — <repo-name>
Date: YYYY-MM-DD
Language: <detected>
Initial commit: <sha>

## What was created
- [x] git init
- [x] .gitignore (language: <lang>)
- [x] README.md (skeleton)
- [x] CHANGELOG.md (Keep-a-Changelog format)
- [x] LICENSE (<license>) | [ ] skipped
- [x] Initial commit: <sha> "chore: initial commit"

## Remotes configured
- origin → <gitea url>
- github → <github url>

## Hooks installed
- [x] commitlint (conventional commits)
- [x] lefthook | husky (pre-commit)

## Branch protection (manual action required)
- [ ] Enable protection on `main` in Gitea: <url>
- [ ] Enable protection on `main` in GitHub: <url>
- [ ] Require signed commits
- [ ] Require status checks before merge

## Next steps
- Add team members
- Configure CI/CD webhook
- First feature branch: `/git-expert --feature`
```

---

## Mode 2: `--feature` — Daily Feature Workflow

### Subtask list
```
[1] Verify clean working tree OR stash WIP — PENDING
[2] Fetch all remotes, pull main — PENDING
[3] Determine branch name from user input / issue / spec — PENDING
[4] Create branch `<type>/<scope>-<desc>` off main — PENDING
[5] User does work, return for commit — PENDING
[6] Analyze diff, propose atomic commit split via `git add -p` — PENDING
[7] Draft conventional-commit message per commit — PENDING
[8] Run pre-commit hooks (lint, format, typecheck) — PENDING
[9] Create commits — PENDING
[10] Push branch to all remotes — PENDING
[11] Create draft PR on gitea + github via `tea` + `gh` — PENDING
[12] Link issue, add labels, reviewers, test plan — PENDING
[13] Write FEATURE report — PENDING
```

### Commit message drafting rules
1. Read `git log --oneline -20` to match the repo's commit style
2. Subject: `<type>(<scope>): <imperative desc>` ≤72 chars
3. Body: explain *why*, not *what* — the diff shows what
4. Footer: `Refs: #<issue>` if applicable
5. NEVER include "Generated with Claude" / co-author attribution unless the project already uses it (check recent log)
6. If breaking change: add `!` after type/scope AND `BREAKING CHANGE:` footer

### Atomic commit splitting

When the diff contains multiple logical changes, split them:
```bash
git add -p  # interactive hunk-by-hunk
# select hunks for commit 1 (e.g., the new feature)
git commit -m "feat(auth): add oauth refresh token flow"
git add -p  # hunks for commit 2
git commit -m "test(auth): cover oauth refresh edge cases"
git add -p  # hunks for commit 3
git commit -m "docs(auth): document oauth refresh in README"
```

Heuristics for splitting:
- Feature code + its tests = same commit (tests alongside)
- Feature + unrelated refactor = separate commits
- Feature + docs = separate commits (docs can land independently)
- Formatting changes = always separate (`style:` or `chore: format`)

### PR body template
```markdown
## Summary
- <1-3 bullet points, what changed and why>

## Test plan
- [ ] Unit tests pass
- [ ] Manual test: <scenario>
- [ ] <other checks>

## Screenshots (if UI)
<if applicable>

Refs: #<issue>
```

---

## Mode 3: `--release` — Cut a Release

### Subtask list
```
[1] Verify on main, working tree clean, up to date — PENDING
[2] Find last release tag (`git describe --tags --abbrev=0`) — PENDING
[3] Scan commits since last tag, parse conventional commit types — PENDING
[4] Compute next version per semver (major/minor/patch) — PENDING
[5] Generate CHANGELOG.md entry from parsed commits — PENDING
[6] Commit CHANGELOG update (`chore(release): <version>`) — PENDING
[7] Create signed annotated tag (`git tag -s v<version> -m "..."`) — PENDING
[8] Push commit + tag to all remotes — PENDING
[9] Draft GitHub Release via `gh release create` — PENDING
[10] Draft Gitea Release via `tea release create` — PENDING
[11] Write RELEASE report — PENDING
```

### Version bump logic
```
Parse commits since last tag:
  Any `feat!:` or `BREAKING CHANGE:` → MAJOR
  Else any `feat:`                    → MINOR
  Else any `fix:` / `perf:`           → PATCH
  Else no release-worthy changes      → STOP, report to user
```

### CHANGELOG entry generator
Group commits by type into sections:
- `feat:` → `### Added`
- `feat!:` / `BREAKING CHANGE:` → `### Changed` (with ⚠ BREAKING marker)
- `fix:` → `### Fixed`
- `perf:` → `### Changed` (performance)
- `refactor:` → skip (unless user-visible)
- `docs:`, `style:`, `test:`, `chore:`, `ci:`, `build:` → skip
- Deprecations (from commit bodies) → `### Deprecated`
- Security fixes (`fix(security):`) → `### Security`

Each entry: `- <subject> ([<short sha>](<commit url>))`

### Signed tag command
```bash
git tag -s "v<version>" -m "Release v<version>

<changelog-entry-body>"
git push origin "v<version>"
git push github "v<version>"
```

If GPG unavailable, fall back to SSH-signed tags (`git config gpg.format ssh`) or unsigned with a warning in the report.

---

## Mode 4: `--recover` — Rescue Lost Work

### Common scenarios and fixes

| Symptom | Diagnosis | Recovery |
|---|---|---|
| "I ran `git reset --hard` and lost my commits" | Reflog has them | `git reflog` → find commit → `git reset --hard <sha>` |
| "I rebased wrong and lost commits" | Reflog + ORIG_HEAD | `git reset --hard ORIG_HEAD` |
| "I'm in detached HEAD with good work" | Create branch to save it | `git branch rescue-<date>` then `git checkout main` |
| "I deleted the wrong branch" | Reflog has last commit | `git reflog` → `git checkout -b <name> <sha>` |
| "I force-pushed and overwrote teammate's work" | Reflog on teammate's side OR server-side reflog | `git fetch origin +refs/heads/main:refs/heads/main-backup` on their machine |
| "Merge conflict I can't resolve" | Use mergetool or abort | `git merge --abort` or `git mergetool` |
| "I committed to wrong branch" | Cherry-pick + reset | `git cherry-pick <sha>` on right branch, `git reset --hard HEAD~1` on wrong |
| "I committed secrets" | Remove from history | `git filter-repo --path <file> --invert-paths` + rotate secrets + force push (coordinate!) |
| "Stash got lost" | Stash reflog | `git fsck --unreachable | grep commit` → inspect with `git show <sha>` |
| "HEAD points to nonexistent ref" | Manual fix | `git symbolic-ref HEAD refs/heads/main` |

### Recovery protocol (every recovery)
1. **Do not make it worse** — no more destructive ops until state is understood
2. Capture current state: `git status`, `git reflog > /tmp/reflog.txt`, `git stash list`
3. Identify the target state (what commit should HEAD be at)
4. Explain the plan to the user before executing
5. Execute ONE recovery command
6. Verify with `git log --all --oneline --graph -20`
7. Write RECOVERY report with before/after reflog excerpts

### Reflog is your best friend
```bash
git reflog                    # HEAD history
git reflog show <branch>      # branch history
git reflog --all              # everything
git fsck --unreachable        # orphaned commits not in reflog
git fsck --lost-found         # creates refs for dangling objects
```

---

## Mode 5: `--inspect` — Forensics & History

### Log formatting presets
```bash
# Short graph
git log --oneline --graph --all -20

# Detailed with stats
git log --stat --since="2 weeks ago"

# Pretty format for reports
git log --pretty=format:"%h %ad %an: %s" --date=short --since="<date>"

# Commits touching a file across renames
git log --follow --patch -- <file>

# Commits by author
git log --author="<name>" --oneline --since="1 month ago"
```

### Pickaxe (find when a string appeared/disappeared)
```bash
# When was this string added or removed?
git log -S "<literal-string>" --oneline

# When did this regex pattern change?
git log -G "<regex>" --oneline

# Show the actual diff for each match
git log -S "<string>" -p
```

### Blame with rename tracking
```bash
git blame -w -C -C -C <file>
# -w: ignore whitespace
# -C -C -C: detect copies across files aggressively

# Blame a specific line range
git blame -L 45,60 <file>

# Who wrote this line originally (ignore later reformatting)?
git blame --ignore-rev <formatting-commit-sha> <file>
```

### Bisect (regression hunt)
```bash
git bisect start
git bisect bad              # current commit is broken
git bisect good <old-sha>   # this commit was working
# git checks out midpoint; user tests; marks good/bad
git bisect run <script>     # automated: script exits 0=good, 1=bad, 125=skip
git bisect reset            # return to original branch
```

### Branch divergence
```bash
# How far ahead/behind is this branch?
git rev-list --left-right --count main...feature-branch

# Visualize
git log --oneline --graph --decorate main...feature-branch
```

### Contributor stats
```bash
git shortlog -sn --since="1 year ago"        # commit counts
git log --format='%aN' | sort -u | wc -l     # unique contributors
git log --numstat --format='%aN' | awk '...' # lines added/removed
```

---

## Mode 6: `--sync` — Multi-Remote Maintenance

### Subtask list
```
[1] Fetch all remotes with prune — PENDING
[2] Report divergence for each tracking branch — PENDING
[3] Fast-forward clean branches — PENDING
[4] List [gone] branches (remote-deleted) — PENDING
[5] Confirm + delete gone branches + worktrees — PENDING
[6] Mirror gitea → github if configured — PENDING
[7] Push all tags — PENDING
[8] Write SYNC report — PENDING
```

### Commands
```bash
git fetch --all --prune --prune-tags
git branch -vv | grep ': gone]'                    # list gone branches
git worktree list                                  # check worktrees
git worktree prune                                 # clean stale worktrees

# Mirror gitea -> github
git push --mirror github

# Or just tags
git push origin --tags
git push github --tags
```

---

## Hook Scaffolding (for `--init`)

### commitlint config (if Node project)
```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```
`.commitlintrc.json`:
```json
{ "extends": ["@commitlint/config-conventional"] }
```

### lefthook (framework-agnostic, preferred)
`lefthook.yml`:
```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      run: npm run lint
    typecheck:
      run: npm run typecheck
commit-msg:
  commands:
    commitlint:
      run: npx commitlint --edit {1}
pre-push:
  commands:
    test:
      run: npm test
```

### husky (Node-specific fallback)
```bash
npx husky init
echo "npx commitlint --edit \$1" > .husky/commit-msg
```

---

## Report Templates

### Common header (all modes)
```markdown
# Git <Mode> Report — <target>
Date: YYYY-MM-DD
Mode: <--init|--feature|--release|--recover|--inspect|--sync>
Repo: <path>
Branch: <branch>
HEAD before: <sha>
HEAD after: <sha>

## Summary
<1-3 sentences>

## Actions taken
- [x] <action 1>
- [x] <action 2>

## Skipped / Deferred
- [ ] <action> — reason: <...>

## Safety checks
- Reflog backup: <path>
- Pre-flight warnings: <none | list>

## Verification
<commands run to verify success, with output snippets>

## Next steps
- <follow-ups>
```

---

## SDLC Integration Points

The `git-expert` agent should be proactively called by `sdlc-lead` at these moments:

| SDLC Mode / Phase | git-expert mode | What it does |
|---|---|---|
| Mode 1 `init` — Phase 0 start | `--init` | Bootstrap repo, remotes, hooks, CHANGELOG |
| Mode 3 `feature` — Step 0 | `--feature` (branch creation) | Create feature branch from spec |
| Phase 4 Implementation — per feature | `--feature` (commit + PR) | Atomic commits + draft PR |
| Phase 5 Review complete | `--release` (if user says "ship") | Tag + changelog + release notes |
| Any phase — error recovery | `--recover` | Rescue lost work |
| Any phase — forensics ("what changed?") | `--inspect` | Blame, pickaxe, bisect |

---

## Confidence Gate-Loop (all modes)

After executing the mode, score confidence 1-10 on these dimensions:

- **State correctness** — is the repo in the expected state?
- **Safety** — were all destructive ops gated and backed up?
- **Completeness** — were all subtasks completed or explicitly deferred?
- **Verification** — was the result verified with `git status` / `git log`?

Rules:
- Score < 5 on any dimension = **automatic fail**, surface the gap, do NOT iterate
- Score 5-6 = revise (max 3 passes)
- Score ≥ 7 = pass
- Document scores in the report footer

---

## What NOT to do

- Do NOT rewrite published history without explicit user confirmation AND coordination plan
- Do NOT skip hooks with `--no-verify` — fix the failing hook
- Do NOT `git config --global` — always local to the repo
- Do NOT commit without reading `git log --oneline -20` first to match style
- Do NOT invent commit types outside conventional commits
- Do NOT auto-apply branch protection — propose in report, let user apply
- Do NOT push tags silently — always show which tag to which remote
- Do NOT touch `.git/` internals directly — use porcelain commands
- Do NOT use `git rebase -i` — interactive mode blocks automation; use non-interactive equivalents (`git rebase --onto`, `git commit --fixup` + `--autosquash`)
- Do NOT add Claude attribution to commit messages unless the project's existing log already uses it
