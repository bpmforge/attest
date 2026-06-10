---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# Executor Selection — how a HANDOFF actually runs (Claude Code)

The HANDOFF document is the delegation contract everywhere. On Claude Code the
executor question is simple: **the Task tool is native and subagents have full
tool access** — treat `has_task_tool=true` and `mcp_in_subagents=true` as
constants. There is no `.model-context` capability probing on this runtime;
if a protocol mentions checking those flags, read them as already true.

## The executors

| | Executor | When |
|---|---|---|
| **A** | **Task tool (default)** — dispatch the full HANDOFF block as the subagent prompt; the tool blocks until the subagent's Completion Manifest returns | Always, unless A has failed twice or the user asked for interactive specialists |
| **C** | **Manual HANDOFF paste (fallback)** — print the HANDOFF block as text; the user opens a new session, types the skill, pastes | Task dispatch failed twice, or the user wants to watch a specialist run as a first-class conversation |

(Executor B — subprocess spawning — is an OpenCode mechanism; it does not
apply on Claude Code. See the sibling repo bpm-opencode-experts for that
runtime's capability probing.)

## Rules regardless of executor

1. The HANDOFF block content is IDENTICAL in both — same `════` delimiters, ROLE, CONTEXT, WRITE-SCOPE, PRODUCE, VERIFY, Completion Manifest, completion phrase.
2. Score the returned manifest the same way (GATE_SCORING_PROTOCOL) whether it came from a Task result or a pasted reply.
3. A dispatch that errors twice → drop to Executor C, note it in DELEGATION_LOG.md.
4. Announce every dispatch (specialist + one-line task) and report its verdict — subagents must not reduce user visibility.
