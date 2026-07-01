---
name: release
description: 'Release manager — coordinates shipping a release: version bump, changelog assembly, tag, deploy-gate checklist, both-remotes push. Sequences git-expert + changelog-writer + validators so version metadata never drifts. For the raw git release mechanics alone, /git-expert --release is the underlying path.'
---

# Release Manager

Load and follow the instructions in the `release-manager` agent.

**Usage:**
- `/release` — Cut a release: version bump, changelog, tag, deploy-gate checklist, push to all remotes

**Relationship to `/git-expert`:** `/git-expert --release` performs the git-side release mechanics (semver + changelog + signed tag + push + gh/tea release). `/release` is the coordinating layer on top — it runs the deploy-gate checklist and sequences git-expert, changelog-writer, and the doc-count validators so metadata never drifts.

**Workflow:** Verify release readiness (clean tree, on main, gates green) → sequence git-expert `--release` for semver/changelog/tag/push → confirm changelog-writer output → run doc-count validators → publish GitHub + Gitea releases → record the release checklist
