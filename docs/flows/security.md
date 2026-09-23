# Security Flow — `/security`

_How a security audit runs: specialist waves, the attack chainer, the challenger gate, and the verified fix loop._

Source of truth: `agents/security-auditor.md` (coordinator), `agents/security/*.md` (specialists), `skills/security/SKILL.md`, `agents/shared/RALPH_WIGGUM_LOOP.md`, `agents/shared/FIX_VERIFY_LOOP.md`.

## Modes

| Invocation | What runs | Time |
|------------|-----------|------|
| `/security` or `/security --quick` | Wave 1 + OWASP Web; challenger if any HIGH/CRITICAL | ~10 min |
| `/security --deep` | All four waves, then `run-coverage-loop.sh security-deep` until every OWASP category is covered (max 3 iterations) | ~45–90 min |
| `/security --fix` | The audit (quick unless combined with `--deep`), then the verified fix loop | audit + fixes |
| `/security --deep --fix` | Exhaustive find-and-fix | longest |

## Full audit — specialist waves

```mermaid
flowchart TD
    Start(["/security"]) --> P0["Phase 0 - read ARCHITECTURE, README, entry points; announce plan"]
    P0 --> Mode{Depth}
    Mode -->|quick, default| QW1
    Mode -->|--deep| W1

    subgraph Quick [Quick mode]
        QW1["Wave 1: semgrep-runner, secrets-scanner, dependency-auditor"] --> QW2[owasp-web-checker]
    end

    subgraph Deep [Deep mode]
        W1["Wave 1 parallel: semgrep-runner, secrets-scanner, dependency-auditor"] --> W2
        W2["Wave 2 parallel: owasp-web-checker, owasp-llm-checker if LLM code"] --> W3
        W3["Wave 3 parallel: threat-modeler, cloud-security-checker if cloud SDKs, iac-security-checker if IaC"] --> W4
        W4["Wave 4: attack-chainer reads every FINDINGS file"]
    end

    QW2 --> Report
    W4 --> Report["Phase 5: coordinator writes docs/security/final-report.md"]
    Report --> HC{HIGH or CRITICAL?}
    HC -->|yes, or any deep run| Chal["challenger: CHALLENGE_REPORT_security_date.md"]
    HC -->|no, quick| Out([Completion output])
    Chal --> DeepQ{--deep?}
    DeepQ -->|no| Out
    DeepQ -->|yes| Loop["run-coverage-loop.sh security-deep"]
    Loop --> Cov{Clean?}
    Cov -->|yes| Out
    Cov -->|"gaps, under 3 rounds"| ReScan[Re-run the uncovered OWASP categories]
    ReScan --> Loop
    Cov -->|3 rounds or no change| Esc[Escalate]
```

Specialists are always dispatched in fresh context. That's Executor A (subagents, parallel within a wave) when a task tool exists, and Executor B (`opencode run` subprocesses, run one after another) when it doesn't. The coordinator never runs a specialist inline: scan output is the largest tool output in the system and would flood the session.

## Who produces what

| Wave | Specialist | Runs when | Output in `docs/security/` |
|------|------------|-----------|----------------------------|
| 1 | `semgrep-runner` (Opengrep + bpm-rulepacks) | always | `SEMGREP_FINDINGS_<date>.md` |
| 1 | `secrets-scanner` | always | `SECRETS_FINDINGS_<date>.md` |
| 1 | `dependency-auditor` | always | `DEPENDENCY_FINDINGS_<date>.md` |
| 2 | `owasp-web-checker` | always | `OWASP_WEB_FINDINGS_<date>.md`, `OWASP_TRACKER.md` |
| 2 | `owasp-llm-checker` | LLM code detected | `LLM_FINDINGS_<date>.md` |
| 3 | `threat-modeler` | deep | `THREAT_MODEL_FINDINGS_<date>.md`, `docs/design/THREAT_MODEL.md` |
| 3 | `cloud-security-checker` | cloud SDKs detected | `CLOUD_FINDINGS_<date>.md` |
| 3 | `iac-security-checker` | Terraform/CDK/Pulumi/CFN detected | `IaC_FINDINGS_<date>.md` |
| 4 | `attack-chainer` | deep, last | `ATTACK_CHAINS_<date>.md` |
| 5 | coordinator | always | `final-report.md` |
| gate | `challenger` | HIGH/CRITICAL found | `docs/reviews/CHALLENGE_REPORT_security_<date>.md` |

