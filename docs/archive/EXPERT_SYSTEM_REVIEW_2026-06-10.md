# Expert System Review — 2026-06-10

**Scope:** All expert agents in attest (applies equally to attest-claude — content is shared). Four questions: (1) what is each expert's true goal and how does it actually work, (2) is the Ralph Wiggum + Challenger flow really wired or just prose, (3) is every expert a proper portable prompt + standard handoff usable by any LLM, (4) which experts are missing. Plus: current state of OpenCode subagent support (the original reason for the repo split).
**Companion:** `docs/archive/ARCHITECTURE_EVOLUTION_PLAN.md` (Parts 1–7), `IMPROVEMENT_BACKLOG.md` (28 items — not duplicated here).

---

## 1. The experts — goals and how they truly work

All 10 primary experts were read in full. Goals are crisp across the board; the system has a consistent skeleton with real (not decorative) structure:

| Universal sections (10/10) | Common (8+/10) | Rare |
|---|---|---|
| Loop Prevention, Execution workflow (bounded SDLC-TASK or orchestrator mode), Completion Manifest, Pre-Completion Gate | Context Budget, Research Tools, Progress announcements | Scope Boundary (coding-agent, researcher only), HANDOFF packet examples (security-auditor only) |

**Per-expert verdicts (goal / size / portability 1–5):**

| Expert | Goal (one line) | Est. tokens | Portability |
|---|---|---|---|
| security-auditor | Dispatch 8 security specialists in waves, synthesize, chain attacks last | 954 | 3/5 |
| code-reviewer | Dispatch 6 code-health specialists, synthesize compound risk | 2,103 | 2/5 |
| performance-engineer | Dispatch 5 perf specialists; never optimize without measuring | 2,543 | 2/5 |
| test-engineer | Tests that catch real bugs; use-case catalog; e2e infra | 5,693 | 2/5 |
| ux-engineer | Design direction, workflows, WCAG; live-environment-first | 3,814 | 3/5 |
| frontend-design | Bridge UX spec → production UI; anti-slop aesthetics | 3,834 | 3/5 |
| db-architect | Access-pattern-driven schema, migrations, EXPLAIN literacy | 4,453 | 2/5 |
| coding-agent | Doc-driven implementation, verify APIs, manifest honesty | 4,090 | 2/5 |
| challenger | Evidence-only verdicts: CONFIRMED/CONTRADICTED/UNVERIFIABLE | 1,208 | **4/5** |
| researcher | 4-mode research with credibility tiers + checkpoints | 6,892 | **1/5** |

**Average portability 2.4/5.** The challenger is the model citizen — small, capped (4 calls/claim, 40 total), evidence-gated. The researcher is the worst offender: 6.9k tokens of non-negotiable methodology assuming a specific MCP stack.

**Cross-cutting problems found:**

- **P1 — 22% boilerplate.** Loop Prevention, Context Budget, Research Tools, the 5-step bounded contract, and the manifest template are repeated near-verbatim across 7–10 agents ≈ **7,750 duplicated tokens** out of 35,584 total. One edit = ten files.
- **P2 — contradictions inside prompts** (small models follow the wrong branch):
  - test-engineer: "task() does not work. Do NOT call it" (line ~100) vs "task-driven pattern" (line ~106).
  - code-reviewer: Bounded Task Mode says "skip everything, execute 5 steps" while Orchestrator/Phase modes assume the opposite entry — the mode fork is implicit.
  - coding-agent: Law 3 (match existing patterns) vs Law 4 (follow approved tech stack) with no precedence rule; 8-dimension self-audit can loop 3× per pass with no time bound.
  - ux-engineer: claims "three modes" but defines five.
  - security-auditor: `--quick` skips attack-chainer yet the Challenger Gate text assumes the full pipeline produced the findings.
- **P3 — frontier-only instructions.** "Pick an extreme aesthetic direction," "what bug would page someone at 3am?", "every schema decision justified by access patterns" — excellent heuristics for a frontier model, unanchored for a 7–30B model. These need a worked example or a checklist beside them (plan 4.3 exemplars address this).
- **P4 — single-stack assumptions.** test-engineer is Playwright/vitest/TS-specific; db-architect assumes one relational DB; researcher hard-requires playwright-search MCP functions. Each needs an explicit "if tool X absent → fallback Y" line (ux-engineer already does this well for Playwright).

---

