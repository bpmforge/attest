#!/usr/bin/env bash
# handoff-done.sh — mechanical done-gate for HANDOFF specialists (v2.31.0)
#
# WHY: the "am I done?" judgment was the last self-assessed step. Field trace
# (T-234, 2026-07): the agent re-read the HANDOFF on request and still
# concluded "yes, everything done" — with 57 lint errors, no completion report
# ever appended, and the completion phrase never printed. This script replaces
# that judgment with checks: run it BEFORE writing your completion report.
# RED lists exactly what is missing; GREEN means print the phrase and stop.
#
# Usage:
#   bash handoff-done.sh <packet-or-handoff-file> [options]
#     --no-push-check     HANDOFF does not require pushing
#     --report <path>     VERIFY_REPORT location (default docs/work/VERIFY_REPORT.md)
#
# Checks:
#   1. VERIFY_REPORT.md exists and its verdict line is ALL GREEN
#   2. Freshness: no tracked file modified AFTER the report (fix-after-verify
#      without a re-run is a red flag, not a formality)
#   3. Working tree committed (dirty docs/work/** is a warning, not a failure)
#   4. Commits pushed (upstream exists and git log @{u}.. is empty)
#   5. PRODUCE paths parsed from the file all exist on disk (best-effort parse)
#   6. If the HANDOFF says to append a completion report, the target contains
#      a "## Completion report" heading
#
# Exit: 0 GREEN, 1 RED, 2 usage. Never-sudo, dependency-free (bash 3.2+).
set -u

FILE=""
PUSH_CHECK=1
REPORT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --no-push-check) PUSH_CHECK=0 ;;
    --report)
      [ $# -ge 2 ] || { echo "handoff-done: --report needs a path" >&2; exit 2; }
      REPORT="$2"; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    -*) echo "handoff-done: unknown option $1" >&2; exit 2 ;;
    *) FILE="$1" ;;
  esac
  shift
done

[ -n "$FILE" ] && [ -f "$FILE" ] || {
  echo "handoff-done: pass the HANDOFF/context-packet file. See --help." >&2
  exit 2
}

if [ -z "$REPORT" ]; then
  if [ -f "docs/work/VERIFY_REPORT.md" ]; then REPORT="docs/work/VERIFY_REPORT.md"
  else REPORT="VERIFY_REPORT.md"; fi
fi

FAILS=0
WARNS=0
red()  { echo "  [FAIL] $1"; FAILS=$((FAILS + 1)); }
grn()  { echo "  [ok]   $1"; }
wrn()  { echo "  [warn] $1"; WARNS=$((WARNS + 1)); }

echo "DONE-CHECK for $FILE"

# -- 1. Verify report exists and is ALL GREEN --------------------------------
if [ ! -f "$REPORT" ]; then
  red "no verify report at $REPORT — run: bash ~/.config/opencode/scripts/verify-handoff.sh $FILE"
