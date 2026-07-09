#!/usr/bin/env bash
#
# validate-security-controls.sh -- ensures SECURITY_CONTROLS.md exists and
# that every HIGH/CRITICAL threat in THREAT_MODEL.md has a corresponding
# control entry, and that DATABASE.md, API_DESIGN.md, and ARCHITECTURE.md
# each contain a security section incorporating the controls.
#
# Part of Phase 3 gate -- runs after threat model feedback loop completes.
#
# T29.4 adds three more checks (Bootstrap & Empty-State checklist,
# self-referential/circular permission gate, RBAC cardinality). They run
# right after the SECURITY_CONTROLS.md existence check and BEFORE the
# THREAT_MODEL.md-presence branch -- independent review (2026-07-09) found
# that appending them after the pre-existing "no THREAT_MODEL.md -> warn +
# validator_exit" early return made them silently unreachable whenever a
# project had a bootstrap-authority hole but hadn't written THREAT_MODEL.md
# yet, exactly the gap this ticket exists to catch.
#
# Known limitation: the direct (1-hop) self-reference check's `[^.]*` window
# is sentence-scoped, not clause-scoped -- a 2-hop mutual cycle phrased as one
# run-on sentence ("only A may grant B, and only B may grant A") can trip
# the 1-hop branch first (both role names appear twice in the same
# sentence) instead of the dedicated N-hop cycle branch. This only affects
# which gap MESSAGE is produced (mislabeled as "self-referential" instead of
# "N-hop circular"); the outcome (flagged as a gap unless a real bootstrap
# escape is documented, same `bootstrap_escape_ok` check either way) is
# identical either way, so it is not a false negative.
#

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

validator_init "validate-security-controls"

ROOT="$(detect_project_root "${1:-}")"

SC="$ROOT/docs/SECURITY_CONTROLS.md"
TM="$ROOT/docs/THREAT_MODEL.md"
DB="$ROOT/docs/DATABASE.md"

# -- 1. SECURITY_CONTROLS.md must exist and be non-empty ----------------------
if ! file_exists_nonempty "$SC"; then
  gap "missing-security-controls" "docs/SECURITY_CONTROLS.md not found or empty — run security-auditor HANDOFF to produce it"
  validator_exit
fi
pass "SECURITY_CONTROLS.md present"

# -- 2. Bootstrap & Empty-State checklist answered (t=0 questions, M29) ------
# Field lesson: a design can pass every other gate while never answering how
# the system reaches a usable state from zero. Require a real, non-placeholder
# answer for each t=0 question -- a bare heading with no content is a fail,
# same "cannot be faked by omission" discipline as validate-completion-manifest.sh v2.
if ! grep -qiE '^##[[:space:]]+Bootstrap[[:space:]]*&?[[:space:]]*Empty-State' "$SC"; then
  gap "missing-bootstrap-checklist" "docs/SECURITY_CONTROLS.md has no '## Bootstrap & Empty-State' section — answer the t=0 questions (first privileged user, zero-seed usability, state-gated capabilities, zero-role user view, bootstrap mechanism)"
else
  pass "Bootstrap & Empty-State section present"
  # Match "Label:" regardless of markdown decoration around it (this repo's
  # convention is "**Label:** answer" -- the closing ** comes AFTER the
  # colon, not before -- so search on the label+colon only, then strip all
  # asterisks before splitting on the colon to extract the answer).
  for label in "First privileged user" "Zero-seed usable" "State-gated capabilities" "Zero-role user view" "Bootstrap mechanism"; do
    field_line=$(grep -iE "${label}[[:space:]]*:" "$SC" | head -1 || true)
    if [[ -z "$field_line" ]]; then
      gap "missing-bootstrap-field" "SECURITY_CONTROLS.md Bootstrap & Empty-State section missing '${label}:' field"
      continue
    fi
    field_plain="$(printf '%s' "$field_line" | tr -d '*')"
    field_answer="${field_plain#*:}"
    field_trim="$(printf '%s' "$field_answer" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [[ -z "$field_trim" ]] || printf '%s' "$field_trim" | grep -qiE '(TBD|TODO|PLACEHOLDER|^\[)'; then
      gap "thin-bootstrap-field" "SECURITY_CONTROLS.md '${label}:' has no real answer (empty or placeholder)"
    else
      pass "Bootstrap field answered: ${label}"
    fi
  done
