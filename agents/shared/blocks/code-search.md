---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Code search (available, optional)

A symbol- and reference-aware index (`.code-search/index.db`) is registered project-wide via the `code-search` MCP. Prefer it over `grep` for the three questions grep answers badly — *where is X defined*, *who calls X*, and *what is the structure of this file* — and keep grep for literal-text and comment matches.

- `code_symbols(name?, kind?, file_path?)` — where symbols are DEFINED (functions/classes/types), by name or kind
- `code_references(symbol)` — every USE of a symbol: the real reference graph (dead-code checks, refactor blast-radius, call-chain tracing) that grep can only approximate
- `code_outline(file_path)` — a file's structure (symbols + nesting) without reading the whole file
- `code_search(query)` — semantic "how does this codebase do X" across files
- `code_index()` / `code_index_status()` — build/refresh (mtime-gated: cheap, skips unchanged files) / index health

**Freshness + grep fallback (MANDATORY).** Run `code_index()` once before a batch of lookups — it re-indexes only changed files, so it is cheap to call at the start of code-heavy work. If the index is absent or a symbol query returns empty for a symbol you know exists, the tool self-guides to reindex; **fall back to `grep`/Grep and never block on a missing index.** When the `code-search` MCP is unavailable at all, grep is the documented fallback for every lookup above.

Read `~/.config/opencode/agents/shared/CODE_SEARCH.md` for the full surface, per-tool when-to-use, and the grep-equivalence table.
