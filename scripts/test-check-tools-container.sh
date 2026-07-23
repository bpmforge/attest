#!/usr/bin/env bash
#
# test-check-tools-container.sh -- behavioural proof for scripts/check-tools.sh
# on a BARE Linux box, which is the only place the 2026-07 field failure occurs.
#
#   ./scripts/test-check-tools-container.sh
#
# Why a container and not CI: GitHub's ubuntu-latest ships a writable npm global
# prefix, unzip, and a full toolcache, so `npm i -g` succeeds there and none of
# the reported failures reproduce. A green CI run proves nothing about this bug.
# The image below recreates the actual conditions:
#   - ubuntu:24.04 (noble)  -> PEP 668 externally-managed Python
#   - node/npm from apt     -> root-owned global prefix (EACCES for a normal user)
#   - non-root user, no sudo, no pipx, no unzip, no go, no brew
#
# Exits 0 when check-tools.sh --install recovers the npm tools without sudo AND
# prints actionable prerequisites for the ones it legitimately cannot install.
# Requires podman or docker; skips (exit 0) with a notice when neither is present.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="bpm-check-tools-bare"

RT=""
command -v podman >/dev/null 2>&1 && RT=podman
[[ -z "$RT" ]] && command -v docker >/dev/null 2>&1 && RT=docker
if [[ -z "$RT" ]]; then
  echo "SKIP: neither podman nor docker found — cannot run the bare-Linux proof."
  echo "      (the static invariants still run in the main suite: Pass 'check-tools')"
  exit 0
fi
if ! $RT info >/dev/null 2>&1; then
  echo "SKIP: $RT is installed but not running (try: $RT machine start)."
  exit 0
fi

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

cat > "$BUILD_DIR/Containerfile" <<'CONTAINERFILE'
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git python3 nodejs npm \
 && rm -rf /var/lib/apt/lists/*
# Deliberately absent: pipx, unzip, python3-pip, go, brew, sudo.
RUN useradd -m -u 1500 tester
USER tester
WORKDIR /home/tester
ENV PATH=/home/tester/.local/bin:/home/tester/go/bin:/usr/local/bin:/usr/bin:/bin
CONTAINERFILE

echo "Building bare-Linux image ($RT)..."
if ! $RT build -t "$IMAGE" -f "$BUILD_DIR/Containerfile" "$BUILD_DIR" >/dev/null 2>&1; then
  echo "SKIP: image build failed (no network, or registry unreachable)."
  exit 0
fi

echo "Running check-tools.sh --install on a bare non-root Ubuntu 24.04..."
out=$($RT run --rm -v "$ROOT/scripts:/scripts:ro,Z" "$IMAGE" \
        bash /scripts/check-tools.sh --install 2>&1)
echo "$out"

# Second run in the SAME container image but a fresh instance where the npm tools
# are ALREADY installed to ~/.npm-global (off the default PATH). This reproduces
# the zsh-box bug: a re-run must REPORT them installed, not "missing"/"FAILED".
echo ""
echo "Re-run after install (tools present but off PATH)..."
rerun=$($RT run --rm -v "$ROOT/scripts:/scripts:ro,Z" "$IMAGE" bash -c '
  npm i -g --prefix "$HOME/.npm-global" knip >/dev/null 2>&1
  # knip is now in ~/.npm-global/bin but NOT on PATH. Report mode must still see it.
  bash /scripts/check-tools.sh 2>&1
')
echo ""

fails=0
assert() { # description | grep -E pattern
  if printf '%s' "$out" | grep -qE "$2"; then
    printf '  \033[32m✓\033[0m %s\n' "$1"
  else
    printf '  \033[31m✗\033[0m %s\n' "$1"
    fails=$((fails + 1))
  fi
}
refute() {
  if printf '%s' "$out" | grep -qE "$2"; then
    printf '  \033[31m✗\033[0m %s\n' "$1"
    fails=$((fails + 1))
  else
    printf '  \033[32m✓\033[0m %s\n' "$1"
  fi
}

echo "Assertions:"
# The three tools that reported a bare "FAILED" on the user's box.
assert "knip installed without sudo"      'installed knip'
assert "ts-prune installed without sudo"  'installed ts-prune'
assert "jscpd installed without sudo"     'installed jscpd'
assert "EACCES diagnosed, not swallowed"  'global prefix not writable'
assert "PATH guidance for the user prefix" '\.npm-global/bin'
# Things it correctly refuses to install, with actionable next steps.
assert "pipx prerequisite is actionable"  'apt install -y pipx'
assert "PEP 668 explained"                'externally-managed'
assert "mmdc prerequisites explained"     'unzip'
# Regressions we must never reintroduce.
refute "no bare FAILED without a reason"  'FAILED (knip|ts-prune|jscpd)'
refute "no brew hint on Linux"            'brew install'

# The zsh-box bug: an installed-but-off-PATH tool must REPORT as present, not
# missing, and the PATH hint must point at its bin.
rassert() {
  if printf '%s' "$rerun" | grep -qE "$2"; then printf '  \033[32m✓\033[0m %s\n' "$1"
  else printf '  \033[31m✗\033[0m %s\n' "$1"; fails=$((fails + 1)); fi
}
rrefute() {
  if printf '%s' "$rerun" | grep -qE "$2"; then printf '  \033[31m✗\033[0m %s\n' "$1"; fails=$((fails + 1))
  else printf '  \033[32m✓\033[0m %s\n' "$1"; fi
}
rassert "re-run: off-PATH knip reported INSTALLED, not missing" 'knip.*installed at .*\.npm-global/bin'
rrefute "re-run: off-PATH knip NOT shown as missing"           '○ knip'
rassert "re-run: PATH hint points at the npm-global bin"       'export PATH=.*\.npm-global/bin'

echo ""
if [[ $fails -eq 0 ]]; then
  echo "PASS -- bare-Linux install path recovers without sudo and explains the rest."
  exit 0
fi
echo "FAIL -- $fails assertion(s) failed."
exit 1
