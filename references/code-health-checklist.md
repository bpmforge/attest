# Code Health Checklist

Reference used by the `code-reviewer` agent in every invocation. Read this file at the start of every run — it contains the rubrics, anti-patterns, consolidation catalog, language thresholds, and report templates used across all modes.

**Not in scope here:** security vulnerabilities (→ `security-auditor`), performance profiling (→ `performance-engineer`), test strategy (→ `test-engineer`). Code health flags smells in those areas and hands them off.

---

## Modes

| Mode | Purpose | Output |
|---|---|---|
| `--review` | Full code-health pass — all 7 dimensions | `docs/reviews/CODE_REVIEW_<date>.md` |
| `--debt` | Tech-debt catalog only, build a backlog | `docs/reviews/TECH_DEBT_<date>.md` |
| `--consolidate` | Duplication + error-handling consolidation pass | `docs/reviews/CONSOLIDATION_<date>.md` |
| `--patterns` | Cross-codebase pattern consistency audit | `docs/reviews/PATTERNS_<date>.md` |

Default (no flag): `--review`.

---

## The 7 Dimensions

Every `--review` scores these independently on a 1-10 scale in the Health Dashboard:

1. **Complexity** — function/file length, nesting depth, cyclomatic complexity, god objects
2. **Duplication / DRY** — copy-paste ratio, missing abstractions, parallel implementations
3. **Error Handling** — swallowed errors, broad catches, missing context, inconsistency
4. **Type Safety & Invariants** — illegal states representable, runtime checks that should be compile-time
5. **Pattern Consistency** — naming, module boundaries, DI, imports, idioms
6. **Naming Quality** — intent-revealing names, boolean-as-question, no abbreviations
7. **Comment Accuracy** — comments match code behavior, no stale docs, no noise comments

Overall score = average, but any single dimension ≤4 downgrades the verdict to NEEDS REVISION regardless of average.

---

## Pass 1: Complexity

**Measure, don't guess.** Run these before any judgment:

```bash
# TypeScript/JavaScript
wc -l src/**/*.ts src/**/*.tsx 2>/dev/null | sort -rn | head -20
npx eslint src/ --rule 'complexity: [warn, 10]' --no-eslintrc --format unix 2>/dev/null

# Python
find . -name "*.py" -not -path "*/\.*" | xargs wc -l | sort -rn | head -20
radon cc -s -a src/ 2>/dev/null || python -m mccabe --min 10 src/

# Go
find . -name "*.go" -not -path "*/vendor/*" | xargs wc -l | sort -rn | head -20
gocyclo -over 10 . 2>/dev/null

# Rust
find . -name "*.rs" | xargs wc -l | sort -rn | head -20
cargo clippy -- -W clippy::cognitive_complexity 2>/dev/null
```

**Language thresholds** (flag anything exceeding, block anything 2× the flag):

| Language | Function | File | Nesting | Cyclomatic |
|---|---|---|---|---|
| TypeScript/JS | >40 lines | >300 lines | >3 | >10 |
| Python | >50 lines | >400 lines | >3 | >10 |
| Go | >60 lines | >500 lines | >3 | >12 |
| Rust | >50 lines | >400 lines | >3 | >10 |
| Java/Kotlin | >50 lines | >300 lines | >4 | >10 |
| Ruby | >30 lines | >300 lines | >3 | >8 |

**God-object detection:** class/struct >300 lines with 3+ unrelated responsibilities, or >15 public methods.

---

## Pass 2: Duplication / DRY

**DRY scoring rubric:**

- **0 duplicates** = 10/10
- **2 near-copies** (3+ lines identical, minor variable names differ) = 7/10 — flag, recommend extract
- **3-4 near-copies** = 5/10 — HIGH severity, blocks dimension
- **5+ near-copies** = 3/10 — architectural gap, recommend module-level abstraction
- **Parallel implementations** (two modules doing "the same thing" differently) = automatic ≤4

**Detection:**

```bash
# jscpd — multi-language duplication
npx jscpd src/ --min-lines 5 --min-tokens 50 --reporters console 2>/dev/null

# simian (Java/C#/many)
simian -threshold=6 src/**/*.java 2>/dev/null

# Python
pylint --disable=all --enable=duplicate-code src/ 2>/dev/null
```

**Every duplication finding must include:** locations (all file:line pairs), a concrete extract-method proposal (name, signature, caller list), and an effort estimate.

