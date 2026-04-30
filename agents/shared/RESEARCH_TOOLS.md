# Research tools — available to every agent

Two MCP servers handle all web research in this system. The opencode built-ins (`webfetch`, `websearch`) are **disabled** in `examples/opencode.json` so the LLM cannot drift back to them. Every agent — researcher and specialists alike — uses the tools below.

## The hard rule

> If you need to read a URL or search the web, you call `playwright-search_*` or `pullmd_*`. **You do not call `webfetch` or `websearch`.** Those tools are disabled in `examples/opencode.json` (`"tools": { "webfetch": false, "websearch": false }`), which means opencode does not expose them to the LLM at all — they are simply not in your tool list. If you don't see `playwright-search_*` tools either, the MCP isn't running; surface that to the user, don't silently retry against built-ins that aren't there.

## Two MCPs, different roles

| MCP | Role | When to reach for it |
|-----|------|---------------------|
| `playwright-search` | **PRIMARY** — multi-engine search + extraction + paragraph ranking | Default. Anything that needs search. Most URL fetches. |
| `pullmd` | **FALLBACK** — single URL → clean markdown via 4-stage pipeline | When `playwright-search_web_fetch` returns garbage / fails on a JS-heavy or Cloudflare-protected page, or for Reddit threads (pullmd has dedicated Reddit support) |

## playwright-search — primary surface

| Tool | What it does | When to use |
|------|--------------|-------------|
| `web_research(query, top=3, max_chars_per_source=3000, relevance_query?)` | Search 3 engines (DDG + Brave + Bing) → dedup → fetch each URL → extract main article via Mozilla Readability → rank paragraphs by query relevance → return one formatted text block with `[Source N]` markers | Default for "research X" tasks. One tool call, full content, citations included. |
| `web_search(query, limit=10)` | Multi-engine search returning titles + URLs + snippets only. No page fetching. | Triage / orientation. When you don't need full content yet. |
| `web_fetch(url, max_chars=8000, relevance_query?)` | Fetch one URL, return clean article text via Mozilla Readability. With `relevance_query`, returns the BEST paragraphs for that query. | When you already have a URL (citation, doc link) and want its content. |

## pullmd — fallback surface

| Tool | What it does | When to use |
|------|--------------|-------------|
| `read_url(url, comment_depth?, comment_limit?, frontmatter?, lang?, render?)` | Fetch one URL → markdown via 4-stage pipeline (Reddit handler → Cloudflare native MD → Readability+Trafilatura → Playwright headless fallback). Pass `render=force` to skip the heuristic and use headless Chromium directly. | When `web_fetch` failed on this URL. Or for Reddit threads (pullmd extracts the full comment tree). Or any JS-heavy site. |
| `get_share(id)` | Re-fetch a previously cached pullmd conversion by share ID | Rare. When you need the same page again and remember its share ID. |
| `list_recent()` | List recent pullmd conversions on this host | Rare. Mostly debugging / discovery. |

## The fallback chain (memorize this)

```
1. web_research(...)                       ← default for new investigations
2. web_fetch(url, ...)                     ← for known URLs
3. If (2) returns empty / garbage / error:
     pullmd_read_url(url, render="force") ← retry via 4-stage pipeline
4. If (3) also fails:
     surface to user — do not loop
```

**Do NOT** chain `web_research` → `pullmd_read_url` for every result. `web_research` already extracts content in one call. Only use pullmd when the playwright-search extraction failed.

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

Tool names are namespaced by the MCP server (opencode auto-prefixes the server name with an underscore separator):

```
playwright-search_web_research({"query": "...", "top": 3})
playwright-search_web_search({"query": "...", "limit": 10})
playwright-search_web_fetch({"url": "https://...", "max_chars": 8000})
pullmd_read_url({"url": "https://..."})
pullmd_read_url({"url": "https://...", "render": "force"})
```

## Tips for good queries

- **Include the year** for time-sensitive topics: `"playwright stealth 2026"` not `"playwright stealth"`.
- **Use quotes** to lock specific terms: `"playwright-stealth" npm latest 2026`.
- **Refine on pass 2** based on what pass 1 surfaced. If pass 1 mentions "Camoufox", pass 2 query becomes `"Camoufox vs Patchright comparison 2026"`.
- **Use `relevance_query`** when you want broad search but tight content extraction: `web_research(query="rust async runtimes 2026", relevance_query="tokio scheduler model")`.
- **Default top=3 is usually right.** Higher top = slower; the MCP request timeout is ~60s, so top>5 may time out on cold cache.

## What NOT to do

- **Do NOT call `webfetch` or `websearch`** — they are disabled. Use `playwright-search_*` or `pullmd_read_url`.
- **Don't chain `web_search` → `web_fetch` × N when `web_research` does the same thing in one call.** Smaller models in particular handle one well-formed call better than a chain.
- **Don't pass `top=20` looking for thoroughness.** 3 high-quality sources beat 20 mediocre ones for LLM context.
- **Don't bypass the cache by passing `no_cache: true` unless you specifically need fresh data.** Repeat queries within 24h are zero-cost; passing `no_cache` defeats the politeness guarantee.
- **Don't call pullmd as a primary tool for searches** — it has no search capability, only URL extraction.

## What to do when both MCPs fail

If `web_research` returns 0 results and `pullmd_read_url` also fails on a URL:

1. Verify the MCPs are actually running. `playwright-search` is local Node; `pullmd` is a Docker/Podman container on `localhost:33000` (default port — check your install if you used `PULLMD_PORT`).
2. If the user can't restart the services, surface a `RESEARCH BLOCKED` block (see `researcher.md` 3-strikes rule) with what was learned, what couldn't be answered, and the last error.
3. Do **not** silently fall back to anything else. The built-ins are disabled by design.

## Operational guarantees

- **Polite by default** — per-domain rate limit (1.2–2.5s), robots.txt respected, 24h disk cache. Safe to run repeatedly.
- **No API keys, no paid tiers** — runs entirely on your machine.
- **LLM-agnostic** — works with LM Studio, Ollama, Anthropic, OpenAI, any provider behind opencode.
- **Captcha-aware** — when an engine serves a captcha or POW challenge, that engine fails clean and the others continue. The pipeline never hangs on a single failed engine.
- **pullmd extraction layers** — Reddit native API → Cloudflare's native markdown header → Mozilla Readability + Trafilatura → headless Chromium fallback. Each layer is tried in order; first one to extract clean content wins.

## Closing the research → memory loop

After completing research, store key findings via the memory MCP registered in this project (`mempalace` or `claude-memory`). Always include the source URL so future sessions can cite back. The memory tools are namespaced as `mempalace_*` or `claude-memory_*`.

## Source files

- playwright-search implementation: `/Users/user/Code/playwright-search/src/mcp.ts`
- playwright-search pipeline: `/Users/user/Code/playwright-search/src/pipeline.ts`
- playwright-search setup: `/Users/user/Code/playwright-search/MCP.md`
- pullmd repo: https://github.com/AeternaLabsHQ/pullmd
- pullmd setup: `./install.sh --pullmd` (auto-detects Docker or Podman); default MCP at `http://localhost:33000/mcp`
