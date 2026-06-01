# MCP Configuration Guide

How to install, configure, and use each MCP server in the expert system. For the full catalog of what each MCP provides, see [FEATURES.md](FEATURES.md).

---

## Overview — all registered MCPs

| MCP | Purpose | Claude Code | OpenCode |
|-----|---------|-------------|---------|
| `playwright-mcp` | Browser automation, screenshots, E2E testing | ✅ | ✅ |
| `playwright-search` | Multi-engine web research + page extraction | ✅ | ✅ |
| `pullmd` | Clean markdown extraction from JS-heavy pages | ✅ | ✅ |
| `context7` | Live library API docs lookup | ✅ | ✅ |
| `memory` | Cross-session project memory (decisions, facts, patterns) | ✅ | ✅ |
| `code-search` | Semantic code search + symbol index | ✅ | ✅ |

`install.sh` sets up all of these. You can skip individual MCPs with `--no-<name>` flags.

---

## playwright-mcp — Browser automation & screenshots

**What it does:** Gives agents a real browser (Chromium via Playwright). LLM-agnostic — no vision model required; uses the accessibility tree by default, with screenshots on demand. Works identically in Claude Code and OpenCode.

**When to use it:**
- Visual verification of a deployed UI feature
- E2E test recording / verification
- Screenshots for design review or bug reports
- Interacting with web forms, dashboards, and single-page apps

**Install (handled by `install.sh`):**
```bash
# Claude Code — registers once per user
claude mcp add playwright -- npx -y @playwright/mcp@latest

# OpenCode — in opencode.json (auto-written by install.sh)
"playwright-mcp": {
  "type": "local",
  "command": ["npx", "-y", "@playwright/mcp@latest"],
  "enabled": true
}
```

**Manual install without install.sh:**
```bash
# Claude Code
claude mcp add playwright -- npx -y @playwright/mcp@latest

# OpenCode — edit ~/.config/opencode/opencode.json and add the block above
```

**Key tools:**

| Tool | Description |
|------|-------------|
| `browser_navigate(url)` | Navigate to a URL |
| `browser_screenshot()` | Take a screenshot (returns image) |
| `browser_snapshot()` | Accessibility tree snapshot — for non-vision models |
| `browser_click(element)` | Click a button, link, or any element |
| `browser_type(element, text)` | Type into a focused input |
| `browser_fill(element, value)` | Fill a form field |
| `browser_select_option(element, value)` | Select from a dropdown |
| `browser_get_url()` | Get current URL |
| `browser_wait_for(selector, state)` | Wait for element (visible/hidden/attached) |
| `browser_evaluate(js)` | Run JavaScript in the page |
| `browser_close()` | Close the browser session |

**Typical pattern — UI verification:**
```
browser_navigate("http://localhost:3000/dashboard")
browser_wait_for(".dashboard-loaded", "visible")
browser_screenshot()         ← attach to report
browser_snapshot()           ← check for error states in accessibility tree
```

**Typical pattern — form testing:**
```
browser_navigate("http://localhost:3000/login")
browser_fill("[name=email]", "test@example.com")
browser_fill("[name=password]", "password123")
browser_click("[type=submit]")
browser_wait_for(".dashboard", "visible")
browser_screenshot()
```

**Headless vs headed mode:** By default runs headless. To see the browser:
```bash
PLAYWRIGHT_MCP_HEADED=true claude
```

**vs `playwright-search`:** playwright-search is for web research (multi-engine search + content extraction). playwright-mcp is for browser automation (navigate to your app, click things, take screenshots). Use both for their respective jobs.

---

## playwright-search — Web research & page extraction

**What it does:** Multi-engine web search (DuckDuckGo + Brave + Bing) with paragraph-ranked extraction and 24h cache. Also extracts clean content from any URL — handles JS-heavy SPAs, Cloudflare pages, and paywalled content via a 4-stage pipeline.

**Install (handled by `install.sh` — clones and builds automatically):**
```bash
# Manual install
git clone https://github.com/bpmforge/playwright-search.git ~/.local/share/playwright-search
cd ~/.local/share/playwright-search && npm install && npm run build

# Claude Code — register
claude mcp add playwright-search node ~/.local/share/playwright-search/dist/mcp.js

# OpenCode — in opencode.json
"playwright-search": {
  "type": "local",
  "command": ["node", "~/.local/share/playwright-search/dist/mcp.js"],
  "enabled": true
}
```

**Key tools:**

| Tool | Description |
|------|-------------|
| `playwright-search_web_research(query)` | Multi-engine search with ranked extraction |
| `playwright-search_web_fetch(url)` | Extract clean content from a URL |

**Use in research backbone:**
```
playwright-search_web_research("Playwright MCP server tools list")
playwright-search_web_fetch("https://github.com/microsoft/playwright-mcp")
```

---

## pullmd — Markdown extraction fallback

**What it does:** Pulls clean markdown from URLs that `playwright-search_web_fetch` struggles with: JavaScript-rendered SPAs, Cloudflare-protected pages, Reddit threads. 4-stage pipeline: Reddit handler → Cloudflare native MD → Readability + Trafilatura → headless Playwright.

