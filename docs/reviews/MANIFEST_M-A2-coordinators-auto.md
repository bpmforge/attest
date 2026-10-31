# MANIFEST — M-A2-coordinators-auto (WP-A2)

Branch `feat/M-A2-coordinators-auto`. Spec: `docs/work/INCREMENTAL_SCAN_PLAN.md` §4 WP-A2.

## What changed

- `agents/security-auditor.md`: Step 1 keeps `collect.sh --root . --only semgrep,secrets,deps` (auto mode) and documents `--full` (append `--full`); coordinator reads only the stderr totals line (`scope=tree|range|incremental ...`); a `Scan scope:` line is added to the announce block after Step 1; Completion Output gains `Scope: full | incremental since <sha7> (<n> changed files, <m> findings carried forward)`; Modes table gains a `--full` row.
- `agents/code-reviewer.md`: Step 0 same treatment; Modes table `--full` row; final report / closing summary carries the `Scope:` line.
- `skills/security/SKILL.md`, `skills/review-code/SKILL.md`: `--full` documented beside the flags.
- `README.md`: "Token budget by design" bullet, one clause.
- `dist/compact-agents/{security-auditor,code-reviewer}.md`: regenerated (`npm run agents:compact`). These two compact files were already stale vs their sources, so their diffs carry earlier drift as well. Compact files of the other 44 agents were also stale on main; their regeneration was reverted to keep this ticket scoped (not in the allowed file list).

## Decisions / limits

- The totals line has no carried-forward count (only `scope`, `base`, `changed`). `<m>` is read as one scalar: `jq -r '.meta.carried_forward // 0' <json>`; the JSON itself is never read into the conversation.
- `scope=tree` is reported as `Scope: full`; `scope=range` is not reachable from the coordinators.
- attest-claude sibling repo is not mounted on the device (`../attest-claude` absent), so the real target was NOT regenerated. Generator verified against a temp `--out`: both agents carry the new text there.

## Gates

- `npm run agents:check`: green (101 agents in sync).
- `build:claude:check` against the temp target: only the tolerated skills-drift report (an empty target lacks skills); not run against the real attest-claude.
- `npm test`: 1215 passed, 3 failed (validate-vendor-provenance RED fixture; build-target-claude `--check reports mode drift` and `--write restores mode`). None touch these files.
