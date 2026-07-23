#!/usr/bin/env bash
#
# test-setup-dev-server.sh — unit-test the config-merge logic of
# setup-dev-server.sh WITHOUT running install.sh or touching the network.
#
# The merge is the one novel, risky piece: it must add a provider block to an
# opencode.json that install.sh already populated (mcp / permission / compaction)
# WITHOUT clobbering any of it, must take its model list from the host's live
# /models response, must be idempotent, and must not wipe the model list when the
# host is briefly unreachable. To test the SHIPPED code rather than a copy, we
# extract the exact python heredoc from setup-dev-server.sh and run it.
#
# Exit 0 all-pass / 1 any-fail.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/setup-dev-server.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Pull out the merge program: the lines between the `python3 - <<'PY'` that has
# MODELS_JSM/PROVIDER_ID in its env prefix and its closing PY.
awk '/CONFIG="\$CONFIG" PROVIDER_ID=/{grab=1} grab && /<<.PY.$/{copy=1;next} copy && /^PY$/{exit} copy{print}' \
  "$SCRIPT" > "$WORK/merge.py"
if [[ ! -s "$WORK/merge.py" ]]; then
  echo "FAIL: could not extract the merge program from $SCRIPT"; exit 1
fi

run_merge() { # config_path  models_json
  CONFIG="$1" PROVIDER_ID="lmstudio-remote" PROVIDER_NAME="LM Studio (test)" \
  LLM_URL="http://192.168.0.179:1234/v1" MODELS_JSON="$2" \
  python3 "$WORK/merge.py"
}

fails=0
check() { # description  test-expression already evaluated to 0/1 via [[ ]]
  if [[ "$2" == "0" ]]; then printf '  \033[32m✓\033[0m %s\n' "$1"
  else printf '  \033[31m✗\033[0m %s\n' "$1"; fails=$((fails+1)); fi
}

# A config shaped like what install.sh leaves behind.
cat > "$WORK/cfg.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": { "context7": { "type": "local", "enabled": true } },
  "permission": { "bash": "ask" },
  "compaction": { "prune": true },
  "provider": {
    "lmstudio-remote": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "old name",
      "options": { "baseURL": "http://old:1234/v1", "apiKey": "lm-studio" },
      "models": { "stale-model": { "name": "stale-model" } }
    }
  }
}
JSON

LIVE='{"data":[{"id":"qwen3.6-35b-a3b"},{"id":"google/gemma-4-12b-qat"},{"id":"text-embedding-nomic-embed-text-v1.5"}]}'

echo "1) fresh merge with a live model list"
run_merge "$WORK/cfg.json" "$LIVE" >/dev/null
py() { python3 -c "import json,sys;d=json.load(open('$WORK/cfg.json'));print($1)"; }
check "install.sh's mcp block preserved"          "$([[ "$(py "'context7' in d.get('mcp',{})")" == True ]] && echo 0 || echo 1)"
check "permission block preserved"                "$([[ "$(py "d.get('permission',{}).get('bash')=='ask'")" == True ]] && echo 0 || echo 1)"
check "compaction block preserved"                "$([[ "$(py "d.get('compaction',{}).get('prune')==True")" == True ]] && echo 0 || echo 1)"
check "3 live models written"                     "$([[ "$(py "len(d['provider']['lmstudio-remote']['models'])")" == 3 ]] && echo 0 || echo 1)"
check "stale model dropped"                        "$([[ "$(py "'stale-model' in d['provider']['lmstudio-remote']['models']")" == False ]] && echo 0 || echo 1)"
check "baseURL updated to new host"               "$([[ "$(py "d['provider']['lmstudio-remote']['options']['baseURL']")" == "http://192.168.0.179:1234/v1" ]] && echo 0 || echo 1)"

echo "2) idempotent (second run identical)"
cp "$WORK/cfg.json" "$WORK/after1.json"
run_merge "$WORK/cfg.json" "$LIVE" >/dev/null
check "re-running produces byte-identical config" "$(cmp -s "$WORK/cfg.json" "$WORK/after1.json" && echo 0 || echo 1)"

echo "3) host unreachable (empty model list) keeps the existing models"
run_merge "$WORK/cfg.json" "" >/dev/null   # empty MODELS_JSON = outage
check "outage does NOT wipe the model list"       "$([[ "$(py "len(d['provider']['lmstudio-remote']['models'])")" == 3 ]] && echo 0 || echo 1)"

echo "4) brand-new config (no prior provider) still works"
printf '{"$schema":"https://opencode.ai/config.json"}\n' > "$WORK/blank.json"
run_merge "$WORK/blank.json" "$LIVE" >/dev/null
pyb() { python3 -c "import json;d=json.load(open('$WORK/blank.json'));print($1)"; }
check "provider created on a blank config"        "$([[ "$(pyb "len(d['provider']['lmstudio-remote']['models'])")" == 3 ]] && echo 0 || echo 1)"
check "schema preserved"                          "$([[ "$(pyb "'\$schema' in d")" == True ]] && echo 0 || echo 1)"

echo ""
if [[ $fails -eq 0 ]]; then echo "PASS — config merge is non-destructive, idempotent, and outage-safe."; exit 0; fi
echo "FAIL — $fails assertion(s) failed."; exit 1
