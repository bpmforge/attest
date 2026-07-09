# Fix Backlog — Release

T22.19 fixture: a genuinely closed CRITICAL/HIGH row (real justification
text after WAIVED) plus a row whose description merely contains
"HIGHLIGHTED"/"HIGH_RISK" as substrings — neither is the whole word HIGH,
so this row must not be mistaken for an open CRITICAL/HIGH item. Proves the
whole-word fix doesn't over-match on adjacent substrings.

| ID | Severity | Description | Status | Justification |
|----|----------|--------------|--------|----------------|
| F-1 | HIGH | Missing rate limit on login endpoint | WAIVED | Accepted by security lead, tracked in SEC-42 |
| F-2 | LOW | HIGH_RISK_NOTE: item is HIGHLIGHTED in the doc but severity was downgraded | OPEN | |
