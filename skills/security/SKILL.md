---
name: security
description: 'OWASP audit, threat modeling, CVE/dependency scanning. Supports --quick (default, ~10 min) and --deep (Ralph Wiggum: exhaustive OWASP x SAST rules x iterative attack chain, ~45-90 min). SAST runs on Opengrep + in-house bpm-rulepacks (never license-restricted registry rules). Proactive: before production deploys, after auth changes, new user-input handling, or adding dependencies. NOT for code quality — use /review-code.'
---

# Security Audit

Load and follow the instructions in the `security-auditor` agent.

Performs a professional security assessment following OWASP, NIST, and industry-standard frameworks.

## Depth flags

| Flag | Scope | Time |
|------|-------|------|
| `/security` / `/security --quick` | Phases 1-3: understand, automated scan, one-pass OWASP | ~10 min |
| `/security --deep` | Full Ralph Wiggum loop (see `agents/shared/RALPH_WIGGUM_LOOP.md`): every OWASP category iterated to confidence >= 7, every custom SAST rule file walked (Opengrep + bpm-rulepacks), iterative attack-chain until stable. Blocks until `~/.config/opencode/scripts/validators/run-coverage-loop.sh security-deep` exits clean (**the wrapper, not the bare gate** — it counts iterations in `docs/work/COVERAGE_LOOP_security-deep_<date>.md`, caps at 3, and halts immediately on exit 3 when a round changes nothing). This file used to name `validate-phase-gate.sh` here while calling itself a Ralph Wiggum loop: same validators, no counter, so an OWASP category that would not converge iterated until a human noticed. | ~45-90 min |

## Fix mode

- `/security --fix` — audit, then drive a **verified fix loop**: build a fix backlog (CRITICAL+HIGH by default), dispatch coding-agent to remediate, and **re-scan to confirm each finding is actually closed** before marking it fixed (per `agents/shared/FIX_VERIFY_LOOP.md`). Findings in dead/unreachable code are skipped (not exploitable). Combine with `--deep` for an exhaustive find-and-fix pass: `/security --deep --fix`. Anything whose fix changes auth/crypto/input behavior is flagged for human review, not silently applied.

## Focused modes

- `/security --threat-model` — STRIDE threat analysis
- `/security --owasp` — OWASP vulnerability scan only (skip threat model / deps)
- `/security --deps` — Dependency vulnerability audit only

Combine flags: `/security --deep --owasp` runs deep mode on OWASP surface only.

## Workflow

Understand → Research → Plan → Execute → Verify → Report

In `--deep` mode, the Plan-Execute-Verify loop iterates per Ralph Wiggum until every row of the inventory (OWASP category, SAST rule file, attack-chain pattern) is covered.

## Output

- `docs/security/OWASP_TRACKER.md` — per-category confidence tracker
- `docs/security/attack-chains.md` — multi-step exploit chains
- `docs/security/final-report.md` — findings with severity, file:line, evidence, remediation

## When to pick deep

- Before a production deploy to a security-sensitive environment
- Before a compliance audit (SOC2, PCI, HIPAA)
- After adding auth, session, authorization, user-input, file-upload, SQL, crypto, or external-API-with-credentials surfaces
- When a CVE drops on a dependency you use and you want to confirm reachability + no chains

Reference documents available in `references/`: owasp-checklist.md, severity-matrix.md, report-template.md.