fi

# Flatten wrapped paragraphs into single lines before prose-scanning checks
# 3-4 below. Markdown authors hard-wrap prose at ~80 cols; a naive per-line
# grep (e.g. "only ... admin ... grant ... admin" or "union of grants") would
# silently miss any match split across a line break. Headings and blank
# lines are preserved as their own lines; consecutive non-blank, non-heading
# lines are joined with a space. Portable to onetrueawk (no IGNORECASE, no \b).
SC_FLAT="$(mktemp -t "sc_flat.XXXXXX")"
awk '
  function flush() { if (para != "") { print para; para = "" } }
  /^[[:space:]]*$/ { flush(); print ""; next }
  /^#/ { flush(); print; next }
  /^\|/ { flush(); print; next }
  { if (para == "") para = $0; else para = para " " $0 }
  END { flush() }
' "$SC" > "$SC_FLAT"

# -- 3. Self-referential / N-hop circular permission gate (bootstrap-authority) --
# "Only role X may grant role X" (direct, 1-hop) or a chain "only A grants B,
# only B grants C, ..., only N grants A" (N-hop cycle -- every role's grant
# path ultimately requires already holding a role IN the cycle, so nobody can
# ever bootstrap the first holder of ANY role in it) with no documented
# bootstrap mechanism is a circular authority trap. Role names are NOT a
# hardcoded vocabulary -- extracted generically via backreference match (BSD
# grep on this platform supports \N backreferences in -E mode as an
# extension) so a custom role name (Reviewer, Approver, ...) is caught the
# same as admin/owner/root.
bootstrap_escape_ok() {
  # Returns 0 (true) if SECURITY_CONTROLS.md's Bootstrap mechanism field has
  # a real, non-placeholder answer that names positive evidence of an actual
  # escape (not just any non-empty text -- "None, this is broken" is real
  # content but not an escape) AND that escape isn't itself confessed to be
  # unsafe. Independent review (2026-07-09) found a documented "seed script"
  # that explicitly warns "do not run this twice, it will create duplicate
  # admins and corrupt the role table" still keyword-matched "seed" and
  # passed clean -- a design that HONESTLY DISCLOSES its bootstrap mechanism
  # is broken must not be treated as having a valid escape. Check for danger
  # cues in the SAME field before accepting the keyword match.
  local bootstrap_line bootstrap_plain bootstrap_answer bootstrap_trim
  bootstrap_line=$(grep -iE "Bootstrap mechanism[[:space:]]*:" "$SC" | head -1 || true)
  bootstrap_plain="$(printf '%s' "$bootstrap_line" | tr -d '*')"
  bootstrap_answer="${bootstrap_plain#*:}"
  bootstrap_trim="$(printf '%s' "$bootstrap_answer" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ -z "$bootstrap_trim" ]] && return 1
  printf '%s' "$bootstrap_trim" | grep -qiE '(TBD|TODO|PLACEHOLDER|^\[|^none\b)' && return 1
  # Danger cues: the mechanism admits it is unsafe to actually use as
  # documented -- not idempotent, corrupts state, must not be re-run, etc.
  # (Deliberately does NOT include a "manual SQL" cue: the expected GOOD
  # phrasing is "no manual SQL required", which contains "manual SQL
  # required" as a substring -- a naive cue there false-positives on every
  # correctly-documented escape. Unsafe-to-re-run is caught by the
  # do-not-run/unsafe/corrupt/duplicate cues below regardless.)
  if printf '%s' "$bootstrap_trim" | grep -qiE '(do[[:space:]]+not[[:space:]]+run|not[[:space:]]+safe|unsafe|not[[:space:]]+idempotent|will[[:space:]]+(corrupt|break|duplicate)|only[[:space:]]+run[[:space:]]+once|never[[:space:]]+re-?run)'; then
    return 1
  fi
  printf '%s' "$bootstrap_trim" | grep -qiE '(first[[:space:]]+user|zero[[:space:]]+user|automatic|seed|invite|CLI|env(ironment)?[[:space:]]+var|migration|bootstrap[[:space:]]+script|idempotent)'
}

