---
description: 'Reference document — read on demand, not an agent.'
disable: true
mode: "all"
---

# ANTI_SLOP_RULES.md

**Canonical list of AI code-quality anti-patterns ("AI slop").**

Single source of truth referenced by `coding-agent.md`, `code-reviewer.md`, `frontend-design.md`, `validate-code-health.sh`, and `validate-vendor-provenance.sh`. Every specialist that produces or reviews code must check against these rules.

Sources: GitClear 2025 (211M LOC study), Veracode GenAI Code Security Report 2025, CSA AI-Generated Code Security Surge 2026, USENIX Security 2025 (package hallucinations), dev community research (Greptile, Addy Osmani, DEV Community, eslint-plugin-llm-core, AI-SLOP Detector v2.7.0, Sloppylint Dec 2025).

**2025-2026 additions (R-21 through R-30):** slopsquatting, architectural privilege escalation, credential leakage, docstring inflation, phantom imports, disconnected pipelines, logic density, LLM output handling, prose padding, and library-shaped reimplementation. These were not documented in 2024 editions.

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
**Also covers — fallbacks that return *correct* results.** `try { fastPath() } catch { slowPath() }` where slowPath yields the same right answer silently hides that fastPath is permanently broken: every caller sees correct output, so nothing looks wrong, while the optimized/primary path never runs. Same trap with a capability flag defaulted inside a swallowed catch (`try { enable() } catch { enabled = false }`) — the feature is dead but degraded-path output stays correct. A fallback that substitutes a degraded path MUST be observable: log a warning, bump a metric, or expose a queryable flag, so "works" can't mask "primary path is dead." (Real bug: a vector-index flag defaulted false inside a catch; the whole test suite passed via brute-force fallback while the index never activated.)

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

**Script enforcement:** `validate-code-health.sh` enforces R-01, R-02, R-13, R-15, R-16, R-19 (grep-based). All rules are enforced by code-reviewer's anti-slop dimension in the confidence loop.

---

## Category 6: Supply Chain Slop (2025-2026 — NEW)

