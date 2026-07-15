---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# CODE_SEARCH.md — the code-search MCP (symbol/reference index)

The `code-search` MCP maintains a per-project index (`.code-search/index.db`,
gitignored) that answers structural questions `grep` can't: where a symbol is
**defined**, everywhere it is **referenced**, and a file's **outline**. It is
auto-installed by `bpm-opencode-experts` / `claude-experts` `install.sh`.

The short form agents carry inline is `agents/shared/blocks/code-search.md`; this
is the full reference.

## Tools

| Tool | Answers | Use it for |
|---|---|---|
| `code_symbols(name?, kind?, file_path?)` | where symbols are **defined** | "where is `parsePlan` defined?", "list every exported function in this file" |
| `code_references(symbol)` | every **use** of a symbol | dead-code ("0 non-test references"), refactor blast-radius, call-chain tracing |
| `code_outline(file_path)` | a file's **structure** | understand a file without reading all of it |
| `code_search(query)` | **semantic** match across files | "how does this codebase handle auth?", "where do we validate input?" |
| `code_index()` | build/refresh the index | run once at the start of code-heavy work (mtime-gated — re-indexes only changed files, cheap) |
| `code_index_status()` | index health | confirm the index exists / how many files are indexed |

## When to prefer code-search over grep

grep matches **text**; code-search understands **structure**. Reach for
code-search when the question is about symbols or references:

| Question | grep (weak) | code-search (right) |
|---|---|---|
| Where is `X` defined? | `grep -rn "function X"` misses arrow fns / re-exports | `code_symbols("X")` |
| Who calls `X`? | `grep -rn "X("` catches strings, comments, substrings | `code_references("X")` |
| Is `X` dead code? | grep count minus defs/tests — brittle | `code_references("X")` → 0 non-test uses |
| What's in this file? | read the whole file | `code_outline(file)` |
| How do we do auth here? | guess the keyword | `code_search("authentication flow")` |

Keep grep for what it's good at: literal strings, comment text (`TODO`/`FIXME`),
config values, and any non-code file.

## Freshness & fallback (the contract every wired agent inherits)

1. **Refresh once, cheaply.** Call `code_index()` at the start of a batch of
   lookups. It is mtime-gated — unchanged files are skipped — so calling it
   defensively costs almost nothing and guarantees you query current code.
2. **Degrade, never block.** If the `code-search` MCP is unavailable, the index
   is absent, or a symbol query returns empty for a symbol you know exists,
   **fall back to `grep`/Grep**. The engine itself falls back to full-text (FTS)
   when no vector index exists and self-guides you to reindex a stale/new file —
   but your agent must still treat a missing index as "use grep," not "stop."
3. **Index lifecycle.** The onboard flow builds the index once
   (`sdlc-onboard-mode`); edits during a session are picked up by the next
   `code_index()`. `.code-search/` is gitignored — never commit it.

## Do not

- Do not commit `.code-search/index.db` (it's per-machine, gitignored).
- Do not treat an empty result as authoritative without a `code_index()` refresh
  and a grep cross-check — a stale index under-reports.
- Do not use code-search for non-code files or literal comment matches — that's grep.
