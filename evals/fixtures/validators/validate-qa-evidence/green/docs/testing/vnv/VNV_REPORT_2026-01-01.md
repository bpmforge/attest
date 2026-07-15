# V&V Report — Example App — 2026-01-01
**URL:** http://localhost:3000/ | **Verdict:** VALIDATED-WITH-DEFECTS (1)
**Evidence bundle:** docs/testing/vnv/evidence/2026-01-01/ (trace.zip, home.png)

## Exit-criteria scorecard
| Criterion | Target | Result |
|---|---|---|
| P0 journeys passing | 100% | ✅ |
| AA contrast failures | 0 | ❌ 1 |
| Runtime errors (non-allowlisted) | 0 | ✅ 0 |

## Traceability matrix (requirement → test → evidence)
| Req | Test | Type | Result | Evidence |
|---|---|---|---|---|
| AC-1 | e2e/login | V | PASS | evidence/2026-01-01/trace.zip |
| REQ-2 contrast | contrast scan | V | FAIL | evidence/2026-01-01/home.png |

## Layout & visual findings
| # | Defect | Measured | Severity |
|---|---|---|---|
| VNV-001 | metadata below AA contrast | #828282 on #f6f6ef = 3.54:1 | S3 |

## Journey findings
| Journey | Steps | Result | Trace |
|---|---|---|---|
| Sign in | 3 | ✅ PASS | trace.zip |

## Runtime error findings
0 non-allowlisted runtime errors across the journey.