### R-21 Hallucinated Package Names (Slopsquatting)
**Pattern:** AI suggests a package name that doesn't exist on npm/PyPI/crates.io. Developer installs it without checking. Attacker has registered the name with malicious code.
**Research basis:** USENIX Security 2025 — LLMs hallucinate package names at ~20% rate. 43% of hallucinated packages are suggested consistently across re-runs (same prompt → same hallucination → systematic install). Charlie Eriksen documented one hallucinated package propagating through 237 repositories via autonomous agents.
**Why it fails:** Malicious package executes at `npm install`. Supply chain compromise before first `git commit`.
**Rule:** For any package not well-known (< 500k weekly downloads or not in your training data's common knowledge): verify with `npm view <pkg>` or `pip show <pkg>` before importing. Run `npm audit` and `pip-audit` on every dependency change.
**Detection:** Package in `package.json`/`requirements.txt` returns 404 on registry. Or: weekly downloads < 100 with recent publish date.

### R-22 Architectural Privilege Escalation Paths
**Research basis:** Apiiro data across Fortune 50 (Dec 2024–Jun 2025) shows +322% privilege escalation paths and +153% architectural design flaws in AI-assisted codebases. Monthly security findings went from ~1,000 to ~10,000 in 6 months.
**Pattern:** AI generates service-to-service calls where Service A has access to Service B's admin API without explicit authorization check — because the AI saw an admin client in the context and reused it everywhere.
**Why it fails:** AI doesn't reason about trust boundaries. It produces structurally correct code that violates the principle of least privilege at the architectural level.
**Rule:** Every cross-service call must explicitly specify which credentials/role it uses. No credential reuse between services. Review all new inter-service integrations for privilege scope.

### R-23 Elevated Credential Leakage Rate
**Research basis:** CSA 2025 — AI-assisted commits expose secrets at 3.2% rate vs. 1.5% for human-only commits (2x+). AI frequently generates code with hardcoded credential patterns from training data.
**Pattern:** `const apiKey = "sk-..."` or `password: "example123"` in non-test code. Hardcoded fallbacks: `process.env.API_KEY || "prod-fallback-key"`.
**Rule:** No string literals that look like secrets, passwords, tokens, or connection strings in production code. All credentials via environment variables or secrets manager. No hardcoded fallbacks that expose production values.

---

## Category 7: Structural Slop (2025-2026 — NEW)

### R-24 Docstring Inflation (Logic Density Ratio violation)
**Research basis:** AI-SLOP Detector v2.7.0 — measures **Logic Density Ratio (LDR)**: ratio of executable logic to structural overhead. Flagged in AI output when doc/impl ratio > 3x.
**Pattern:** A 5-line function with a 20-line docstring explaining "what" the function does, including obvious parameter descriptions ("@param id the ID of the user"), return type restating the TypeScript type, and usage examples for trivial cases.
**Why it fails:** Documentation should explain WHY (hidden constraint, surprising behavior, external requirement). Documenting WHAT is duplicating what the type system already says.
**Rule:** Docstrings only when the WHY is non-obvious. Never document type information that TypeScript/Python already expresses. LDR < 1.0 (more docs than logic) is a slop signal.

### R-25 Phantom Imports
**Research basis:** Sloppylint (Dec 2025), AI-SLOP Detector — AI generates imports for libraries it plans to use but doesn't, or confuses library names across languages.
**Pattern:** `import { something } from 'nonexistent-package'` that passes TypeScript compilation (e.g., it's installed as a dev dep) but is never referenced. Or Python `import requests` that is used nowhere in the file.
**Why it fails:** Dead imports signal disconnected generation — AI wrote a plan and didn't fully implement it. They also inflate bundle size if not tree-shaken.
**Rule:** Every import must have at least one use in the file. Run `eslint --rule 'no-unused-vars'` and `pylint W0611` in CI with `--max-warnings 0`.

### R-26 Disconnected Pipelines (Dead Scaffolding)
**Research basis:** AI-SLOP Detector v2.7.0 — most impactful detection category: "architectural scaffolding that looks complete but is wired to nothing."
**Pattern:**
- Event emitter set up but never subscribed to
- Queue created but no consumer registered
- Strategy pattern implemented but only one strategy ever passed
- Middleware registered but never mounted
- Error boundary component created but never wrapping anything
**Why it fails:** Passes all tests (no test covers the integration). Gives false confidence of a working architecture. Found in production when the expected behavior never fires.
**Rule:** Every architectural construct (event, queue, middleware, strategy) must have at least one actual integration test that verifies it is wired and fires. If it's not tested end-to-end, it may be disconnected.

### R-27 Unimplemented Stubs as Features
**Pattern:** Function body is `pass`, `...`, `throw new Error("not implemented")`, or `return null` — but the function is exported and included in documentation as a feature.
**Why it fails:** Callers in production get runtime errors or silent no-ops. Worse: other AI-generated code calls stubs because they appear real in context.
**Rule:** Stubs are only acceptable in `TODO` branches explicitly marked in the PR description. Never export a stub as a completed feature. `grep -rn "throw new Error.*not implemented\|TODO.*implement"` in pre-merge gate.

### R-28 LLM Output Consumed Without Validation
**Research basis:** Veracode GenAI 2025 — 45% of AI-generated code fails security tests; worst offenders are output handling (log injection 88%, XSS 86%). LLM-generated code that integrates with OTHER LLMs is particularly risky.
**Pattern:** `result = llm.generate(prompt); db.execute(result)` — LLM output used directly as SQL, shell command, HTML, or code.
**Why it fails:** The LLM is an injection vector. Its output can be manipulated (prompt injection) to produce malicious SQL/HTML/commands. See OWASP LLM05.
**Rule:** LLM output is always **untrusted user input**. Validate against a schema before use. Never pass LLM output to `eval()`, `exec()`, `db.execute()` without parameterization, or `innerHTML` without sanitization.

### R-29 Prose Padding (Local LLM Output Slop)
**Research basis:** Observed consistently across qwen3, gemma3, and similar local models when producing documentation, findings reports, and analysis. Distinct from R-13/R-14 (code comments) — this covers agent-generated *markdown prose*.
**Pattern:** Three specific verbal tics that inflate word count without adding information:
1. **Confidence-hedging openers:** "It's worth noting that…", "One might consider…", "It should be mentioned that…", "It is important to note that…"
2. **Repetitive section openers:** Every finding begins "This is a significant [security/performance/quality] concern that…" — all findings start the same way.
3. **Fake specificity:** Citing "industry best practices" or "modern approaches" or "established patterns" without naming the specific practice, standard, or source.
**Why it fails:** Padding dilutes real signal. A report where every finding is prefixed with "It's important to note that this is a significant concern" forces the reader to parse 30% more text to get the same information. On local LLMs with tight output budgets, it also wastes tokens on noise.
**Rule:** State findings directly. "This function has no error handling" not "It's worth noting that one might observe that this function arguably lacks error handling." If citing a practice, name it: "OWASP recommends parameterized queries (A03:2021)" not "industry best practices suggest using safe query patterns."
**Grep signal:** `grep -rn "worth noting\|it should be mentioned\|one might consider\|important to note" docs/ agents/` — flag any occurrence in agent-produced deliverables.

---

## Category 8: Vendoring & Provenance Slop (2025-2026 — NEW)

### R-30 Library-Shaped Reimplementation (Silent Fork)
**Research basis:** Field lesson B-2 (Mode-1 SDLC engagement, external install, field report 2026-07). A design doc claimed "we use library X" for a vendored/copy-paste component set. A reviewing developer identified the actual components as renamed variants, missing sizes, and an older template — not the real library, just library-X-*shaped* — "reinventing the component lib" under the library's name.
**Pattern:** An agent told to vendor/copy-paste library X generates X-flavored files from memory (training data) instead of pulling the real upstream artifacts via the library's actual CLI, registry, or repo. The design doc, a comment, or a README then asserts "we use X" unqualified, masking the drift. No step ever diffs the vendored copy against upstream, so dropped variants (missing sizes/components), renamed props, and stale structure accumulate invisibly.
**Why it fails:** The claim "we use X" is untested. The vendored code becomes an unacknowledged fork carrying its own maintenance burden — upstream security fixes and API changes never arrive — with none of the review scrutiny a declared fork would get. The field lesson also found the design doc's *stated reason* for vendoring (a supply-chain rationale) named the wrong library entirely (see R-A5/ADR rules) — B-2 is specifically about the code drifting from upstream, not the rationale being wrong.
**Rule:** When a library is vendored/copied (not a runtime dependency), it MUST be generated from the library's real CLI, registry, or repository — never approximated from memory — with the source name and version recorded at the vendor site (e.g. a `VENDORED.md` file listing `source`, `tool`/`registry`, `version`, and the exact file/variant list pulled). If a vendored file was in fact written from memory (no CLI/registry pull was possible), that MUST be declared explicitly in the same manifest ("generated from memory, not pulled from upstream — divergence risk") rather than presented as an unqualified "we use X."
**Reviewer check:** For any "we use library X" claim (docs, comments, ADRs, PR descriptions), spot-diff a sample of the vendored files against the real upstream artifact (the CLI's fresh output, or the tagged release in the upstream repo). Drift — renamed/dropped variants, a stale template, missing affordances — is filed as a **fork / maintenance-debt finding**, distinct from a functional bug: it still blocks the "library X" claim from standing unqualified even when the vendored code works correctly.
**Detection:** `scripts/validators/validate-vendor-provenance.sh` — flags (a) a directory with vendoring language ("vendored from", "copied from", "based on", "adapted from" a named library) but no `VENDORED.md` provenance record, and (b) a `VENDORED.md` whose declared file/variant list doesn't match what's actually on disk (dropped variants = declared-but-missing, renamed/undeclared variants = present-but-not-declared).

---

## Detection Tools (2025-2026)

| Tool | Language | Key rules | Install |
|------|----------|-----------|---------|
| `eslint-plugin-llm-core` | JS/TS | 20 rules; no-async-in-array-methods, no-explicit-any, strict null | `npm i -D eslint-plugin-llm-core` |
| `AI-SLOP Detector v2.7.0` | JS/TS | LDR measurement, phantom imports, disconnected pipelines | VS Code extension + CLI |
| `Sloppylint` | Python | 100+ rules; hallucinated imports, stubs, wrong-language patterns | `pip install sloppylint` |
| `Sloplint` | Multi-lang | AST-based; similar to sloppylint but language-agnostic | `github.com/dannote/sloplint` |
| `semgrep` | Multi | Community rules for deprecated APIs, PII logging, bypassed security | `semgrep --config auto` |