**Not duplication:**
- Similar-looking test cases (tests should be DAMP, not DRY)
- Two functions that happen to share 3 lines but have different responsibilities
- Boilerplate mandated by a framework (component registration, route handlers)

---

## Pass 3: Error Handling (Silent-Failure Hunter)

**Zero tolerance.** Every catch/except block must pass the Silent-Failure Hunter:

### Automatic findings:

| Pattern | Severity | Reason |
|---|---|---|
| Empty catch block `catch {}` / `except: pass` | **HIGH** | Errors are invisible |
| Catch with only `console.log` / `print` and no rethrow | **HIGH** | No upstream signal |
| Broad catch (`catch (e)` / `except Exception`) without type narrowing | **MEDIUM** | Masks unrelated errors |
| Catch returning a default value without justification comment | **MEDIUM** | Fallback hides real failures |
| Error message without context (`"error"`, `"failed"`, `e.message` alone) | **MEDIUM** | Unusable for debugging |
| Error thrown as bare string instead of Error/exception type | **MEDIUM** | Loses stack trace |
| Multiple catch blocks doing the same thing in the same file | **MEDIUM** | Consolidation candidate |
| Error swallowed in async function without logging | **HIGH** | Silent async failures are the worst class |

**Per-finding output includes:** the hidden error types this catch could suppress. Example: "This `catch (e)` at line 42 would suppress: `NetworkError`, `JSONParseError`, `AuthError`, `ValidationError` — the caller cannot distinguish them."

### Consolidation Catalog

When you find the same error-handling shape in 3+ places, prescribe one of these:

| Pattern | When to use | Example language idiom |
|---|---|---|
| **Central error boundary** | HTTP handlers or React components all wrapping bodies in try/catch | Express middleware, React `<ErrorBoundary>`, Fastify `setErrorHandler` |
| **Result type** | Domain layer returning "success or known error" | Rust `Result<T,E>`, TypeScript `Result<T,E>` via neverthrow, Go `(T, error)` |
| **Error-handling middleware** | Repeated retry / log / rethrow in async pipelines | Express middleware, async interceptors |
| **Custom error classes** | Callers need to distinguish error types | `class NotFoundError extends Error`, Python exception hierarchy |
| **Decorator / wrapper** | Cross-cutting logging around many functions | Python `@handle_errors`, TypeScript method decorator |
| **`defer`/`finally` cleanup** | Repeated resource cleanup across functions | Go `defer`, Python `with`, TypeScript `try/finally` or `using` |

Every `--consolidate` finding must reference one of these patterns by name.

---

## Pass 4: Type Safety & Invariants

**Principle: make illegal states unrepresentable.**

Score each type/struct on four sub-dimensions (1-10):

1. **Encapsulation** — private fields, no leaky setters, invariants owned by the type
2. **Invariant expression** — does the type signature express what's true? (e.g., `NonEmptyArray<T>` vs `T[] + runtime check`)
3. **Invariant usefulness** — does enforcing this invariant actually prevent bugs callers would have?
4. **Invariant enforcement** — constructor validates, no way to create an invalid instance

**Common findings:**

- **Primitive obsession** — raw `string` for email/URL/userId instead of branded types
- **Optional fields that should be tagged unions** — `{ status: string; error?: string; data?: T }` should be `{ status: 'ok'; data: T } | { status: 'error'; error: string }`
- **Runtime validation that should be compile-time** — if you're checking `if (!user.email) throw` on every read, email should be required in the type
- **Boolean parameters** — `createUser(name, true, false)` — replace with enum or options object
- **Null pollution** — values nullable everywhere "just in case" instead of at one boundary
- **`any` / `unknown` / `Object` / `interface{}`** outside of trust boundaries

**Language-specific tripwires:**

- **TypeScript**: `any`, `!` non-null assertion, `as` casts, `// @ts-ignore`, `Record<string, any>`
- **Python**: missing type hints in new code, `Any` in signatures, `Optional[T]` where `T` would do
- **Go**: `interface{}` / `any`, ignoring errors with `_`, nil-able pointers as "maybe" values
- **Rust**: `unwrap()` / `expect()` outside tests, `Option<T>` where an enum would encode the variants
- **Java/Kotlin**: raw types, `Object` parameters, `@SuppressWarnings`, nullable where non-null fits

