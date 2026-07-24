---
description: 'Mode 1 phase files — Phase 5: Review and Release. Loaded on demand by sdlc-init-mode.md dispatcher when entering Phase 5.'
mode: "subagent"
---

> **Persistence (do not end your turn early):** never end your turn after *announcing* an action — perform it; if you cannot call a tool, print `BLOCKED: <reason>` (never a plan as your final message). Full rule: `agents/shared/PERSISTENCE.md`.


# Mode 1 — Phase 5: Review and Release

> Load only when sdlc-init-mode.md directs you here. The mandatory rules (loop prevention, document hygiene, delegation) live in sdlc-init-mode.md and apply here too.
>
> **task() → HANDOFF (compact reminder):** Any `task(agent="X", ...)` in this file = emit a HANDOFF block for X using the `════` delimiter format, save state to `docs/work/sdlc-state.md`, wait for user to return. Full rules in `sdlc-init-mode.md` § Delegation Rule.
> **Autonomy:** In `autonomy: auto` (per `agents/shared/AUTONOMY_PROTOCOL.md`) never wait on a paste — Executor C degrades to D (inline) per `EXECUTOR_SELECTION.md`.

## HANDOFF intake (MANDATORY — resolve before any other mode)

A HANDOFF can reach you in three shapes. **All three mean: execute the task now.** Resolve this
section before mode selection, scope-boundary checks, or anything else in this file.

| What arrives in your prompt | What it means |
|---|---|
| Starts with `SDLC-TASK for` | The HANDOFF body is inline — execute it |
| Names a `docs/work/HANDOFF_*.md` path, in **any** wording ("read it and follow it", "it reads X", "open /skill, it reads X", or just the bare path) | `read()` that file first, then execute the `SDLC-TASK for` body inside it |
| Tells you to open/run a skill that **is you** | You are already that agent. Do not ask the user to open it. Execute. |

**Six rules:**

1. **Read, then do.** If a `docs/work/HANDOFF_*.md` path appears anywhere in your prompt, read that
   file before you reply. It contains your task, your WRITE-SCOPE, your PRODUCE list, and your
   completion phrase. A pointer to a HANDOFF is a HANDOFF.
   **Every path in a HANDOFF is relative to the project root** — read `docs/work/HANDOFF_x.md`, never
   `/docs/work/HANDOFF_x.md`. A leading `/` escapes to the filesystem root and the read is denied.
   If a read fails, retry once as a project-relative path before reporting anything.
2. **Keep a task ledger — your memory lives on disk, not in this conversation.** Your FIRST action
   after reading the HANDOFF: if `docs/work/TASKS_<agent>-<slug>.md` does not already exist (the
   orchestrator may have written it), create it by transcribing the HANDOFF's steps verbatim, one
   `- [ ] <step>` checkbox per step. Tick a box (`- [x]`) the moment that step's evidence exists on
   disk — never batch ticks. **THE LOOP:** whenever you are unsure where you are — after a
   compaction, a long detour, or any interruption — re-read the original HANDOFF and the ledger,
   reconcile each checkbox against what actually exists on disk (files, commits, verify report),
   fix any box that is wrong in either direction, then do the FIRST unchecked item. Repeat until
   every box is ticked; only then run the done-gate and print the completion phrase. The runtime
   re-injects this ledger's status into every turn, so trusting it costs nothing and trusting your
   memory of the conversation is the known failure mode.
3. **Never re-emit a HANDOFF you received.** Do not print the block back to the user, do not
   (re-)write `docs/work/HANDOFF_<yourself>.md`, and do not tell the user to open the skill you are
   already running. Handing your own task back is the single most common pipeline stall on smaller
   models — it looks like progress and produces nothing.
