#!/usr/bin/env bash
# _scope-match.sh — the write_scope matcher, in ONE place.
#
# WHY ITS OWN FILE. This function used to exist twice: once in
# validate-scope.sh (the product) and once, copy-pasted, inside
# validate-scope.match.test.sh (the "fixture-backed" proof). A test holding its
# own copy of the thing it tests cannot fail when the product changes — it can
# only fail when the COPY changes. Confirmed 2026-09-08: the two had already
# diverged, and the test would have reported green over a matcher it no longer
# resembled. Same lesson as scripts/test-conductor-suite.ts's header, one
# directory over. Both sides now source this.
#
# Containment rules, in order:
#   - literal/prefix behaviour first, unchanged;
#   - any pattern containing ".." is refused (no traversal);
#   - a pattern whose FIRST path segment is not a literal name is refused: it
#     is not anchored to anything and spans unrelated top-level trees;
#   - "dir/**" resolves to a prefix test rather than a raw glob;
#   - patterns are matched only against repo-relative paths, anchored
#     full-string by [[ ]], so "apps/api" never matches "apps/api-other/...".

matches_scope() {
  local path="$1" ok="$2"

  # 1. exact file, or inside this directory (original behaviour, unchanged)
  [[ "$path" == "$ok" || "$path" == "$ok/"* ]] && return 0

  # 2. no traversal, ever
  case "$ok" in
    *'..'*) return 1 ;;
  esac

  # 3. THE PATTERN MUST BE ANCHORED.
  #
  # This was previously a blacklist of four literal strings — '*', '**', '/*',
  # '/**' — under a comment stating the intent as "would authorise the whole
  # repo". Every other spelling of that same thing walked straight through.
  # Measured 2026-09-08 against the real function: '**/*', '*/**', '*/*',
  # '?*/**' and '[a-z]*/**' each matched "src/auth/session.ts", authorising
  # every nested path in the repository, while only the two exact strings were
  # refused. A blacklist of spellings cannot express "names no path".
  #
  # The rule is the intent instead: the FIRST path segment must be a literal
  # name, containing no glob metacharacter. A scope contract is anchored at a
  # concrete top-level entry or it is not a contract.
  #
  #   a/**                      -> first segment "a"     -> anchored, allowed
  #   src/features/x/*.test.ts  -> first segment "src"    -> anchored, allowed
  #   **/*  |  */**  |  [a-z]*/** -> first segment globs  -> refused
  #   *.ts                      -> first segment "*.ts"   -> refused (it spans
  #                                every tree in the repo, which is the thing
  #                                a write_scope exists to prevent)
  local first="${ok%%/*}"
  case "$first" in
    *[\*\?\[]*) return 1 ;;
    '') return 1 ;;
  esac

  # 4. glob forms
  if [[ "$ok" == *[\*\?\[]* ]]; then
    if [[ "$ok" == */'**' ]]; then
      local base="${ok%/**}"
      [[ "$path" == "$base" || "$path" == "$base/"* ]] && return 0
    fi
    # unquoted RHS = bash pattern match, anchored to the whole path
    [[ "$path" == $ok ]] && return 0
  fi

  return 1
}
