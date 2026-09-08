#!/usr/bin/env bash
# Proves the new matcher: POSITIVE cases must match, NEGATIVE must NOT.
# Sources the REAL matcher. This file used to carry its own copy, which meant
# it could not fail when the product changed — only when the copy did.
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_scope-match.sh"

p=0;f=0
chk(){ local want="$1" scope="$2" path="$3"
  if matches_scope "$path" "$scope"; then got=MATCH; else got=NOMATCH; fi
  if [[ "$got" == "$want" ]]; then p=$((p+1)); printf "  ok   %-8s %-46s %s\n" "$want" "$scope" "$path"
  else f=$((f+1)); printf "  FAIL want=%-8s got=%-8s %-40s %s\n" "$want" "$got" "$scope" "$path"; fi; }

echo "=== POSITIVE: previously-broken forms must now match ==="
chk MATCH "apps/web/src/features/mitigations/**" "apps/web/src/features/mitigations/MitigationDetail.tsx"
chk MATCH "docs/reviews/**"                      "docs/reviews/CODE_REVIEW_RDSAD-421.md"
chk MATCH "apps/api/src/features/diagrams/*.test.ts" "apps/api/src/features/diagrams/diagram-service.test.ts"
chk MATCH "docs/integrations/iriusrisk/**library**"  "docs/integrations/iriusrisk/library-import-discovery.md"
chk MATCH "apps/web/e2e/**connector**"           "apps/web/e2e/connector-editing.spec.ts"
echo "=== POSITIVE: existing literal/prefix behaviour preserved ==="
chk MATCH "apps/api/src/http/routes/diagrams.ts" "apps/api/src/http/routes/diagrams.ts"
chk MATCH "docs/reviews"                         "docs/reviews/X.md"
echo "=== NEGATIVE: must NOT become permissive ==="
chk NOMATCH "apps/web/src/features/mitigations/**" "apps/api/src/features/diagrams/diagram-service.ts"
chk NOMATCH "apps/api/src/features/diagrams/*.test.ts" "apps/api/src/http/routes/diagrams.ts"
chk NOMATCH "apps/api"                            "apps/api-other/secret.ts"
chk NOMATCH "docs/reviews/**"                     "apps/api/src/server.ts"
chk NOMATCH "**"                                  "apps/api/src/server.ts"
chk NOMATCH "*"                                   "package.json"
echo "=== NEGATIVE: an UNANCHORED pattern names no path and authorises nothing ==="
# Each of these matched "src/auth/session.ts" before 2026-09-08, i.e. every
# nested path in the repository, while only the two literals above were refused.
chk NOMATCH "**/*"                                "src/auth/session.ts"
chk NOMATCH "*/**"                                "src/auth/session.ts"
chk NOMATCH "*/*"                                 "src/auth/session.ts"
chk NOMATCH "?*/**"                               "src/auth/session.ts"
chk NOMATCH "[a-z]*/**"                           "src/auth/session.ts"
chk NOMATCH "*.ts"                                "vendor/other/thing.ts"
chk NOMATCH "apps/web/**/../../../etc/passwd"     "etc/passwd"
chk NOMATCH "apps/web/e2e/**connector**"          "apps/api/src/features/diagrams/diagram-service.ts"
echo; echo "passed=$p failed=$f"; [[ $f -eq 0 ]]
