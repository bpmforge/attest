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

APPROVALS.md line format (T27.5 — machine-parseable; validated by
`validate-autonomy-ledger.sh`):

```
| timestamp | pause_site_id | default_taken | signed_by | what the user would have been asked |
```

- `timestamp` — UTC, `date -u +%Y-%m-%dT%H:%M:%SZ`.
- `pause_site_id` — one of the stable ids below (`G-1`..`G-8` gated, `NA-1`..`NA-7` NEVER-AUTO).
  A typo'd or invented id is itself a gap — the validator cross-references this table.
- `default_taken` — the action actually taken (free text, matches the per-gate default).
- `signed_by` — `auto` for an ordinary gated row (the agent took the documented default itself,
  no human involved — that's the whole point of auto mode). For a `NA-*` row, `auto` is a
  contradiction in terms: **NEVER-AUTO sites always pause**, so if one made it into the ledger
  at all, a human made the actual call — `signed_by` must name that person (same blocklist as
  `waive-gate.sh`: not `agent`/`claude`/`ai`/`assistant`/`system`/`bot`/`llm`/`gpt`/`model`/
  `opencode`, case/whitespace-insensitive).

## Per-gate defaults (auto mode)

| id | Gate type | Documented default in auto |
|---|---|---|
| G-1 | Human Gate A/B (phase 2→3, 3.5→4) | Advance to the next phase; log |
| G-2 | Inter-phase check-in ("do not auto-continue") | Continue to the next step; log |
| G-3 | Phase "do NOT auto-advance" | Advance; log |
| G-4 | Backlog approval (improve mode) | Execute CRITICAL + HIGH items; defer the rest to the backlog; log |
| G-5 | Wave-mode question (parallel vs sequential) | Sequential, unless `plan.json` modules are collision-free (`validate-tickets.sh` clean); log |
| G-6 | Fix-then-proceed prompts | Fix, then proceed; log |
| G-7 | Ralph loop 3-cap exhaustion | Route to the named specialist (option C) if one is named; else record a waiver and continue; log |
| G-8 | Fix-Verify 3-cap exhaustion | Defer — log the finding to `FIX_BACKLOG` as deferred; continue; log |

## NEVER-AUTO — pause even in `auto` (enumerated; validators grep this table)

| id | Site / class | Why it always pauses |
|---|---|---|
| NA-1 | Discovery / Feature / Design interviews (`sdlc-lead` discovery, feature-mode questions) | These ARE user input — there is no "default" to take |
| NA-2 | Destructive DB ops — migrations flagged DANGEROUS, data deletion | Irreversible |
| NA-3 | Merges to `main`, releases, tags, deploys | Outward-facing / irreversible |
| NA-4 | Tech-stack additions (coding-agent Law 4 deviation) | Changes the approved design surface |
| NA-5 | Security fixes that change auth / crypto / input behavior (`security-auditor`) | Behavior-changing; needs human review |
| NA-6 | Scope-boundary blocks (`SCOPE_BOUNDARY.md`) | The task was mis-routed; proceeding would be wrong work |
| NA-7 | `BOUNDED_TASK` Rule-9 escalation after 3 failures **when no documented default exists** | Nothing safe to auto-pick |

A site is "gated" if it appears in the per-gate table; a site in the NEVER-AUTO table pauses in
both levels. Every pause site in `agents/**` must be one or the other (enforced by
`validate-autonomy-wiring.sh`).

## Ledger verification (T27.5) — what it checks and what it can't

`validate-autonomy-ledger.sh` checks `docs/work/APPROVALS.md` itself: every row is
well-formed, every `pause_site_id` is a real id from the tables above (not a typo or an
invented one), and every `NA-*` row is human-signed per the blocklist above. That's a real
tripwire — it catches a *recorded* NEVER-AUTO action that got auto-defaulted or self-signed by
an agent instead of genuinely reviewed.

It is **not** independent proof that every NEVER-AUTO action which actually happened got
logged at all — there is no run-journal or execution trace in this repo today that records
"which gate sites a session traversed" separately from the ledger the session itself writes
(the same file the tripwire checks). An unlogged action is invisible to a static-file check by
construction. Closing that residual gap needs an out-of-process traversal record — a Conductor
that runs gates from outside the agent and journals what it dispatched — which is out of scope
here and belongs to M28, not this validator.

It is also, like `waive-gate.sh`'s signer blocklist, a deterrent against a sloppy/eager agent
self-signing or auto-defaulting a `NA-*` row — not a security boundary against a determined
adversary. A fabricated human-sounding name in `signed_by` (any string not on the blocklist)
passes the check cleanly; comprehensively verifying "is this really a human" is a different,
harder problem this validator doesn't attempt.

## Wiring

Referenced from `PHASE_ROUTING_PROTOCOL.md` (the routing spine) and `sdlc-lead.md` (start
sequence). Each pause site carries an inline autonomy line: *"If `autonomy: auto` per
`AUTONOMY_PROTOCOL.md` and not NEVER-AUTO: take the documented default, log to APPROVALS.md,
continue. Otherwise: &lt;existing text&gt;."* — or is marked **NEVER-AUTO**.
