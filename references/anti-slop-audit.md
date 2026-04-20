# Anti-Slop Audit Checklist

Reference used by the `code-reviewer` agent on every review. Detects six anti-patterns that contaminate LLM-generated code at a rate high enough to matter.

## Rationale

LLMs trained on public code corpora inherit a consistent set of defensive-programming reflexes — try-catch blocks wrapping pure internal calls, single-use helper functions, "what" comments, premature abstractions — that individually look reasonable but accumulate into code that is expensive to own. These reflexes appear across model families and model sizes. Prompt engineering alone does not suppress them because the behavior is trained, not instructed.

This checklist gives the reviewer a deterministic list of things to hunt for so slop can be caught at merge time instead of during the next refactor. It applies equally to code written by humans and code emitted by agents; the audit target is the output, not the author.

---

## Applicability

- **Default target:** new code in a PR (added or modified hunks).
- **Legacy code:** files not touched by the PR get a grandfather pass — note this explicitly in the review ("grandfathered: not modified in this PR").
- **Generated code:** anything emitted by an agent is a first-class target — hold it to the same bar as hand-written code.
- **Scope creep rule (rule 5):** only applies when the PR description states an expected file set. Skip if scope is not specified.

---

## Scoring

Count distinct violations across all six rules in the changed code.

| Violations | Action |
|---|---|
| 0 | **Pass.** No slop finding in the review. |
| 1 | **Warn.** Leave an inline comment citing the rule; do not block. |
| 2+ | **Block.** Request changes on the PR. Do not approve until violations drop to ≤1. |

When you block, list every violation with file:line and the rule number — the author has to fix them, not argue them.

---

## Rule 1: Try-Catch Outside System Boundaries

Wrapping pure internal function calls in try-catch. The only legitimate places to catch are at system boundaries — HTTP route handlers, CLI entry points, job runners, top-level `main`, message-queue consumers, background-task wrappers. Internal utility and service functions should let errors propagate.

**Violation:**
```ts
// src/utils/calculate.ts
export function calculateTotal(items: Item[]): number {
  try {
    return items.reduce((sum, item) => sum + item.price, 0);
  } catch (err) {
    console.error('Failed to calculate total', err);
    return 0;
  }
}
```
The reduce cannot fail in any recoverable way. The catch hides a bug and returns `0` silently, which will corrupt downstream math.

**Correct:**
```ts
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

**Exception:** Route handlers, CLI `main`, job workers, and other places where an uncaught error would crash the process or leave a request hanging. Those SHOULD catch — but catch at the boundary, log with context, and return a typed error response. One catch per boundary, not one per function.

**How to spot it:** read the file path. If it is in `routes/`, `controllers/`, `handlers/`, `cli/`, `workers/`, or is literally `main.ts`/`index.ts`/`server.ts`, try-catch is allowed. Everywhere else it is a finding unless the reviewer can name a specific recoverable error the catch is handling.

---

## Rule 2: Abstractions With Fewer Than Two Implementations

Interfaces, abstract classes, factories, and strategy patterns written for a single concrete implementation. YAGNI violation — the abstraction adds a layer of indirection with no flexibility payoff.

**Violation:**
```ts
// src/services/email.ts
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

export class SesEmailSender implements EmailSender {
  async send(to: string, subject: string, body: string): Promise<void> {
    // ... the only implementation
  }
}
```
One interface, one implementation, zero tests that substitute an alternative. The interface is dead weight.

**Correct:** Use the concrete class directly. Extract an interface when the second implementation arrives (tests that stub via a mocking library do not count as a second implementation).

```ts
export class EmailSender {
  async send(to: string, subject: string, body: string): Promise<void> {
    // ...
  }
}
```

**Exception:**
- Interfaces ending in `Options`, `Config`, `Input`, or `Params` — those are data shapes, not behavior contracts.
- Plugin or adapter layers where a second implementation is actually planned and cited in the PR description.
- Public library APIs where the interface is the contract with consumers outside the codebase.

**How to spot it:** grep for `interface X` / `abstract class X` / `trait X`. For each one, find all concrete implementers in the repo. If the count is less than 2 and the exception does not apply, flag it.

---

## Rule 3: Single-Use Helper Functions

Functions extracted from a single call site that are only called from that one call site. Premature extraction — inlining makes the code shorter and more readable.

**Violation:**
```ts
// src/handlers/createUser.ts
function buildWelcomeEmailSubject(name: string): string {
  return `Welcome, ${name}!`;
}

function buildWelcomeEmailBody(name: string): string {
  return `Hi ${name}, thanks for joining.`;
}

export async function createUser(req: Request, res: Response) {
  const user = await db.users.create(req.body);
  await mailer.send(user.email, buildWelcomeEmailSubject(user.name), buildWelcomeEmailBody(user.name));
  return res.json(user);
}
```
Two helpers, each called exactly once, in the same file. They add names for nothing — the inlined version is shorter and easier to read.

**Correct:**
```ts
export async function createUser(req: Request, res: Response) {
  const user = await db.users.create(req.body);
  await mailer.send(
    user.email,
    `Welcome, ${user.name}!`,
    `Hi ${user.name}, thanks for joining.`,
  );
  return res.json(user);
}
```

**Exception:**
- The helper's name genuinely clarifies intent in a way the inline version does not (a wall of nested conditionals replaced by `isEligibleForDiscount(user)`).
- The helper is tested independently — a dedicated unit test justifies the name.
- The function is an entry point (`main`, `handler`, `default` export, route handler) — single use is the point.

**How to spot it:** for each function defined in a file, count call sites across the repo. If the count is exactly 1 and none of the exceptions apply, inline it.

---

## Rule 4: What-Comments

Comments that describe what the next line does mechanically instead of why. Pure noise — the code already says what; the comment repeats it.

**Violation:**
```ts
// increment i
i++;

