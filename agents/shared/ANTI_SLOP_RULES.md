# ANTI_SLOP_RULES.md

**Canonical list of AI code-quality anti-patterns ("AI slop").**

Single source of truth referenced by `coding-agent.md`, `code-reviewer.md`, and `validate-code-health.sh`. Every specialist that produces or reviews code must check against these rules.

Sources: GitClear 2025 (211M LOC study), Veracode GenAI Code Security Report 2025, dev community research (Greptile, Addy Osmani, DEV Community, eslint-plugin-llm-core).

---

## Category 1: Error Handling Slop

### R-01 Catch-all swallowing
**Pattern:** `catch (e) {}` or `catch (e) { console.log(e) }` — error is swallowed with no caller notification.
**Why it fails:** Silent failures appear as "working" code. Bugs become impossible to trace. A caught exception that produces no signal is worse than a crash.
**Rule:** Catch only at system boundaries (HTTP handlers, queue consumers, scheduled jobs). Every catch that does not re-throw MUST either return a typed error result to the caller or trigger a user-visible error path. Empty catch blocks are forbidden unconditionally.

### R-02 try/catch inside tight loops
**Pattern:** `for (const item of items) { try { process(item) } catch {} }`
**Why it fails:** V8 (and other JIT compilers) cannot optimize functions with try/catch in hot loops — 5-20x slowdown measured in production systems.
**Rule:** Wrap the loop, not each iteration. Validate before the loop if items can be invalid.

### R-03 Exception-driven control flow
**Pattern:** Using throw/catch to handle expected states — e.g., `try { JSON.parse(input) } catch { return defaultValue }` in a hot path.
**Why it fails:** Exceptions are 100-1000x more expensive than conditional checks. They also obscure intent.
**Rule:** Use guard clauses or try-parse patterns for expected failures. Reserve exceptions for truly unexpected states.

### R-04 Serial awaits that block parallelism
**Pattern:** Three `await` calls in sequence where all three are independent:
```ts
const a = await fetchUser(id)
const b = await fetchOrders(id)
const c = await fetchPrefs(id)
```
**Why it fails:** Total latency = sum of all three. Should be: `const [a, b, c] = await Promise.all([...])`
**Rule:** Independent async operations MUST be `Promise.all` / `Promise.allSettled`. Sequential awaits are only valid when each depends on the prior result.

---

## Category 2: Abstraction Slop

### R-05 Single-implementation interfaces/factories
**Pattern:** `interface PaymentProcessor { charge(): ... }` with exactly one implementation (`StripeProcessor`) and no second implementation in the codebase or the backlog.
**Why it fails:** Adds indirection with no benefit. Every future reader must trace interface → implementation for zero payoff. The "we might add PayPal later" argument is speculative generalization.
**Rule:** Abstract only when there are ≥2 concrete implementations. One = concrete class directly.

### R-06 Delegation-only wrapper classes
**Pattern:** `class MyService { constructor(private dep: Dep) {} doThing() { return this.dep.doThing() } }` — wraps a dependency without adding logic.
**Why it fails:** Adds a type and file for zero behavior. Every future reader asks "why does this exist?"
**Rule:** Wrappers must add logic (transformation, validation, caching, error mapping). Pure delegation = delete the wrapper.

### R-07 Single-use helper functions
**Pattern:** Extracting 2-4 lines into a named function called exactly once in the codebase.
**Why it fails:** Indirection without reuse. The abstraction is costlier than the code it hides.
**Rule:** Extract to a function only when it is called ≥2 times OR it represents a named domain concept worth making explicit. One call = inline it.

### R-08 Repository pattern on simple CRUD
**Pattern:** `UserRepository` → `UserDAO` → `UserService` for three Prisma `findUnique` calls.
**Why it fails:** Adds three layers of indirection for zero behavior. ORM IS the repository pattern.
**Rule:** Use the ORM directly in service code unless query logic is genuinely complex (multi-join aggregations, raw SQL for performance). Do not wrap ORM calls in another abstraction "for testability" — mock the ORM directly.

---

## Category 3: Defensive Bloat

### R-09 Null checks on types you control
**Pattern:** `if (result === null || result === undefined)` on a value whose type is `string` or `User` — a type the codebase owns and controls.
**Why it fails:** Signals the developer does not trust their own types. If the type can be null, fix the type. If it cannot, remove the check.
**Rule:** Null-guard only at system ingress (user input, API responses, DB results). Internal-to-internal calls follow types.

### R-10 Fallback values that hide failures
**Pattern:** `catch { return [] }` or `catch { return "" }` when an operation fails — caller receives an empty result indistinguishable from a successful empty result.
**Why it fails:** The caller cannot distinguish "no data" from "data could not be fetched." Bugs become invisible. Monitoring misses failures.
**Rule:** On failure, return a typed error result or throw. Never return a value that looks like success.

### R-11 Unspecified retry logic
**Pattern:** Retry + exponential backoff added to a DB call or API request that has no retry requirement in the spec.
**Why it fails:** Adds complexity (state, timing, idempotency concerns) with no design basis. Retry logic is a system-level concern that must be specified.
**Rule:** Add retry only when the spec explicitly requires it (e.g., "idempotent external payment call must retry up to 3 times"). No cargo-cult retry.

