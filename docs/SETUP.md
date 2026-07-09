# Setup Guide

Step-by-step setup for a new machine. Covers prerequisites, installation, MCP configuration, and embedding model options.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 20–24 LTS | `install.sh` will prompt to install via NVM if wrong version |
| **git** | Any | For cloning MCPs |
| **jq** | Any | For `opencode.json` merges (macOS: `brew install jq`) |
| **OpenCode** | Latest | `# OpenCode install: https://opencode.ai` |

Optional but recommended:
- **LM Studio** — for vector embeddings (semantic search). Without it, BM25 keyword search still works.
- **Semgrep** — for security audits (`pip install semgrep` or `brew install semgrep`)

---

## 2. Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git ~/Code/bpm-opencode-experts
cd ~/Code/bpm-opencode-experts
./install.sh
```

`install.sh` prompts y/n for each optional MCP, then clones, builds, and registers them. Pass `--yes` to accept all defaults without prompting. Useful flags: `--compact` (compact agent variants for 32k local models), `--tools` (also install the optional code-analysis tools).

**Useful flags:** `--compact` (overlay compact agent variants for 32k local models), `--tools` (also install the optional code-analysis tools — semgrep, knip, vulture, mmdc, …), `--project` (install into `.opencode/` instead of global), `--link` (symlink for dev).

**What it installs:**
- Agents, skills, shared protocols, hooks, and scripts → `~/.config/opencode/`
- `bpm-code-search-mcp` → `~/Code/bpm-code-search-mcp/` + registers as `code-search` MCP
- `bpm-memory-mcp` → `~/Code/bpm-memory-mcp/` + registers as `memory` MCP
- `playwright-mcp` → registered via `npx -y @playwright/mcp@latest`
- `playwright-search` → `~/.local/share/playwright-search/` + registers with Claude Code

---

## 3. Embedding model setup

Both `bpm-code-search-mcp` and `bpm-memory-mcp` use vector embeddings for semantic search. **BM25 keyword search works without any embedding provider** — set it up only if you want semantic ("what does auth?" style) search.

### Option A — LM Studio (default, free, local)

1. Download [LM Studio](https://lmstudio.ai)
2. In the model search bar, find and download: `nomic-ai/nomic-embed-text-v1.5-GGUF`
3. Load it → it will listen on `http://localhost:1234`
4. No further config needed — the MCPs default to this model and URL

### Option B — Different LM Studio model

Any text embedding model loaded in LM Studio works. Set these env vars (add to `~/.zshrc` or `~/.bashrc`):

```bash
export LM_STUDIO_MODEL="your-model-name-here"   # model ID as shown in LM Studio
export LM_STUDIO_URL="http://localhost:1234"     # default port, change if different
```

Common alternatives:

| Model | Dimensions | Speed | Quality |
|-------|-----------|-------|---------|
| `nomic-ai/nomic-embed-text-v1.5` | 768 | Fast | Good (default) |
| `text-embedding-nomic-embed-text-v1` | 768 | Fast | Good |
| `CompendiumLabs/bge-large-en-v1.5-gguf` | 1024 | Medium | Better |
| `CompendiumLabs/bge-small-en-v1.5-gguf` | 384 | Fastest | OK |

> **Important:** If you change the embedding model after indexing, you must re-index with `force=true` (for code-search) or the existing vectors become incompatible. Memory is provider-sticky — changing the model requires re-embedding stored memories.

### Option C — OpenAI embeddings

Set these env vars:

```bash
export LM_STUDIO_URL="https://api.openai.com/v1"
export LM_STUDIO_MODEL="text-embedding-3-small"
export OPENAI_API_KEY="sk-..."
```

`bpm-code-search-mcp` and `bpm-memory-mcp` both speak the OpenAI embeddings API format, so this works transparently.

### Option D — No embeddings (BM25 only)

If you don't want to run LM Studio at all, disable vector embeddings:

```bash
export EMBEDDING_PROVIDER=none
```

Both MCPs will use BM25 keyword search only. This is faster and still effective for exact-match queries — just not semantic ("find code that handles auth" style).

---

## 4. MCP environment variables