// set the user name
user.name = input.name;

// return true if active
return user.isActive;

// loop through items
for (const item of items) { ... }
```

**Correct:** Delete them. If the line needs explanation, explain the why, the invariant, or the non-obvious constraint.

```ts
// Retry index — reset on 429 so we back off the full window, not a partial one.
i = 0;

// Upstream validates length, but we still trim to preserve the DB trigger on name change.
user.name = input.name.trim();
```

**Exception:**
- Comments longer than ~40 characters that add genuine context (why, tradeoff, link to issue/spec).
- Docstrings and public-API JSDoc that describe parameters and return values as part of the documented contract.
- Section headers in a long function (`// --- Validation ---`) that aid navigation.

**How to spot it:** short comments (under ~40 chars) that start with a verb like `increment`, `decrement`, `set`, `get`, `return`, `loop`, `iterate`, `check`, `call`, `assign`, `initialize`, `if`. Read the line below — if the comment just restates it, flag it.

---

## Rule 5: Scope Creep

Files or exports produced beyond what the PR was asked to ship. "While I was in here" additions that expand review surface and blast radius without being in the stated scope.

**Violation:** PR says "add DELETE /users/:id endpoint". Diff also touches `src/utils/formatDate.ts`, adds `src/middleware/rateLimit.ts`, renames a field in `src/types/user.ts`. Two of those three were not asked for.

**Correct:** Land the requested change only. Open separate PRs for the bonus work. If a refactor is genuinely a prerequisite for the feature, say so in the PR description — do not sneak it in.

**Exception:**
- Bug fixes discovered in the files you had to touch for the feature — note them explicitly in the PR description.
- Mechanical renames from a tool (codemod, linter autofix) that touch many files but do one thing. These should be a separate PR anyway, but are forgivable if the PR description names the tool and the change.

**How to spot it:** compare the PR's stated scope to the file list in the diff. Unannounced new files or unrelated modifications are findings.

**Applicability:** only run this rule when the PR description states an expected file set or scope. If not, skip.

---

## Rule 6: Framework Wrappers

Custom classes or functions that hand-roll a feature the underlying framework already provides. Adds a layer with fewer features, more bugs, and a learning curve for anyone who already knows the framework.

**Violation:**
```ts
// src/lib/Logger.ts — next.js project
export class Logger {
  info(msg: string) { console.log(`[INFO] ${msg}`); }
  warn(msg: string) { console.warn(`[WARN] ${msg}`); }
  error(msg: string, err?: Error) { console.error(`[ERROR] ${msg}`, err); }
}

// src/lib/HttpClient.ts
export class HttpClient {
  async get(url: string) { return fetch(url).then(r => r.json()); }
}

// src/lib/safeFetch.ts
export async function safeFetch(url: string, opts?: RequestInit) {
  try { return await fetch(url, opts); } catch { return null; }
}
```
Pino, winston, the framework's built-in logger, and `fetch` all exist. These wrappers replace proven tools with hand-rolled ones that drop features (structured logging, retries, timeouts, tracing) and silently swallow errors.

**Correct:** Use the framework's native logger, HTTP client, cache, config loader, error boundary, etc. Wrap only when you have a concrete project-specific reason (centralized tagging, multi-backend switching that actually has multiple backends, mandatory audit trail) and document it in the wrapper's top-of-file comment.

**Exception:**
- Thin aliases that add a single project-specific concern (e.g. a logger that always tags with `requestId`) and delegate everything else to the real library.
- Code explicitly replacing a framework feature with a proven alternative because the framework's version has a known bug — cite the bug.

**How to spot it:** classes named `Logger`, `HttpClient`, `Cache`, `Config`, `EventBus`, `ErrorBoundary`. Functions named `safeFetch`, `wrappedRequest`, `tryCatch`. For each, ask: "what does the framework already provide here?" If the wrapper is thinner than the framework's built-in and adds no project-specific value, flag it.

---

## Quick Reference for the Reviewer

Run through these in order on every PR:

1. Find every `try {` / `try:` in the diff. For each, check if the file is at a system boundary. If not, flag it.
2. Find every `interface` / `abstract class` / `trait` in the diff. For each, grep the repo for implementers. If fewer than 2 and no exception applies, flag it.
3. Find every `function` / `def` / `const X = () =>` in the diff. For each, count call sites in the repo. If exactly 1 and no exception applies, flag it.
4. Scan short comments under ~40 chars starting with `increment|decrement|set|get|return|loop|iterate|check|call|assign|initialize|if`. Flag them.
5. Compare diff file list to the PR's stated scope. Flag unannounced files.
6. Scan for `Logger`, `HttpClient`, `Cache`, `safeFetch`, `wrappedRequest` and similar framework-feature names. Flag wrappers that add no project-specific value.

Tally violations. Apply the scoring table at the top of this file.