### R-12 Feature flags on unreleased code
**Pattern:** `if (featureFlags.enableNewCheckout)` added to code that has no users and no rollout plan.
**Why it fails:** Flags add branch complexity, dead code paths, and test cases for zero benefit when there is no rollout infrastructure.
**Rule:** Feature flags only when there is a concrete rollout plan in SCOPE.md or a staged-deployment requirement. New code for a new product has no users to roll back from.

---

## Category 4: Comment and Style Slop

### R-13 What-comments
**Pattern:** Comments that describe WHAT the code does mechanically:
```ts
// increment the counter
counter++

// check if user is authenticated
if (!user.isAuthenticated)
```
**Why it fails:** The code already says what it does. What-comments add noise, rot quickly, and are the single most reliable indicator of AI-generated code in code reviews.
**Rule:** Comments explain WHY, not WHAT. "Why" = a non-obvious constraint, a workaround for a specific bug, a hidden invariant, a performance tradeoff. If removing the comment would not confuse a future reader, remove it.

### R-14 Step-by-step narration blocks
**Pattern:** Multi-line comment blocks narrating the algorithm:
```ts
// Step 1: Validate the input parameters
// Step 2: Fetch the user from the database
// Step 3: Check their permissions
// Step 4: Apply the transformation
```
**Why it fails:** If your code needs prose narration to be understood, the code itself is unclear. Fix the code, not the comments.
**Rule:** No numbered step comments. No paragraph comments explaining an algorithm. Name things well enough that the sequence is self-evident.

### R-15 Stale JSDoc / docstring parameters
**Pattern:** `@param userId The user's ID` when the function was refactored to take `@param options: { userId, teamId }`.
**Why it fails:** Wrong documentation is worse than no documentation — it actively misleads.
**Rule:** If you add a JSDoc/docstring, you are responsible for keeping it accurate. Stale parameters are a test failure, not a style issue. If you cannot maintain it, do not add it.

### R-16 Emojis in code comments
**Pattern:** `// ✅ User authenticated successfully` or `// 🚀 Fast path`
**Why it fails:** Emojis in source code are a near-certain AI giveaway to experienced reviewers. They read as "generated, not authored."
**Rule:** No emojis in source code comments. Emojis belong in commit messages or PR descriptions where the author has intentionally placed them.

---

## Category 5: Structural Slop

### R-17 Speculative generalization
**Pattern:** Adding a `strategy` parameter, `options` object, `config` knob, or `hook` callback to code that has one concrete use case and no planned second use case.
**Why it fails:** Every hypothetical extension point is a maintenance burden today for a requirement that may never arrive. "What if someone wants to configure this later?" is not a spec.
**Rule:** Build for the requirements in SRS.md. Add extension points only when MODULE_DESIGN.md § Plugin Points explicitly identifies the seam. No imaginary future callers.

### R-18 Cargo-cult patterns
**Pattern:** Circuit breaker, rate limiter, distributed cache, message queue, service mesh — added because the AI saw them in training data, not because the system requires them.
**Why it fails:** Each pattern adds operational complexity. A circuit breaker on a local DB call adds failure modes, not resilience. A message queue for synchronous user-facing operations adds latency.
**Rule:** Every architectural pattern must trace to a specific requirement in SRS.md or a documented constraint in DESIGN_CONTEXT.md. "Best practice" is not a justification.

### R-19 Duplicated blocks (copy-paste growth)
**Pattern:** Three handlers each containing an 8-line block of identical input-validation logic, differing only in field names.
**Why it fails:** Duplication is the primary driver of maintenance debt. One fix needs to happen in N places, and always misses one.
**Rule:** Any pattern repeated ≥2 times is an abstraction candidate. Extract after the second duplication — not before (R-07), not never.

### R-20 Inconsistent pattern usage
**Pattern:** In a codebase that uses Prisma service calls in `src/users/`, the AI builds `src/payments/` using raw SQL queries because that's what appeared in its context window.
**Why it fails:** Inconsistent patterns mean every module is foreign to developers from other modules. Cognitive load grows with every inconsistency.
**Rule:** Read 2-3 existing files in the same directory before writing new code. Match their patterns — error handling, naming, file structure, module organization. Do not invent a new pattern when an existing one covers the use case.

---

## Anti-Slop Scoring (used in code-reviewer confidence loop)

Each rule is scored per finding:
| Score | Meaning |
|-------|---------|
| 0 | No violations found |
| 1 | 1-2 minor violations (e.g., one what-comment) |
| 2 | 3-5 violations or 1 structural violation |
| 3+ | Systemic violations (multiple files, foundational problem) |

**Block thresholds:**
- R-01, R-02, R-03 (error handling): any violation ≥1 blocks merge
- R-05, R-06, R-08 (abstraction): any violation ≥2 blocks merge
- R-13, R-14 (comment slop): ≥3 instances blocks merge (systemic, not isolated)
- R-17, R-18 (structural): any violation blocks merge
- R-19, R-20 (duplication/inconsistency): ≥2 instances blocks merge
- All others: ≥2 instances blocks merge

**Script enforcement:** `validate-code-health.sh` enforces R-01, R-02, R-13, R-15, R-16, R-19 (grep-based). All 20 rules are enforced by code-reviewer's anti-slop dimension in the confidence loop.