# 1-hop: "only <role> ... grant ... <same role>"
direct_self_ref=0
if grep -iqE 'only[[:space:]]+(a|an|the)?[[:space:]]*([A-Za-z][A-Za-z0-9_-]*)\b[^.]*\b(grant|assign|create|approve)\b[^.]*\b\2\b' "$SC_FLAT" 2>/dev/null; then
  direct_self_ref=1
fi

# N-hop: extract every "only <roleA> may/can grant/assign/create/approve
# <roleB> role" statement into a (roleA, roleB) pair -- roleB's grant DEPENDS
# ON already holding roleA. Build a dependency graph (edge: roleB -> roleA)
# and run cycle detection over it: any cycle means every role in it depends,
# transitively, on a role only reachable by already holding a role in the
# SAME cycle -- unbootstrappable. This generalizes the 2-hop mutual-cycle
# case (independent review, 2026-07-09: a 3+-hop chain A->B->C->A was
# previously undetected) to any cycle length.
PAIRS_FILE="$(mktemp -t "sc_pairs.XXXXXX")"
PAIR_PATTERN='only[[:space:]]+(a|an|the)?[[:space:]]*[a-z][a-z0-9_-]*[[:space:]]+(user[[:space:]]+)?(role[[:space:]]+)?(may|can)[[:space:]]+(grant|assign|create|approve)[[:space:]]+(the[[:space:]]+)?[a-z][a-z0-9_-]*[[:space:]]+role'
# `|| true` on the grep is load-bearing under `set -e -o pipefail` (_lib.sh):
# the common case is ZERO matches (most designs don't use this phrasing at
# all), which makes grep exit 1 -- without the guard, pipefail would abort
# the whole validator instead of just meaning "no pairs found".
PAIR_MATCHES="$(tr '[:upper:]' '[:lower:]' < "$SC_FLAT" | grep -oE "$PAIR_PATTERN" || true)"
if [[ -n "$PAIR_MATCHES" ]]; then
  while IFS= read -r m; do
    [[ -z "$m" ]] && continue
    r1=$(printf '%s' "$m" | sed -E 's/^only[[:space:]]+(a |an |the )?([a-z][a-z0-9_-]*).*/\2/')
    r2=$(printf '%s' "$m" | sed -E 's/.*(grant|assign|create|approve)[[:space:]]+(the[[:space:]]+)?([a-z][a-z0-9_-]*)[[:space:]]+role.*/\3/')
    [[ -n "$r1" && -n "$r2" && "$r1" != "$r2" ]] && printf '%s\t%s\n' "$r1" "$r2" >> "$PAIRS_FILE"
  done <<< "$PAIR_MATCHES"
fi

