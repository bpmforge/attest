#!/usr/bin/env bash
# detect-model-context.sh
# Detects the current model's context window and type (local/cloud).
# Writes docs/work/.model-context for agents to read at session start.
# Usage: bash scripts/detect-model-context.sh [--model <model-id>]

set -e

CONTEXT_FILE="docs/work/.model-context"

# -- Executor capability flags (see agents/shared/EXECUTOR_SELECTION.md) -----
# has_task_tool: current OpenCode ships a blocking Task tool with custom
#   subagents (anomalyco/opencode#20059, closed). Probe: opencode CLI present.
# mcp_in_subagents: Task-tool subagents cannot execute MCP tools while
#   anomalyco/opencode#16491 is open. Flip the default when it closes.
# Both respect env overrides for unusual setups.
detect_capabilities() {
  if [[ -n "${OPENCODE_HAS_TASK_TOOL:-}" ]]; then
    HAS_TASK_TOOL="$OPENCODE_HAS_TASK_TOOL"
  elif command -v opencode >/dev/null 2>&1; then
    HAS_TASK_TOOL="true"
  else
    HAS_TASK_TOOL="false"
  fi
  MCP_IN_SUBAGENTS="${OPENCODE_MCP_IN_SUBAGENTS:-false}"
}
detect_capabilities

# Maker/Verifier split (MODEL_ADAPTER.md § Maker/Verifier split). The verifier
# MUST be a different, ideally faster instance than the maker, so confidence
# scoring and re-verify never ask a model to grade its own work. Reads the
# provider/model/tier lines already written to CONTEXT_FILE, so it works in
# every exit path. Env override: VERIFIER_MODEL.
emit_model_roles() {
  local provider model maker verifier
  provider=$(grep -E '^provider=' "$CONTEXT_FILE" 2>/dev/null | head -1 | cut -d= -f2)
  model=$(grep -E '^model=' "$CONTEXT_FILE" 2>/dev/null | head -1 | cut -d= -f2)
  maker="${model:-unknown}"
  if [[ -n "${VERIFIER_MODEL:-}" ]]; then
    verifier="$VERIFIER_MODEL"
  else
    case "$provider" in
      anthropic) verifier="claude-haiku-4-5" ;;
      google)    verifier="gemini-2.0-flash-lite" ;;
      openai)    verifier="gpt-4o-mini" ;;
      lmstudio)  verifier="${VERIFIER_MODEL_LOCAL:-nemotron-3-nano-4b}" ;;
      *)         verifier="$maker" ;;
    esac
  fi
  echo "maker_model=$maker"               >> "$CONTEXT_FILE"
  echo "verifier_model=$verifier"         >> "$CONTEXT_FILE"
  # If they collide, the protocol's single-model fallback (fresh session,
  # cleared context) applies — flag it so the weaker guarantee is auditable.
  if [[ "$verifier" == "$maker" ]]; then
    echo "verifier_independent=false"     >> "$CONTEXT_FILE"
  else
    echo "verifier_independent=true"      >> "$CONTEXT_FILE"
  fi
}

write_capabilities() {
  echo "has_task_tool=$HAS_TASK_TOOL"       >> "$CONTEXT_FILE"
  echo "mcp_in_subagents=$MCP_IN_SUBAGENTS" >> "$CONTEXT_FILE"
  emit_model_roles
}
mkdir -p docs/work

# Parse optional --model flag
MODEL_OVERRIDE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --model) MODEL_OVERRIDE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ── Cloud model detection ─────────────────────────────────────────────────────
# If a cloud API key is set, derive model type from env
if [[ -n "$ANTHROPIC_API_KEY" ]]; then
  echo "type=cloud"            > "$CONTEXT_FILE"
  echo "provider=anthropic"  >> "$CONTEXT_FILE"
  echo "context=200000"       >> "$CONTEXT_FILE"
  echo "model=${MODEL_OVERRIDE:-claude-sonnet-4-5}" >> "$CONTEXT_FILE"
  echo "tier=large"           >> "$CONTEXT_FILE"
  write_capabilities
cat "$CONTEXT_FILE"
  exit 0
fi

if [[ -n "$GOOGLE_GENERATIVE_AI_API_KEY" ]]; then
  echo "type=cloud"           > "$CONTEXT_FILE"
  echo "provider=google"     >> "$CONTEXT_FILE"
  echo "context=1000000"      >> "$CONTEXT_FILE"
  echo "model=${MODEL_OVERRIDE:-gemini-2.0-flash}" >> "$CONTEXT_FILE"
  echo "tier=large"           >> "$CONTEXT_FILE"
  write_capabilities
cat "$CONTEXT_FILE"
  exit 0
fi

