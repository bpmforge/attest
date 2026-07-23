#!/usr/bin/env bash
#
# setup-dev-server.sh — provision (and re-provision) a remote Linux dev box for
# opencode + the bpm-opencode-experts expert system, pointed at a local-LLM host.
#
# One command does the whole thing, and re-running it is a REFRESH: it pulls the
# latest repo, re-installs the agents/skills/tools, and re-merges the LLM provider
# config — safe to run as often as you like.
#
#   ssh you@dev-server
#   git clone https://git.bpmforge.com/user/bpm-opencode-experts.git ~/Code/bpm-opencode-experts
#   cd ~/Code/bpm-opencode-experts && ./scripts/setup-dev-server.sh
#
#   # later, to refresh:
#   cd ~/Code/bpm-opencode-experts && ./scripts/setup-dev-server.sh
#
# What it does, in order:
#   1. git pull --ff-only  (the "refresh")
#   2. bash install.sh --yes --tools   (agents, skills, MCPs, + the optional
#      code-analysis tools via the never-sudo bare-Linux path)
#   3. merge an LM Studio provider block into ~/.config/opencode/opencode.json,
#      with its model list fetched LIVE from the LLM host (so it matches whatever
#      is actually loaded), without disturbing the MCP/permission blocks install
#      wrote. A timestamped backup is made first.
#   4. optionally point the embedder (code-search / memory) at the same host.
#   5. verify: opencode present, LLM endpoint reachable, models visible.
#
# Never runs sudo. If a system package is missing, install.sh / check-tools.sh
# print the exact command for you to run — this script surfaces that, it does not
# escalate. See docs/SETUP.md §6.

set -euo pipefail

# ── Defaults (override via flags) ─────────────────────────────────────────────
LLM_URL="http://192.168.0.179:1234/v1"   # the local-LLM host this box talks to
PROVIDER_ID="lmstudio-remote"
PROVIDER_NAME=""                            # derived from LLM_URL if left blank
BRANCH="main"
DO_PULL=true
DO_TOOLS=true
DO_EMBED=true
CONFIG="$HOME/.config/opencode/opencode.json"

usage() {
  cat <<EOF
setup-dev-server.sh — provision/refresh opencode + experts on a Linux dev box.

  --llm-url URL       OpenAI-compatible base URL of the LLM host
                      (default: $LLM_URL)
  --provider-id ID    opencode provider key to write (default: $PROVIDER_ID)
  --branch NAME       git branch to track (default: $BRANCH)
  --no-pull           skip 'git pull' (reinstall + reconfigure only)
  --no-tools          skip the optional code-analysis tools (install.sh --tools)
  --no-embed          don't point the embedder env var at the LLM host
  -h, --help          this help

Re-running with no flags is a full refresh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --llm-url)     LLM_URL="$2"; shift 2 ;;
    --provider-id) PROVIDER_ID="$2"; shift 2 ;;
    --branch)      BRANCH="$2"; shift 2 ;;
    --no-pull)     DO_PULL=false; shift ;;
    --no-tools)    DO_TOOLS=false; shift ;;
    --no-embed)    DO_EMBED=false; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage; exit 2 ;;
  esac
done

# Strip a trailing slash so URL joins are clean.
LLM_URL="${LLM_URL%/}"
HOSTPORT="$(printf '%s' "$LLM_URL" | sed -E 's#^https?://##; s#/.*$##')"
[[ -z "$PROVIDER_NAME" ]] && PROVIDER_NAME="LM Studio ($HOSTPORT)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

# ── Preconditions ─────────────────────────────────────────────────────────────
step "Preconditions"
for bin in git python3 curl; do
  if command -v "$bin" >/dev/null 2>&1; then
    ok "$bin present"
  else
    echo "  MISSING: $bin — install it first (e.g. sudo apt install -y $bin)"; exit 1
  fi
done
if command -v opencode >/dev/null 2>&1; then
  ok "opencode present ($(opencode --version 2>/dev/null | head -1))"
else
  warn "opencode not on PATH — install it (https://opencode.ai) before agents can run."
  warn "continuing: the expert files and config will still be set up."
fi

# ── 1. Refresh the repo ───────────────────────────────────────────────────────
step "Refresh repo ($REPO_DIR)"
if [[ "$DO_PULL" == true ]] && git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$REPO_DIR" fetch --quiet --all --prune || warn "fetch failed (offline?) — using local checkout"
  if git -C "$REPO_DIR" rev-parse --verify --quiet "origin/$BRANCH" >/dev/null 2>&1 \
     || git -C "$REPO_DIR" rev-parse --verify --quiet "github/$BRANCH" >/dev/null 2>&1; then
    git -C "$REPO_DIR" checkout --quiet "$BRANCH" 2>/dev/null || true
    if git -C "$REPO_DIR" pull --ff-only --quiet 2>/dev/null; then
      ok "pulled latest $BRANCH → $(git -C "$REPO_DIR" rev-parse --short HEAD)"
    else
      warn "fast-forward pull failed (local changes or diverged) — using current checkout"
    fi
  else
    warn "no tracking remote for $BRANCH — using current checkout"
  fi
else
  ok "skipping pull (--no-pull or not a git checkout)"
fi

