#!/usr/bin/env bash
# handoff-done.sh — mechanical done-gate for HANDOFF specialists (v2.43.0)
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
#   1. VERIFY_REPORT.md exists and its verdict line is ALL GREEN. A HANDOFF with
#      no ```verify fence warns instead when its PRODUCE list is documents only,
#      or when the repo has no runnable verify target yet — demanding a report
#      the HANDOFF cannot produce is an unwinnable gate. If PRODUCE ships source
#      and something IS runnable, the missing fence itself is the failure.
#   2. Freshness: no tracked file modified AFTER the report (fix-after-verify
#      without a re-run is a red flag, not a formality)
#   3. Working tree committed — files this HANDOFF owns (WRITE-SCOPE ∪ PRODUCE)
#      fail; anything else warns, because another agent owns it and the contract
#      forbids you touching it. Dirty docs/work/** is a warning too.
#   4. Commits pushed (upstream exists and git log @{u}.. is empty). No remote
#      configured at all warns — there is nowhere to push.
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
    -h|--help) awk 'NR>1 && /^set -u/{exit} NR>1' "$0"; exit 0 ;;
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
# Blocking items are also accumulated so the verdict can NAME them. Observed
# 2026-07-30: a specialist read a gate with 1 [FAIL] and 4 [warn] lines and
# reported the two warnings as its blockers — "lacks a verify fence and changes
# are uncommitted/unpushed" — when the fence and the push were both warnings and
# the single blocker was its own uncommitted deliverable. A model summarising the
# tail should not have to scroll back up to find what actually blocked it.
BLOCKERS=""
red()  { echo "  [FAIL] $1"; FAILS=$((FAILS + 1)); BLOCKERS="$BLOCKERS  - $1
"; }
grn()  { echo "  [ok]   $1"; }
wrn()  { echo "  [warn] $1"; WARNS=$((WARNS + 1)); }

echo "DONE-CHECK for $FILE"

# -- 0. Parse the HANDOFF's PRODUCE and WRITE-SCOPE lists ---------------------
# Both are bullet lists; a path may be backticked. Used by checks 1, 3 and 5.
parse_list() {
  awk -v head="$1" '
    $0 ~ head { in_p = 1; next }
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
  ' "$FILE" | sort -u
}

PRODUCE_PATHS=$(parse_list '^(PRODUCE|## PRODUCE)')
# Attribution set = WRITE-SCOPE ∪ PRODUCE. A file you were told to produce is
# yours to commit even when the HANDOFF omits a WRITE-SCOPE section.
SCOPE_PATHS=$(printf '%s\n%s\n' \
  "$(parse_list '^(WRITE-SCOPE|## WRITE-SCOPE)')" "$PRODUCE_PATHS" \
  | grep -v '^$' | sort -u)

# Is $1 inside this HANDOFF's attribution set? Nothing parseable = no, so
# unattributable files degrade to a warning instead of a false RED.
in_scope() {
  [ -n "$SCOPE_PATHS" ] || return 1
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    s=${s%\*\*}; s=${s%/}
    case "$1" in
      "$s"|"$s"/*) return 0 ;;
    esac
  done <<INNER
$SCOPE_PATHS
INNER
  return 1
}

# Does this HANDOFF ship code, or only documents? A doc-only HANDOFF has no
# runnable verify fence, so there is nothing for the harness to write a report
# from. Field trace (2026-07): researcher finished both deliverables, then
# withheld the completion phrase permanently because the gate demanded a report
# its own HANDOFF made impossible.
HAS_FENCE=0
grep -qE '^```verify[[:space:]]*$' "$FILE" && HAS_FENCE=1
# …and is there anything in this repo a fence could even run? Demanding a fence
# where no build/test target exists yet rebuilds the same unwinnable gate one
# size smaller, so that case warns and the HANDOFF that adds the target owns the
# fence.
HAS_VERIFY_TARGET=0
if [ -f package.json ] && grep -qE '"(test|build|lint|typecheck|check)"[[:space:]]*:' package.json; then
  HAS_VERIFY_TARGET=1
elif [ -f Makefile ] || [ -f makefile ] || [ -f pyproject.toml ] || \
     [ -f Cargo.toml ] || [ -f go.mod ] || [ -f build.gradle ] || [ -f pom.xml ]; then
  HAS_VERIFY_TARGET=1
fi
SHIPS_CODE=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in
    docs/*|*.md|README*|LICENSE*|CHANGELOG*|.gitignore|.gitattributes) ;;
    *) SHIPS_CODE=1 ;;
  esac
done <<EOF
$PRODUCE_PATHS
EOF

# -- 1. Verify report exists and is ALL GREEN --------------------------------
if [ ! -f "$REPORT" ]; then
  if [ "$HAS_FENCE" -eq 0 ] && [ "$SHIPS_CODE" -eq 0 ]; then
    wrn "no verify report — this HANDOFF has no \`\`\`verify fence and PRODUCEs documents only; nothing runnable to verify"
  elif [ "$HAS_FENCE" -eq 0 ] && [ "$HAS_VERIFY_TARGET" -eq 0 ]; then
    wrn "no verify report — PRODUCE ships source but this repo has no runnable verify target yet (no package.json script, Makefile, pyproject.toml, Cargo.toml, go.mod); say so in your report. The HANDOFF that adds the target owns the \`\`\`verify fence."
  elif [ "$HAS_FENCE" -eq 0 ]; then
    red "PRODUCE ships source files but $FILE has no \`\`\`verify fence — add one (build/lint/test commands), then run: bash ~/.config/opencode/scripts/verify-handoff.sh $FILE"
  else
    red "no verify report at $REPORT — run: bash ~/.config/opencode/scripts/verify-handoff.sh $FILE"
  fi
else
  VERDICT=$(grep -E 'VERIFY: (ALL GREEN|BASELINE_RED|RED)' "$REPORT" | tail -n 1)
  case "$VERDICT" in
    *"ALL GREEN"*)
      grn "verify report is ALL GREEN ($REPORT)"
      case "$VERDICT" in
        *"BASELINE NOT CHECKED"*)
          wrn "the harness performed no regression check (no baseline stored) — a test deleted in this work would not have been caught; say so in your report" ;;
      esac ;;
    *BASELINE_RED*)
      # Every failure was already failing at the baseline commit, so it is not
      # this HANDOFF's defect and the contract forbids fixing it here. Blocking
      # on it is the unwinnable gate the downstream project trace stalled on (2026-07).
      wrn "verify report is BASELINE_RED — every failure pre-dates this work; name them in your report, do not fix them in this scope. Verdict: ${VERDICT}" ;;
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
  # Only files this HANDOFF owns are yours to commit. The contract forbids
  # touching anything else, so failing on another agent's uncommitted files
  # made the gate unwinnable in a shared repo (2026-07).
  DIRTY_MINE=""
  DIRTY_THEIRS=""
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    f=$(printf '%s' "$line" | sed 's/^...//; s/^.* -> //; s/^"//; s/"$//')
    if in_scope "$f"; then
      DIRTY_MINE="$DIRTY_MINE$line
"
    else
      DIRTY_THEIRS="$DIRTY_THEIRS$line
"
    fi
  done <<EOF
$DIRTY
EOF

  if [ -n "$DIRTY_MINE" ]; then
    red "uncommitted changes to files this HANDOFF owns (WRITE-SCOPE/PRODUCE) — commit before reporting:"
    printf '%s' "$DIRTY_MINE" | sed 's/^/         /' | head -10
  else
    grn "working tree committed (every file this HANDOFF owns)"
  fi
  if [ -n "$DIRTY_THEIRS" ]; then
    if [ -n "$SCOPE_PATHS" ]; then
      wrn "uncommitted files this HANDOFF does not own — not yours to commit; name them in your report and leave them alone:"
    else
      wrn "no WRITE-SCOPE or PRODUCE list parsed from $FILE — the files below are unattributed; confirm manually which are yours:"
    fi
    printf '%s' "$DIRTY_THEIRS" | sed 's/^/         /' | head -10
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
    elif [ -z "$(git remote 2>/dev/null)" ]; then
      wrn "no git remote configured — there is nowhere to push; say so in your report (a fresh repo is not unpushed work)"
    else
      red "no upstream set — push first: git push -u origin \$(git branch --show-current)   (or pass --no-push-check if this HANDOFF does not push)"
    fi
  fi
fi

# -- 5. PRODUCE paths exist (best-effort parse) -------------------------------
PRODUCE_SEEN=0
PRODUCE_MISSING=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  PRODUCE_SEEN=$((PRODUCE_SEEN + 1))
  if [ -e "$p" ]; then
    grn "PRODUCE exists: $p"
  else
    red "PRODUCE missing: $p"
    PRODUCE_MISSING=$((PRODUCE_MISSING + 1))
  fi
done <<EOF
$PRODUCE_PATHS
EOF
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
  echo "DONE-CHECK: RED — $FAILS blocking item(s). Warnings above are NOT blockers; these are:"
  printf '%s' "$BLOCKERS"
  echo "Fix those, then re-run this check. Do NOT print the completion phrase."
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
