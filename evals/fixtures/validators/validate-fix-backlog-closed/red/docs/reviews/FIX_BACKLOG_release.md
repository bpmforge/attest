# Fix Backlog — Release

T22.19 fixture: the waived-justification check depends on whole-word "\b"
matching inside awk (`/\b(CRITICAL|HIGH)\b/`). Stock macOS system awk
(onetrueawk) treats \b as a no-op, so before the T22.19 fix this row
produced zero gaps despite being a genuine WAIVED row with no justification.

| ID | Severity | Description | Status |
|----|----------|--------------|--------|
| F-1 | HIGH | Missing rate limit on login endpoint | WAIVED |