# Cycle detection (DFS, white/gray/black coloring) over the dependency graph
# edge roleB -> roleA (from PAIRS_FILE row "roleA<TAB>roleB", i.e. "only
# roleA may grant roleB"). Reports the first cycle found as "r1 -> r2 -> ...
# -> r1". Pure-POSIX awk (match()/split()/associative arrays only -- no
# gawk-only IGNORECASE/gensub, portable to onetrueawk on stock macOS).
cyclic_chain=""
if [[ -s "$PAIRS_FILE" ]]; then
  cyclic_chain=$(awk -F'\t' '
    { dep[$2] = dep[$2] SUBSEP $1; nodes[$1] = 1; nodes[$2] = 1 }
    END {
      for (n in nodes) color[n] = 0
      for (n in nodes) {
        if (color[n] == 0) {
          result = dfs(n, n)
          if (result != "") { print result; exit }
        }
      }
    }
    function dfs(u, path,    parts, i, cnt, v, r) {
      color[u] = 1
      cnt = split(dep[u], parts, SUBSEP)
      for (i = 1; i <= cnt; i++) {
        v = parts[i]
        if (v == "") continue
        if (color[v] == 1) { return path " -> " v; }
        if (color[v] == 0) {
          r = dfs(v, path " -> " v)
          if (r != "") return r
        }
      }
      color[u] = 2
      return ""
    }
  ' "$PAIRS_FILE" || true)
fi
rm -f "$PAIRS_FILE"

if [[ "$direct_self_ref" -eq 1 ]]; then
  if bootstrap_escape_ok; then
    pass "self-referential grant pattern detected, but a documented bootstrap mechanism escapes the cycle"
  else
    gap "self-referential-permission-gate" "SECURITY_CONTROLS.md documents a self-referential permission gate (a role that can only be granted by itself) with no documented bootstrap mechanism that actually escapes the cycle — how does the FIRST holder of this role ever get created?"
  fi
elif [[ -n "$cyclic_chain" ]]; then
  if bootstrap_escape_ok; then
    pass "circular grant chain detected (${cyclic_chain}), but a documented bootstrap mechanism escapes it"
  else
    gap "self-referential-permission-gate" "SECURITY_CONTROLS.md documents a circular permission gate chain: ${cyclic_chain} — with no documented bootstrap mechanism that actually escapes the cycle, no role in this chain can ever be bootstrapped from zero"
  fi
else
  pass "no self-referential or circular permission gate pattern detected"
fi

# -- 4. RBAC cardinality: union-of-grants, never highest-role-wins ----------
# If the schema stores N roles per principal (many-to-many), enforcement MUST
# compute the union of grants across all roles -- "highest role wins" can
# silently under-grant (or over-grant) a legitimately-held permission.
many_to_many_roles=0
if grep -qiE '(many-to-many|N[[:space:]]+roles|multiple[[:space:]]+roles)[^.]*\brole' "$SC_FLAT" 2>/dev/null; then
  many_to_many_roles=1
fi
if [[ "$many_to_many_roles" -eq 0 && -f "$DB" ]] && grep -qiE '(many-to-many|user_roles|role_assignments|principal_roles)' "$DB" 2>/dev/null; then
  many_to_many_roles=1
fi
if [[ "$many_to_many_roles" -eq 1 ]]; then
  # A line stating the anti-pattern in a NEGATED context (documenting that the
  # design deliberately avoids it, e.g. "never ... highest role wins", or
  # "rejected ... in favor of union of grants") must not itself be flagged as
  # committing the anti-pattern -- exclude lines carrying a negation cue near
  # the match. Independent review (2026-07-09) found "we explicitly rejected
  # a highest role wins approach in favor of union of grants" false-positived
  # because "rejected"/"in favor of" weren't in the original cue list.
  highest_role_wins_line=$(grep -iE '(highest[[:space:]-]+(priority|ranked|rank)[[:space:]]+role|highest[[:space:]]+role[[:space:]]+wins|top[[:space:]]+role[[:space:]]+wins)' "$SC_FLAT" 2>/dev/null \
    | grep -viE '(never|\bnot\b|without|instead of|rather than|avoid|no single|reject|in favor of)' || true)
  if [[ -n "$highest_role_wins_line" ]]; then
    gap "rbac-highest-role-wins" "SECURITY_CONTROLS.md documents a many-to-many role model but enforcement uses 'highest role wins' — this can silently under-grant a permission legitimately held via a lower-priority role (or over-grant, depending on implementation); enforcement MUST compute the union of grants across all of a principal's roles"
  elif grep -qiE 'union[[:space:]]+of[[:space:]]+(grants|permissions|roles)' "$SC_FLAT" 2>/dev/null; then
    pass "RBAC cardinality: many-to-many role model documents union-of-grants enforcement"
  else
    gap "rbac-union-not-documented" "SECURITY_CONTROLS.md documents a many-to-many role model but does not state that permission enforcement computes the union of grants across all roles — add an explicit 'union of grants/permissions' statement (never 'highest role wins')"
  fi
else
  pass "no many-to-many RBAC cardinality found (or single-role model) — union-of-grants rule not applicable"
fi

rm -f "$SC_FLAT"

# -- 5. THREAT_MODEL.md must exist --------------------------------------------
if ! file_exists_nonempty "$TM"; then
  warn "no THREAT_MODEL.md found — skipping threat coverage check"
  validator_exit
fi
pass "THREAT_MODEL.md present"

# -- 6. Every HIGH/CRITICAL threat must have a control entry ------------------
# Extract threat IDs that appear on lines containing CRITICAL or HIGH
high_critical_threats=$(grep -iE '(CRITICAL|HIGH)' "$TM" | grep -oE '(T-[0-9]+|THR-[0-9]+|THREAT-[0-9]+|T[0-9]+)' | sort -u || true)

if [[ -n "$high_critical_threats" ]]; then
  covered=0
  missing=0
  while IFS= read -r threat_id; do
    [[ -z "$threat_id" ]] && continue
    if grep -qi "$threat_id" "$SC" 2>/dev/null; then
      pass "$threat_id covered in SECURITY_CONTROLS.md"
      covered=$((covered + 1))
    else
      gap "uncovered-threat" "HIGH/CRITICAL threat $threat_id not addressed in SECURITY_CONTROLS.md"
      missing=$((missing + 1))
    fi
  done <<< "$high_critical_threats"
  note "threat coverage: $covered covered, $missing missing"
else
  pass "no HIGH/CRITICAL threats found in THREAT_MODEL.md (or no threat IDs with T-NN format)"
fi

# -- 7. DATABASE.md must have a security section ------------------------------
if file_exists_nonempty "$DB"; then
  if grep -qiE '(## [Ss]ecurity|## [Ee]ncryption|[Ss]ecurity[[:space:]]+[Cc]ontrols|[Ee]ncryption[[:space:]]+[Aa]t[[:space:]]+[Rr]est|[Ss]ensitive[[:space:]]+[Ff]ields|[Aa]ccess[[:space:]]+[Cc]ontrol)' "$DB"; then
    pass "DATABASE.md has security/encryption section"
  else
    gap "db-missing-security" "docs/DATABASE.md has no security section — add encryption-at-rest, sensitive fields, and access control notes from SECURITY_CONTROLS.md"
  fi
else
  warn "docs/DATABASE.md not found — skipping database security check"
fi

# -- 8. API_DESIGN.md must have a security section ----------------------------
API="$ROOT/docs/API_DESIGN.md"
if file_exists_nonempty "$API"; then
  if grep -qiE '(## [Ss]ecurity|[Rr]ate[[:space:]]+[Ll]imit|[Ii]nput[[:space:]]+[Vv]alid|[Aa]uth[[:space:]]+[Rr]equirement|[Cc]SRF|[Cc]ors[[:space:]]+[Pp]olicy)' "$API"; then
    pass "API_DESIGN.md has security section"
  else
    gap "api-missing-security" "docs/API_DESIGN.md has no security section — add rate limits, input validation, and auth requirements from SECURITY_CONTROLS.md"
  fi
else
  warn "docs/API_DESIGN.md not found — skipping API security check"
fi

# -- 9. ARCHITECTURE.md must reference security controls ----------------------
ARCH="$ROOT/docs/ARCHITECTURE.md"
if file_exists_nonempty "$ARCH"; then
  if grep -qiE '(SECURITY_CONTROLS|[Ss]ecurity[[:space:]]+[Cc]ontrol|[Tt]hreat[[:space:]]+[Mm]itigation|[Ss]ecurity[[:space:]]+[Aa]rchitecture)' "$ARCH"; then
    pass "ARCHITECTURE.md references security controls"
  else
    gap "arch-missing-security" "docs/ARCHITECTURE.md does not reference security controls or mitigations — add a Security Architecture section citing SECURITY_CONTROLS.md"
  fi
else
  warn "docs/ARCHITECTURE.md not found — skipping architecture security check"
fi

validator_exit