else
  VERDICT=$(grep -E 'VERIFY: (ALL GREEN|RED)' "$REPORT" | tail -n 1)
  case "$VERDICT" in
    *"ALL GREEN"*) grn "verify report is ALL GREEN ($REPORT)" ;;
    *RED*)         red "verify report is RED — fix and re-run the harness. Verdict: ${VERDICT}" ;;
    *)             red "verify report has no verdict line — re-run the harness" ;;
  esac

  # -- 2. Freshness: any tracked file newer than the report? -----------------
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    STALE=""
    while IFS= read -r f; do
      case "$f" in docs/work/*|docs/reviews/*) continue ;; esac
      if [ -f "$f" ] && [ "$f" -nt "$REPORT" ]; then STALE="$f"; break; fi
    done < <(git ls-files -m -o --exclude-standard; git diff --name-only HEAD 2>/dev/null; git ls-files)
    if [ -n "$STALE" ]; then
      red "files changed AFTER the verify run (e.g. $STALE) — re-run the harness; a report older than your last edit proves nothing"
    else
      grn "verify report is fresher than every tracked source file"
    fi
  fi
fi

# -- 3/4. Git state: committed and pushed ------------------------------------
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  DIRTY=$(git status --porcelain 2>/dev/null | grep -Ev ' docs/(work|reviews)/' || true)
  DIRTY_DOCS=$(git status --porcelain 2>/dev/null | grep -E ' docs/(work|reviews)/' || true)
  if [ -n "$DIRTY" ]; then
    red "uncommitted changes outside docs/work — commit before reporting:"
    echo "$DIRTY" | sed 's/^/         /' | head -10
  else
    grn "working tree committed (source files)"
  fi
  [ -n "$DIRTY_DOCS" ] && wrn "uncommitted docs/work|docs/reviews files — commit them with your report"

  if [ "$PUSH_CHECK" -eq 1 ]; then
    if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
      AHEAD=$(git log '@{u}..HEAD' --oneline 2>/dev/null | wc -l | tr -d ' ')
      if [ "$AHEAD" -gt 0 ]; then
        red "$AHEAD commit(s) not pushed — push before reporting (unpushed work reads as a non-delivery)"
      else
        grn "all commits pushed"
      fi
    else
      red "no upstream set — push first: git push -u origin \$(git branch --show-current)   (or pass --no-push-check if this HANDOFF does not push)"
    fi
  fi
fi

# -- 5. PRODUCE paths exist (best-effort parse) -------------------------------
PRODUCE_SEEN=0
PRODUCE_MISSING=0
while IFS= read -r p; do
  PRODUCE_SEEN=$((PRODUCE_SEEN + 1))
  if [ -e "$p" ]; then
    grn "PRODUCE exists: $p"
  else
    red "PRODUCE missing: $p"
    PRODUCE_MISSING=$((PRODUCE_MISSING + 1))
  fi
done < <(awk '
  /^(PRODUCE|## PRODUCE)/ { in_p = 1; next }
  in_p && /^[[:space:]]*-[[:space:]]/ {
    line = $0
    sub(/^[[:space:]]*-[[:space:]]*/, "", line)
    if (match(line, /`[^`]+`/)) {
      path = substr(line, RSTART + 1, RLENGTH - 2)
    } else {
      split(line, a, /[[:space:]]/); path = a[1]
    }
    if (path ~ /[\/.]/ && path !~ /^</) print path
    next
  }
  in_p && !/^[[:space:]]*$/ && !/^[[:space:]]*-/ { in_p = 0 }
' "$FILE" | sort -u)
[ "$PRODUCE_SEEN" -eq 0 ] && wrn "no PRODUCE list parsed from $FILE — file-existence check skipped (verify manually against the HANDOFF)"

# -- 6. Completion report appended, if required -------------------------------
if grep -qiE 'append.*completion report|completion report.*append' "$FILE"; then
  if grep -qiE '^##+ +Completion [Rr]eport' "$FILE"; then
    grn "completion report section present in $FILE"
  else
    red "HANDOFF requires appending a completion report to $FILE — no '## Completion report' heading found"
  fi
fi

# -- verdict -------------------------------------------------------------------
echo ""
if [ "$FAILS" -gt 0 ]; then
  echo "DONE-CHECK: RED — $FAILS blocking item(s) above. Fix them, then re-run this check. Do NOT print the completion phrase."
  exit 1
fi
PHRASE=$(grep -oiE '(reply|print)[^"]*"[^"]{5,120}"' "$FILE" 2>/dev/null | head -n 1 | sed 's/^[^"]*"//; s/"$//')
if [ -n "$PHRASE" ]; then
  echo "DONE-CHECK: GREEN — print the completion phrase exactly and stop:"
  echo "  $PHRASE"
else
  echo "DONE-CHECK: GREEN — print the HANDOFF's completion phrase verbatim and stop."
fi
exit 0
