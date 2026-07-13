---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# TUI Session Hygiene (T30.10)

The opencode TUI and `opencode run` assemble every request identically: full
post-compaction history + system prompt + AGENTS.md + every tool schema, resent
on every turn (chat completions are stateless — there is no server-side session).
The only real difference is session **lifetime**: `opencode run` is one-shot, so
it never accumulates; a TUI session can run for hours, so whatever it holds
inline keeps compounding turn after turn. This protocol is the discipline that
keeps a long-lived TUI session from flooding itself. Root-cause research:
`docs/research/LOCAL_CONTEXT_INTEGRITY_DESIGN.md` (Part 1-3, V6-V8 live
validation).

## Rule 1 — Thin orchestrator

The TUI session holds only the thin orchestrator (`sdlc-lead`, `security-auditor`
as coordinator shell, etc.) — its own instructions plus whatever the current step
actually needs. It does not run a tool-heavy specialist's methodology itself; it
dispatches. Per-step reading stays inside `CONTEXT_BUDGET.md`'s per-agent budget
(a coordinator that reads a specialist's full OWASP_METHODOLOGY.md "just to be
sure" has already broken this rule).

## Rule 2 — Mandatory fresh-context dispatch (never inline)

Every tool-heavy specialist HANDOFF routes to a **fresh context**, never inline
in the accumulating TUI session:

- **Executor A** — native Task-tool subagent (child session, prompt-only, no
  parent history — opencode's equivalent of Jarvis/Foreman's fresh-`messages`
  step), when `has_task_tool=true` and the specialist needs no MCP (or
  `mcp_in_subagents=true`).
- **Executor B** — `opencode run` subprocess (`tools/task.ts`), when the CLI is
  on PATH. In the TUI, `opencode_cli` is always true — you ARE opencode — so B
  is always an available fallback when A doesn't apply.

**Executor D (inline) must never be used for a scan-heavy or otherwise
tool-heavy specialist in TUI mode**, even though `EXECUTOR_SELECTION.md`'s
general matrix allows D as a last resort for skill-less specialists when neither
A nor B exists — that carve-out is for genuinely headless/no-CLI runtimes, not
the TUI. Full selection logic (and the TUI-specific override): `EXECUTOR_SELECTION.md`.

## Rule 3 — Scan output goes to disk, never into context (hard rule)

Scan-heavy tools — SAST/semgrep, secrets/TruffleHog, dependency audits, any
grep sweep — are the security wave's flood source: they produce the largest
tool outputs in the system. **Write raw output to disk and return only the file
path + a count, never stream the dump into the tool result.** This is a hard
rule, not `CONTEXT_BUDGET.md` advice — T30.8's live repro (V8) proved even an
HONEST context limit doesn't save a hold-it-all-in-context workflow: opencode
evicted big tool outputs (`[Old tool result content cleared]`), the model kept
re-reading them, and the doom-loop detector never fired because the repeats
were cross-message (219 tool calls, 0 compaction, 0 errors). Concretely:
redirect fully to a file (`cmd > out.txt 2>&1`, never `cmd 2>&1 | tee out.txt`
or `| head -N` piped back to the model) and report back `wc -l`/finding counts,
not the content. `agents/security/semgrep-runner.md` Phase 1 is the reference
implementation.

## Rule 4 — 70% checkpoint-and-resume (TUI mode)

`CONTEXT_BUDGET.md`'s Rule 5 emergency-stop (60%) is a *self-estimate* — it
exists because most runtimes (headless subprocess, local models with no live
display) give an agent no other way to know how full its window is. The TUI is
different: since T30.8's `sync-model-limits.mjs` writes a truthful
`limit.context` into opencode config, the TUI's own context-% indicator is no
longer a lie (pre-T30.8 it read `limit.context=0` → "unknown" → never fired).
**In the TUI specifically, checkpoint at 70% of that live, truthful context
display** — higher than the self-estimate threshold because the number is now
trustworthy, not because more headroom is safe. At 70%: write the checkpoint
(`docs/work/STATE.md`, per `CHECKPOINT_STATE.md`) and tell the user to `/clear`
and run `/sdlc resume` in a fresh session, rather than riding autocompaction —
compaction on a local model has its own loop bugs (LOCAL_CONTEXT_INTEGRITY_DESIGN.md
Part 1 item 5b) and, per V7, can never converge if the truthful limit is too
close to the fixed ~29k overhead in the first place. Do not wait for a higher
threshold "just to finish this one step" — the whole point of a truthful
display is to act on it before the window actually fills.

## Applying this in practice

- `security-auditor.md`'s Executor rule dispatches every specialist in every
  wave via A or B — see that file's "Executor rule" block.
- `EXECUTOR_SELECTION.md` carries a "TUI mode" note pointing back here.
- `CONTEXT_BUDGET.md` and `CHECKPOINT_STATE.md` remain the general-purpose
  (any-runtime) rules; this file is the TUI-specific override layered on top,
  not a replacement.