4. **`USER:` lines are not addressed to you.** Lines inside the block aimed at `USER:` (e.g. "open a
   new session, type `/<skill>`, paste everything below") are delivery instructions for the human who
   has *already* delivered it. Ignore them. Never relay them back.
5. **A turn ends only three ways: more work, the completion phrase, or `BLOCKED: <evidence>`.**
   Never a menu of options (A/B/C…), a confirm-request ("shall I proceed?", "confirm you want the
   tests"), or a question about which mode, slug, scope, or step to run — the HANDOFF already
   answered those; asking again stalls an unattended pipeline while looking cooperative. If a
   detail is genuinely absent, pick the documented default, state it in one line, and proceed.
6. **Then follow the contract.** Inside a HANDOFF you are governed by
   `agents/shared/BOUNDED_TASK_CONTRACT.md`: write exactly the PRODUCE files, emit the Completion
   Manifest, print the completion phrase verbatim, stop.

**The one exception.** Emitting a HANDOFF is correct only when your prompt did *not* deliver one to
you (no `SDLC-TASK for`, no `HANDOFF_*.md` path). Delegating onward to a **different** agent is
normal orchestration; re-issuing the handoff you were just given is not.

## Phase 5: Review — DID it work?

Phase 5 runs in **five rounds**. Rounds 1 and 3 can overlap (audit HANDOFFs in Round 3 are parallel-safe with the fix-verify work in Round 2). Rounds 4 and 5 are strictly sequential.

```
Round 1: Reviews fan-out  — 4 parallel HANDOFFs (always parallel)
Round 2: Fix-Verify loop  — up to 3 iterations (coding-agent + re-verify)
Round 3: Audit fan-out    — 3 parallel HANDOFFs (parallel-safe with Round 2 iteration N-1)
Round 4: Release Gate     — run-coverage-loop.sh phase-5 (must exit 0)
Round 5: Release          — git-expert --release
```

### Phase 5 Pre-Gate Checklist

Before Round 1, confirm Phase 4 is fully closed:

```
PHASE 5 PRE-GATE CHECK

  Phase 4 gate passed:    ✓/✗ (lock: docs/work/gates/phase-4-passed.lock)
  All RUNTIME_*.md PASS:  ✓/✗
  All FIX_BACKLOG clean:  ✓/✗ (0 open CRITICAL/HIGH per module)
  IaC + CI/CD complete:   ✓/✗
  PARALLELIZATION_MAP all waves DONE: ✓/✗

ALL ✓ → proceed to Round 1
ANY ✗ → return to Phase 4, close the gap first
```

---

### Round 1 — Reviews (always parallel)

Save state, then emit ONE message with all review HANDOFFs:

```
write(filePath="docs/work/sdlc-state.md", content="
Mode: 1 / Phase: 5 — Round 1: Reviews
Last completed: Phase 4 gate passed
Awaiting: parallel fan-out — security + perf + code-review + ux
Next after resume: synthesize FIX_BACKLOG_RELEASE_<date>.md
")
```

```
---
  PHASE 5 — ROUND 1: REVIEWS ([N] parallel HANDOFFs)
  Open N sessions concurrently. All must complete before Round 2.
---

<!-- HANDOFF — never run the security audit yourself; write docs/work/HANDOFF_security-auditor.md, point the user at /security, read only SECURITY_FINAL_<date>.md -->
───── HANDOFF #1 → /security (security-auditor) ─────
SDLC-TASK for security-auditor:
CONTEXT: entire codebase (src/) + docs/THREAT_MODEL.md + docs/API_DESIGN.md
  + docs/reviews/CODE_REVIEW_FINAL_* (if exists — read prior review before starting).
YOUR TASK: Full OWASP Top 10 audit. For each finding: verbatim code quote + file:line
  + severity + fix. Cross-reference with any prior code-review findings — don't re-raise
  what's already flagged. Findings only — do NOT fix.
  Before printing done: re-read your report cold as a skeptical reviewer. Add missing
  evidence for any finding you'd question if you hadn't written it.
PRODUCE: docs/reviews/SECURITY_FINAL_<date>.md — sorted by severity, OWASP category
  table, verdict (READY / BLOCKED).
Print exactly: "security done — [CRITICAL count, HIGH count, verdict]"

───── HANDOFF #2 → /perf (performance-engineer) ─────
SDLC-TASK for performance-engineer:
CONTEXT: docs/SRS.md NFR targets + full codebase + docs/reviews/CODE_REVIEW_FINAL_* (if exists).
YOUR TASK: Benchmark against every NFR target. Report measured vs. target. For each miss:
  root cause + fix + expected delta. Findings only — do NOT self-optimize.
  Before printing done: re-read your report cold. Every FAIL must have measured evidence,
  not just a claim.
PRODUCE: docs/reviews/PERF_FINAL_<date>.md — NFR table, flame graph/evidence for FAILs,
  verdict (RELEASE-READY / BLOCKED).
Print exactly: "perf done — [N/M NFR targets passed]"

───── HANDOFF #3 → /review-code (code-reviewer) ─────
SDLC-TASK for code-reviewer:
CONTEXT: entire codebase (src/) + docs/ARCHITECTURE.md + agents/shared/ANTI_SLOP_RULES.md.
YOUR TASK: Full 9-dimension health review (7 standard + anti-slop + tech-stack compliance per
  agents/shared/ANTI_SLOP_RULES.md). Flag every CRITICAL/HIGH with file:line + fix.
  Run validate-code-health.sh before printing done. Re-read the report cold — if you'd
  question a finding reading it fresh, add the evidence.
PRODUCE: docs/reviews/CODE_REVIEW_FINAL_<date>.md — findings per dimension,
  health scores 1-10 per dimension (anti-slop threshold ≥8), verdict (APPROVED /
  NEEDS REVISION / REJECT), top 5 priority fixes.
Print exactly: "review done — [verdict and top issue]"

───── HANDOFF #4 → /ux (ux-engineer) [if UI-bearing] ─────
SDLC-TASK for ux-engineer:
CONTEXT: UI source files + docs/design/UX_SPEC.md + docs/design/STYLE_GUIDE.md.
YOUR TASK: Full WCAG 2.2 AA audit — alt text, keyboard nav, color contrast (4.5:1),
  ARIA, focus order, responsive. File:line + fix per finding. Findings only.
  Before printing done: re-read cold. Every CRITICAL must have a specific file:line.
PRODUCE: docs/reviews/UX_AUDIT_<date>.md — findings by severity (CRITICAL first),
  summary counts, verdict (RELEASE-READY / BLOCKED).
Print exactly: "ux done — [CRITICAL/HIGH count and release verdict]"

───── HANDOFF #5 → /qa-vnv (qa-vnv-engineer — end-user V&V) [if UI-bearing] ─────
SDLC-TASK for qa-vnv-engineer:
CONTEXT: the RUNNING app URL (+ creds) + docs/testing/USE_CASES.md + docs/design/tokens.json (if present).
YOUR TASK: Validate the rendered app from the end user's side, with evidence — this is
  end-user validation, NOT the ux-engineer's static WCAG audit and NOT test-engineer's
  code-view coverage. Run the objective layout/visual checks (overlap, real computed
  color + WCAG contrast, overflow, responsive matrix), visual-regression, and each P0
  user journey UNDER the runtime error watchdog (console.error / pageerror /
  requestfailed / HTTP 4xx-5xx / dialog / error-banner). Every finding = a measured
  number + an artifact. INDEPENDENCE (IEEE 1012): you must be a different context than
  the coding-agent that implemented these screens — validate, do not self-certify.
PRODUCE: docs/testing/vnv/VNV_REPORT_<date>.md + docs/testing/vnv/evidence/<date>/
  (trace/video/screenshots/diffs). Findings → FIX_BACKLOG. Then run
  validate-qa-evidence.sh against the report before printing done.
Print exactly: "qa-vnv done — [verdict, N journeys, N layout/visual, N runtime errors]"

---
```

After all completion phrases return → proceed to Round 2.

**Git checkpoint — commit Round 1 review documents:**
```
task(agent="git-expert", prompt="Commit all new docs/reviews/ files from Round 1 (CODE_REVIEW_*_<date>.md, SECURITY_*_<date>.md, PERF_*_<date>.md, UX_*_<date>.md) plus docs/testing/vnv/ (VNV_REPORT + evidence) to the current feature branch. Conventional commit: 'docs(reviews): add round 1 review findings'. Push to origin. Only stage docs/reviews/ and docs/testing/vnv/ files.", timeout=60)
```

---

### Round 2 — Fix-Verify loop

After every review's completion phrase prints, synthesize `docs/reviews/FIX_BACKLOG_RELEASE_<date>.md` (see `agents/shared/FIX_VERIFY_LOOP.md` § Step 2). Deduplicate across all reviews; every merge-blocking row must have a Verify criterion.

If "Merge-blocking" is empty → Round 2 is done; skip to Round 3.

**Git checkpoint after each Fix-Verify iteration:**
After writing FIX_BACKLOG_*_<date>.md and each VERIFY_*_<iteration>_<date>.md:
```
task(agent="git-expert", prompt="Commit docs/reviews/FIX_BACKLOG_*_<date>.md and docs/reviews/VERIFY_*_<date>.md (latest files only) to the feature branch. Conventional commit: 'docs(reviews): update fix-verify backlog — iteration N'. Push. Only stage docs/reviews/ files.", timeout=60)
```

**Iterate up to 3 times per `agents/shared/FIX_VERIFY_LOOP.md` Steps 3-5:**
1. Remediation HANDOFF (coding-agent receives FIX_BACKLOG_RELEASE)
2. Targeted re-verification HANDOFFs — emit ALL triggered specialist re-verifications in ONE message (parallel-safe — each verifies only its own rows)
3. All PASS → exit loop. Any FAIL → next iteration.
4. After 3 failed iterations → emit escalation block, STOP, wait for decision [A/B/C/D]

**Re-verification fan-out example (parallel):**
```
---
  ROUND 2 — RE-VERIFICATION (parallel)
  Open one session per specialist with active backlog rows
---
[security-auditor re-verify HANDOFF — only their BACKLOG rows]
[code-reviewer re-verify HANDOFF — only their BACKLOG rows]
[performance-engineer re-verify HANDOFF — only their BACKLOG rows]
```

**Start Round 3 after Fix-Verify iteration 1 completes** — don't wait for all iterations. Audits (tech-debt, coverage, container) are read-only and parallel-safe with fix-verify work.

---

### Round 3 — Audit fan-out (parallel-safe with Round 2 iterations)

Start these alongside Round 2's remediation/re-verify work — they read code without modifying it.

Emit all three in ONE message:

```
---
  PHASE 5 — ROUND 3: AUDITS (4 parallel HANDOFFs — start after Round 2 iteration 1)
---

───── HANDOFF A → /review-code (code-reviewer — tech debt) ─────
SDLC-TASK for code-reviewer:
CONTEXT: entire codebase (src/).
YOUR TASK: Produce a prioritized tech-debt register. Identify every instance of:
  duplicated code, missing abstractions, hardcoded values, missing tests, unclear naming,
  accumulated workarounds. Sort by leverage (low effort / high impact first).
PRODUCE: docs/reviews/TECH_DEBT_<date>.md — each item with description, file:line,
  effort S/M/L, impact if fixed, leverage score. Highest leverage first.
Print exactly: "debt done — [total items, top leverage item]"

───── HANDOFF B → /test-expert (test-engineer — coverage) ─────
SDLC-TASK for test-engineer:
CONTEXT: test suite (test/ or __tests__/) + docs/TEST_STRATEGY.md + source codebase.
YOUR TASK: Analyse test coverage. Flag: modules < 80%, critical paths with uncovered
  branches, tests in docs/TEST_STRATEGY.md that haven't been written.
PRODUCE: docs/reviews/COVERAGE_<date>.md — coverage % per module, untested critical
  paths with file:line, missing tests from strategy, prioritized "write these first" list.
Print exactly: "test done — [overall coverage, most critical gap]"

───── HANDOFF C → /containers (container-ops — container audit) ─────
SDLC-TASK for container-ops:
CONTEXT: Dockerfile + docker-compose.yml + docs/ARCHITECTURE.md.
YOUR TASK: Audit container config for production readiness. Check: layer sizes,
  multi-stage build, dev deps in final image, CVE scan on base images, health checks.
PRODUCE: docs/reviews/CONTAINER_AUDIT_<date>.md — image sizes, layer breakdown,
  CVEs severity-rated, optimization recommendations, production readiness verdict.
Print exactly: "containers done — [image size, CVE count, readiness verdict]"

───── HANDOFF D → /documentation-gap-finder (doc-gap audit — release readiness) ─────
SDLC-TASK for documentation-gap-finder:
CONTEXT: source codebase (src/) + existing docs/ + README + public API surface.
YOUR TASK: Before release, find what is public but undocumented, documented but stale,
  or missing entirely. Cover the most-exposed public surface first (exported functions/
  classes, HTTP routes, CLI commands). Report gaps — do not write the docs.
PRODUCE: docs/reviews/DOC_GAPS_<date>.md — undocumented public symbols with file:line,
  stale/contradicted doc references, coverage %, prioritized "document these first" list.
Print exactly: "doc-gaps done — [coverage %, count undocumented public symbols]"
```

Wait for all four completion phrases. Round 3 audits do NOT block Round 2 completion — they run concurrently.

**Git checkpoint — commit Round 3 audit documents:**
```
task(agent="git-expert", prompt="Commit all new docs/reviews/ files from Round 3 (TECH_DEBT_*_<date>.md, COVERAGE_*_<date>.md, CONTAINER_AUDIT_*_<date>.md, DOC_GAPS_*_<date>.md) to the feature branch. Conventional commit: 'docs(reviews): add tech-debt, coverage, container, and doc-gap audit reports'. Push. Only stage docs/reviews/ files.", timeout=60)
```

---

### Round 4 — Release Gate

**Pre-gate checklist:**
```
PHASE 5 ROUND 4 PRE-GATE CHECK

  Round 1 reviews: ✓/✗ All 4 completion phrases received
  Round 2 fix-verify: ✓/✗ All merge-blocking rows PASS or waived
  Round 3 audits: ✓/✗ All 3 completion phrases received (TECH_DEBT + COVERAGE + CONTAINER)
  FIX_BACKLOG_RELEASE: ✓/✗ Exists with 0 open CRITICAL/HIGH
  RUNTIME_*.md: ✓/✗ All show PASS

ALL ✓ → run: ./scripts/validators/run-coverage-loop.sh phase-5
ANY ✗ → close the gap first
```

**Run the coverage loop:**
```bash
./scripts/validators/run-coverage-loop.sh phase-5
```

The Phase 5 coverage loop chains: `validate-build`, `validate-lint`, `validate-tests`, `validate-deps`, `validate-smoke`, `validate-fix-backlog-closed`, `validate-code-health`, `validate-module-boundaries`, `validate-release-readiness`.

`validate-release-readiness.sh` checks all 10 conditions atomically:
- FIX_BACKLOG_RELEASE 0 open CRITICAL/HIGH
- SECURITY_FINAL = READY, PERF_FINAL = RELEASE-READY, CODE_REVIEW_FINAL = APPROVED
- UX_AUDIT = RELEASE-READY (if UI-bearing), COVERAGE no critical gap
- CONTAINER_AUDIT no CRITICAL CVE, TECH_DEBT exists, all RUNTIME PASS

| Loop exit | Action |
|-----------|--------|
| 0 (clean) | Proceed to Round 5 |
| 1 (gaps, iter < 3) | Fix the gap, re-run |
| 2 (3 iterations exhausted) | Emit Ralph Wiggum escalation — user decides waiver/fix/defer |

---

### Round 5 — Release

Only after Round 4 coverage loop exits 0:

```
task(agent="git-expert", prompt="--release: compute next semver from conventional commits, generate CHANGELOG entry, create signed annotated tag, push to all remotes, draft GitHub + Gitea releases.", timeout=120)
```

**Exit:** Phase 5 coverage loop exit 0, release tag cut and pushed to all remotes
