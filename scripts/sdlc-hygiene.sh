#!/usr/bin/env bash
#
# sdlc-hygiene.sh — heal a project whose docs/work/ has silted up.
#
# An SDLC run leaves two very different kinds of file in docs/work/:
#
#   EPHEMERAL — HANDOFF_*.md, TASKS_*.md, context-for-*.md, sdlc-state.md,
#     COVERAGE_LOOP_*.md, plus per-machine runtime files (telemetry.jsonl,
#     session-receipts.jsonl, ...). Regenerated every run and read from DISK,
#     never from git. No handoff owns them: the lead writes them, the
#     specialist consumes them, and so nobody ever commits them. They pile up.
#
#   DURABLE — DELEGATION_LOG.md, SDLC_TRACKER.md, PROGRESS.md, APPROVALS.md,
#     LESSONS.md, SDLC_AUDIT.md, docs/work/gates/*-receipt.json, and every
#     docs/reviews/MANIFEST_*.md and review report. This is the audit trail:
#     who did what, and what proved it.
#
# Observed on a real project: 114 dirty files, 88 of them ephemeral scaffolding
# — with six manifests, two review reports and a gate receipt buried untracked
# in the same pile. The evidence was the part actually at risk.
#
# This script ignores the ephemeral, keeps the durable, and NEVER deletes
# anything from disk: it only removes files from the git index (`git rm
# --cached`), so an in-flight SDLC run is unaffected — the resume protocol and
# the TASKS ledgers read the filesystem, not git.
#
# Idempotent: safe to run any number of times. A healthy project is a no-op.
#
# Usage: sdlc-hygiene.sh [project-root] [--apply] [--commit]
#   (default)   DRY RUN — report what would change, touch nothing
#   --apply     write .gitignore rules + untrack now-ignored files
#   --commit    --apply, then commit the result as one hygiene checkpoint
#
# Exit: 0 clean or fixed / 1 changes needed and not applied (dry run) / 2 error

set -u

ROOT=""
APPLY=false
COMMIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)  APPLY=true; shift ;;
    --commit) APPLY=true; COMMIT=true; shift ;;
    -h|--help) sed -n '3,36p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  [[ -z "$ROOT" ]] && ROOT="$1"; shift ;;
  esac
done

[[ -z "$ROOT" ]] && ROOT="$(pwd)"
cd "$ROOT" 2>/dev/null || { echo "no such directory: $ROOT" >&2; exit 2; }

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "sdlc-hygiene: not a git work tree ($ROOT) — nothing to do" >&2
  exit 0
fi
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2

# Refuse mid-operation: rewriting the index during a merge/rebase is how work
# gets lost, and this script's entire promise is that it never loses anything.
for op in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply; do
  if [[ -e ".git/$op" ]]; then
    echo "sdlc-hygiene: a git operation is in progress (.git/$op) — resolve it first" >&2
    exit 2
  fi
done

BOLD=$'\033[1m'; RESET=$'\033[0m'
say() { printf '%s\n' "$*" >&2; }

# ── The policy, in one place ────────────────────────────────────────────────
RUNTIME_RULES=(
  '.code-search/'
  'docs/work/.model-context'
  'docs/work/verify-logs/'
  'docs/work/verify-baseline.txt'
  '**/docs/work/telemetry.jsonl'
  '**/docs/work/session-receipts.jsonl'
  '**/docs/work/watchdog-events.jsonl'
  '**/docs/work/run-until-done.log'
)
SCAFFOLD_RULES=(
  '**/docs/work/HANDOFF_*.md'
  '**/docs/work/TASKS_*.md'
  '**/docs/work/context-for-*.md'
  '**/docs/work/sdlc-state.md'
  '**/docs/work/COVERAGE_LOOP_*.md'
)

