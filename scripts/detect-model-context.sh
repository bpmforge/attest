#!/usr/bin/env bash
# detect-model-context.sh
# Detects the current model's context window and type (local/cloud).
# Writes docs/work/.model-context for agents to read at session start.
# Usage: bash scripts/detect-model-context.sh [--model <model-id>]

set -e

CONTEXT_FILE="docs/work/.model-context"
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
  cat "$CONTEXT_FILE"
  exit 0
fi

if [[ -n "$GOOGLE_GENERATIVE_AI_API_KEY" ]]; then
  echo "type=cloud"           > "$CONTEXT_FILE"
  echo "provider=google"     >> "$CONTEXT_FILE"
  echo "context=1000000"      >> "$CONTEXT_FILE"
  echo "model=${MODEL_OVERRIDE:-gemini-2.0-flash}" >> "$CONTEXT_FILE"
  echo "tier=large"           >> "$CONTEXT_FILE"
  cat "$CONTEXT_FILE"
  exit 0
fi

if [[ -n "$OPENAI_API_KEY" ]]; then
  echo "type=cloud"           > "$CONTEXT_FILE"
  echo "provider=openai"     >> "$CONTEXT_FILE"
  echo "context=128000"       >> "$CONTEXT_FILE"
  echo "model=${MODEL_OVERRIDE:-gpt-4o}" >> "$CONTEXT_FILE"
  echo "tier=large"           >> "$CONTEXT_FILE"
  cat "$CONTEXT_FILE"
  exit 0
fi

# ── Local model detection via LM Studio API ──────────────────────────────────
LMSTUDIO_URL="${LMSTUDIO_URL:-http://127.0.0.1:1234}"

MODELS_JSON=$(curl -s --max-time 3 "$LMSTUDIO_URL/v1/models" 2>/dev/null || echo "")

if [[ -z "$MODELS_JSON" ]]; then
  echo "type=unknown"         > "$CONTEXT_FILE"
  echo "context=32000"        >> "$CONTEXT_FILE"
  echo "tier=small"           >> "$CONTEXT_FILE"
  echo "WARNING: Could not reach LM Studio at $LMSTUDIO_URL — defaulting to 32k budget" >&2
  cat "$CONTEXT_FILE"
  exit 0
fi

# Extract first loaded model ID
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

CONTEXT=$(determine_context "$MODEL_ID")

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

cat "$CONTEXT_FILE"
