---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Executor Selection — how a HANDOFF actually runs

The HANDOFF document is the delegation contract everywhere. What varies by
runtime and version is the **executor** — the mechanism that runs it. Pick by
capability flags, not by assumptions baked into prose.

## The flags

`docs/work/.model-context` (written by `scripts/detect-model-context.sh`):

```
has_task_tool=true|false       # runtime has a blocking Task/subagent tool
mcp_in_subagents=true|false    # Task-tool subagents can execute MCP tools
opencode_cli=true|false        # the `opencode` CLI is on PATH → Executor B is available
autonomy=interactive|auto      # AUTONOMY_PROTOCOL — auto must never emit a paste-and-wait
```

Env overrides: `OPENCODE_HAS_TASK_TOOL`, `OPENCODE_MCP_IN_SUBAGENTS`, `OPENCODE_AUTONOMY`.
If `.model-context` is missing, run the detect script; if you cannot, assume
`has_task_tool=false`, `opencode_cli=false`, `autonomy=interactive`.

## The three executors

| | Executor | When |
|---|---|---|
| **A** | **Native Task tool** — dispatch the full HANDOFF block as the subagent prompt; block until the Completion Manifest returns | `has_task_tool=true` AND the specialist needs no MCP tools (or `mcp_in_subagents=true`) |
| **B** | **Subprocess** — `tools/task.ts` spawns `opencode run --agent <x> --dir <workcopy>` with the HANDOFF as prompt | `opencode_cli=true` and not already inside a subprocess-spawned session — whenever the CLI exists B is preferred over C because it removes the manual-paste pause. Required (not just preferred) when the specialist needs MCP tools and `mcp_in_subagents=false`. A fresh process is a primary session with full MCP access; the only programmatic path with timeout protection. **Always pass an explicit `--dir <workcopy>`** (eval-harness isolation lesson) so parallel B dispatches don't collide. |
| **C** | **Manual HANDOFF paste** — print the HANDOFF block as text; the user opens a new session, types the skill, pastes | `has_task_tool=false` AND `opencode_cli=false` (no programmatic path), or A/B failed twice, or the user asked to run specialists interactively. **In `autonomy=auto`, C is an error** — auto mode must never emit a paste-and-wait; degrade to D (inline) and log to `docs/work/APPROVALS.md`. |
| **D** | **Inline** — the coordinator reads the specialist's own agent file and runs its methodology in the same conversation, writing the specialist's output files before continuing | the specialist has **no user-facing `/skill`** AND `has_task_tool=false` AND `opencode_cli=false` — so A is unavailable, B has no CLI to spawn, and C is impossible (there is no slash to paste into). Genuinely headless/no-CLI runtimes only — **never the TUI**, where `opencode_cli=true` makes B available; see "TUI mode" below. |

## Selection order & matrix

Pick the **first** viable executor: **A → B → C**, and **→ D** for skill-less specialists that
can't be pasted. B is now preferred over C whenever `opencode_cli=true` — the manual paste is
the biggest structural pause, and a subprocess removes it.

| has_task_tool | opencode_cli | autonomy | specialist | → executor |
|---|---|---|---|---|
| true | any | any | native-tools only | **A** |
| true | true | any | needs MCP (`mcp_in_subagents=false`) | **B** |
| false | true | any | any | **B** (subprocess) |
| false | false | interactive | has a `/skill` | **C** (paste) |
| false | false | interactive | skill-less | **D** (inline) |
| false | false | **auto** | any | **D** (inline) — C is forbidden in auto; log to APPROVALS.md |
| false | false | **auto** | needs the user (NEVER-AUTO) | pause anyway (per AUTONOMY_PROTOCOL) |

Key cases: **auto + no task tool + CLI → B**; **auto + nothing → D** (never a paste-and-wait).

## TUI mode (T30.10)

In the opencode TUI, `opencode_cli` is always true — you ARE opencode — so
Executor B (`opencode run` subprocess) is always available as a fallback when A
doesn't apply. That makes the general matrix's "no task tool + CLI → B" row the
one that actually governs the TUI, not the skill-less-specialist "→ D" carve-out
below: **D (inline) must never be used for a scan-heavy or otherwise tool-heavy
specialist in the TUI**, even for specialists with no `/skill`. The `security/*`
micro-agents note under Executor D's row predates subprocess dispatch parity
(#20059, fixed v1.17.9) — read it as "headless/no-CLI runtimes only," not as
TUI guidance. Full rationale and the companion checkpoint/scan-output rules:
`agents/shared/TUI_SESSION_HYGIENE.md`.

## Which specialists need MCP

Needs MCP (route to B or C while `mcp_in_subagents=false`): **researcher**
(playwright-search), anything calling **memory** tools mid-task, **coding-agent**
when Context7 verification is required.

Native-tools only (A is fine): all security/code-review/performance/onboard
micro-agents — they read files, run bash, write findings.

## Rules regardless of executor

1. The HANDOFF block content is IDENTICAL across A/B/C — same `════` delimiters, ROLE, CONTEXT, WRITE-SCOPE, PRODUCE, VERIFY, Completion Manifest, completion phrase. Executor D carries the same *intent* but sources ROLE / WRITE-SCOPE / VERIFY from the specialist's own agent file (which the coordinator loads), so its dispatch may be terse — per-invocation task focus, output path, and completion phrase only. This terseness is sound ONLY because a skill-less specialist can never take the standalone paste path (C); if such a specialist ever gains a `/skill`, promote its dispatch to a full A/B/C block.
2. Score the returned manifest the same way (GATE_SCORING_PROTOCOL) whether it came from a tool result or a pasted reply.
3. A dispatch that hangs or errors twice → drop to the next executor down (A → B → C, or → D for skill-less specialists that cannot be pasted), note it in DELEGATION_LOG.md.
4. Announce every dispatch (specialist + one-line task) and report its verdict — subagents must not reduce user visibility.

## Known upstream issues (recheck when updating defaults)

- anomalyco/opencode#20059 — custom user-defined subagent types in the Task tool — **CLOSED** (v1.17.9, 2026-06-22). Executor A now works for our custom agents, not just the built-in `explore`/`general` types. Manual paste (C) is no longer required just because an agent is custom — only MCP need (#16491) or `has_task_tool=false` forces B/C.
- anomalyco/opencode#16491 — MCP tools unavailable in Task-tool subagents (open; the reason `mcp_in_subagents` defaults false)
- anomalyco/opencode#6573 — native Task awaits have no timeout (the reason B is preferred for long specialists)
- anomalyco/opencode#15069 — async dispatch (feature request; would let the runner parallelize natively)
