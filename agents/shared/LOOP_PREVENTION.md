# LOOP_PREVENTION.md

**Canonical loop-prevention rules for ALL agents.** These rules override any "be thorough", "try harder", or "iterate more" instinct. Read this once at the start of any task that involves tool calls.

There are three loop classes that have caused real failures in production. Each has its own exit condition.

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

Model retries the SAME malformed call, gets the SAME validation error, retries again.

**Why this happens:** Local LLMs (Qwen, Gemma, Nemotron, smaller models generally) sometimes emit incomplete tool-call JSON — missing required args, wrong types, or `undefined` values. The model doesn't always understand the validation error and repeats the broken call verbatim.

**Rule — schema errors are 1 strike each, and they count:**

If a tool returns a schema/validation error:

1. **Read the error.** It tells you exactly what's wrong (`expected string`, `pattern is required`, etc.).
2. **Fix the call OR switch tools.** If you can't construct valid args, the tool is wrong for the job.
3. **Never retry the same malformed call twice.** That's the loop.

If you've hit a schema error and don't know how to fix it, STOP and surface to user with:

```
TOOL CALL MALFORMED — could not construct valid arguments.
- Tool: <name>
- Required schema: <what the error says is required>
- What I tried: <the args I sent>
- Why I'm stuck: <the reasoning gap>
- Workaround attempt: <if any>

Recommend: ask the user to either (a) clarify the input, (b) suggest a different tool, or (c) take this step manually.
```

---

## Class 3: Success loop (every call works, but model never stops)

**Pattern:** Each tool call succeeds with real data. Model keeps fetching "one more source" indefinitely. Often re-fetches URLs already seen because it's lost track.

**Why this happens:** Larger models bias toward "more data = better answer" without a hard cap. They also forget what they've already fetched without an explicit ledger.

**Rule — hard caps:**

| Limit | Cap | If hit |
|-------|-----|--------|
| Tool calls per work-unit (per question, per file, per check) | **4** | Mark unit DONE at current confidence, move on |
| Tool calls per task overall | **15** | STOP gathering. Synthesize from what you have. |
| Calls to the same URL | **1** | Forbidden to re-fetch. Re-read your own notes. |
| Calls to same tool with similar args | **2** | Vary the tool, the input type, OR the work-unit. |

**Required ledger between calls** (state it explicitly in your reasoning):

```
Calls so far: <N>/15 total
URLs/files already fetched: [<list>]
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
- ≥ 15 total tool calls (success loop budget)
- Same URL fetched twice (you've already lost track)
- 3 consecutive successful calls with no new info (diminishing returns)

When you stop, **always tell the user**:
1. What you accomplished (partial is fine)
2. Why you stopped (which trigger fired)
3. What would unblock you (network, different tool, manual step, etc.)

Never silently give up. Never silently keep going past a trigger.

---

## How to apply this in agent flows

- **Plan first.** Before the first tool call, write down what you expect to call. If your plan would exceed 15 calls, simplify the plan.
- **Track the ledger.** State call counts and seen URLs/files between calls.
- **Verify the trigger.** Before EVERY tool call, check: am I about to violate any cap or rule above? If yes, stop instead of calling.
- **Synthesize early.** A partial report at confidence 6/10 with sources is more useful than an infinite loop.

This file is the single source of truth for loop prevention. If an agent prompt contradicts this file, this file wins.
