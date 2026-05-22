# LOOP_PREVENTION.md

**Canonical loop-prevention rules for ALL agents.** These rules override any "be thorough", "try harder", or "iterate more" instinct. Read this once at the start of any task that involves tool calls.

There are three loop classes that have caused real failures in production. Each has its own exit condition.

---

## Tool selection cheat-sheet (read this FIRST — most loops start here)

Before calling any tool, match the verb in your task to the right tool. **Most schema-validation loops start by calling the wrong tool with arguments that make sense for a different tool.**

| You want to… | Use this tool | Example |
|--------------|---------------|---------|
| Read a markdown reference doc, agent prompt, or any file | `read` | `read({filePath: "~/.config/opencode/agents/shared/HANDOFF_TEMPLATES.md"})` |
| Run a slash command (e.g., `/sdlc init`, `/security`) | `skill` | `skill({name: "sdlc"})` |
| List files matching a pattern | `glob` | `glob({pattern: "**/*.md"})` |
| Search file contents | `grep` | `grep({pattern: "TODO", path: "src"})` |
| Run a shell command | `bash` (or `run`) | `bash({command: "ls -la"})` |
| Write a new file | `write` | `write({filePath: "...", content: "..."})` |
| Edit existing file | `edit` | `edit({filePath: "...", old_string: "...", new_string: "..."})` |
| Fetch a URL | `webfetch` | `webfetch({url: "https://..."})` |
| Search the web | `playwright-search_web_research` (or `websearch`) | `playwright-search_web_research({query: "..."})` |

**Common confusions that trigger loops:**

- `skill` is for slash commands by **name**, not for "loading" reference docs. Reference docs are files — use `read`.
- "See `agents/shared/X.md`" / "consult X" / "per the contract in X" all mean **`read` that file**, not "load it as a skill".
- Relative paths like `agents/shared/X.md` resolve from your install dir. If unsure, prefix with `~/.config/opencode/` (opencode) or `~/.claude/` (Claude Code) and use the absolute path. Or list the dir first via `ls`.
- A tool with required args you can't fill is the wrong tool. Pick a different one — don't pass `undefined` and hope.

If after 2 tool calls you can't find the right tool for a task, **stop and surface to user** (see Class 2 rule below). Don't bluff.

---

## Class 1: Failure loop (tool errors repeating)

**Pattern:** Same tool call returns the same error 3+ times. Model retries hoping for a different result.

**Examples:**
- DDG search returns "no results" three times in a row
- HTTP fetch returns 429/500 repeatedly
- API call fails with same message twice

**Rule — 3 strikes you stop:**

If a tool call returns:
- 0 results, OR
- "rate-limited" / "blocked" / "challenge" / "no results found", OR
- the same error twice in a row,

…count it as a strike. **After 3 strikes within a single task, STOP** and surface verbatim:

```
TASK BLOCKED — tool calls have failed 3+ times in a row.
- Last error: <paste the actual error>
- Last call: <tool name + args>
- Likely cause: <rate limit, captcha, network, schema mismatch, missing dependency>
- What I have so far: <partial findings or progress>
- What I cannot complete: <unfinished items>
```

---

## Class 2: Schema-validation loop (malformed tool args)

**Pattern:** Tool call returns a Zod / schema-validation error like:
- `"Invalid input: expected string, received undefined"`
- `"Required field 'X' is missing"`
- `"Expected number, got string"`
- `"The X argument must be of type string. Received undefined"`

Model retries the SAME malformed call, gets the SAME validation error, retries again. **Or switches to a different tool but emits the same shape of broken call (e.g., calls `skill` with no name, then `write` with no file path).** That counts the same — it's not the tool that's looping, it's your tool-call construction.

**Why this happens:** Local LLMs (Qwen, Gemma, Nemotron, smaller models generally) sometimes emit incomplete tool-call JSON — missing required args, wrong types, or `undefined` values. The model often *sees* the error but cannot break out of the pattern; it will narrate "I keep calling tools without proper arguments" while continuing to call them with no arguments.

**Rule — 2 strikes you stop. Schema errors are unforgiving.**

After **2 schema-validation errors in a single task** (any tools, any errors, even different ones), STOP. Do not keep "trying" — the next call will fail the same way for the same reason. If you've articulated "I keep calling tools without arguments" or "let me try again" or "I keep getting errors" you have **already hit the loop signal — STOP NOW**.

When you hit the 2-strike limit, copy-paste this template VERBATIM with the blanks filled:

