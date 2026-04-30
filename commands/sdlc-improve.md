---
description: "Audit and improve an existing system. Run audits across UX/perf/security/code-quality, synthesize a prioritized backlog, then route fixes through the SDLC pipeline."
---

Audit and improve this system following the SDLC Lead agent **Mode 4** methodology.

Optional focus: `{{focus}}` — leave empty for whole-app audit, or pass one of:
`ux`, `frontend`, `backend`, `feature:<name>`, `performance`, `security`, `code-quality`, `all` (default).

## What this does

1. **Improvement Discovery Interview** — captures the user's vision, change tolerance, and any specific complaints (presents all questions at once, waits for answers).
2. **Context check** — reuses Mode 2 onboarding docs if present; otherwise runs a lightweight landscape scan.
3. **Discovery audit** — single pre-pass against the running app to spot obvious problems and scope the specialist audits.
4. **Specialist audits (HANDOFFs)** — UX, code quality, performance, security, database. Each runs in its own session and writes a focused audit report to `docs/improve/`.
5. **Vision research** (optional) — if the user gave a specific desired state ("feel like Linear", "10x traffic"), researcher returns a phased path to get there.
6. **Synthesize improvement backlog** — dedupes findings, sizes them S / M / L, ranks by severity.
7. **Prioritization review** — present backlog to user, get approval before any code change.
8. **Execute approved items**:
   - **Size S** — implementation checkpoint in current session.
   - **Size M / L** — HANDOFF to `coding-agent` (or domain specialist) with the audit finding as the spec.
   - **Architectural change** — spawn a Mode 3 (`/sdlc feature`) sub-workflow.
9. **Verify** — re-run the specialist who found each issue against the fixed code.

## When to use

- After `/sdlc onboard` completes and the user wants a health check or targeted improvements.
- When the user says: "review the product for gaps", "what could we improve", "audit this", "make it better", "the UI looks bad", "this is slow", or anything that asks for evaluation rather than new functionality.
- When prior audit reports exist in `docs/improve/` and the user wants to act on them.

## What it does NOT do

- It does not add new features. Use `/sdlc feature` for new functionality.
- It does not write code directly. Findings are routed to `coding-agent` or domain specialists via HANDOFF.
- It does not skip the discovery interview — every Mode 4 run starts with one.

## Output

- `docs/improve/SYSTEM_SNAPSHOT.md` — tech stack and UI-bearing flag
- `docs/improve/IMPROVE_CONTEXT.md` — confirmed Discovery Interview answers
- `docs/improve/DISCOVERY_PRE.md` — pre-audit live-app scan (if applicable)
- `docs/improve/{UX,CODE_QUALITY,PERFORMANCE,SECURITY,DATABASE}_AUDIT.md` — per-specialist findings
- `docs/improve/RESEARCH_VISION_<date>.md` — vision research (if applicable)
- `docs/improve/IMPROVEMENT_BACKLOG.md` — prioritized, sized backlog
- `docs/improve/EXECUTION_PLAN.md` — user-approved items + order
- `docs/improve/VERIFY_ITEM_<n>.md` — per-item verification reports

See `agents/sdlc-improve-mode.md` for the full step-by-step workflow.
