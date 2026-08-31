# rules/ — glob-scoped context rules (P-A3, T1-03)

Cursor-derived lesson (design doc §15.1): **load rules by glob, not always** —
too many always-apply rules bring context bloat to every chat. attest's shared
protocol set is always-on and growing; this primitive lets content load only
when its globs match the files actually in play.

## Rule file format

Every `*.md` file in this directory (except this README) is a rule and MUST
carry frontmatter with all three keys explicit:

```markdown
---
description: 'One-line summary shown when the rule is offered'
globs:
  - "scripts/validators/**/*.sh"
alwaysApply: false
---

The rule body — the instructions that load when the rule is selected.
```

- `description` — required, non-empty. What the rule enforces, one line.
- `globs` — path patterns (`**` crosses directories, `*`/`?` stay within a
  segment). Required unless `alwaysApply: true`. A dash-list or a single
  comma-separated inline string are both accepted.
- `alwaysApply` — required, literal `true` or `false`. `true` means the rule
  loads into every session; keep this set SMALL — it is exactly the context
  bloat this primitive exists to avoid.

## Selection semantics

`scripts/lib/rules.mjs` exposes `selectRules(files, rulesDir)`: the selected
set is every `alwaysApply: true` rule plus every rule whose globs match at
least one file in the working set. CLI:

```sh
node scripts/lib/rules.mjs select rules scripts/validators/validate-tests.sh
node scripts/lib/rules.mjs lint rules
```

## Validation

`scripts/validators/validate-rules.sh` (chained into the phase-4 gate) rejects
a rule with missing/malformed frontmatter, a non-boolean `alwaysApply`, or a
non-alwaysApply rule with no globs (it could never load). Red/green fixtures:
`evals/fixtures/validators/validate-rules/`.