## 2. Ralph Wiggum + Challenger — flow trace verdict

**Ralph Wiggum: REAL wiring, and well designed.** The loop is enforced by `scripts/validators/run-coverage-loop.sh`, not by prose: iteration count is persisted on disk in `docs/work/COVERAGE_LOOP_<phase>_<date>.md` (grep-counted by the script, line 50), the 3-iteration cap is a script branch (line 133) surfacing as exit code 2, and the orchestrator only reads gap files and emits HANDOFFs. The model never holds loop state in context — exactly right for 32k models (~4.7k tokens total loop overhead across 3 iterations ≈ 15% of a 32k window).

**Challenger: REAL gate-blocking, structurally independent.** Fires at Gate A (TECH_STACK), Gate B (THREAT_MODEL + SECURITY_CONTROLS), and on HIGH/CRITICAL findings from security/code-review/perf/research. `sdlc-lead.md:533`: no human approval block until zero CONTRADICTED verdicts. It runs as a fresh-session HANDOFF with only the artifact + packet (no access to the author's reasoning) — true structural independence, and it refuses incomplete artifacts ("CHALLENGER BLOCKED … run Ralph Wiggum coverage loop first").

**Flow gaps found:**

- **F1 — `/sdlc feature` and `/sdlc improve` have no coverage loop at all.** Only init phases 3/3.5/4/5 and onboard --deep run `run-coverage-loop.sh`. Feature mode relies on targeted reviews + runtime validators only. Fix: a *scoped* inventory (changed-files + touched routes/tables) so feature/improve get a 1–2 iteration mini-loop instead of nothing.
- **F2 — Challenger-on-incomplete risk in those same modes.** Because no coverage loop ran, the "Ralph first, Challenger second" ordering rule is unenforceable in feature/improve — the Challenger's DRAFT/TODO check is the only guard.
- **F3 — onboard mode has no Challenger at all.** HEALTH_ASSESSMENT and LANDSCAPE ship factual claims (versions, counts, "no tests for X") with no veracity check. Onboard claims are exactly the kind that go stale or get hallucinated.
- **F4 — no archival of old `COVERAGE_LOOP_*` files.** They accumulate; a later session listing docs/work/ pays tokens for every stale loop file. Add cleanup/archive to the script.

---

## 3. Handoff standardization — can any LLM run these?

**Output side: strong.** 84/85 agent files declare the identical 7-section Completion Manifest from `BOUNDED_TASK_CONTRACT.md:54-73`. Synthesizer token math checks out for 32k models (attack-chainer ≈ 4.9k, code-health-synthesizer ≈ 3.7k, perf-synthesizer ≈ 3.6k total context).

**Defects:**

- **H1 — `entry-point-tracer.md` is non-compliant**: no Completion Manifest section at all (file ends at the completion phrase, line 135). Violates Rule 6. Worst-shaped micro-agent for a generic LLM: no manifest, no output schema, no partial-progress state.
- **H2 — no input contracts anywhere.** No micro-agent declares what its HANDOFF must contain (expected CONTEXT files, WRITE-SCOPE, PRODUCE list). A generic LLM given a malformed packet has nothing to validate against. Add a 5-line "## Input Contract" section to every specialist.
- **H3 — Rule 3 (verbatim completion phrase) is violated** by attack-chainer and entry-point-tracer (formula-based phrases). Either enforce or amend the rule.
- **H4 — preconditions/yields chaining exists only in the security cluster.** `FINDING_SCHEMA.md` is why attack-chainer is the single best-shaped agent for a 32k model (explicit input schema + pseudocode algorithm). Code-review and performance clusters synthesize by informal heuristics ("3+ specialists on one file = compound"). Create `code-review/FINDINGS_SCHEMA.md` and `performance/FINDINGS_SCHEMA.md` mirroring the security pattern — this is the difference between "hand it to any LLM" and "hope the model infers intent."

**Bottom line:** best-shaped for a generic 32k model today: attack-chainer, static-perf-analyzer. Worst: entry-point-tracer, code-health-synthesizer. With H1–H4 fixed, any synthesizer prompt + packet + specialist files should run on a generic 32k model reliably.

---

## 4. OpenCode subagent support — the split's premise has changed

Researched 2026-06-10:

- **OpenCode now supports subagents natively**: defined as markdown files in `~/.config/opencode/agents/` with `description`/`mode`/`model`/`temperature` frontmatter; invoked by @ mention, automatically by description, or via the **Task tool — which blocks and waits for completion**. Custom user-defined subagents in the Task tool: shipped (issue #20059 closed).
- **Open bug #16491 (still open):** subagents spawned via the Task tool **cannot execute MCP tools** — they appear in the registry but permission checks fail. So native subagents have read/write/bash/grep but no memory MCP, no code-search, no playwright-search, no Context7.
- **Reliability caveats:** the Task tool awaits the subagent run **with no timeout wrapper** (#6573); subagents can crash silently in high concurrency while the parent waits forever (#18378); model-specific indefinite hangs reported (#13841).
- **Async dispatch** (fire-and-forget + poll) is a feature request (#15069), not shipped.

**Implications for the architecture:**

1. **The manual copy-paste HANDOFF is no longer the only OpenCode execution mode.** The protocol files saying "task() does not work in OpenCode — never emit a task() call" are now *version-dependent* statements, and wrong on current OpenCode.
2. **Three executors, picked by capability probe, not by runtime identity:**
   - Native Task tool — when probed available AND the child needs no MCP tools (most micro-agents: they read files and write findings — native tools suffice).
   - `tools/task.ts` subprocess (`opencode run --agent X`) — **this bypasses #16491 entirely** because a fresh process is a primary session with full MCP access. Use for children that need memory/code-search/web research. Already has timeout protection (up to 900s) — which the native Task tool lacks.
   - Manual HANDOFF paste — fallback for interactive sessions / older versions.
3. **Add capability flags to `.model-context`:** `has_task_tool=true|false`, `mcp_in_subagents=true|false` (probe `opencode --version` + a registry check). Protocol files reference the flags instead of asserting "task() doesn't exist."
4. **Keep the DAG runner anyway (plan 4.1).** The hang reports are exactly why: the runner's per-node timeout, health check, and journal (plan G5/G6) protect against the Task tool's missing timeout. Native Task is an *executor* under the runner, not a replacement for it.
5. **Watch #16491 and #15069** — when MCP-in-subagents lands, the subprocess executor becomes optional; when async dispatch lands, the runner can parallelize natively.

---

## 5. Missing experts

Already tracked in IMPROVEMENT_BACKLOG (not repeated): cost-optimization (A1), accessibility (B1), data-governance (B2), load-testing (B3), analytics (B4).

Existing coverage check against the ask: frontend-design ✓, ux-engineer ✓, test-engineer ✓, ui-verifier ✓ (spec-conformance browser checks). Gaps:

### E1 — Task Decomposer (highest priority — it's the keystone of the small-LLM strategy)
A dedicated expert whose only artifact is `plan.json`: take any request, emit a typed DAG of bounded leaf tasks (`{id, agent, inputs, output, depends_on, tier_needed, tokens_est}`), each sized to fit a tier=small budget. Today decomposition lives implicitly inside sdlc-lead + mode files — the hardest cognitive job in the system is the least specialized. Cloud does decomposition once; small models execute leaves. Pairs with plan 4.1's runner and 4.7's triage (the decomposer assigns `tier_needed` per node). Also reusable standalone: "/decompose <anything>" is valuable outside SDLC.

### E2 — End-User Simulator (true end-user testing)
Distinct from ui-verifier (which checks "does the implementation match the spec"). This expert checks **"can a human actually get the job done"**: loads USER_PERSONAS.md, picks a persona + goal, walks the live app via Playwright like a first-time user — no spec knowledge, only what's on screen. Produces a friction log (where it hesitated, misread labels, dead ends, recovery from errors), first-run-experience report, and task-completion verdict per persona. An LLM is genuinely good casting for this: it reads the UI as text the way a confused human skims. Repeat per persona (novice/expert) and on tier=small models deliberately — *a small model failing to navigate your UI is itself a usability signal*.

### E3 — Game development cluster
Reuse existing experts for the engineering (coding-agent, perf, test, frontend-design) and add the four genuinely missing specialisms:
- **game-designer** — core loop, mechanics, GDD (Game Design Document replaces SRS in the SDLC mapping; phase gates still apply: vision → GDD → systems design → vertical slice → content).
- **gameplay-engineer** — engine-specific implementation patterns (Godot/Unity/Phaser/Bevy): game loop vs frame budget, ECS vs inheritance, physics, input buffering, state machines. The generic coding-agent will write server-shaped code in a game loop without this.
- **game-balance-designer** — progression curves, economy sinks/sources, difficulty tuning; outputs spreadsheet-style models with formulas, not vibes. (Pairs naturally with a validator: simulate 1,000 player-sessions in a bash/Node script and check the curve.)
- **playtest-evaluator** — E2's sibling for games: plays the vertical slice via browser/input automation, evaluates against fun heuristics (clarity of goal, feedback juice, difficulty ramp, time-to-first-success), produces a playtest report. True end-user testing for play.
SDLC mapping note: a `--game` flavor of init mode that swaps SRS→GDD, USER_STORIES→player stories, and inserts a vertical-slice gate before content production.

### E4 — LLM-integration engineer
The system audits LLM apps for security (owasp-llm-checker) but has no *design-side* expert for building them: prompt architecture, eval harness design, model routing/fallback chains, token budgeting, structured-output contracts, RAG shape. Given the portfolio (Jarvis, ThreatForge AI features, this very system), the absence is conspicuous. It would also own the system's own protocol quality — dogfooding.

### E5 — Release manager (small)
Owns version bumps, changelog assembly (delegating to changelog-writer), tag/release flow, deploy-gate checklist sequencing. Currently smeared across git-expert + sre-engineer + devops skill; a thin coordinator with a checklist closes the gap. Low effort, prevents the "version metadata drift" class of defect found in Part 2 of the evolution plan.

Deliberately not proposed: localization, mobile, data-engineer — wait for a project that needs them (experts without a consuming project rot).

---

## 6. Enhancement list from this review

| # | Enhancement | Fixes | Effort |
|---|---|---|---|
| R1 | Factor shared boilerplate into one source; build step injects per-agent, with a **compact variant per tier** (small tier gets ≤1.5k-token agent prompts, full text for large) | P1, portability scores | M |
| R2 | Resolve the 5 in-prompt contradictions (test-engineer task(), code-reviewer mode fork, coding-agent law precedence, ux mode count, security --quick gate) | P2 | S |
| R3 | Add "## Input Contract" (5 lines) to every specialist; fix entry-point-tracer manifest; enforce/amend Rule 3 verbatim phrases | H1–H3 | S |
| R4 | FINDINGS_SCHEMA.md for code-review + performance clusters (mirror security's preconditions/yields) | H4 | S–M |
| R5 | Scoped mini coverage loop for `/sdlc feature` + `/sdlc improve` (changed-files inventory, 2-iteration cap) | F1, F2 | M |
| R6 | Challenger pass on onboard factual artifacts (HEALTH_ASSESSMENT, LANDSCAPE) | F3 | S |
| R7 | COVERAGE_LOOP archival in run-coverage-loop.sh | F4 | S |
| R8 | Capability-probed executor selection: native Task tool / subprocess task.ts / manual paste; `has_task_tool` + `mcp_in_subagents` flags in `.model-context`; rewrite "task() doesn't work" prose as flag-conditional | §4 | M |
| R9 | New experts: task-decomposer (E1), end-user-simulator (E2), llm-integration-engineer (E4), release-manager (E5) | §5 | M–L |
| R10 | Game cluster (E3) + `--game` SDLC flavor — when a game project exists | §5 | L |
| R11 | Per-agent fallback lines for stack assumptions (no Playwright, NoSQL DB, missing MCP) | P4 | S |

**Sequencing note:** R1–R3 are prerequisites for the small-LLM goal — they cut every agent's fixed token cost and remove the branches small models misread. R8 should land with the evolution plan's G3/G4 (executor + structured-output work). E1 (decomposer) should be built alongside the DAG runner (plan 4.1) since they are two halves of one mechanism.

---

## Sources (OpenCode research)
- [OpenCode Agents docs](https://opencode.ai/docs/agents/) — subagents, Task tool, frontmatter
- [#20059 Task tool support for custom subagents](https://github.com/anomalyco/opencode/issues/20059) — closed/shipped
- [#16491 Subagents can't execute MCP tools](https://github.com/anomalyco/opencode/issues/16491) — open
- [#6573 Task tool awaits with no timeout](https://github.com/anomalyco/opencode/issues/6573)
- [#18378 Subagent hangs in high concurrency](https://github.com/anomalyco/opencode/issues/18378)
- [#15069 Async task dispatch feature request](https://github.com/anomalyco/opencode/issues/15069)
