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
| **B** | **Subprocess** — `tools/task.ts` spawns `opencode run --agent <x> --dir <workcopy>` with the HANDOFF as prompt | **`autonomy=auto` only.** `opencode_cli=true` and not already inside a subprocess-spawned session. Required when a specialist needs MCP tools and `mcp_in_subagents=false`. A fresh process is a primary session with full MCP access and the only programmatic path with timeout protection. **Always pass an explicit `--dir <workcopy>`** (eval-harness isolation lesson) so parallel B dispatches don't collide. **Never used in `interactive`** — there the human opens the specialist (C). |
| **C** | **HANDOFF document for the user** — write the HANDOFF to `docs/work/HANDOFF_<agent>.md`, then print a short pointer telling the user which agent to open (`/skill`), **the exact line to paste** (`SDLC-TASK for <agent>: read docs/work/HANDOFF_<agent>.md and execute it.` — the `SDLC-TASK for` prefix is the Bounded-Task trigger; a bare "it reads X" pointer lets smaller models fall through to their default mode and hand the task back), and which report to submit back | **The default in `interactive` for any specialist with a `/skill`** — the user drives every handoff and the specialist runs as a first-class conversation they open. Also the fallback if A/B fail twice in auto. **In `autonomy=auto`, C is an error** — auto has no human to paste; degrade to D (inline) and log to `docs/work/APPROVALS.md`. |
| **D** | **Inline** — the coordinator reads the specialist's own agent file and runs its methodology in the same conversation, writing the specialist's output files before continuing | the specialist has **no user-facing `/skill`** (so it cannot be handed off — there is no slash to open) — in either mode. Also the `auto` fallback when `opencode_cli=false` (no CLI to spawn B). A skill-less specialist that later gains a `/skill` should move to C in interactive. |

## Selection order & matrix

**Autonomy is the primary discriminator.** In `interactive` (a human is at the session — the
default in the opencode TUI), a specialist that has a `/skill` is **ALWAYS Executor C**: write the HANDOFF to
`docs/work/HANDOFF_<agent>.md` and tell the user which agent to open (`/skill`), to have it read that doc, and what report to submit back. You do
**not** run the specialist for them via a hidden Task-tool subagent (A) or an `opencode run`
subprocess (B). The user drives every handoff and each specialist runs as a first-class conversation
they open. Only in `auto` (unattended/headless — e.g. the conductor) is dispatch programmatic:
**A → B → D** (C is forbidden in `auto` — there is no human to paste). Skill-less specialists (no
slash to open, so they cannot be pasted) fall to **D** (inline) in either mode.

| autonomy | specialist | runtime | → executor |
|---|---|---|---|
| **interactive** | has a `/skill` | any (`opencode_cli`/`has_task_tool` irrelevant) | **C** — write `docs/work/HANDOFF_<agent>.md`; the user opens the specialist, has it READ that doc, and submits the report back |
| **interactive** | skill-less (no slash to open) | any | **D** (inline) — cannot be handed off; run its methodology in-conversation |
| **auto** | native-tools only | `has_task_tool=true` | **A** (native Task tool) |
| **auto** | needs MCP, or `has_task_tool=false` | `opencode_cli=true` | **B** (subprocess `opencode run`) |
| **auto** | any | `opencode_cli=false` | **D** (inline) — C is forbidden in auto; log to `docs/work/APPROVALS.md` |
| **auto** | needs the user (NEVER-AUTO) | — | pause per AUTONOMY_PROTOCOL |

Key: **interactive → always the visible HANDOFF (C)** for skilled specialists — never a hidden A/B
dispatch. **auto → programmatic (A/B/D), never a paste-and-wait.** The `opencode_cli`/`has_task_tool`
probes only matter in `auto`; in `interactive` the human is the executor.

## TUI mode

The opencode TUI is an **interactive** session — a human is present. Per the matrix, every
specialist that has a `/skill` is **Executor C**: you write the HANDOFF to
`docs/work/HANDOFF_<agent>.md` and tell the user which agent to open, to have it read that doc and
follow it, and what report to submit back. You do **NOT** spawn
an `opencode run` subprocess (B) or a Task-tool subagent (A) to run a specialist behind the user's
back — that is the exact behavior this rule forbids. Executor B (subprocess) is for **auto/headless**
runs (the unattended conductor), not the interactive TUI.

> This supersedes the earlier T30.10 guidance that preferred B in the TUI "to remove the manual-paste
> pause." The visible, user-driven handoff is the opencode requirement: subagents can't use MCP
> (#16491) and the user must see each specialist as a first-class conversation they open. The
> manual-paste "pause" is the intended interaction, not a defect.

Skill-less specialists (no slash to open) are the only interactive exception — they fall to **D**
(inline). Companion checkpoint/scan-output rules: `agents/shared/TUI_SESSION_HYGIENE.md`.

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
