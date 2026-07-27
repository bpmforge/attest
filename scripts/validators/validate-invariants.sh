#!/usr/bin/env bash
#
# validate-invariants.sh -- enforce a project's declared cross-cutting rules.
#
# The failure this closes: a route that bypassed the audited-transaction seam every
# other route in its codebase uses, and PASSED ITS OWN TESTS. Nothing in "does it
# work" surfaces a cross-cutting architectural violation the ticket's spec never
# mentioned. It was caught only because a reviewer happened to know the invariant
# existed and checked by hand.
#
# That knowledge is exactly what an agent given a bounded ticket does not have, and
# what a human who wrote the surrounding code has for free. This makes it explicit
# and mechanical, so it stops depending on who reviews.
#
# Declare invariants in .sdlc/invariants.json:
#
#   { "invariants": [
#       { "name": "routes use the audited transaction seam",
#         "files": "src/api/**/*.ts",
#         "require": "withAuditedTx",
#         "exclude": "src/api/health.ts",
#         "why": "every mutation must land in the audit log (ADR-014)" },
#       { "name": "no local auth helpers",
#         "files": "src/api/**/*.ts",
#         "forbid": "function getAuthUser",
#         "why": "import from utils/auth-helpers, never redefine" }
#   ] }
#
# `require` = the pattern MUST appear in each matched file.
# `forbid`  = the pattern must NOT appear.
# Both are grep -E patterns. `why` is printed on failure -- an invariant whose
# reason is not stated gets deleted by the next person who hits it.
#
# Usage: validate-invariants.sh [project-root]
# Exit:  0 clean / 1 violations / 0 with a notice when nothing is declared.

set -uo pipefail
ROOT="${1:-$PWD}"
CONFIG="$ROOT/.sdlc/invariants.json"

if [ ! -f "$CONFIG" ]; then
  echo "[validate-invariants] no .sdlc/invariants.json -- nothing declared, nothing enforced"
  echo "  Declare the rules a reviewer currently has to know by heart."
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[validate-invariants] ERROR: node is required to read the config" >&2
  exit 2
fi

# One record per invariant, delimited by ASCII Unit Separator. NOT tab: bash treats
# tab as IFS-whitespace, which collapses consecutive delimiters -- an invariant with
# an empty `require` then shifts `forbid` into its place and the check silently
# inverts. Caught in testing; a forbid rule was reported as a missing requirement.
RECORDS=$(node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const i of cfg.invariants ?? []) {
    process.stdout.write([
      i.name ?? "(unnamed)",
      i.files ?? "",
      i.require ?? "",
      i.forbid ?? "",
      i.exclude ?? "",
      i.why ?? "",
    ].join("\x1f") + "\n");
  }
' "$CONFIG") || { echo "[validate-invariants] ERROR: could not parse $CONFIG" >&2; exit 2; }

if [ -z "$RECORDS" ]; then
  echo "[validate-invariants] config present but declares no invariants"
  exit 0
fi

echo "[validate-invariants] starting"
VIOLATIONS=0
CHECKED=0

while IFS=$'\x1f' read -r NAME GLOB REQUIRE FORBID EXCLUDE WHY; do
  [ -z "$NAME" ] && continue

  # Resolve the glob relative to the project root, skipping vendor trees.
  FILES=$(cd "$ROOT" && find . -type f -path "./${GLOB#./}" 2>/dev/null \
    | grep -vE '/(node_modules|\.git|dist|build|target|vendor)/' || true)

  if [ -z "$FILES" ]; then
    echo "  - $NAME: no files match '$GLOB' (invariant not exercised)"
    continue
  fi

  while IFS= read -r F <&3; do
    [ -z "$F" ] && continue
    if [ -n "$EXCLUDE" ] && echo "$F" | grep -qE "${EXCLUDE#./}"; then continue; fi
    CHECKED=$((CHECKED + 1))

    if [ -n "$REQUIRE" ] && ! grep -qE "$REQUIRE" "$ROOT/${F#./}" 2>/dev/null; then
      echo "  [x] ${F#./}: missing required '$REQUIRE' -- $NAME"
      [ -n "$WHY" ] && echo "      why: $WHY"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi

    if [ -n "$FORBID" ] && grep -qE "$FORBID" "$ROOT/${F#./}" 2>/dev/null; then
      echo "  [x] ${F#./}: contains forbidden '$FORBID' -- $NAME"
      [ -n "$WHY" ] && echo "      why: $WHY"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done 3<<< "$FILES"
done <<< "$RECORDS"

echo ""
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "[validate-invariants] $VIOLATIONS violation(s) across $CHECKED file check(s)"
  echo "  These pass their own tests. That is why they are declared here instead."
  exit 1
fi
echo "[validate-invariants] clean -- $CHECKED file check(s), 0 violations"
exit 0
