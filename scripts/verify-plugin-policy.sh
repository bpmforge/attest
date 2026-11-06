#!/usr/bin/env bash
#
# verify-plugin-policy.sh — prove, on THIS machine, whether a plugin dropped into a project's .opencode/plugins/
# is loaded by OpenCode. Harmless: the marker plugin only writes one file in a temp dir. Run it once with no
# policy (control: it SHOULD load) and once after ./install.sh --harden (it should NOT).
#
#   scripts/verify-plugin-policy.sh              read-only check against your real config
#   scripts/verify-plugin-policy.sh --isolated   full test in a throwaway config dir (applies the policy there, not to your real config)
#
# Exit: 0 = result matches what the detected hardening state predicts, 1 = mismatch (do not rely on the policy), 2 = could not run.
set -u
command -v opencode >/dev/null 2>&1 || { echo "opencode not found on PATH"; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── --isolated: full mechanism test in a THROWAWAY config dir (never touches your real ~/.config/opencode) ──────────
#   A) control, no policy:  a project plugin AND an attest-named global plugin both load
#   B) after `opencode-hardening.mjs apply`:  the project plugin is blocked, the attest-named global plugin still loads
if [ "${1:-}" = "--isolated" ]; then
  command -v node >/dev/null 2>&1 || { echo "node not found"; exit 2; }
  ISO="$(mktemp -d)"; trap 'rm -rf "$ISO"' EXIT
  export XDG_CONFIG_HOME="$ISO/xdg"; G="$XDG_CONFIG_HOME/opencode"; P="$ISO/proj"
  mkdir -p "$G/plugins/expert-hooks" "$P/.opencode/plugins/attest-marker"
  # Marker paths are baked into the plugin source, NOT passed by env: a v2 server may be a shared background process
  # that started earlier and would not have this script's environment.
  MG="$ISO/mg"; MP="$ISO/mp"
  mk() {  # mk <dir> <marker file path> <plugin id>
    cat > "$1/index.ts" <<TS
import { Plugin } from "@opencode/plugin";
import { writeFileSync } from "node:fs";
writeFileSync("$2", "loaded");
export default Plugin.define({ id: "$3", async setup() {} });
TS
  }
  mk "$G/plugins/expert-hooks" "$MG" attest.verify-global       # stands in for an attest plugin (same path shape as a real install)
  mk "$P/.opencode/plugins/attest-marker" "$MP" attest.verify-project
  others="$(pgrep -fl opencode 2>/dev/null | grep -v "pgrep\|verify-plugin-policy" | head -5)"
  if [ -n "$others" ]; then
    echo "NOTE: other opencode processes are running. A v2 server started earlier ignores this test's config dir and"
    echo "      would make the result meaningless. If the result is INCONCLUSIVE, quit them (pkill -f opencode) and re-run:"
    printf '%s\n' "$others" | cut -c1-140 | sed 's/^/        /'
  fi
  echo '{}' > "$P/opencode.json"
  OCVER="$(opencode --version 2>/dev/null | head -1)"
  echo "OpenCode: $OCVER   (isolated config: $G)"
  run_to() { local secs="$1"; shift; "$@" & local pid=$!; ( sleep "$secs"; kill "$pid" 2>/dev/null ) & local w=$!; wait "$pid" 2>/dev/null; local rc=$?; kill "$w" 2>/dev/null; return $rc; }
  try() { rm -f "$MG" "$MP"
          ( cd "$P" && run_to 60 opencode run "reply with the single word ok" >"$ISO/oc.log" 2>&1 ) || true
          G_LOADED=no; P_LOADED=no; [ -f "$MG" ] && G_LOADED=yes; [ -f "$MP" ] && P_LOADED=yes; }
  try; echo "A) no policy:        project plugin loaded=$P_LOADED  attest-named global plugin loaded=$G_LOADED"
  if [ "$P_LOADED" != yes ] || [ "$G_LOADED" != yes ]; then
    echo "INCONCLUSIVE: the control did not load both plugins, so this config dir may not be honored (XDG_CONFIG_HOME) or opencode did not start."; tail -8 "$ISO/oc.log" | cut -c1-200; exit 2
  fi
  node "$HERE/lib/opencode-hardening.mjs" apply --global-dir "$G" --cwd "$P" --major 2 --version "$OCVER" | sed 's/^/   /'
  try; echo "B) policy applied:   project plugin loaded=$P_LOADED  attest-named global plugin loaded=$G_LOADED"
  if [ "$P_LOADED" = no ] && [ "$G_LOADED" = yes ]; then echo "PASS: the policy blocked the dropped project plugin and left the attest-named plugin loading."; exit 0
  elif [ "$P_LOADED" = yes ]; then echo "FAIL: the policy did NOT stop the project plugin. Do not rely on it."; tail -5 "$ISO/oc.log" | cut -c1-200; exit 1
  else echo "FAIL: the policy blocked the attest-named plugin too — the allow rules do not match how this OpenCode names plugins. Send me this output."; cat "$G/opencode.json"; exit 1; fi
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export ATTEST_MARKER="$TMP/marker"
OCVER="$(opencode --version 2>/dev/null | head -1)"
OCMAJOR="$(printf '%s' "$OCVER" | sed -n 's/^[^0-9]*\([0-9][0-9]*\)\..*/\1/p')"
# Module-scope write, like a real autoloaded plugin: it runs at import time, before any model turn.
if [ "$OCMAJOR" = "2" ]; then
  mkdir -p "$TMP/proj/.opencode/plugins/attest-marker"
  cat > "$TMP/proj/.opencode/plugins/attest-marker/index.ts" <<TS
import { Plugin } from "@opencode/plugin";
import { writeFileSync } from "node:fs";
writeFileSync("$ATTEST_MARKER", "loaded");
export default Plugin.define({ id: "attest.verify-marker", async setup() {} });
TS
else   # v1: plugins are plain modules in .opencode/plugins/*.ts exporting async functions
  mkdir -p "$TMP/proj/.opencode/plugins"
  cat > "$TMP/proj/.opencode/plugins/attest-marker.ts" <<TS
import { writeFileSync } from "node:fs";
writeFileSync("$ATTEST_MARKER", "loaded");
export const AttestMarker = async () => ({});
TS
fi
echo '{}' > "$TMP/proj/opencode.json"
verdict="$(node "$HERE/lib/opencode-hardening.mjs" detect --verdict --cwd "$TMP/proj" 2>/dev/null || echo unknown)"
echo "OpenCode: $OCVER   detected hardening state: $verdict"
# Portable timeout (macOS has no `timeout`): run in the background, kill after N seconds.
run_to() { local secs="$1"; shift; "$@" & local pid=$!; ( sleep "$secs"; kill "$pid" 2>/dev/null ) & local w=$!; wait "$pid" 2>/dev/null; local rc=$?; kill "$w" 2>/dev/null; return $rc; }
# Start OpenCode in the scratch project; a model call may fail (no provider) — plugin loading happens first.
( cd "$TMP/proj" && run_to 60 opencode run "reply with the single word ok" >"$TMP/opencode.log" 2>&1 ) || true
if [ -f "$ATTEST_MARKER" ]; then loaded=yes; else loaded=no; fi
echo "project plugin loaded: $loaded"
[ "$loaded" = no ] && { echo "--- last lines of opencode output (to tell 'did not load' from 'did not start'):"; tail -8 "$TMP/opencode.log" 2>/dev/null | cut -c1-200; echo "---"; }
case "$verdict:$loaded" in
  open:yes)      echo "PASS (control): with no policy the dropped plugin loads — this is the risk --harden removes."; exit 0 ;;
  hardened:no)   echo "PASS: the policy blocked the dropped plugin."; exit 0 ;;
  hardened:yes)  echo "FAIL: policy is configured but the plugin still loaded. Do NOT rely on it; check OpenCode's version/config layers and report this."; exit 1 ;;
  unsupported-v1:yes) echo "EXPOSED (expected on v1): a plugin dropped into a project's .opencode/plugins/ was loaded and executed automatically, and v1 has no config to stop it. Upgrade to OpenCode v2.2.3+ and run ./install.sh --harden, or run untrusted web research in a container/VM without your credentials."; exit 0 ;;
  open:no)       echo "INCONCLUSIVE: no policy yet the plugin did not load (OpenCode may not have started a session here, or plugin loading differs). Check 'opencode run' works in a project."; exit 2 ;;
  *)             echo "INCONCLUSIVE: hardening state '$verdict' (v1, old v2, or attest blocked) — see: node scripts/lib/opencode-hardening.mjs detect"; exit 2 ;;
esac