---

## Pass 5: Pattern Consistency

Read 3-5 files in the same module first to establish what "normal" looks like. Then every finding compares against that baseline, not an idealized standard.

**Checks:**
- Naming convention (camelCase / snake_case / PascalCase) — consistent across file, module, project
- Error handling approach (Result types vs exceptions vs error codes) — pick the project's, flag drift
- Dependency injection vs hardcoded dependencies
- Import organization (grouped? sorted? relative vs absolute?)
- Module structure (index.ts re-exports, barrel files, flat vs nested)
- State management (store? context? prop drilling? signals?)
- Async style (async/await vs promises vs callbacks)
- Logging (which logger, what format, what level for what)
- Config access (env vars directly? config object? layered?)

**Inconsistency with a GOOD pattern is also a finding.** If 9 modules use a Result type and 1 uses try/catch, that's a finding even if the try/catch module "works."

---

## Pass 6: Naming Quality

- Variables describe content (`userCount`, not `n`; `activeSession`, not `s`)
- Functions describe action (`calculateTotalPrice`, not `process`, `handle`, `doStuff`)
- Booleans read as questions (`isValid`, `hasPermission`, `canDelete`, `shouldRetry`)
- No Hungarian notation in languages that don't need it (`strName`, `iCount`)
- No negations in boolean names (`isNotReady` → `isPending`)
- Acronyms consistent (`HTTPServer` or `HttpServer` — pick one project-wide)
- Public API names are nouns/verbs matching the domain language, not the implementation

**Misleading names are HIGH severity.** A `getUser(id)` that also writes to a cache is misleading — either rename to `getOrLoadUser` or split.

---

## Pass 7: Comment Accuracy

**Comments must match code behavior.** Every comment is a liability if it's wrong.

- Comment says "returns null if not found" but the code throws → **HIGH** (actively misleading)
- Comment references a function that no longer exists → **MEDIUM**
- Comment explains WHAT the code does when it's obvious (`i++` // increment i) → **LOW** (noise)
- Comment explains WHY something non-obvious is done → keep it (valuable)
- TODO/FIXME older than 6 months (check `git blame`) → **LOW** (debt)
- Commented-out code → **LOW** (delete it, git has history)
- Docstring/JSDoc parameters that don't match function signature → **HIGH**

**Stale-comment detection:**

```bash
# Find TODO/FIXME with age
git grep -n "TODO\|FIXME\|XXX\|HACK" | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  lineno=$(echo "$line" | cut -d: -f2)
  age=$(git blame -L "$lineno,$lineno" --porcelain "$file" 2>/dev/null | grep '^author-time' | awk '{print $2}')
  [ -n "$age" ] && echo "$((($(date +%s) - age) / 86400))d  $line"
done | sort -rn | head -30
```

---

## Confidence Scoring per Finding

Every finding gets a 0-100 confidence score. **Suppress findings below 75.**

| Score | Meaning |
|---|---|
| 0-25 | Stylistic, unverified, possible false positive — DO NOT REPORT |
| 26-50 | Real but minor, only include in `--patterns` cross-codebase view |
| 51-74 | Plausible but not verified against the full codebase — DO NOT REPORT without verification |
| 75-89 | CLAUDE.md violation, established pattern violated, or clear anti-pattern with evidence |
| 90-100 | Certain — verified by reading the code, matches a listed anti-pattern exactly |

**How to score:**
- Did you read the actual file:line and paste verbatim code? +20
- Does it match an entry in this checklist exactly? +20
- Did you find 2+ instances confirming it's a pattern, not a one-off? +15
- Did you verify it's inconsistent with the rest of the codebase (not an intentional exception)? +15
- Is there a concrete fix you can write out, not just "improve this"? +15
- Is the severity backed by specific user/developer impact? +15

Report the confidence score with every finding.

---

## Severity Rubric

Use `references/severity-matrix.md` as the shared framework. Code-health-specific mapping:

| Severity | Code Health Criteria |
|---|---|
| **CRITICAL** | Data-loss risk, infinite loop potential, deadlock, silent async error in payment/auth path |
| **HIGH** | Function >100 lines, nesting >5, swallowed error in critical path, misleading public API name, duplication in 5+ places, runtime check that should be compile-time on hot path |
| **MEDIUM** | Function 50-100 lines, pattern drift, duplication in 3-4 places, broad catch, missing abstraction, stale comment that could mislead |
| **LOW** | Tech debt, naming drift in private code, copy-paste in 2 places, old TODO, minor complexity |
| **INFO** | Style preference, cosmetic, no behavioral impact |