All env vars can be set in `~/.zshrc` / `~/.bashrc`, or passed inline when starting Claude Code.

### bpm-code-search-mcp

| Variable | Default | Purpose |
|----------|---------|---------|
| `CODE_SEARCH_ROOT` | `cwd` | Project root to index. Set per-project or leave as default. |
| `LM_STUDIO_URL` | `http://localhost:1234` | Embedding API base URL |
| `LM_STUDIO_MODEL` | `text-embedding-nomic-embed-text-v1.5` | Embedding model name |

**First-time per project:**
```
code_index()          # builds the index (takes ~30s for medium codebases)
code_index_status()   # verify: provider, files, chunks, symbols
```

The index lives at `.code-search/index.db` in your project root (gitignored). It's rebuilt automatically when you re-index.

### bpm-memory-mcp

| Variable | Default | Purpose |
|----------|---------|---------|
| `LM_STUDIO_URL` | `http://localhost:1234` | Embedding API base URL |
| `LM_STUDIO_MODEL` | `text-embedding-nomic-embed-text-v1.5` | Embedding model name |
| `EMBEDDING_PROVIDER` | _(auto-detect)_ | Set to `none` to disable vectors |
| `CLAUDE_MEMORY_DB_PATH` | `~/.claude-memory/memory.db` | Override the DB location |

Memory is shared across all projects by default (project-scoped via project ID). Each project's memories are isolated automatically.

### playwright-mcp

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLAYWRIGHT_MCP_HEADED` | `false` | Set to `true` to see the browser while it runs |

**First use:** Chromium is auto-downloaded (~170 MB) on first browser launch. To pre-install:
```bash
npx playwright install chromium
```

---

## 5. Verify everything is working

```bash
# Check registered MCPs
# OpenCode reads MCPs from opencode.json — check with:
cat ~/.config/opencode/opencode.json | python3 -m json.tool

# Expected output includes:
#   code-search  node ~/Code/bpm-code-search-mcp/dist/index.js  - ✓ Connected
#   memory       node ~/Code/bpm-memory-mcp/mcp/memory-server/dist/index.js  - ✓ Connected
#   playwright   npx -y @playwright/mcp@latest  - ✓ Connected
#   playwright-search  node ~/.local/share/playwright-search/dist/mcp.js  - ✓ Connected
```

**Run the self-checks:**
```bash
~/.config/opencode/scripts/doctor.sh        # structure, deps, config, model backend, agent discovery → Status: HEALTHY
~/.config/opencode/scripts/check-tools.sh   # which optional analysis tools are present (add --install)
```

Then start an OpenCode session and test each MCP:
```
code_index_status()        # should show provider + file/chunk counts
session_restore()          # should return [] on a fresh install (no memories yet)
browser_navigate("https://example.com") && browser_screenshot()
```

---

## 6. LM Studio on a remote server

If LM Studio runs on a different machine (e.g., a home server):

```bash
export LM_STUDIO_URL="http://192.168.1.x:1234"   # replace with your server IP
```

Make sure LM Studio is configured to accept connections on all interfaces (not just localhost) in its settings.

---

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| `cat ~/.config/opencode/opencode.json \| python3 -m json.tool` shows MCP as "Pending approval" | Restart OpenCode once and approve it |
| code-search: "no embedding provider available" | Start LM Studio with the embedding model loaded, or set `EMBEDDING_PROVIDER=none` for BM25-only |
| memory: vector search returns 0 results | LM Studio isn't running or model name doesn't match — check `LM_STUDIO_MODEL` |
| playwright-mcp: "browser not found" | Run `npx playwright install chromium` |
| install.sh: "node not found" or wrong version | The installer will prompt to install NVM + Node 24 automatically |
| `jq: command not found` | `brew install jq` (macOS) or `apt install jq` (Linux) |
| MCP built but not registered | Re-run `./install.sh` or register manually: `Add entry to ~/.config/opencode/opencode.json under "mcp"` |

---

## 8. Uninstall

```bash
./uninstall.sh
```

Removes all installed files from `~/.claude/`. Does not remove MCP repos from `~/Code/` or the memory database (`~/.claude-memory/memory.db`).
