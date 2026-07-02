---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Autonomy Protocol — make the by-design pauses opt-out

The expert system is deliberately human-in-the-loop: it pauses at gates, backlog approvals,
inter-phase check-ins, and manual HANDOFF pastes. That is correct for interactive work and
**wrong for unattended runs**. This protocol adds an autonomy level so the *by-design* pauses
become opt-out — with an audit trail and a hard NEVER-AUTO list that always pauses. (It does
not touch the *accidental* pauses — those are `PERSISTENCE.md` + the O0 config/plugins.)

## Source of truth

`docs/work/.model-context` carries an `autonomy:` key, written by
`scripts/detect-model-context.sh`:

```
autonomy=interactive   # default — every existing pause behaves exactly as written
autonomy=auto          # gated pauses take the documented default + log, then continue
```

Set it by: an `AGENTS.md` / `CLAUDE.md` line `autonomy: auto`, the env var
`OPENCODE_AUTONOMY=auto`, or editing `.model-context`. **Default is `interactive`** — zero
behavior change unless opted in.

## The two levels

- **`interactive`** — read a gate's existing "wait for the user" / "get approval first" text and
  follow it. Nothing changes.
- **`auto`** — at each *gated* pause point: (1) take the **documented default action** for that
  gate (table below), (2) append one line to `docs/work/APPROVALS.md`, (3) continue. Never sit
  and wait. The ledger is the audit trail — Foreman's approval-queue semantics as prose + a file.

APPROVALS.md line format:

```
| when | gate | default taken | what the user would have been asked |
```

## Per-gate defaults (auto mode)

| Gate type | Documented default in auto |
|---|---|
| Human Gate A/B (phase 2→3, 3.5→4) | Advance to the next phase; log |
| Inter-phase check-in ("do not auto-continue") | Continue to the next step; log |
| Phase "do NOT auto-advance" | Advance; log |
| Backlog approval (improve mode) | Execute CRITICAL + HIGH items; defer the rest to the backlog; log |
| Wave-mode question (parallel vs sequential) | Sequential, unless `plan.json` modules are collision-free (`validate-tickets.sh` clean); log |
| Fix-then-proceed prompts | Fix, then proceed; log |
| Ralph loop 3-cap exhaustion | Route to the named specialist (option C) if one is named; else record a waiver and continue; log |
| Fix-Verify 3-cap exhaustion | Defer — log the finding to `FIX_BACKLOG` as deferred; continue; log |

## NEVER-AUTO — pause even in `auto` (enumerated; validators grep this table)

| # | Site / class | Why it always pauses |
|---|---|---|
| 1 | Discovery / Feature / Design interviews (`sdlc-lead` discovery, feature-mode questions) | These ARE user input — there is no "default" to take |
| 2 | Destructive DB ops — migrations flagged DANGEROUS, data deletion | Irreversible |
| 3 | Merges to `main`, releases, tags, deploys | Outward-facing / irreversible |
| 4 | Tech-stack additions (coding-agent Law 4 deviation) | Changes the approved design surface |
| 5 | Security fixes that change auth / crypto / input behavior (`security-auditor`) | Behavior-changing; needs human review |
| 6 | Scope-boundary blocks (`SCOPE_BOUNDARY.md`) | The task was mis-routed; proceeding would be wrong work |
| 7 | `BOUNDED_TASK` Rule-9 escalation after 3 failures **when no documented default exists** | Nothing safe to auto-pick |

A site is "gated" if it appears in the per-gate table; a site in the NEVER-AUTO table pauses in
both levels. Every pause site in `agents/**` must be one or the other (enforced by
`validate-autonomy-wiring.sh`).

## Wiring

Referenced from `PHASE_ROUTING_PROTOCOL.md` (the routing spine) and `sdlc-lead.md` (start
sequence). Each pause site carries an inline autonomy line: *"If `autonomy: auto` per
`AUTONOMY_PROTOCOL.md` and not NEVER-AUTO: take the documented default, log to APPROVALS.md,
continue. Otherwise: &lt;existing text&gt;."* — or is marked **NEVER-AUTO**.
