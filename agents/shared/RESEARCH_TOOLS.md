# Research tools — available to every agent

The `playwright-search` MCP server is registered project-wide (see `examples/opencode.json`). Once configured, **every agent in this opencode project can call these tools** — not just the researcher.

This is the shared reference. Agents that benefit from web research should `Read` this file when they need to verify a fact, look up a library API, check current standards, or research an unknown technology.

## Three tools

| Tool | What it does | When to reach for it |
|------|--------------|---------------------|
| `web_research(query, top=3, max_chars_per_source=3000, relevance_query?)` | Search 3 engines (DDG + Brave + Bing) → dedup → fetch each URL → extract main article via Mozilla Readability → rank paragraphs by query relevance → return one formatted text block with `[Source N]` markers | Default for "research X" tasks. One tool call, full content, citations included. |
| `web_search(query, limit=10)` | Multi-engine search returning titles + URLs + snippets only. No page fetching. | Triage / orientation. When you don't need full content yet. |
| `web_fetch(url, max_chars=8000, relevance_query?)` | Fetch one URL, return clean article text via Mozilla Readability. With `relevance_query`, returns the BEST paragraphs for that query. | When you already have a URL (citation, doc link) and want its content. |

## When each agent should use these

| Agent | Typical use |
|-------|------------|
| **researcher** | Default for every task. Iterative loop with multiple passes. |
| **coding-agent** | Before adopting a new library: `web_fetch("https://www.npmjs.com/package/<lib>")` or `web_research("<lib> API best practices 2026")`. Don't write code from training data on unfamiliar libraries. |
| **api-designer** | Look up current REST/GraphQL standards, OpenAPI patterns, versioning practices for a specific domain. |
| **security-auditor** | CVE lookups, vulnerability research (`web_research("<package> CVE 2026")`), threat-model patterns. |
| **db-architect** | Migration patterns, ORM-specific gotchas, indexing best-practice for a particular DB version. |
| **performance-engineer** | Benchmark comparisons (`web_research("<tech-A> vs <tech-B> benchmark 2026")`), profiling tool selection. |
| **container-ops** | Image best-practices, registry / orchestration patterns, recent CVEs in a base image. |
| **frontend-design / ux-engineer** | WCAG 2.2 specifics, design-system patterns, current accessibility guidance. |
| **sre-engineer** | Incident response patterns, runbook templates, monitoring tool comparisons. |
| **test-engineer** | Testing patterns for a specific framework (Playwright matchers, vitest config tricks). |
| **git-expert** | Rare — git workflow is procedural. Use only if the user asks for current best practices. |
| **sdlc-lead / sdlc-* modes** | Tech-stack research during planning, competitive landscape, framework selection. |

## How to call them

In your tool calls, the names are namespaced by the MCP server:

```
playwright-search_web_research({"query": "...", "top": 3})
playwright-search_web_search({"query": "...", "limit": 10})
playwright-search_web_fetch({"url": "https://...", "max_chars": 8000})
```

opencode auto-prefixes the server name with an underscore separator.

## Tips for good queries

- **Include the year** for time-sensitive topics: `"playwright stealth 2026"` not `"playwright stealth"`.
- **Use quotes** to lock specific terms: `"playwright-stealth" npm latest 2026`.
- **Refine on pass 2** based on what pass 1 surfaced. If pass 1 mentions "Camoufox", pass 2 query becomes `"Camoufox vs Patchright comparison 2026"`.
- **Use `relevance_query`** when you want broad search but tight content extraction: `web_research(query="rust async runtimes 2026", relevance_query="tokio scheduler model")`.
- **Default top=3 is usually right.** Higher top = slower; the MCP request timeout is ~60s, so top>5 may time out on cold cache.

## What NOT to do

- **Don't chain `web_search` → `web_fetch` × N when `web_research` does the same thing in one call.** Smaller models in particular handle one well-formed call better than a chain.
- **Don't pass `top=20` looking for thoroughness.** 3 high-quality sources beat 20 mediocre ones for LLM context.
- **Don't bypass the cache by passing `no_cache: true` unless you specifically need fresh data.** Repeat queries within 24h are zero-cost; passing `no_cache` defeats the politeness guarantee.

## Operational guarantees

- **Polite by default** — per-domain rate limit (1.2–2.5s), robots.txt respected, 24h disk cache. Safe to run repeatedly.
- **No API keys, no paid tiers** — runs entirely on your machine.
- **LLM-agnostic** — works with LM Studio, Ollama, Anthropic, OpenAI, any provider behind opencode.
- **Captcha-aware** — when an engine serves a captcha or POW challenge, that engine fails clean and the others continue. The pipeline never hangs on a single failed engine.

## Closing the research → memory loop

After completing research, store key findings via the memory MCP registered in this project (`mempalace` or `claude-memory`). Always include the source URL so future sessions can cite back. The memory tools are namespaced as `mempalace_*` or `claude-memory_*`.

## Source files

- Tool implementation: `/Users/user/Code/playwright-search/src/mcp.ts`
- Pipeline (search → fetch → extract → rank): `/Users/user/Code/playwright-search/src/pipeline.ts`
- Setup: `/Users/user/Code/playwright-search/MCP.md`
