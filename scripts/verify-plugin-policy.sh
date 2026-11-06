#!/usr/bin/env bash
#
# verify-plugin-policy.sh — prove, on THIS machine, whether a plugin dropped into a project's .opencode/plugins/
# is loaded by OpenCode. Harmless: the marker plugin only writes one file in a temp dir. Run it once with no
# policy (control: it SHOULD load) and once after ./install.sh --harden (it should NOT).
#
#   scripts/verify-plugin-policy.sh
#
# Exit: 0 = result matches what the detected hardening state predicts, 1 = mismatch (do not rely on the policy), 2 = could not run.
set -u
command -v opencode >/dev/null 2>&1 || { echo "opencode not found on PATH"; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export ATTEST_MARKER="$TMP/marker"
mkdir -p "$TMP/proj/.opencode/plugins/attest-marker"
# Module-scope write, like a real autoloaded plugin: it runs at import time, before any model turn.
cat > "$TMP/proj/.opencode/plugins/attest-marker/index.ts" <<'TS'
import { Plugin } from "@opencode/plugin";
import { writeFileSync } from "node:fs";
writeFileSync(process.env.ATTEST_MARKER as string, "loaded");
export default Plugin.define({ id: "attest.verify-marker", async setup() {} });
TS
echo '{}' > "$TMP/proj/opencode.json"
verdict="$(node "$HERE/lib/opencode-hardening.mjs" detect --verdict --cwd "$TMP/proj" 2>/dev/null || echo unknown)"
echo "OpenCode: $(opencode --version 2>/dev/null | head -1)   detected hardening state: $verdict"
# Start OpenCode in the scratch project; a model call may fail (no provider) — plugin loading happens first.
( cd "$TMP/proj" && timeout 60 opencode run "reply with the single word ok" >/dev/null 2>&1 ) || true
if [ -f "$ATTEST_MARKER" ]; then loaded=yes; else loaded=no; fi
echo "project plugin loaded: $loaded"
case "$verdict:$loaded" in
  open:yes)      echo "PASS (control): with no policy the dropped plugin loads — this is the risk --harden removes."; exit 0 ;;
  hardened:no)   echo "PASS: the policy blocked the dropped plugin."; exit 0 ;;
  hardened:yes)  echo "FAIL: policy is configured but the plugin still loaded. Do NOT rely on it; check OpenCode's version/config layers and report this."; exit 1 ;;
  open:no)       echo "INCONCLUSIVE: no policy yet the plugin did not load (OpenCode may not have started a session here, or plugin loading differs). Check 'opencode run' works in a project."; exit 2 ;;
  *)             echo "INCONCLUSIVE: hardening state '$verdict' (v1, old v2, or attest blocked) — see: node scripts/lib/opencode-hardening.mjs detect"; exit 2 ;;
esac