---

## Health Dashboard Template

Every `--review` report starts with this:

```markdown
# Code Health Report
**Date:** YYYY-MM-DD
**Project:** [name]
**Language:** [detected language + framework]
**Scope:** [files/modules reviewed]
**Linter:** [tool used + version, or "not available"]
**Method:** [Static | Static + Linter | Static + Linter + Cyclomatic]

## Health Dashboard

| Dimension | Score (1-10) | Status | Top Issue |
|---|---|---|---|
| Complexity            | 6 | ⚠️ Needs work | 3 functions >100 lines |
| Duplication / DRY     | 5 | ⚠️ Needs work | Retry logic copy-pasted in 4 handlers |
| Error Handling        | 4 | 🔴 Poor      | 6 swallowed errors, 3 in async paths |
| Type Safety           | 7 | ✅ Good      | 2 `any` uses in new code |
| Pattern Consistency   | 8 | ✅ Good      | Minor naming drift in utils/ |
| Naming Quality        | 8 | ✅ Good      | 2 misleading variable names |
| Comment Accuracy      | 6 | ⚠️ Needs work | 4 stale JSDoc entries |
| **Overall**           | **6.3** | ⚠️ Needs work | See top 3 below |

**Verdict:** NEEDS REVISION (Error Handling dimension ≤4)

## Top 3 Most Impactful Improvements
1. [Highest leverage change with specific file:line and effort estimate]
2. [Second highest]
3. [Third highest]
```

---

## Finding Format

```markdown
---
### [SEVERITY] Finding N: [Title]   (confidence: NN/100)

**File:** `src/path/to/file.ts`
**Line:** 42-67
**Category:** Complexity | Duplication | ErrorHandling | TypeSafety | Pattern | Naming | CommentAccuracy
**Rule:** [the specific checklist entry violated, e.g., "Function >50 lines (TS threshold)", "Silent-Failure: empty catch"]

**Current code (verbatim):**
```typescript
// paste the verbatim lines from Read — never paraphrase
function processAllUsers(users: any[]) {
  for (const user of users) {
    try {
      sendNotification(user);
    } catch (e) {}  // silent failure
  }
}
```

**Why this is a problem:**
[Specific to THIS code. Which caller, which data, which condition makes it fail. Not "this is hard to maintain."]
Example: "`sendNotification` can throw `NetworkError`, `RateLimitError`, or `TemplateError`. All three are silently swallowed, so a failed notification run looks identical to a successful one in logs. Operations has no way to alert on this."

**Suggested fix:**
```typescript
// fix THIS code, not a generic pattern
async function processAllUsers(users: User[]) {
  const results = await Promise.allSettled(users.map(sendNotification));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) logger.error({ failed: failed.length, total: users.length }, 'notification batch had failures');
}
```

**Hidden errors suppressed (error-handling findings only):**
NetworkError, RateLimitError, TemplateError

**Consolidation pattern (if applicable):** Central error boundary via Promise.allSettled

**Effort:** S (< 1 hr) | M (half day) | L (> 1 day)
---
```

**Hard rules for findings:**

1. **The "Current code" block MUST be verbatim** — use the Read tool on the exact file:line range and paste it. No paraphrasing, no reconstruction from memory.
2. **"Why this is a problem" MUST be specific to this code** — generic statements fail.
3. **"Suggested fix" MUST fix THIS code** — not a generic pattern.
4. **If you cannot write the "Why", you cannot include the finding.**
5. **If confidence < 75, drop the finding.**

---

## Cross-Cutting Patterns Section

After all findings, group them by root cause. If the same issue appears in 3+ places, it's no longer individual findings — it's an architectural observation:

```markdown
## Pattern Analysis

### Pattern 1: Retry logic copy-pasted across handlers
**Instances:** src/handlers/user.ts:45, src/handlers/order.ts:78, src/handlers/billing.ts:112, src/handlers/report.ts:200
**Root cause:** No shared retry utility; each handler implements its own with drift
**Consolidation:** Extract `withRetry<T>(fn, opts)` to `src/lib/retry.ts`, apply to all 4 sites
**Effort:** M  |  **Risk:** Low (pure refactor, 4 existing test suites cover behavior)
```

