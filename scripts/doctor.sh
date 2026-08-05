#!/usr/bin/env bash
#
# doctor.sh — post-install self-check for attest.
#
# Run after ./install.sh (or anytime something feels broken):
#   ~/.config/opencode/scripts/doctor.sh
#
# Exit codes: 0 = healthy, 1 = FAIL items present (system won't work fully).
# WARN items are degraded-but-functional (optional features missing).

set -u

DIR="${1:-$HOME/.config/opencode}"
PASS=0; WARN=0; FAIL=0

ok()   { printf '  \033[32m[PASS]\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
warn() { printf '  \033[33m[WARN]\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
bad()  { printf '  \033[31m[FAIL]\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }

echo "attest — doctor"
echo "Checking install at: $DIR"
echo ""

# ── 1. Install structure ────────────────────────────────────────────────
echo "Install structure:"
[ -d "$DIR" ] && ok "install dir exists" || { bad "install dir missing — run ./install.sh"; echo ""; echo "RESULT: $PASS pass, $WARN warn, $FAIL fail"; exit 1; }
for d in agents skills scripts references; do
  [ -d "$DIR/$d" ] && ok "$d/ present" || bad "$d/ missing — re-run ./install.sh"
done

AGENT_COUNT=$(find "$DIR/agents" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
[ "$AGENT_COUNT" -ge 30 ] && ok "primary agents: $AGENT_COUNT (expect 30+)" || bad "only $AGENT_COUNT primary agents found (expect 30+)"

VAL_COUNT=$(find "$DIR/scripts/validators" -name "validate-*.sh" 2>/dev/null | wc -l | tr -d ' ')
[ "$VAL_COUNT" -ge 40 ] && ok "validators: $VAL_COUNT (expect 40+)" || bad "only $VAL_COUNT validators (expect 40+)"

for p in LOOP_PREVENTION CONTEXT_BUDGET BOUNDED_TASK_CONTRACT HANDOFF_TEMPLATES EXECUTOR_SELECTION MODEL_ADAPTER; do
  [ -f "$DIR/agents/shared/$p.md" ] && ok "protocol $p.md present" || bad "agents/shared/$p.md missing"
done

if [ -d "$DIR/agents/compact" ]; then
  warn "agents/compact/ inside install — old layout; compact variants now overlay via ./install.sh --compact (rm -rf $DIR/agents/compact and re-install)"
fi

# ── 2. Runtime ──────────────────────────────────────────────────────────
echo ""
echo "Runtime:"
if command -v opencode >/dev/null 2>&1; then
  ok "opencode CLI: $(opencode --version 2>/dev/null | head -1)"
else
  bad "opencode CLI not found — install: https://opencode.ai"
fi
command -v node >/dev/null 2>&1 && ok "node: $(node --version)" || bad "node missing (custom tools need it)"
command -v jq   >/dev/null 2>&1 && ok "jq present" || warn "jq missing — install.sh cannot safely merge opencode.json (brew install jq)"
command -v git  >/dev/null 2>&1 && ok "git present" || bad "git missing"
if command -v opengrep >/dev/null 2>&1; then
  ok "opengrep (preferred SAST engine): $(opengrep --version 2>/dev/null | head -1)"
elif command -v semgrep >/dev/null 2>&1; then
  warn "opengrep missing, using semgrep fallback: $(semgrep --version 2>/dev/null | head -1) — install opengrep for client-safe scans (registry rules are internal-use-only)"
else
  warn "no SAST engine — security scans degraded. Install Opengrep (preferred): see references/semgrep-guide.md"
fi

# ── 3. Config ───────────────────────────────────────────────────────────
echo ""
echo "Config ($DIR/opencode.json):"
CFG="$DIR/opencode.json"
if [ -f "$CFG" ]; then
  ok "opencode.json present"
  if command -v jq >/dev/null 2>&1; then
    jq -e '.mcp.context7' "$CFG" >/dev/null 2>&1 && ok "context7 MCP configured" || warn "context7 MCP not configured (library docs lookup degraded)"
    if jq -e '.permission.external_directory' "$CFG" >/dev/null 2>&1; then
      ok "external_directory permission configured (protocol reads work in opencode run)"
    else
      bad "external_directory permission MISSING — non-interactive runs cannot read shared protocols. Re-run ./install.sh"
    fi
  else
    grep -q "external_directory" "$CFG" && ok "external_directory permission appears configured" || bad "external_directory permission missing — re-run ./install.sh (with jq installed)"
  fi
else
  bad "opencode.json missing — re-run ./install.sh"
fi

# ── 4. Model backend ────────────────────────────────────────────────────
echo ""
echo "Model backend:"
FOUND_BACKEND=false
for url in "${LMSTUDIO_URL:-http://127.0.0.1:1234}" "http://127.0.0.1:11434"; do
  if curl -s --max-time 2 "$url/v1/models" >/dev/null 2>&1 || curl -s --max-time 2 "$url/api/tags" >/dev/null 2>&1; then
    ok "local model server reachable at $url"
    FOUND_BACKEND=true
    break
  fi
done
for key in ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_GENERATIVE_AI_API_KEY; do
  if [ -n "${!key:-}" ]; then ok "cloud key set: $key"; FOUND_BACKEND=true; fi
done
$FOUND_BACKEND || warn "no local model server reachable and no cloud API key in env — opencode's own provider config may still work; verify with: opencode run 'say hi'"

# ── 5. Detection script ─────────────────────────────────────────────────
echo ""
echo "Model detection:"
if [ -x "$DIR/scripts/detect-model-context.sh" ] || [ -f "$DIR/scripts/detect-model-context.sh" ]; then
  TMPD=$(mktemp -d)
  if (cd "$TMPD" && bash "$DIR/scripts/detect-model-context.sh" >/dev/null 2>&1) && grep -q "tier=" "$TMPD/docs/work/.model-context" 2>/dev/null; then
    ok "detect-model-context.sh runs: $(grep -E '^(tier|has_task_tool|mcp_in_subagents)=' "$TMPD/docs/work/.model-context" | tr '\n' ' ')"
  else
    warn "detect-model-context.sh did not produce .model-context (run it inside a project to debug)"
  fi
  rm -rf "$TMPD"
else
  bad "scripts/detect-model-context.sh missing"
fi

# ── 6. Agent discovery ──────────────────────────────────────────────────
# Authoritative check = the agent FILES are installed (deterministic).
# `opencode agent list` boots the runtime and returns a partial/varying list
# across runs, so it's only an advisory cross-check — never a hard failure.
echo ""
echo "Agent discovery:"
for a in sdlc-lead guide task-decomposer; do
  if [ -f "$DIR/agents/$a.md" ]; then ok "agent installed: $a.md"; else bad "agent missing: $DIR/agents/$a.md — re-run ./install.sh"; fi
done
[ -d "$DIR/agents/compact" ] && warn "stale agents/compact/ present — duplicate registrations; rm -rf $DIR/agents/compact and re-install" || ok "no stale compact/ dir"
if command -v opencode >/dev/null 2>&1; then
  # `opencode agent list` returns a partial/varying list per run, so retry a few
  # times and pass if any attempt enumerates sdlc-lead. Only warn if all fail.
  enum_ok=0; enum_count=0
  for _ in 1 2 3; do
    LIST=$(cd /tmp && opencode agent list 2>/dev/null)
    if echo "$LIST" | grep -qE "(^|[[:space:]])sdlc-lead([[:space:]]|\()"; then
      enum_ok=1; enum_count=$(echo "$LIST" | grep -cE '\((primary|subagent|all)\)'); break
    fi
  done
  if [ "$enum_ok" -eq 1 ]; then ok "opencode enumerates agents (${enum_count} listed)"
  else warn "opencode agent list never showed sdlc-lead across 3 tries — runtime enumeration may be degraded; the installed files above are the real signal"; fi
fi

# ── 7. Code-analysis tools ──────────────────────────────────────────────
echo ""
echo "MCP servers (registered in opencode.json):"
# A registered MCP whose binary is missing looks identical to a healthy one
# until opencode silently fails to connect it. install.sh can also BUILD every
# server and register none of them when jq is absent, which reads as success.
# Check what is actually there: the entry exists, its file exists, and for
# stdio servers the process answers a real JSON-RPC initialize.
if [ -f "$CFG" ] && command -v jq >/dev/null 2>&1; then
  MCP_NAMES=$(jq -r '.mcp // {} | keys[]' "$CFG" 2>/dev/null)
  if [ -z "$MCP_NAMES" ]; then
    bad "no MCP servers registered — agents lose code-search/research/memory. Re-run ./install.sh"
  else
    for name in $MCP_NAMES; do
      # NOT `.enabled // true` -- jq's `//` treats `false` as empty, so an
      # explicitly disabled server would read back as enabled.
      enabled=$(jq -r --arg n "$name" 'if (.mcp[$n] | has("enabled")) then (.mcp[$n].enabled) else true end' "$CFG" 2>/dev/null)
      if [ "$enabled" != "true" ]; then
        warn "$name: registered but disabled"
        continue
      fi
      bin=$(jq -r --arg n "$name" '.mcp[$n].command[0] // ""' "$CFG" 2>/dev/null)
      arg=$(jq -r --arg n "$name" '.mcp[$n].command[1] // ""' "$CFG" 2>/dev/null)
      # npx-based servers fetch on first use — nothing local to stat.
      if [ "$bin" = "npx" ]; then
        command -v npx >/dev/null 2>&1 \
          && ok "$name: npx package (fetched on first use)" \
          || bad "$name: needs npx, which is not on PATH"
        continue
      fi
      if [ -n "$arg" ] && [ ! -f "$arg" ]; then
        bad "$name: registered path does not exist — $arg (re-run ./install.sh)"
        continue
      fi
      if [ "$bin" = "node" ] && [ -n "$arg" ]; then
        if printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"doctor","version":"1"}}}' \
           | node "$arg" 2>/dev/null | head -c 2000 | grep -q '"serverInfo"'; then
          ok "$name: responds to initialize"
        else
          bad "$name: built and registered but does not respond — try: node $arg"
        fi
      else
        ok "$name: registered ($bin)"
      fi
    done
  fi
elif [ -f "$CFG" ]; then
  warn "cannot check MCP servers — jq not installed"
fi

echo ""
echo "Code-analysis tools (optional — agents fall back to grep):"
TOOLS_PRESENT=0; TOOLS_TOTAL=0
for tool in opengrep ast-grep semgrep knip ts-prune jscpd vulture radon lizard staticcheck gitleaks; do
  TOOLS_TOTAL=$((TOOLS_TOTAL+1))
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool present"; TOOLS_PRESENT=$((TOOLS_PRESENT+1)); fi
done
if [ "$TOOLS_PRESENT" -lt "$TOOLS_TOTAL" ]; then
  warn "$TOOLS_PRESENT/$TOOLS_TOTAL analysis tools present — run scripts/check-tools.sh to see which, or ./install.sh --tools to add the easy ones"
fi

# ── Summary ─────────────────────────────────────────────────────────────
echo ""
echo "RESULT: $PASS pass, $WARN warn, $FAIL fail"
if [ "$FAIL" -gt 0 ]; then
  echo "Status: BROKEN — fix [FAIL] items above."
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "Status: FUNCTIONAL — [WARN] items are optional features."
else
  echo "Status: HEALTHY"
fi
exit 0
