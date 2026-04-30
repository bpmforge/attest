# BPM OpenCode Experts

Expert agent system for [OpenCode](https://opencode.ai). 14 specialist agents, 23 skills, 9 validators, a full SDLC workflow — driven by whichever LLM backend you configure (Claude, OpenAI, Gemini, Ollama, LM Studio, 75+ providers).

Sibling project: [`claude-experts`](https://github.com/bpmforge/claude-experts) — same experts for Claude Code.

## Install

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh
```

The install script handles everything automatically:
- Copies agents, skills, tools, and hooks to `~/.config/opencode/`
- Installs npm tool dependencies (`@opencode-ai/plugin`, `playwright`, etc.)
- Installs `@playwright/cli` globally and its Chromium browser
- Configures **Context7 MCP** for live library docs lookup
- Clones, builds, and registers **playwright-search MCP** (`web_research` / `web_search` / `web_fetch`) at `~/.local/share/playwright-search` — multi-engine web research with paragraph-level relevance ranking, available to every agent in the project
- Optionally installs Semgrep and community rule sets (`--semgrep`)

### Install flags

| Flag | Effect |
|------|--------|
| `--project` | Install to `.opencode/` in current directory (project-scoped) instead of global `~/.config/opencode/` |
| `--link` | Symlink agents/skills instead of copying — edits to this repo update the live install (dev mode) |
| `--semgrep` | Also install Semgrep + community rule repos |
| `--no-playwright-search` | Skip cloning/building the playwright-search MCP (use if you don't have Node 20+, or already manage it yourself) |
| `--pullmd` | Also clone and start [pullmd](https://github.com/AeternaLabsHQ/pullmd) (URL→markdown fallback for JS-heavy / Cloudflare / Reddit pages) via Docker. Requires `docker compose`. |
| `--uninstall` | Remove installed files |

Override install locations: `PLAYWRIGHT_SEARCH_DIR=~/code/pws ./install.sh` or `PULLMD_DIR=~/code/pullmd ./install.sh --pullmd`

### Research backbone

Web research goes through **our** MCP servers — never opencode built-ins. The reference `examples/opencode.json` disables `webfetch` and `websearch` so the LLM is forced into the right tool chain:

1. **`playwright-search` MCP** (always installed) — multi-engine search (DDG + Brave + Bing) → paragraph-ranked extraction → 24h cache. Provides `web_research`, `web_search`, `web_fetch`.
2. **`pullmd` MCP** (optional, install with `--pullmd`) — fallback for JS-heavy pages and Cloudflare / Reddit. 4-stage extraction pipeline (Reddit handler → Cloudflare native MD → Readability + Trafilatura → headless Playwright). Provides `read_url`, `get_share`, `list_recent`.

See `agents/shared/RESEARCH_TOOLS.md` for the full surface and the fallback chain every agent follows.

Requires macOS, Linux, or Windows with WSL2. Uninstall with `./uninstall.sh`.

### What others need

If you're handing this off, the recipient just needs:

```bash
git clone https://github.com/bpmforge/bpm-opencode-experts.git
cd bpm-opencode-experts
./install.sh
```

…plus Node 20+ on PATH (for the playwright-search MCP), and `jq` (for safe JSON merging into `opencode.json`). The script clones playwright-search from GitHub, builds it, and wires the MCP into their `opencode.json`. No manual config required.

### Lifecycle plugin (`plugins/expert-hooks.ts`)

A single opencode plugin wires up safety + quality automation. Auto-loaded by opencode from `~/.config/opencode/plugins/` after install:

- **Pre-tool guards** — blocks dangerous bash commands (`rm -rf /`, `git push --force`, `DROP TABLE`, `curl|bash`, etc.) and writes to credential files (`.env*`, `*.key`, `*.pem`, `id_rsa`, `credentials.json`).
- **Post-edit automation** — after any write/edit, runs format → lint → type-check → secret-scan in parallel:
  - format: prettier (TS/JS/JSON/MD), black + isort (Python), gofmt, rustfmt
  - lint: eslint, ruff
  - type-check: `tsc --noEmit` on `.ts` / `.tsx`
  - secret-scan: regex-based scan for hardcoded API keys, AWS credentials, PEM private keys, DB connection strings with creds, bearer tokens

Failures surface via `console.warn` so the LLM sees them, but never block — informational pressure, not a gate. Formatters that aren't installed are silently skipped.

Skipped from the claude-experts hook port (different abstractions): `commit-validator.sh` (better placed as a project-level git pre-commit hook), `test-on-stop.sh` (no clean opencode session-idle semantic), `session-start.sh` (opencode's event API doesn't expose a UserPromptSubmit equivalent yet).

## First command

Inside an OpenCode session:

```
/sdlc init my-project "short description"
```

Or describe what you want in plain English — the SDLC lead detects intent and routes.

## Docs

- [docs/USERGUIDE.md](docs/USERGUIDE.md) — how to invoke and use each expert
- [docs/FEATURES.md](docs/FEATURES.md) — every agent, skill, validator, and shared protocol
- [docs/SDLC_GUIDE.md](docs/SDLC_GUIDE.md) — full SDLC workflow
- [docs/AGENT_PROCESS_FLOW.md](docs/AGENT_PROCESS_FLOW.md) — step-by-step agent orchestration
- [scripts/validators/README.md](scripts/validators/README.md) — validator contract
- [CHANGELOG.md](CHANGELOG.md) — release notes (current: v0.16.0 research + loop-prevention)

## Remote LM Studio on macOS (Sequoia+)

macOS Sequoia's Local Network privacy blocks Node.js (a third-party binary) from connecting directly to LM Studio on another machine on your LAN. You'll see `Cannot connect to API` / `FailedToOpenSocket` in the OpenCode logs even though `curl` to the same host works fine.

**Fix:** run a local TCP proxy using `/usr/bin/python3` — Apple's system Python is exempt from the restriction and forwards traffic transparently.

**Step 1 — create the proxy script**

Save as `~/.local/bin/lmstudio-proxy.py` and edit `REMOTE_HOST`/`REMOTE_PORT` to match your LM Studio machine:

```python
#!/usr/bin/python3
import socket, threading

LISTEN_HOST = '127.0.0.1'
LISTEN_PORT = 12345           # any free local port
REMOTE_HOST = '192.168.x.x'  # your remote LM Studio host
REMOTE_PORT = 1234            # LM Studio API port (default 1234)

def relay(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data: break
            dst.sendall(data)
    except Exception: pass
    finally:
        for s in (src, dst):
            try: s.shutdown(socket.SHUT_RDWR)
            except Exception: pass
            try: s.close()
            except Exception: pass

def handle(client):
    try:
        remote = socket.create_connection((REMOTE_HOST, REMOTE_PORT), timeout=10)
        remote.settimeout(None)
        t1 = threading.Thread(target=relay, args=(client, remote), daemon=True)
        t2 = threading.Thread(target=relay, args=(remote, client), daemon=True)
        t1.start(); t2.start(); t1.join(); t2.join()
    except Exception as e:
        print(f"handle error: {e}", flush=True)
    finally:
        try: client.close()
        except Exception: pass

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind((LISTEN_HOST, LISTEN_PORT))
server.listen(32)
print(f"Proxy {LISTEN_HOST}:{LISTEN_PORT} -> {REMOTE_HOST}:{REMOTE_PORT}", flush=True)
while True:
    client, _ = server.accept()
    client.settimeout(None)
    threading.Thread(target=handle, args=(client,), daemon=True).start()
```

**Step 2 — create a LaunchAgent so it starts at login**

Save as `~/Library/LaunchAgents/com.yourname.lmstudio-proxy.plist` (replace `yourname` and the script path):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.yourname.lmstudio-proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/yourname/.local/bin/lmstudio-proxy.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/lmstudio-proxy.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/lmstudio-proxy.log</string>
</dict>
</plist>
```

**Step 3 — load it**

```bash
launchctl load ~/Library/LaunchAgents/com.yourname.lmstudio-proxy.plist
```

**Step 4 — update `opencode.json`**

Point your remote provider at `localhost` instead of the remote IP:

```json
"lmstudio-remote": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "LM Studio (Remote)",
  "options": {
    "baseURL": "http://127.0.0.1:12345/v1",
    "apiKey": "lm-studio"
  },
  "models": { ... }
}
```

The proxy auto-starts at login and restarts if it crashes. Check `/tmp/lmstudio-proxy.log` for diagnostics.

## License

See `LICENSE`.