---

## Tech Debt Register (`--debt` mode)

Output to `docs/reviews/TECH_DEBT_<date>.md`. Every item:

```markdown
## DEBT-001: [Short title]
**Introduced:** [commit sha / date from git blame]
**Location:** file:line (or "systemic — see pattern")
**Category:** Complexity | Duplication | ErrorHandling | Types | Patterns | Naming | Comments
**Cost of ignoring:** [what breaks, when, at what scale]
**Cost of fixing:** S/M/L + specific steps
**Blocked work:** [what features/improvements this debt blocks]
**Priority:** P0/P1/P2/P3
```

Sort by `(blocked_work × priority) / cost_to_fix` — highest leverage first.

---

## What NOT to Include

- **No prescriptions without evidence.** "Use Zustand instead of Redux" when the project has 40 Redux reducers and works fine is wrong.
- **No "might be" or "could be" findings.** If you're not sure, verify or drop it.
- **No generic advice.** "Consider adding error handling" without specifying where and what error is noise.
- **No style preferences as findings.** 2 spaces vs 4 spaces, semicolons, trailing commas — let the linter handle those.
- **No findings without a verbatim code block and a file:line reference.**
- **No findings that would make the code worse to fix** (e.g., "extract this 5-line function" — don't create abstractions smaller than their call sites).
- **No pile-on.** 5 important findings > 50 nitpicks.

---

## Language-Specific Anti-Patterns Quick Reference

### TypeScript / JavaScript
- `any`, `as any`, `!` non-null assertion outside tests
- `// @ts-ignore` / `// @ts-nocheck` without explanation comment
- `JSON.parse` without try/catch on untrusted input
- Missing `await` on promise-returning functions (floating promises)
- `forEach` with async callback (doesn't actually await)
- Mutating function parameters
- `==` instead of `===`
- `var` anywhere

### Python
- Bare `except:` / `except Exception:`
- Mutable default arguments (`def f(x=[]):`)
- Missing type hints on new public functions
- `global` variables for state
- `from module import *`
- Catching `BaseException` or `SystemExit`
- Using `eval` / `exec` on user input

### Go
- `_ = err` — ignoring errors
- Naked returns in functions >10 lines
- Goroutines without context/cancellation
- Missing `defer cancel()` after `context.WithCancel`
- Mutex copied by value
- Slice aliasing bugs (sharing underlying array unexpectedly)
- `panic` in library code

### Rust
- `.unwrap()` / `.expect()` outside tests and `main`
- `.clone()` in hot paths when borrow would work
- `.to_string()` followed by `.as_str()`
- Blocking I/O in `async fn`
- `Arc<Mutex<_>>` when `RwLock` or channel would fit better
- `panic!` in library code

### Java / Kotlin
- Catching `Exception` or `Throwable` broadly
- `null` returns where `Optional`/`null-safe type` fits
- Mutable `public` fields
- Missing `@Override` on overrides
- Raw generic types (`List` instead of `List<T>`)
- String concatenation in loops (use StringBuilder)
- Returning null collections instead of empty ones

---

## Confidence Loop (shared across all expert agents)

After all passes:

- **< 5 on any dimension** = automatic fail. STOP and surface the specific gap. Do NOT iterate.
- **5-6** = revise that specific pass (max 3 revision passes).
- **≥ 7** = pass.
- After 3 revision passes at < 7, surface to the user with the specific gap.

Document final confidence scores in the report footer.

---

## Handoffs

Every code-reviewer report ends with a "Handoffs" section listing which other experts should review specific findings:

- **Hardcoded secrets, SQL concatenation, unsanitized user input** → `security-auditor`
- **O(n²) in hot paths, large allocations, blocking I/O on request path** → `performance-engineer`
- **Untested critical paths, missing integration tests on new endpoints** → `test-engineer`
- **API inconsistencies, missing versioning, unbounded pagination** → `api-designer`
- **Slow queries, missing indexes, N+1** → `db-architect`
- **Component / accessibility concerns in UI files** → `ux-engineer`
- **Flaky deploy, missing health checks, noisy alerts** → `sre-engineer`

The code-reviewer does NOT fix these — it flags and hands off. Its own fixes stay inside the 7 dimensions above.
