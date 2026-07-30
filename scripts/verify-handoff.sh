#!/usr/bin/env bash
# verify-handoff.sh — mechanical verify-loop evidence harness (v2.44.0)
#
# WHY THIS EXISTS: small models cannot reliably self-report verify compliance.
# Field traces (2026-07, gpt-5-mini): `|| true` appended to gates, biome errors
# relabeled "non-blocking suggestions", output head-truncated past the summary
# line (`| sed -n '1,240p'` cut off "Found 57 errors"), integration commands
# never run ("covered by the suite"), pass counts below baseline shipped anyway.
# Every one of those was a prose rule the model broke. This script makes them
# mechanical: it runs each command EXACTLY as written, captures full output,
# keeps the TAIL, extracts pass counts, compares against a stored baseline, and
# writes the report itself. The model's job shrinks to: run this, read the one
# verdict line, fix, re-run.
#
# Usage:
#   bash verify-handoff.sh <file>              # run commands from the file's ```verify fence
#   bash verify-handoff.sh <file> --baseline   # also store the baseline (run BEFORE editing)
#   bash verify-handoff.sh -c "cmd" [-c ...]   # explicit commands, no file
#   Options: --report <path>   (default docs/work/VERIFY_REPORT.md)
#
# The ```verify fence: first fenced block opening with ```verify in the file;
# each non-empty, non-# line is one command, run verbatim via `bash -c` from
# the directory this script was invoked in.
#
# Three wrong-verdict channels this closes (field trace 2026-07, downstream project):
#   * A command that matched NOTHING is not a pass. `jest --passWithNoTests`,
#     vitest with no match, and `eslint --no-error-on-unmatched-pattern` all exit
#     0 having tested nothing; `biome check <config-excluded-path>` exits non-zero
#     with "No files were processed" and reads as the agent's defect. Both are the
#     same bug — a fence/path/config defect — and both are now named as one.
#     Guarded by a zero-pass-count precondition, so a monorepo run where one
#     package has no tests but 1000 pass elsewhere is NOT flagged.
#   * A summed pass-count cannot tell a pre-existing failure from a new one. The
#     baseline now stores failing-test SIGNATURES plus provenance (commit,
#     branch, command count). On RED, the current failing set is compared against
#     it: a subset means BASELINE_RED (pre-existing, not this agent's work); any
#     new signature stays RED and only the NEW ones are named. Attribution is
#     claimed only when the baseline commit is an ancestor of HEAD — otherwise
#     the verdict says UNKNOWN rather than guessing.
#   * A run with no baseline silently performs no regression check at all. The
#     ALL GREEN verdict now says so, so absent evidence stops reading as evidence.
#
# Baseline format (docs/work/verify-baseline.txt): line 1 is the summed
# pass-count — a bare integer file from any earlier version still reads
# correctly — followed by `# `-prefixed provenance and `# fail:` signatures.
#
# Exit: 0 = ALL GREEN, 1 = RED, 2 = usage/no commands, 3 = BASELINE_RED
# (every failure pre-dates this work; the verdict line is the authority and
# handoff-done.sh treats it as a warning, not a block).
#
# Known gaps, stated rather than hidden: a pass-count that RISES while tests are
# deleted (+10 new / -5 removed) is still undetectable — that needs a full
# test-name inventory, not just failures. And the pass-count sum greps the whole
# log, so a test NAME containing "5 passed" inflates it.
#
# Never-sudo, dependency-free (bash 3.2+, awk, tail, grep). Never masks an
# exit code; never truncates the head of a summary.
set -u

FILE=""
BASELINE_MODE=0
REPORT=""
CMDS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --baseline) BASELINE_MODE=1 ;;
    --report)
      [ $# -ge 2 ] || { echo "verify-handoff: --report needs a path" >&2; exit 2; }
      REPORT="$2"; shift ;;
    -c)
      [ $# -ge 2 ] || { echo "verify-handoff: -c needs a command" >&2; exit 2; }
      CMDS+=("$2"); shift ;;
    -h|--help)
      awk 'NR>1 && /^set -u/{exit} NR>1' "$0"; exit 0 ;;
    -*)
      echo "verify-handoff: unknown option $1" >&2; exit 2 ;;
    *)
      FILE="$1" ;;
  esac
  shift
done

ROOT="$(pwd)"