```
[BLOCKED — schema-validation loop]
- I attempted: <list the 2 tool calls and their schema errors>
- Pattern: <what's missing in my calls — usually a required arg I don't know>
- Likely cause: <pick: I lack a piece of context the prompt didn't give me / the tool I picked doesn't match the task / a referenced file path is wrong or relative-vs-absolute confusion>
- What I have so far: <bullets of progress, even partial>
- What I cannot complete: <the unfinished items>

I am stopping per the 2-strikes schema rule. Recommend: the user clarifies <specific input> or suggests a different tool.
```

After printing this template, **stop calling tools** and end the turn. The user will read your message and unblock you.

**Common causes of this loop, and how to spot them:**

- The agent prompt referenced a path like `agents/shared/X.md` (relative) but you're not sure where it resolves. **Use the absolute path:** `~/.config/opencode/agents/shared/X.md` (opencode) or `~/.claude/agents/shared/X.md` (Claude Code). If you're not sure which, list both directories first via `ls`.
- You tried to call a `skill` tool but didn't have a skill name. The `skill` tool is for invoking slash commands by name — not for loading reference docs. To read a doc, use `read` with a file path.
- You tried to write a file but had no path. The `write` tool needs `filePath` and `content` — both required.
- A tool's required arg is unclear from your context. Don't guess — surface to user.
- Workaround attempt: <if any>

Recommend: ask the user to either (a) clarify the input, (b) suggest a different tool, or (c) take this step manually.
```

---

## Class 3: Success loop (every call works, but model never stops)

**Pattern:** Each tool call succeeds with real data. Model keeps fetching "one more source" indefinitely. Often re-fetches URLs already seen because it's lost track.

**Why this happens:** Larger models bias toward "more data = better answer" without a hard cap. They also forget what they've already fetched without an explicit ledger.

**Rule — quality-based stopping (no arbitrary call counts):**

The checkpoint pattern (writing full source content to disk after every tool call) means context never fills from raw tool output. Arbitrary total-call limits are therefore unnecessary and hurt quality by forcing early exit when work remains. Stop based on what you know, not how many calls you've made.

**Stop a work-unit when ANY of these is true:**
- Confidence ≥ 8 (research tasks) → mark DONE, move to next unit
- All files in scope have been reviewed (review tasks) → move to synthesis
- The task is complete as defined in YOUR TASK → stop
- 3 consecutive successful calls on the same work-unit produce no new information → diminishing returns, mark DONE
- The same URL appears again → you already have it on disk, skip it

**Keep calling tools when:**
- New sub-questions surfaced that couldn't be formed before the previous pass
- A conflict between sources needs a third source to resolve
- A primary source was cited but not directly fetched
- Confidence is below 8 and specific gaps remain

**Calls to the same URL or same tool with nearly identical args:**
- Same URL: forbidden to re-fetch — re-read your checkpoint file instead
- Same tool + near-identical args twice with same result: vary the tool, the input type, or the angle — do not repeat a third time

**Required ledger between calls** (state it explicitly in your reasoning):

```
Work-unit: <question or file or check>
URLs/files already fetched: [<list>]
Learned so far: [<bullet facts>]
Still missing: [<specific gaps>]
Errors so far: <count>/3 strikes
```

After every successful call, ask before the next one:
1. Does the new content tell me something I didn't already have?
2. If yes, name the new fact.
3. If no — STOP this work-unit. Move on or synthesize.

If 3 consecutive successful calls produce nothing new, the work-unit is **as answered as it's going to get**. Move on. Repeating fetches hoping for new info is the failure mode you must avoid.

---

## Universal STOP triggers

Stop and surface to user if ANY of these:
- ≥ 3 strikes (failure loop)
- ≥ 2 schema-validation errors on the same tool call shape (validation loop)
- Same URL fetched twice (you've already lost track — re-read your checkpoint instead)
- 3 consecutive successful calls with no new info (diminishing returns)
- Same tool + near-identical args called twice with the same empty/thin result (vary the approach or stop)

When you stop, **always tell the user**:
1. What you accomplished (partial is fine)
2. Why you stopped (which trigger fired)
3. What would unblock you (network, different tool, manual step, etc.)

Never silently give up. Never silently keep going past a trigger.

---

## How to apply this in agent flows

- **Plan first.** Before the first tool call, write down what you expect to call and what specific gaps each call addresses. If a call doesn't address a named gap, don't make it.
- **Track the ledger.** State call counts and seen URLs/files between calls.
- **Verify the trigger.** Before EVERY tool call, check: am I about to violate any cap or rule above? If yes, stop instead of calling.
- **Synthesize early.** A partial report at confidence 6/10 with sources is more useful than an infinite loop.

This file is the single source of truth for loop prevention. If an agent prompt contradicts this file, this file wins.