has_rule() {
  [[ -f .gitignore ]] || return 1
  # Compare whole lines, ignoring inline comments and surrounding space.
  awk -v want="$1" '
    { sub(/#.*/, ""); gsub(/^[ \t]+|[ \t]+$/, "") }
    $0 == want { found = 1 }
    END { exit found ? 0 : 1 }
  ' .gitignore
}

# NOTE: every expansion of these two arrays below uses the ${arr[@]+"${arr[@]}"}
# guard. macOS ships bash 3.2, where `set -u` treats "${empty[@]}" as an unbound
# variable and aborts -- so a project that is ALREADY clean (both arrays empty)
# would crash instead of reporting "nothing to do". Caught by the suite, which
# runs on /bin/bash rather than a newer $BASH (the T27.7 lesson).
MISSING_RUNTIME=(); MISSING_SCAFFOLD=()
for r in "${RUNTIME_RULES[@]}";  do has_rule "$r" || MISSING_RUNTIME+=("$r"); done
for r in "${SCAFFOLD_RULES[@]}"; do has_rule "$r" || MISSING_SCAFFOLD+=("$r"); done

say ""
say "${BOLD}sdlc-hygiene${RESET} — $ROOT"
say ""

# ── 1. .gitignore rules ─────────────────────────────────────────────────────
n_missing=$(( ${#MISSING_RUNTIME[@]} + ${#MISSING_SCAFFOLD[@]} ))
if [[ "$n_missing" -eq 0 ]]; then
  say "  [ok]   .gitignore already carries every hygiene rule"
else
  say "  [fix]  .gitignore is missing $n_missing rule(s)"
  for r in ${MISSING_RUNTIME[@]+"${MISSING_RUNTIME[@]}"} ${MISSING_SCAFFOLD[@]+"${MISSING_SCAFFOLD[@]}"}; do say "           $r"; done
  if [[ "$APPLY" == true ]]; then
    {
      printf '\n'
      if [[ ${#MISSING_RUNTIME[@]} -gt 0 ]]; then
        printf '# Expert-system runtime artifacts — generated per-machine, never committed\n'
        printf '%s\n' ${MISSING_RUNTIME[@]+"${MISSING_RUNTIME[@]}"}
      fi
      if [[ ${#MISSING_SCAFFOLD[@]} -gt 0 ]]; then
        printf '\n# SDLC orchestration scaffolding — regenerated per handoff, read from disk not git\n'
        printf '%s\n' ${MISSING_SCAFFOLD[@]+"${MISSING_SCAFFOLD[@]}"}
      fi
    } >> .gitignore
    say "         → appended to .gitignore"
  fi
fi

# ── 2. tracked files that the rules now cover ───────────────────────────────
# Only meaningful once the rules exist, so in dry-run we ask git with the rules
# supplied on the fly rather than reporting a misleading zero.
EXTRA_ARGS=()
if [[ "$APPLY" != true ]]; then
  for r in ${MISSING_RUNTIME[@]+"${MISSING_RUNTIME[@]}"} ${MISSING_SCAFFOLD[@]+"${MISSING_SCAFFOLD[@]}"}; do EXTRA_ARGS+=(--exclude="$r"); done
fi
TRACKED_IGNORED="$(git ls-files -i -c --exclude-standard "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")"

n_tracked=0
[[ -n "$TRACKED_IGNORED" ]] && n_tracked=$(printf '%s\n' "$TRACKED_IGNORED" | grep -c .)

if [[ "$n_tracked" -eq 0 ]]; then
  say "  [ok]   no tracked file matches an ephemeral rule"
else
  say "  [fix]  $n_tracked tracked file(s) are ephemeral and should not be in git"
  printf '%s\n' "$TRACKED_IGNORED" | head -n 5 | while IFS= read -r f; do say "           $f"; done
  [[ "$n_tracked" -gt 5 ]] && say "           … and $((n_tracked - 5)) more"
  if [[ "$APPLY" == true ]]; then
    printf '%s\n' "$TRACKED_IGNORED" | tr '\n' '\0' | xargs -0 git rm --cached --quiet --
    say "         → removed from the index (every file left on disk)"
  fi
fi

# ── 3. durable evidence sitting untracked ───────────────────────────────────
# In dry run the new rules are not on disk yet, so pass them to git here too --
# otherwise scaffolding that is ABOUT to be ignored is miscounted as evidence.
DURABLE="$(git ls-files --others --exclude-standard \
  "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}" -- 'docs/reviews' 'docs/work' 2>/dev/null || true)"
n_durable=0
[[ -n "$DURABLE" ]] && n_durable=$(printf '%s\n' "$DURABLE" | grep -c .)

if [[ "$n_durable" -eq 0 ]]; then
  say "  [ok]   no durable artifact is sitting untracked"
else
  say "  [fix]  $n_durable durable artifact(s) untracked — this is the audit trail"
  printf '%s\n' "$DURABLE" | head -n 5 | while IFS= read -r f; do say "           $f"; done
  [[ "$n_durable" -gt 5 ]] && say "           … and $((n_durable - 5)) more"
fi

# ── 4. commit ───────────────────────────────────────────────────────────────
say ""
if [[ "$APPLY" != true ]]; then
  if [[ "$n_missing" -eq 0 && "$n_tracked" -eq 0 && "$n_durable" -eq 0 ]]; then
    say "  ${BOLD}clean${RESET} — nothing to do"
    exit 0
  fi
  say "  DRY RUN — nothing was changed."
  say "  Re-run with ${BOLD}--apply${RESET} to fix, or ${BOLD}--commit${RESET} to fix and checkpoint."
  exit 1
fi

if [[ "$COMMIT" == true ]]; then
  git add -A
  if git diff --cached --quiet; then
    say "  ${BOLD}clean${RESET} — nothing to commit"
    exit 0
  fi
  git commit -q -F - <<'MSG'
chore(hygiene): commit the audit trail, stop tracking per-run scaffolding

docs/work/ holds two kinds of file. Orchestration scaffolding (HANDOFF_*,
TASKS_*, context-for-*, sdlc-state, COVERAGE_LOOP_*) is regenerated every run
and read from disk, never from git — and no handoff owns it, since the lead
writes it and the specialist consumes it, so nobody ever commits it and it
accumulates. The audit trail (trackers, gate receipts, manifests, review
reports) is the opposite: it is evidence, and it was sitting untracked in the
same pile.

Ephemeral paths are now gitignored and removed from the index — every file
remains on disk, so an in-flight SDLC run is unaffected. Durable artifacts are
committed.

Applied by scripts/sdlc-hygiene.sh.
MSG
  say "  ${BOLD}committed${RESET} — $(git log --oneline -1)"
else
  say "  ${BOLD}applied${RESET} — review with 'git status', then commit"
fi

say ""
say "  dirty files now: $(git status --porcelain | grep -c . || true)"
exit 0
