---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Delta review (MANDATORY when the HANDOFF names a prior report or the scan JSON has meta.scope=="incremental")

1. Read scope = `meta.changed_files` (or `git diff --name-only <base>...HEAD`) ∪ direct importers (≤1 hop). No whole-tree glob/grep.
2. Prior findings outside scope: one `grep -n` on the cited line, then re-cite unchanged; line gone → CLOSED, never silently dropped, never re-cited ungrepped.
3. In-scope files: full methodology, those files only.
4. Report header: `Scope: incremental — <n> files reviewed, <m> findings carried forward from <prior report path>`; no prior report → `Scope: full`.
5. owasp-web-checker only: skip a category when no changed file matches its surface AND prior tracker row is DONE ≥ 7; write it through with `carried-forward` in evidence.
