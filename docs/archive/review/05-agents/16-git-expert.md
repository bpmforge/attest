[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Container Ops](15-container-ops.md)

---

# 5.16 Git Expert

**File:** `agents/git-expert.md` | **Skill:** `/git-expert`

Six-mode git and forge specialist: init, feature branch lifecycle, release tagging, history forensics, recovery, and multi-remote sync. Enforces a 4-condition merge gate and secret scan before every commit.

## Execution Flow

```mermaid
sequenceDiagram
    participant LEAD as sdlc-lead
    participant GIT as git-expert
    participant SH as Shell
    participant FS as File System

    LEAD->>GIT: HANDOFF (task + mode flag)
    GIT->>FS: Read git-workflow-checklist.md + CLAUDE.md
    GIT->>SH: git remote -v (detect forges: Gitea, GitHub, or both)
    GIT->>SH: gh auth status + tea login list
    GIT->>SH: git status + git log --all --oneline --graph -20

    alt "--feature" mode
        GIT->>SH: git fetch and pull main
        GIT->>SH: Create branch with semantic prefix (feat/, fix/, docs/)
        GIT->>SH: Push branch immediately
        GIT->>SH: Create draft PR (before any code, CI must run from first commit)

        loop Per logical unit
            GIT->>GIT: Secret scan (staged files vs known patterns)
            alt Secret found
                GIT-->>LEAD: STOP - surface file and line to user
            end
            GIT->>SH: git add -p and git commit (atomic)
            GIT->>SH: git push
        end

        GIT->>GIT: Check 4-condition merge gate
        Note over GIT: 1 - RUNTIME report PASS
        Note over GIT: 2 - CI pipeline green
        Note over GIT: 3 - FIX_BACKLOG merge-blocking empty
        Note over GIT: 4 - No open CRITICAL or HIGH review verdicts
        GIT->>SH: gh pr merge --squash
        GIT->>SH: Delete branch
    else "--release" mode
        GIT->>SH: git describe --tags --abbrev=0
        GIT->>SH: git log since last tag (parse conventional commit types)
        GIT->>GIT: Compute next semver (major, minor, or patch)
        GIT->>FS: Write CHANGELOG.md entry (Keep-a-Changelog format)
        GIT->>SH: git tag -s v<version> (signed annotated tag)
        GIT->>SH: Push commit and tag to all remotes
        GIT->>SH: gh release create + tea release create
    else "--recover" mode
        GIT->>SH: Capture reflog and stash list
        GIT->>GIT: Identify target state
        GIT-->>LEAD: Explain plan before executing
        GIT->>SH: Execute ONE recovery command
        GIT->>SH: Verify post-state
    else "--inspect" mode
        GIT->>SH: git log, git blame -w -C -C -C
        GIT->>SH: Pickaxe search (git log -S or -G)
        GIT->>SH: git bisect run for regression hunting
    else "--sync" mode
        GIT->>SH: git fetch --all --prune --prune-tags
        GIT->>SH: Fast-forward clean tracking branches
        GIT->>SH: Mirror Gitea to GitHub
    end

    GIT->>FS: Write mode report (docs/git/)
    GIT->>FS: Write Completion Manifest
    GIT-->>LEAD: Completion phrase + manifest
```

## Merge Gate (4 Conditions Required)

| Condition | How checked |
|-----------|------------|
| Runtime report PASS | `RUNTIME_feature.md` with verdict PASS |
| CI pipeline green | `gh pr checks N` or `tea pr view N` |
| Fix-Verify loop closed | FIX_BACKLOG merge-blocking section empty or all PASS |
| No open CRITICAL/HIGH | CODE_REVIEW, SECURITY, PERF, and UX files all APPROVED |

## Destructive Operation Gate

Before any force-push, reset, or recover operation: name what changes, name what is lost, save reflog backup, print recovery command, and require user confirmation. Skip only if user granted explicit autonomous permission.

## Deliverables

| File | Mode |
|------|------|
| `docs/git/INIT_date.md` | `--init` |
| `docs/git/FEATURE_branch.md` | `--feature` |
| `docs/git/RELEASE_version.md` | `--release` |
| `docs/git/RECOVERY_date.md` | `--recover` |
| `docs/git/INSPECT_topic_date.md` | `--inspect` |
| `docs/git/SYNC_date.md` | `--sync` |
| `CHANGELOG.md` (updated) | `--release` |
| Signed annotated tag + GitHub/Gitea release | `--release` |

---

[🏠 Book](../README.md)  |  [📖 Chapter](README.md)  |  [← Container Ops](15-container-ops.md)
