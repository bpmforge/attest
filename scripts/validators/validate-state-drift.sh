#!/usr/bin/env bash
#
# validate-state-drift.sh -- docs/work/STATE.md's "Done" claims must be
# backed by a real gate receipt, not just asserted (T27.4).
#
# STATE.md (CHECKPOINT_STATE.md's schema) is free-text, hand/agent-written:
# "## Done\n- phase-4 done -- ..." is a claim, not proof. This validator
# cross-checks it against docs/work/gates/<phase>-receipt.json (T27.1) --
# the same receipt validate-phase-gate.sh writes on a real run and
# check_phase_prereq() reads. Two call sites:
#   - /sdlc resume (agents/sdlc-lead.md): WARN before trusting "Next" --
#     surfaces divergence instead of resuming into fiction.
#   - run-until-done.sh's is_complete(): BLOCKS -- the promise token alone
#     is a request to evaluate completion, not proof of it; this is what
#     turns it into proof.
#
# Only checks phases STATE.md itself claims are done. A STATE.md that
# claims nothing gated (a Mode 4 audit with no phase gates, or no STATE.md
# at all) has nothing to cross-check -- clean, not a gap. That's the
# intentional discrimination: "legitimately ungated task" vs "agent skipped
# the gates" is exactly what claim-then-verify can tell apart and a blanket
# receipts-required check can't.
#
# "Receipt says real/waiver" inherits T27.1's disclosed tradeoff: not
# cryptographic tamper-evidence, a sloppy/eager-agent deterrent (anyone with
# filesystem access could hand-craft a passing receipt). Not re-litigated
# here -- same threat model as everywhere else this session used the
# receipt primitive.
#
# Usage: validate-state-drift.sh [project-root] [state-path]
# state-path defaults to <project-root>/docs/work/STATE.md (CHECKPOINT_STATE.md's
# canonical location) but can be overridden -- run-until-done.sh's --state flag
# points at an arbitrary path for test isolation, and the drift check has to
# follow it rather than silently checking the (nonexistent) canonical path and
# vacuously passing.
# Exit 0 clean / 1 gaps / 2 error.

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-state-drift"

ROOT="$(detect_project_root "${1:-}")"
STATE="${2:-$ROOT/docs/work/STATE.md}"

if [[ ! -f "$STATE" ]]; then
  note "no STATE.md at $STATE -- nothing to check"
  validator_exit
fi

# Extract the "## Done" section body: same tolower()-based approach as
# validate-completion-manifest.sh's section_body() -- this machine's system
# awk has no gawk IGNORECASE (silent no-op, not an error; found in T27.2),
# so case-insensitive matching goes through tolower() on both sides, not a
# BEGIN{IGNORECASE=1} that looks like it works and doesn't.
done_body="$(awk '
  BEGIN { in_section = 0 }
  { line = tolower($0) }
  line ~ /^#+[[:space:]]+done/ { in_section = 1; next }
  line ~ /^#+[[:space:]]/ { if (in_section) exit }
  in_section { print }
' "$STATE")"

if [[ -z "$done_body" ]]; then
  note "STATE.md has no '## Done' section (or it's empty) -- nothing to check"
  validator_exit
fi

# Unique phase-N tokens mentioned in Done -- these are the claims to verify.
# grep -i (not -E alone): the Done body it's applied to has NOT been
# lowercased (the awk above only lowercases its own matching side, so `done_body`
# keeps original case) -- an un-lowered "Phase-4" would silently extract zero
# tokens and fall into the vacuous "nothing to check" path otherwise. Found by
# independent review, 2026-07-08: this exact one-character-capitalization case
# restored the original false-completion bug T27.4 exists to close.
PHASES="$(printf '%s\n' "$done_body" | grep -oiE 'phase-[0-9]+(\.[0-9]+)?' | tr '[:upper:]' '[:lower:]' | sort -u || true)"

if [[ -z "$PHASES" ]]; then
  note "STATE.md's Done section claims nothing gated (no phase-N mention) -- nothing to check against receipts"
  validator_exit
fi

checked=0
while IFS= read -r phase; do
  [[ -z "$phase" ]] && continue
  checked=$((checked + 1))
  receipt="$ROOT/docs/work/gates/${phase}-receipt.json"
  if [[ ! -f "$receipt" ]]; then
    gap "state-claims-phase-done-no-receipt" "STATE.md's Done section claims '$phase' but no receipt exists at docs/work/gates/${phase}-receipt.json -- resume would be trusting an unverified claim"
    continue
  fi
  if grep -qE '"mode":"(real|waiver)"' "$receipt"; then
    pass "$phase: Done claim backed by a real/waiver receipt"
  else
    gap "state-claims-phase-done-bad-receipt" "STATE.md claims '$phase' done; docs/work/gates/${phase}-receipt.json exists but its mode is neither 'real' nor 'waiver' -- not a genuine gate pass"
  fi
done <<< "$PHASES"

note "checked ${checked} phase claim(s) in STATE.md's Done section against gate receipts"
validator_exit
