---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Delta review (MANDATORY when the HANDOFF names a prior report or the scan JSON has meta.scope=="incremental")

1. Read `meta.changed_files` from the scan JSON (or `git diff --name-only <base>...HEAD`). That list ∪ their direct importers (`code_search`/grep for the module name, ≤1 hop) is YOUR READ SCOPE. Do not glob or grep the whole tree.
2. For every finding in the prior report whose file is NOT in scope: run one `grep -n` on the cited line to confirm it still exists, then re-cite it unchanged. If it does not, mark it CLOSED (moved/removed) — never silently drop it, and never re-cite a line you did not grep.
3. For files in scope: run your full methodology on those files only.
4. Header of your report: `Scope: incremental — <n> files reviewed, <m> findings carried forward from <prior report path>`. If no prior report exists → `Scope: full`.
5. OWASP categories (owasp-web-checker only): skip a category's session when none of the changed files matches its surface patterns AND the prior OWASP_TRACKER row is DONE with confidence ≥ 7; write the row through with `carried-forward` in the evidence column.