# ── 2. Install agents / skills / MCPs / tools ─────────────────────────────────
step "Install expert system (install.sh)"
INSTALL_FLAGS=(--yes)
[[ "$DO_TOOLS" == true ]] && INSTALL_FLAGS+=(--tools)
bash "$REPO_DIR/install.sh" "${INSTALL_FLAGS[@]}"

# ── 3. Merge the LLM provider block ───────────────────────────────────────────
step "Configure LLM provider '$PROVIDER_ID' → $LLM_URL"

# Fetch the live model list from the host so config matches what's loaded.
MODELS_JSON=""
if MODELS_JSON="$(curl -fsS --max-time 8 "$LLM_URL/models" 2>/dev/null)"; then
  ok "reached $LLM_URL/models"
else
  warn "could not reach $LLM_URL/models — writing an empty model list."
  warn "load a model in LM Studio and re-run this script, or check that it listens on 0.0.0.0."
  MODELS_JSON=""
fi

mkdir -p "$(dirname "$CONFIG")"
[[ -f "$CONFIG" ]] || printf '{"$schema":"https://opencode.ai/config.json"}\n' > "$CONFIG"

# Timestamped backup (opencode config is the one file we most want to be able to revert).
BACKUP="$CONFIG.bak-$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || echo manual)"
cp "$CONFIG" "$BACKUP"
ok "backed up existing config → $BACKUP"

CONFIG="$CONFIG" PROVIDER_ID="$PROVIDER_ID" PROVIDER_NAME="$PROVIDER_NAME" \
LLM_URL="$LLM_URL" MODELS_JSON="$MODELS_JSON" python3 - <<'PY'
import json, os, sys

cfg_path = os.environ["CONFIG"]
pid      = os.environ["PROVIDER_ID"]
pname    = os.environ["PROVIDER_NAME"]
url      = os.environ["LLM_URL"]
raw      = os.environ.get("MODELS_JSON", "").strip()

with open(cfg_path) as f:
    cfg = json.load(f)

cfg.setdefault("$schema", "https://opencode.ai/config.json")

# Live model ids from the OpenAI-compatible /models response; keep the previous
# list if the host was unreachable this run so a transient outage can't wipe it.
model_ids = []
if raw:
    try:
        for m in json.loads(raw).get("data", []):
            mid = m.get("id")
            if mid:
                model_ids.append(mid)
    except Exception as e:
        print(f"  (could not parse model list: {e})", file=sys.stderr)

prov = cfg.setdefault("provider", {})
existing = prov.get(pid, {})
if not model_ids:
    model_ids = list(existing.get("models", {}).keys())

prov[pid] = {
    "npm": "@ai-sdk/openai-compatible",
    "name": pname,
    "options": {"baseURL": url, "apiKey": "lm-studio"},
    "models": {mid: {"name": mid} for mid in sorted(model_ids)},
}

with open(cfg_path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")

print(f"  wrote provider '{pid}' with {len(model_ids)} model(s)")
PY

# ── 4. Point the embedder at the same host (code-search / memory) ─────────────
if [[ "$DO_EMBED" == true ]]; then
  step "Embedder env (code-search / memory vector search)"
  PROFILE="$HOME/.bashrc"; [[ -n "${ZSH_VERSION:-}" ]] && PROFILE="$HOME/.zshrc"
  LINE="export LM_STUDIO_URL=\"${LLM_URL%/v1}\"   # bpm-opencode-experts: remote embedder"
  if [[ -f "$PROFILE" ]] && grep -qF 'bpm-opencode-experts: remote embedder' "$PROFILE"; then
    # keep it current in case the URL changed
    tmp="$(mktemp)"; grep -vF 'bpm-opencode-experts: remote embedder' "$PROFILE" > "$tmp"; mv "$tmp" "$PROFILE"
  fi
  printf '%s\n' "$LINE" >> "$PROFILE"
  ok "set LM_STUDIO_URL in $PROFILE (run: source $PROFILE)"
fi

# ── 5. Verify ─────────────────────────────────────────────────────────────────
step "Verify"
python3 -c "import json;json.load(open('$CONFIG'))" \
  && ok "opencode.json is valid JSON" \
  || { echo "  config is invalid JSON — restore: cp '$BACKUP' '$CONFIG'"; exit 1; }

NMODELS="$(python3 -c "import json;print(len(json.load(open('$CONFIG')).get('provider',{}).get('$PROVIDER_ID',{}).get('models',{})))")"
ok "$NMODELS model(s) configured under provider '$PROVIDER_ID'"

if curl -fsS --max-time 5 "$LLM_URL/models" >/dev/null 2>&1; then
  ok "LLM host reachable at $LLM_URL"
else
  warn "LLM host NOT reachable at $LLM_URL — start the model server or check networking."
fi

cat <<EOF

Done. On this box you can now:
  opencode                                 # interactive
  opencode run --model $PROVIDER_ID/<model> "..."

List the configured models:
  python3 -c "import json;print('\n'.join(json.load(open('$CONFIG'))['provider']['$PROVIDER_ID']['models']))"

Refresh anytime (pull + reinstall + reconfigure):
  cd $REPO_DIR && ./scripts/setup-dev-server.sh
EOF
