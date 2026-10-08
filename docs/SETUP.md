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
- **LM Studio** — embedding server for code-search, which needs one to build its index (and optionally for memory, which defaults to Ollama and falls back to keyword-only search without an embedder). See §3.
- **Opengrep** — preferred SAST engine for security audits (`./install.sh --opengrep`, or see §2a below). Falls back to Semgrep if unavailable.

---

## 2. Install

```bash
git clone https://github.com/bpmforge/attest.git ~/Code/attest
cd ~/Code/attest
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

## 2a. SAST engine (Opengrep, preferred)

The `/security` agent needs a static-analysis engine. **Opengrep is the preferred and
default engine** — it's an LGPL-2.1 fork of Semgrep, so it's safe to run against
client/customer code. Semgrep's own hosted registry rules (`--config auto`, `p/*`
packs) are **internal-use-only** and must never be run in a client-facing scan;
client scans use Opengrep + our own rules in `bpm-rulepacks` instead. Semgrep the
binary remains a documented fallback if Opengrep can't be installed on a given
machine — see `references/semgrep-guide.md` for full command-by-command detail.

**Install Opengrep:**

```bash
./install.sh --opengrep   # auto-installs via the official Opengrep installer
```

This runs Opengrep's own installer (`curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash`),
which places the binary at `~/.opengrep/cli/<version>` (with a `latest` symlink) and
links it into `~/.local/bin/opengrep` if that directory exists on your `PATH`. If the
installer can't reach GitHub, `install.sh` prints the same command plus a link to
https://github.com/opengrep/opengrep so you can install manually, and falls back to
offering a Semgrep install (`brew install semgrep` / `pip install semgrep`) instead.

`--semgrep` is kept as an alias of `--opengrep` for backward compatibility — it tries
Opengrep first and only installs Semgrep if the Opengrep installer fails.

**Verify:**

```bash
opengrep --version
~/.config/opencode/scripts/doctor.sh   # reports "opengrep (preferred SAST engine): ..."
```

**CI:** `.github/workflows/ci.yml` currently runs the meta/process test suite
(`npm test`) only — it does not invoke `semgrep-full-audit.sh` or the `/security`
agent, so no SAST engine is required in CI today. If a workflow that actually runs
SAST scans is added later, it should install Opengrep the same way (`--opengrep` /
the official installer above) rather than falling back to Semgrep.

---

## 3. Embedding model setup

Both `bpm-code-search-mcp` and `bpm-memory-mcp` use vector embeddings for semantic search, but they configure their embedders separately and behave differently without one:

- **code-search** reads environment variables (§4) and talks to LM Studio or another OpenAI-compatible server. `code_index` **needs a reachable embedding endpoint** — it embeds every chunk and refuses to run without one. Once an index exists, `code_search` degrades to keyword-only if the embedder later goes away, and `code_symbols` / `code_outline` / `code_references` never need it.
- **memory** reads `~/.claude-memory/config.json` (no environment variable selects the embedder). With no config file it uses **Ollama** at `http://localhost:11434` with `nomic-embed-text`. It works with no embedder at all: memories are stored without vectors and recall is keyword-only (BM25). The server re-probes its configured embedder at most every 30 s, so starting one later turns vector recall on without a restart.

### Option A — LM Studio (default for code-search, free, local)

1. Download [LM Studio](https://lmstudio.ai)
2. In the model search bar, find and download: `nomic-ai/nomic-embed-text-v1.5-GGUF`
3. Load it → it will listen on `http://localhost:1234`
4. No further config needed for code-search — it defaults to this URL and the model ID `text-embedding-nomic-embed-text-v1.5`. Memory uses LM Studio only when `~/.claude-memory/config.json` selects it; `install.sh` writes that file for you when it finds LM Studio (see Option C).

### Option B — Different LM Studio model (code-search)

Any text embedding model loaded in LM Studio works. Set these env vars (add to `~/.zshrc` or `~/.bashrc`) — code-search reads them; memory does not:

```bash
export LM_STUDIO_MODEL="your-model-name-here"   # model ID as shown in LM Studio
export LM_STUDIO_URL="http://localhost:1234"     # server root, no /v1 — change if different
```

Common alternatives:

| Model | Dimensions | Speed | Quality |
|-------|-----------|-------|---------|
| `nomic-ai/nomic-embed-text-v1.5` | 768 | Fast | Good (default) |
| `text-embedding-nomic-embed-text-v1` | 768 | Fast | Good |
| `CompendiumLabs/bge-large-en-v1.5-gguf` | 1024 | Medium | Better |
| `CompendiumLabs/bge-small-en-v1.5-gguf` | 384 | Fastest | OK |

> **Important:** If you change the embedding model after indexing, you must re-index with `force=true`. code-search records the provider, model and vector dimension at index time; after a change, `code_search` and `code_index` refuse with a message until you run `code_index(force=true)`, which clears the old index and re-embeds every file. Memory is provider-sticky — after switching its model, run `memory_reembed()` to re-embed stored memories.

### Option C — Memory embedder (`~/.claude-memory/config.json`)

**Default (no config file):** install [Ollama](https://ollama.com) and run `ollama pull nomic-embed-text`. Nothing else to configure.

**LM Studio, another model, or a remote host** — create `~/.claude-memory/config.json`:

```json
{
  "embedding": {
    "provider": "lmstudio",
    "endpoint": "http://localhost:1234",
    "model": "text-embedding-nomic-embed-text-v1.5",
    "dimensions": 768
  },
  "version": 1
}
```

`provider` is `ollama` or `lmstudio`. `endpoint` is the server root — the client appends `/v1/embeddings` (LM Studio) or `/api/embeddings` (Ollama) itself.

**What `install.sh` does** (when you install memory with `--memory` or answer yes at the prompt): it never touches an existing `config.json` — it reports the provider it names and probes that endpoint. With no config file, if Ollama is serving `nomic-embed-text` it writes nothing (that is the server's default). Otherwise, if LM Studio on `localhost:1234` lists a model whose ID contains `embed` (a nomic one preferred), it writes `config.json` selecting that model, with `dimensions` measured from one probe embedding (768 if the probe fails). If Ollama is up without the model it offers to pull it; if no embedder is found it says memory runs keyword-only and prints how to enable one later.

### Option D — Other OpenAI-compatible servers (no hosted APIs)

Any server exposing `GET /v1/models` and `POST /v1/embeddings` works: point code-search's `LM_STUDIO_URL`, or memory's `endpoint` with `"provider": "lmstudio"`, at its root (the clients append `/v1/...` themselves, so do not include `/v1`). Neither server sends an API key or `Authorization` header, so hosted APIs that require one — OpenAI included — are **not supported**.

There is no switch to turn embeddings off: memory falls back to keyword-only on its own when its embedder is unreachable, and code-search cannot build an index without one.

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

`code_index` refuses to run until an embedder is reachable (§3). The index lives at `.code-search/index.db` under the project root (`CODE_SEARCH_ROOT`). The server does not gitignore it — add `.code-search/` to your `.gitignore` (`/sdlc hygiene` adds that rule). Re-running `code_index()` refreshes it, skipping files whose mtime is unchanged.

### bpm-memory-mcp

The embedder is not set by environment variables — it comes from `~/.claude-memory/config.json` (§3, Option C). The server reads these:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAUDE_PROJECT_ROOT` | `cwd` | Project whose memory database is used |
| `MEMORY_AGENT_ID` | _(unset)_ | Default writer/reader agent id for fleet-scoped memories |
| `MEMORY_TEAM_ID` | _(unset)_ | Default writer/reader team id for `team`-visibility memories |
| `CLAUDE_MEMORY_SLEEP_CONSOLIDATION` | `false` | Set to `true` to run consolidation automatically on `session_save` |
| `CLAUDE_MEMORY_CONSOLIDATION_INTERVAL_HOURS` | `24` | Minimum hours between automatic consolidation runs per project |
| `CLAUDE_MEMORY_CONSOLIDATION_LOG_PATH` | `~/.claude-memory/logs/consolidation.log` | Consolidation run log |

Each project gets its own database at `~/.claude-memory/<project-id>/memory.db`, where `<project-id>` is the first 16 hex characters of the SHA-256 of the project root path, so projects' memories are isolated automatically. The location is fixed — no variable overrides it.

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

### Long runs and autocompaction

When the context window fills, opencode replaces conversation history with a
summary. On smaller models (reported on `gpt-5-mini`) a long review or coding run
then loses the thread — redoing finished work, forgetting which PRODUCE files it
still owes, or dropping the completion phrase.

The durable fix ships as a plugin: **`plugins/resume-anchor.ts`**, installed to
`~/.config/opencode/plugins/` and auto-loaded (no config entry needed). It works
on one principle — **disk state survives compaction; conversation history does
not** — so instead of trying to make the summary better, it recomputes a short
"where am I" anchor from the filesystem and re-injects it on *every* request:

- the active `docs/work/HANDOFF_*.md`,
- each `PRODUCE` file marked `[done]` or `[MISSING]` by an actual `existsSync`,
- the exact completion phrase,
- `STATE.md`'s single `Next` step, and any `phaseN.md` files already written.

Because it never depended on history, a compacted turn gets exactly the same
anchor as an uncompacted one. It also appends must-survive pointers to the
compaction prompt (best-effort), and emits nothing at all on projects with no
HANDOFF/STATE, so it costs nothing when irrelevant. Disable with
`EXPERTS_RESUME_ANCHOR=0`.

This does **not** remove the need to write findings to disk as you go — see the
`prune` note below.

**Compaction tuning** (`compaction` in `opencode.json`; see `examples/opencode.json`):

| Key | Guidance |
|---|---|
| `prune` | Drops **old tool outputs**. Keeps context low, but silently discards earlier file reads — never rely on "I read that file 20 turns ago". Write results to disk as you go. |
| `tail_turns` | Recent user turns kept verbatim through a compact (default `2`). Raise to `4` for long multi-step work. |
| `reserved` | Token buffer left for compaction. **Leave unset.** Setting it near the model's *input* limit wedges the session — observed on `gpt-5-mini` (input 128k): values from 118000 to 250000 hung it outright. |

---

### Optional analysis tools on a bare Linux box

Every analysis tool is optional — the agents fall back to `grep` — so a partial
install is a supported state, not a broken one.

`check-tools.sh --install` **never runs sudo** and never calls a package manager.
It installs what it can (npm and pipx tools), prints the *real* error for
anything that fails, and lists the remaining system prerequisites as commands for
you to run. On a fresh non-root Linux box you will typically see:

- **`npm i -g` hits EACCES** when the global prefix is root-owned (both the
  nodesource and distro Node packages do this). The script retries scoped into
  `~/.npm-global` — without rewriting your `~/.npmrc` — then tells you to add
  `~/.npm-global/bin` to `PATH`. Nothing to do but the `PATH` line.
- **`pipx` is missing**, which blocks semgrep/vulture/radon/lizard. On Ubuntu
  24.04 and other PEP 668 "externally-managed" distros `pip install --user pipx`
  is refused, so the package manager is the only route:
  `sudo apt install -y pipx && pipx ensurepath`.
- **`mmdc` is never auto-installed.** `@mermaid-js/mermaid-cli` pulls puppeteer,
  which downloads Chromium and needs `unzip` plus browser libs. Installing it
  with `PUPPETEER_SKIP_DOWNLOAD` produces a *broken* renderer, which is worse
  than not having it: `validate-mermaid.sh` cleanly skips a missing `mmdc` and
  still runs every static Mermaid check. Install it deliberately or not at all.
  If an earlier attempt half-finished, clear `~/.cache/puppeteer` first — a
  partial download makes every retry fail differently.

To verify the bare-Linux path yourself (needs podman or docker):

```bash
./scripts/test-check-tools-container.sh   # builds a bare ubuntu:24.04, runs the installer as a non-root user
```

CI cannot cover this: GitHub's `ubuntu-latest` ships a writable npm prefix and
`unzip`, so none of the above reproduces there.

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
export LM_STUDIO_URL="http://192.168.1.x:1234"   # code-search — replace with your server IP
```

Memory ignores that variable: set `"endpoint": "http://192.168.1.x:1234"` (with `"provider": "lmstudio"`) in `~/.claude-memory/config.json` instead (§3, Option C).

Make sure LM Studio is configured to accept connections on all interfaces (not just localhost) in its settings.

---

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| `cat ~/.config/opencode/opencode.json \| python3 -m json.tool` shows MCP as "Pending approval" | Restart OpenCode once and approve it |
| code-search: "No embedding provider available" | Start LM Studio (or the server at `LM_STUDIO_URL`) with an embedding model loaded, then retry — `code_index` cannot build an index without one |
| code-search: "The embedding model changed since this index was built" | Run `code_index(force=true)` to rebuild the index with the current model |
| memory: vector search returns 0 results | Its embedder isn't reachable, so recall is keyword-only. With no `~/.claude-memory/config.json` that embedder is Ollama with `nomic-embed-text` on port 11434; otherwise check the file's `provider`, `endpoint` and `model`. Then run `memory_reembed(onlyMissing=true)` to embed memories stored while it was down |
| playwright-mcp: "browser not found" | Run `npx playwright install chromium` |
| install.sh: "node not found" or wrong version | The installer will prompt to install NVM + Node 24 automatically |
| `jq: command not found` | `brew install jq` (macOS) or `apt install jq` (Linux) |
| MCP built but not registered | Re-run `./install.sh` or register manually: `Add entry to ~/.config/opencode/opencode.json under "mcp"` |

---

## 8. Uninstall

```bash
./uninstall.sh
```

Removes all installed files from `~/.config/opencode/`. Does not remove MCP repos from `~/Code/` or the memory databases and config under `~/.claude-memory/`.
