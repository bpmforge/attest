# Attack Chains — 2026-09-23

## C-1: SSRF to metadata credentials

A10 SSRF (yields: internal network reach) -> cloud metadata endpoint (requires: internal reach, yields: IAM credentials). Severity: CRITICAL.