# --- collect commands -------------------------------------------------------
if [ ${#CMDS[@]} -eq 0 ]; then
  if [ -z "$FILE" ]; then
    echo "verify-handoff: pass a file with a \`\`\`verify fence, or -c commands. See --help." >&2
    exit 2
  fi
  if [ ! -f "$FILE" ]; then
    echo "verify-handoff: file not found: $FILE (paths are project-relative)" >&2
    exit 2
  fi
  while IFS= read -r line; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    CMDS+=("$line")
  done < <(awk '
    done_block == 1        { next }
    /^```verify[[:space:]]*$/ { in_block = 1; next }
    in_block && /^```/     { done_block = 1; next }
    in_block               { print }
  ' "$FILE")
  if [ ${#CMDS[@]} -eq 0 ]; then
    echo "verify-handoff: no \`\`\`verify fence with commands found in $FILE" >&2
    echo "  Add one (each line = one command, run verbatim):" >&2
    printf '  ```verify\n  cd apps/api && npx vitest run\n  ```\n' >&2
    exit 2
  fi
fi

# --- output locations -------------------------------------------------------
if [ -d "docs/work" ]; then OUT="docs/work"; else OUT="."; fi
LOGDIR="$OUT/verify-logs"
mkdir -p "$LOGDIR"
[ -n "$REPORT" ] || REPORT="$OUT/VERIFY_REPORT.md"
BASE_FILE="$OUT/verify-baseline.txt"
FAIL_CUR="$LOGDIR/.failures-current.txt"
: > "$FAIL_CUR"

# Specific, known emptiness strings from real runners. NEVER a generic "did this
# touch files" heuristic: a fence legitimately contains `git branch
# --show-current`, `test -s <path>`, and bare `echo`, and this repo's own test
# fixture emits "Found 0 errors" as a GREEN signal.
EMPTY_RE='no files were processed|no files matching|no test files found|no test files|no tests found|no tests ran|no tests to run|found no tests|ran 0 tests|collected 0 items'

# Normalized failing-test signatures. Uppercase FAIL/FAILED/--- FAIL: and the
# vitest/jest glyphs — deliberately NOT the lowercase summary line ("7 failed |
# 114 passed"), which is a count, not a signature. Timings are stripped so the
# same failure yields the same signature on every run.
extract_failures() {
  grep -hE '(^|[[:space:]])(FAIL|FAILED|--- FAIL:|✗|×|●)([[:space:]]|$)' "$1" 2>/dev/null \
    | sed -E 's/^[[:space:]]*//; s/[[:space:]]+$//; s/\([0-9]+(\.[0-9]+)?[[:space:]]*m?s\)//g; s/[[:space:]][[:space:]]+/ /g' \
    | sort -u
}

# --- fence scope advisory ----------------------------------------------------
# The lead authors the fence; the specialist is bound by WRITE-SCOPE. A fence
# line that targets ONLY paths the HANDOFF does not own hands the specialist a
# failure it is forbidden to fix (field trace 2026-07: a fence ran the whole
# monorepo's tests and failed in `packages/shared`, "outside WRITE-SCOPE", and
# the specialist stalled). Run at --baseline time this is an authoring-time
# check; the WRITE-SCOPE parser is duplicated from handoff-done.sh on purpose —
# both scripts stay standalone so an agent can run either one alone.
#
# Deliberately narrow: this fires only when EVERY path in a command is out of
# scope. A repo-wide command (`pnpm test`, `biome check .`) names no out-of-scope
# path and is often correct, so it is not flagged here — pre-existing failures it
# surfaces are handled by baseline attribution instead.
SCOPE_PATHS=""
if [ -n "$FILE" ]; then
  SCOPE_PATHS=$(awk '
    /^(WRITE-SCOPE|## WRITE-SCOPE)/ { in_p = 1; next }
    in_p && /^[[:space:]]*-[[:space:]]/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      if (match(line, /`[^`]+`/)) { path = substr(line, RSTART + 1, RLENGTH - 2) }
      else { split(line, a, /[[:space:]]/); path = a[1] }
      if (path ~ /[\/.]/ && path !~ /^</) print path
      next
    }
    in_p && !/^[[:space:]]*$/ && !/^[[:space:]]*-/ { in_p = 0 }
  ' "$FILE" | sort -u)
fi

# Callers guard on SCOPE_PATHS being non-empty, so this has no empty-scope case
# on purpose. handoff-done.sh's same-named helper answers "not attributable"
# (return 1) for empty scope; an inverted twin of it here would be a silent
# false-attribution the next time someone copies one into the other.
path_in_scope() {
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

# Path-looking tokens from a command that actually exist on disk.
fence_paths() {
  printf '%s\n' "$1" | tr ' \t' '\n\n' | sed "s/^[\"']//; s/[\"']$//" | while IFS= read -r t; do
    case "$t" in
      -*|''|.|./|'&&'|'||'|';') continue ;;
      */*|*.ts|*.js|*.json|*.md|*.py|*.go) ;;
      *) continue ;;
    esac
    [ -e "$t" ] && printf '%s\n' "${t%/}"
  done | sort -u
}

# --- auto-baseline -----------------------------------------------------------
# A baseline is only meaningful pre-change. If none is stored, store one
# automatically WHEN we can prove this run is pre-change: clean working tree
# AND the branch has no commits beyond the base branch. Otherwise warn loudly —
# a missing baseline means test deletion cannot be detected mechanically.
BASELINE_CHECKED=0
if [ "$BASELINE_MODE" -eq 0 ] && [ ! -f "$BASE_FILE" ]; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    CLEAN=$(git status --porcelain 2>/dev/null | grep -Ev ' docs/(work|reviews)/' || true)
    BASE_BRANCH=""
    git show-ref --verify --quiet refs/heads/main && BASE_BRANCH="main"
    [ -z "$BASE_BRANCH" ] && git show-ref --verify --quiet refs/heads/master && BASE_BRANCH="master"
    AHEAD=0
    if [ -n "$BASE_BRANCH" ]; then
      AHEAD=$(git log "$BASE_BRANCH"..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
    fi
    if [ -z "$CLEAN" ] && [ -n "$BASE_BRANCH" ] && [ "$AHEAD" -eq 0 ]; then
      BASELINE_MODE=1
      echo "note: no baseline stored + clean pre-change tree — storing baseline automatically"
    else
      echo "WARNING: no baseline stored and the tree already has changes — pass-count"
      echo "         regressions CANNOT be detected. If you have not edited yet, commit/stash"
      echo "         and re-run with --baseline from the clean pre-change state." >&2
    fi
  fi
fi

# --- run --------------------------------------------------------------------
STAMP="$(date -u '+%Y-%m-%d %H:%M:%SZ' 2>/dev/null || date)"
{
  echo "# VERIFY REPORT — generated by verify-handoff.sh, not hand-written"
  echo ""
  echo "- Generated: $STAMP"
  echo "- Working dir: $ROOT"
  [ -n "$FILE" ] && echo "- Commands from: $FILE (\`\`\`verify fence)"
  echo "- Full per-command logs: $LOGDIR/NN.log"
  echo ""
} > "$REPORT"

N=0
GREEN=0
RED_CMD=""
RED_CODE=0
TOTAL_PASSED=0
EMPTY_CMD=""

for cmd in "${CMDS[@]}"; do
  N=$((N + 1))
  LOG="$LOGDIR/$(printf '%02d' "$N").log"
  echo "[$N/${#CMDS[@]}] $cmd"
  ( cd "$ROOT" && bash -c "$cmd" ) > "$LOG" 2>&1
  CODE=$?

  # Runners disagree about word order, so sum two shapes:
  #   "<n> passed" / "<n> passing"  — vitest, jest, mocha, pytest, go
  #   "pass <n>"                    — node --test and TAP, count AFTER the word
  # The sum is only compared against a baseline produced by the same commands,
  # so double-counting ("Test Files 69 passed" + "Tests 1152 passed") is stable.
  #
  # The second shape is anchored to the reporter's line-leading glyph — node
  # prints "ℹ pass 8", TAP prints "# pass 8". An unanchored /pass +[0-9]+/ also
  # matches ordinary prose, including this repo's own "[Pass 49]" test headers,
  # and would silently inflate the baseline. Before this, a node --test project
  # scored 0, so its deletion check was inert and tests could vanish unnoticed
  # (found 2026-07-30 running a real HANDOFF against a node --test project).
  CMD_PASSED=$(
    { grep -Eo '[0-9]+ pass(ed|ing)' "$LOG" 2>/dev/null | grep -Eo '^[0-9]+' || true
      grep -Eo '^[#ℹ][[:space:]]*pass[[:space:]]+[0-9]+' "$LOG" 2>/dev/null | grep -Eo '[0-9]+$' || true
    } | awk '{ s += $1 } END { print s + 0 }'
  )
  TOTAL_PASSED=$((TOTAL_PASSED + CMD_PASSED))

  # Matched-nothing detection. Both conditions are required: an emptiness string
  # AND zero passes anywhere in this command's output.
  CMD_EMPTY=0
  if [ "$CMD_PASSED" -eq 0 ] && grep -qiE "$EMPTY_RE" "$LOG" 2>/dev/null; then
    CMD_EMPTY=1
    [ -z "$EMPTY_CMD" ] && EMPTY_CMD="$cmd"
  fi

  extract_failures "$LOG" >> "$FAIL_CUR"

  # Every path this command names is outside the HANDOFF's WRITE-SCOPE.
  CMD_OUT_OF_SCOPE=""
  if [ -n "$SCOPE_PATHS" ]; then
    CMD_PATHS=$(fence_paths "$cmd")
    if [ -n "$CMD_PATHS" ]; then
      ANY_IN=0
      while IFS= read -r p; do
        [ -n "$p" ] || continue
        if path_in_scope "$p"; then ANY_IN=1; break; fi
      done <<EOF
$CMD_PATHS
EOF
      [ "$ANY_IN" -eq 0 ] && CMD_OUT_OF_SCOPE=$(printf '%s' "$CMD_PATHS" | tr '\n' ' ')
    fi
  fi

  {
    echo "## Command $N"
    echo ""
    echo '```'
    echo "$cmd"
    echo '```'
    echo ""
    echo "- Exit code: **$CODE**"
    [ "$CMD_PASSED" -gt 0 ] && echo "- Pass-count mentions summed: $CMD_PASSED"
    [ "$CMD_EMPTY" -eq 1 ] && echo "- **Matched nothing**: the output says no files/tests were processed and zero tests passed. This is a fence/path/config defect, not a code defect."
    [ -n "$CMD_OUT_OF_SCOPE" ] && echo "- **Outside WRITE-SCOPE**: every path this command names ($CMD_OUT_OF_SCOPE) is outside this HANDOFF's write scope. A failure here is not the specialist's to fix — scope the fence to what the HANDOFF owns, or state that this command is a cross-check whose failures are reported, not repaired."
    echo "- Output TAIL (last 15 lines — the summary end; full log: $LOG):"
    echo ""
    echo '```'
    tail -n 15 "$LOG"
    echo '```'
    echo ""
  } >> "$REPORT"

  if [ "$CODE" -eq 0 ]; then
    GREEN=$((GREEN + 1))
    echo "    exit 0"
  else
    echo "    exit $CODE  <-- RED"
    if [ -z "$RED_CMD" ]; then RED_CMD="$cmd"; RED_CODE=$CODE; fi
  fi
  [ -n "$CMD_OUT_OF_SCOPE" ] && echo "    NOTE: every path here is outside WRITE-SCOPE ($CMD_OUT_OF_SCOPE) — scope the fence, or say these failures are reported not repaired"
done

CUR_FAILS=$(sort -u "$FAIL_CUR" 2>/dev/null | grep -c . | tr -d ' ')

# --- baseline ---------------------------------------------------------------
COUNT_RED=""
PREEXISTING=""
NEW_FAILS=""
if [ "$BASELINE_MODE" -eq 1 ]; then
  {
    echo "$TOTAL_PASSED"
    echo "# verify-baseline v2 — generated by verify-handoff.sh, not hand-written"
    echo "# commit: $(git rev-parse HEAD 2>/dev/null || echo none)"
    echo "# branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo none)"
    echo "# ncmds: $N"
    sort -u "$FAIL_CUR" 2>/dev/null | grep . | sed 's/^/# fail: /'
  } > "$BASE_FILE"
  echo "- Baseline stored: $TOTAL_PASSED summed pass-count, $CUR_FAILS failing signature(s) ($BASE_FILE)" >> "$REPORT"
  echo "baseline stored: $TOTAL_PASSED"
elif [ -f "$BASE_FILE" ]; then
  BASELINE_CHECKED=1
  # Line 1 only — a bare-integer baseline from an older version still reads, and
  # digits inside the provenance comments cannot corrupt the count.
  BASE=$(head -n 1 "$BASE_FILE" | tr -cd '0-9')
  BASE_COMMIT=$(sed -n 's/^# commit: //p' "$BASE_FILE" | head -n 1)
  BASE_FAILS="$LOGDIR/.failures-baseline.txt"
  sed -n 's/^# fail: //p' "$BASE_FILE" | sort -u > "$BASE_FAILS"

  if [ -n "$BASE" ] && [ "$TOTAL_PASSED" -lt "$BASE" ]; then
    COUNT_RED="pass-count regressed: $TOTAL_PASSED < baseline $BASE — existing tests were deleted or broken"
  fi
  echo "- Baseline check: current $TOTAL_PASSED vs stored $BASE ${COUNT_RED:+— REGRESSION}" >> "$REPORT"

  # Attribution, only for a run that actually failed. This can downgrade a RED
  # to BASELINE_RED; it can never turn a failure into ALL GREEN.
  if [ -n "$RED_CMD" ] && [ "$CUR_FAILS" -gt 0 ] && [ -s "$BASE_FAILS" ]; then
    ANCESTOR=1
    if [ -n "$BASE_COMMIT" ] && [ "$BASE_COMMIT" != "none" ]; then
      git merge-base --is-ancestor "$BASE_COMMIT" HEAD >/dev/null 2>&1 || ANCESTOR=0
    elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      # A pre-v2 baseline carries no commit. Inside a repo that is unverifiable
      # provenance, and attribution is a claim about history — do not make it.
      ANCESTOR=0
    fi
    if [ "$ANCESTOR" -eq 0 ]; then
      echo "- Attribution: **UNKNOWN** — the baseline was stored at $BASE_COMMIT, which is not an ancestor of HEAD. Re-store it from this branch's base." >> "$REPORT"
    else
      NEW_FAILS=$(sort -u "$FAIL_CUR" | grep . | comm -23 - "$BASE_FAILS")
      NEW_COUNT=$(printf '%s' "$NEW_FAILS" | grep -c . | tr -d ' ')
      if [ "$NEW_COUNT" -eq 0 ]; then
        PREEXISTING="$CUR_FAILS failing signature(s), 0 new — every one is present in the baseline stored at ${BASE_COMMIT:-unknown}"
        {
          echo "- Attribution: **all $CUR_FAILS failure(s) pre-date this work** (baseline ${BASE_COMMIT:-unknown}). Not this HANDOFF's defect — cite this line and report them; do not try to fix them inside this scope."
        } >> "$REPORT"
      else
        {
          echo "- Attribution: **$NEW_COUNT NEW failure(s)** not in the baseline — these are this work's:"
          echo ""
          echo '```'
          printf '%s\n' "$NEW_FAILS"
          echo '```'
        } >> "$REPORT"
      fi
    fi
  fi
fi

# --- verdict ----------------------------------------------------------------
echo "" >> "$REPORT"
if [ -n "$EMPTY_CMD" ]; then
  # Named ahead of the exit code: in the biome-on-excluded-path case the non-zero
  # exit IS the emptiness, and naming "exit 1" instead sends the agent looking for
  # a code defect that does not exist.
  VERDICT="VERIFY: RED — fence command matched nothing (path/config defect, not a code defect): $EMPTY_CMD"
elif [ -n "$RED_CMD" ] && [ -n "$PREEXISTING" ] && [ -z "$COUNT_RED" ]; then
  # COUNT_RED must be clear: pre-existing failures do NOT excuse a pass-count
  # that dropped. Without this guard, deleting tests while the baseline already
  # had failures would downgrade to a warning and ship — the exact masking the
  # count check exists to catch.
  VERDICT="VERIFY: BASELINE_RED — $PREEXISTING"
elif [ -n "$RED_CMD" ] && [ -n "$PREEXISTING" ]; then
  # Reachable only when COUNT_RED blocked the BASELINE_RED downgrade above. Both
  # facts belong in the line: the deletion is the actionable one, and the
  # failures are still not this HANDOFF's. Naming only "exit N" here would send
  # the agent hunting a code defect that pre-dates its work, with the deletion
  # mentioned nowhere in the line it was told to read.
  VERDICT="VERIFY: RED — $COUNT_RED (the $CUR_FAILS failing signature(s) themselves pre-date this work — the missing passes do not)"
elif [ -n "$RED_CMD" ]; then
  # Deliberately ahead of COUNT_RED: a failing test lowers the pass count as a
  # consequence, so letting the count win here would relabel every ordinary
  # test failure as "existing tests were deleted or broken".
  VERDICT="VERIFY: RED — exit $RED_CODE from: $RED_CMD"
elif [ -n "$COUNT_RED" ]; then
  VERDICT="VERIFY: RED — $COUNT_RED"
elif [ "$BASELINE_CHECKED" -eq 0 ] && [ "$BASELINE_MODE" -eq 0 ]; then
  VERDICT="VERIFY: ALL GREEN ($GREEN/$N) — BASELINE NOT CHECKED (no baseline stored; a test deleted in this work would not be detected)"
else
  VERDICT="VERIFY: ALL GREEN ($GREEN/$N)"
fi
echo "**$VERDICT**" >> "$REPORT"
echo "$VERDICT"
echo "report: $REPORT"

case "$VERDICT" in
  "VERIFY: ALL GREEN"*)   exit 0 ;;
  "VERIFY: BASELINE_RED"*) exit 3 ;;
  *) exit 1 ;;
esac