**Install:**
```bash
# pullmd runs as a local HTTP server — start it once
# Check if running: curl http://localhost:33000/health

# Claude Code — register as remote MCP
claude mcp add pullmd --transport sse http://localhost:33000/mcp

# OpenCode — in opencode.json
"pullmd": {
  "type": "remote",
  "url": "http://localhost:33000/mcp",
  "enabled": true
}
```

**Key tool:**
```
pullmd_read_url(url="https://reddit.com/r/...", render="force")
```

Use as the **last resort** in the research chain: playwright-search → pullmd → give up.

---

## context7 — Live library API docs

**What it does:** Fetches up-to-date library documentation from the Context7 index. Prevents agents from using stale training-data APIs that may have changed. Used by `coding-agent` before using any external library.

**Install:** Runs via npx — no local clone needed.
```bash
# Claude Code
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest

# OpenCode — in opencode.json
"context7": {
  "type": "local",
  "command": ["npx", "-y", "@upstash/context7-mcp@latest"],
  "enabled": true
}
```

**Usage pattern:**
```
resolve-library-id("react-query")          → /tanstack/query
get-library-docs("/tanstack/query", topic="useQuery")  → live docs
```

Always call `resolve-library-id` first — library names don't map 1:1 to Context7 IDs.

---

## memory — Cross-session project memory

**What it does:** Persistent memory store backed by SQLite + vector embeddings. Agents store decisions, constraints, patterns, and bug root causes; future sessions restore them. Hybrid search: vector (35%) + BM25 (35%) + link traversal (30%).

**Prerequisite:** Build claude-memory first:
```bash
git clone https://github.com/bpmforge/claude-memory.git ~/Code/claude-memory
cd ~/Code/claude-memory && npm install && npm run build
```

**Install (handled by `install.sh` step 8):**
```bash
# Claude Code
claude mcp add memory node ~/Code/claude-memory/mcp/memory-server/dist/index.js

# OpenCode — in opencode.json
"memory": {
  "type": "local",
  "command": ["node", "~/Code/claude-memory/mcp/memory-server/dist/index.js"],
  "enabled": true
}
```

**The 3-call workflow (from `agents/shared/MEMORY_PRIMER.md`):**

| When | Call |
|------|------|
| Session start | `session_restore()` — load prior decisions/patterns |
| Key discovery | `memory_store({ content, type, confidence, citation })` |
| Session end | `session_save({ summary: "..." })` |

**Types:** `decision`, `fact`, `pattern`, `error`, `preference`

**Fallback when unavailable:** Agents write to `docs/work/SESSION_NOTES.md`.

**Embedding provider:** Requires LM Studio running with `text-embedding-nomic-embed-text-v1.5` on port 1234. If LM Studio isn't running, BM25-only search still works — just set `EMBEDDING_PROVIDER=none` in the server's env.

---

## code-search — Semantic code search + symbol index

**What it does:** Two-layer search over your codebase: (1) semantic chunk search via embeddings + cosine similarity, (2) structural symbol index (functions, classes, interfaces, types, Markdown sections) extracted at index time. FTS5 BM25 fallback when no embedding provider.

**Source:** `~/Code/bpm-code-search-mcp/`

**Install (auto-registered in Claude Code settings and OpenCode):**
```bash
# Claude Code — in ~/.claude/settings.json PostToolUse hook (auto-reindexes on edit)
# OpenCode — in opencode.json
"code-search": {
  "type": "local",
  "command": ["node", "~/Code/bpm-code-search-mcp/dist/index.js"],
  "enabled": true
}
```

**First-time setup for a project:**
```
code_index()              ← index the current project (uses LM Studio for embeddings)
code_index_status()       ← verify: files, chunks, symbols, provider
```

**The 6 tools:**

| Tool | Use it for |
|------|-----------|
| `code_index(path?, force?)` | Build / refresh the index |
| `code_search("query", top_k?, path_filter?)` | Semantic search — "what does auth?" |
| `code_symbols(kind?, name_filter?, path_filter?)` | Browse by type — "all classes", "functions named *Auth*" |
| `code_outline("file_path")` | Structural outline of one file |
| `code_references("SymbolName")` | Find all usages of a symbol |
| `code_index_status()` | Status check |

**Reindex on edit:** A PostToolUse hook in `~/.claude/settings.json` auto-reindexes any `.ts/.py/.go/.md` file you edit. No manual reindex needed during active coding.

**Symbol extraction covers:** TypeScript/JS, Python, Go, Rust, Java, C#, Ruby, PHP, Swift, Kotlin, Markdown.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `claude mcp list` shows MCP as "Pending approval" | Run `claude` interactively once to approve |
| playwright-mcp: "browser not found" | Run `npx playwright install chromium` |
| memory: no results, vector search returns 0 | Start LM Studio with nomic-embed-text loaded on port 1234 |
| code-search: index empty after edit | Check hook is installed: `grep reindex ~/.claude/settings.json` |
| pullmd: connection refused | Start the pullmd server: `cd ~/Code/pullmd && npm start` |
| context7: rate limited | context7 is free but rate-limited; wait and retry |

---

## Checking what's registered

```bash
# Claude Code
claude mcp list

# OpenCode
cat ~/.config/opencode/opencode.json | jq '.mcp | keys'
```
