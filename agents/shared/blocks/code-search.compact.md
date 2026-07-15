---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

## Code search (available, optional)

Symbol/reference-aware search via the `code-search` MCP — prefer over grep for structure/references: `code_symbols(name)` (definitions), `code_references(symbol)` (all uses — dead-code/refactor/call-chains), `code_outline(file)` (structure), `code_search(query)` (semantic). Run `code_index()` once first (cheap, mtime-gated); fall back to grep if the index is absent or empty — never block. Full guide: `agents/shared/CODE_SEARCH.md`.