if [[ -n "$OPENAI_API_KEY" ]]; then
  echo "type=cloud"           > "$CONTEXT_FILE"
  echo "provider=openai"     >> "$CONTEXT_FILE"
  echo "context=128000"       >> "$CONTEXT_FILE"
  echo "model=${MODEL_OVERRIDE:-gpt-4o}" >> "$CONTEXT_FILE"
  echo "tier=large"           >> "$CONTEXT_FILE"
  write_capabilities
cat "$CONTEXT_FILE"
  exit 0
fi

# ── Local model detection via LM Studio API ──────────────────────────────────
LMSTUDIO_URL="${LMSTUDIO_URL:-http://127.0.0.1:1234}"

# Preferred probe: /api/v0/models reports loaded_context_length — the context
# the model is actually loaded with, often far below max_context_length
# (users configure small contexts to save RAM). Tiering on the max or on name
# patterns over-tiers and causes the silent overflow the probe exists to
# prevent (G1). Falls back to /v1/models + name heuristics on older servers.
V0_JSON=$(curl -s --max-time 3 "$LMSTUDIO_URL/api/v0/models" 2>/dev/null || echo "")

PROBE_RESULT=""
if [[ -n "$V0_JSON" ]]; then
  PROBE_RESULT=$(echo "$V0_JSON" | MODEL_OVERRIDE="$MODEL_OVERRIDE" python3 -c "
import sys, json, os
try:
  d = json.load(sys.stdin)
except Exception:
  sys.exit(0)
models = [m for m in d.get('data', []) if m.get('state') == 'loaded' and m.get('type') in ('llm', 'vlm')]
override = os.environ.get('MODEL_OVERRIDE', '')
if override:
  models = [m for m in models if m.get('id') == override] or models
if not models:
  sys.exit(0)
m = models[0]
ctx = m.get('loaded_context_length') or m.get('max_context_length')
if not ctx:
  sys.exit(0)
print(m['id'], ctx)
" 2>/dev/null || echo "")
fi

if [[ -n "$PROBE_RESULT" ]]; then
  MODEL_ID="${PROBE_RESULT% *}"
  CONTEXT="${PROBE_RESULT##* }"
  CONTEXT_SOURCE="probe"
else
  MODELS_JSON=$(curl -s --max-time 3 "$LMSTUDIO_URL/v1/models" 2>/dev/null || echo "")

  if [[ -z "$MODELS_JSON" ]]; then
    echo "type=unknown"         > "$CONTEXT_FILE"
    echo "context=32000"        >> "$CONTEXT_FILE"
    echo "tier=small"           >> "$CONTEXT_FILE"
    echo "WARNING: Could not reach LM Studio at $LMSTUDIO_URL — defaulting to 32k budget" >&2
    write_capabilities
    cat "$CONTEXT_FILE"
    exit 0
  fi

  # Extract first listed model ID (server may list unloaded models too)
  MODEL_ID=$(echo "$MODELS_JSON" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  models = d.get('data', [])
  if models:
    print(models[0]['id'])
  else:
    print('unknown')
except:
  print('unknown')
" 2>/dev/null || echo "unknown")

  if [[ -n "$MODEL_OVERRIDE" ]]; then
    MODEL_ID="$MODEL_OVERRIDE"
  fi
fi

# ── Context size by model name patterns ──────────────────────────────────────
determine_context() {
  local model="$1"
  # 128k+ models
  if echo "$model" | grep -qiE "nemotron-3-super|nemotron.*super"; then
    echo "128000"; return
  fi
  # 60k models
  if echo "$model" | grep -qiE "qwen3\.6-27b|qwen3\.6-35b|nemotron-cascade"; then
    echo "65536"; return
  fi
  # Standard 32k local models
  if echo "$model" | grep -qiE "qwen|gemma|llama|mistral|phi|codestral"; then
    echo "32768"; return
  fi
  # Small models
  if echo "$model" | grep -qiE "nano|mini|small|3b|4b|7b"; then
    echo "8192"; return
  fi
  # Default
  echo "32768"
}

if [[ -z "${CONTEXT:-}" ]]; then
  CONTEXT=$(determine_context "$MODEL_ID")
  CONTEXT_SOURCE="heuristic"
fi

# Determine tier
if   [[ "$CONTEXT" -ge 100000 ]]; then TIER="large"
elif [[ "$CONTEXT" -ge 60000  ]]; then TIER="medium"
else                                    TIER="small"
fi

echo "type=local"             > "$CONTEXT_FILE"
echo "provider=lmstudio"     >> "$CONTEXT_FILE"
echo "model=$MODEL_ID"       >> "$CONTEXT_FILE"
echo "context=$CONTEXT"      >> "$CONTEXT_FILE"
echo "tier=$TIER"            >> "$CONTEXT_FILE"
echo "context_source=$CONTEXT_SOURCE" >> "$CONTEXT_FILE"

write_capabilities
cat "$CONTEXT_FILE"