Every finding uses `agents/security/FINDING_SCHEMA.md`, which records **preconditions** and **yields**. The attack chainer links one finding's yield to another finding's precondition to build multi-step exploit paths. A chain is rated above the severity of any single finding in it.

## How attack chaining works

```mermaid
flowchart LR
    A["Finding A - yields: session token"] --> B["Finding B - requires: session token, yields: admin role"]
    B --> C["Finding C - requires: admin role, yields: data export"]
    C --> Chain["Chain rated CRITICAL even if A, B, C are each MEDIUM"]
```

Findings the chainer marks `reachable: false` (dead code) are reported but skipped by the fix loop unless you ask for them.

## Fix mode — verified remediation loop

```mermaid
flowchart TD
    Audit[Run audit - produces final-report.md] --> Triage["Triage: fix floor CRITICAL + HIGH, skip reachable false"]
    Triage --> Backlog["SECURITY_FIX_BACKLOG_date.md - each row has an observable re-verify criterion"]
    Backlog --> Snap["fix-verify.mjs snapshot semgrep"]
    Snap --> Code["coding-agent: one HANDOFF per logical fix group"]
    Code --> Verify["fix-verify.mjs verify semgrep --floor ERROR"]
    Verify --> Res{Finding gone and nothing new?}
    Res -->|yes| Closed[CLOSED]
    Res -->|no, under 3 cycles| Code
    Res -->|no after 3 cycles| Open[Left OPEN with a note]
    Code -.->|"touches auth, crypto or input validation, under 90 percent sure"| Human[DEFERRED for human review]
    Closed --> Rep["SECURITY_FIX_REPORT_date.md"]
    Open --> Rep
    Human --> Rep
```

A fix is closed only when the re-scan shows it's gone. A diff that looks right doesn't count, and a fix that introduces a new finding isn't a fix.

## Where security runs in the lifecycle

```mermaid
flowchart LR
    P3["Phase 3 design: security-auditor writes THREAT_MODEL.md + SECURITY_CONTROLS.md"] --> P4
    P4["Phase 4: conductor adds a security reviewer when the diff touches auth"] --> P4R
    P4R["Phase 4 review fan-out: security-auditor alongside code, perf, ux"] --> P5
    P5["Phase 5: release gate - zero open CRITICAL/HIGH"]
    OB["Onboard Step 6: SECURITY_SCAN_date.md"] -.-> P5
    IM["/sdlc improve security: targeted audit"] -.-> P5
```

Design-time threat models must explicitly assess three bootstrap and authority archetypes listed in `security-auditor.md`, each either mitigated or ruled N/A with a reason: **bootstrap-authority** (no safe way to create the first privileged user), **self-referential permission gate** (a role only that role can grant), and **RBAC highest-role-wins** (N roles per principal, but enforcement picks one role instead of the union of grants).

## Known gaps (as of 2026-09-23)

These are mismatches between the skill and the coordinator, recorded here and not yet fixed:

1. **`--deep` exists only in the skill.** `skills/security/SKILL.md` and `RALPH_WIGGUM_LOOP.md` define deep mode and its `security-deep` coverage loop. `agents/security-auditor.md` has a Quick Mode section and a Fix Mode section but no Deep Mode section, and it never says which flag selects the full four-wave run. The deep row in the diagram above is the intended behavior, assembled from the skill.
2. **The focused flags aren't implemented.** The skill lists `--threat-model`, `--owasp` and `--deps`. The coordinator doesn't mention any of them.
3. **Legacy output name.** `agents/security/OWASP_METHODOLOGY.md` Phase 5b still writes `docs/security/attack-chains.md`. The coordinator and `attack-chainer` write `ATTACK_CHAINS_<date>.md`.
