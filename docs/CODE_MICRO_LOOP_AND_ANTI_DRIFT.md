# Code Micro-Loop & Anti-Drift Design

**Status:** Proposal — 2026-06-22
**Audience:** `bpm-opencode-experts` (canonical), Foreman, and every consumer (Claude Code, OpenCode, local LLMs)
**Thesis:** The process is the scaffolding that lets a *non-frontier* model behave like a frontier one. Frontier models self-correct drift mid-flight; Gemini and local small-parameter models drift *further* each step. So every correction a strong model does silently in its head must be externalized as an explicit, **individually checkable, recorded** micro-step. Micro-steps without tracking = more drift; micro-steps with a checkable gate + a written trace = a weak model that *cannot* wander off.

---

## 1. The drift taxonomy — every way it creeps in

| # | Vector | Example | Hits hardest |
|---|---|---|---|
| 1 | **Perception** — a check reports false state ("file missing" when present) | a Mode-4 audit reported G1–G7 as "missing" though canonical had them | all; weak models can't sanity-check the check |
| 2 | **Reinvention** — rewrite what already exists, diverging | inferior stubs overwrote 6 canonical files | small models "helpfully" rewrite |
| 3 | **Knowledge/API** — code from stale training data (hallucinated/outdated APIs, slopsquatted packages, phantom imports) | — | small/older models |
| 4 | **Slop** — over-engineering, stubs, defensive bloat, duplication, stale comments | the inferior stubs | all |
| 5 | **Size/complexity** — files grow past what the model can hold coherently | — | acute on small context windows |
| 6 | **Tracking/doc** — work happens, tracker/docs don't update → state lost between steps | "things get lost as we work through steps" | all; compounds across sessions |
| 7 | **Context** — goal/constraints fade across micro-steps (context rot) | — | severe for local models |
| 8 | **Verification** — maker==verifier; self-report over-confidence | the false audit went unchecked before acting | all |
| 9 | **Release-state** — code changes but version/tag/CHANGELOG don't → consumers & deployments can't tell what they have; SHA-divergence across remotes | tags/versions left stale after a change | all; compounds across machines/consumers |

---

## 2. Current coverage — what canonical ALREADY enforces (do NOT rebuild)

Grounded in a read of canonical (cited). This is ~80% of the solution and is itself the anti-reinvention lesson.

| Vector | Existing machinery (canonical) | Strength |
|---|---|---|
| 3 Knowledge/API | **Law 2** (`coding-agent.md:64-70`) — `resolve-library-id` + `get-library-docs` MANDATORY before using any library; Phase 2 of the loop | strong, but see G-E |
| 4 Slop | `ANTI_SLOP_RULES.md` R-01..R-29; `validate-code-health.sh` (R-01/02/13/15/16/19 + H-01..H-05); Phase-5 self-audit scores all 28; code-reviewer confidence loop blocks merge | strong |
| 2 Reinvention | `coding-agent.md:175` "check if it already exists — read it fully before editing"; write-scope isolation + `validate-scope.sh` | partial → G-B |
| 5 Size | function ≤50 lines (H-01, blocking); file >250 lines (H-02, **advisory only**) | weak → G-A |
| 6 Tracking | Completion Manifest mandatory + honesty rule (`coding-agent.md:258-322`); `validate-completion-manifest.sh`; `validate-inventory.sh` (SDLC_TRACKER/DELEGATION_LOG freshness) | partial → G-D |
| 8 Verification | MICRO_LOOP deterministic-first + `verifier_model` (G1); CHALLENGER_PROTOCOL; refuse-to-loop | strong |
| 1 Perception | (relies on the agent reading real files) | weak → G-B |
| 7 Context | disk-state everywhere; ≤1,200-tok context packets; per-phase reset | strong |

**Conclusion:** the gaps are narrow and specific. We *extend*, we do not rebuild.

---

## 3. The real gaps (verified)

- **G-A — No enforced book-style code sizing.** `BOOK_PROTOCOL.md` is docs-only (300-line → chapters). For code, the >250-line check (`validate-code-health.sh` H-02) is *advisory*; nothing blocks a monolith or requires decomposition. **This is the "each code file doesn't get too large" ask — genuinely missing as a gate.**
- **G-B — No canonical-overwrite / locate-before-create gate.** "Read if it exists" is trusted prose, not enforced. Nothing blocks overwriting a tracked file with an inferior version, or detects an audit's false "missing" claim before acting. *The exact Mode-4 drift.*
- **G-D — Tracker update is not a per-step gate for the coder.** The orchestrator owns SDLC_TRACKER; a coding step can complete without touching it → cross-step state lost (the user's main pain).
- **G-E — "API unverifiable → proceed with a warning."** Acceptable for a frontier model, drift for a small one. Should become a **BLOCKED row** (refuse to write that call), not "proceed."
- **G-F — Release-state drift (vector 9).** A change can land without a version bump, CHANGELOG entry, or tag, and remotes can diverge by SHA. **Fix:** make versioning a gate — `validate-release-readiness.sh` should require a matching version + CHANGELOG entry + tag before a release is "done"; the release protocol reconciles both remotes to the same SHA (merge, not force-push). Versioning is part of "track everything," not a manual afterthought.

---

## 4. The hardened CODE micro-loop

Extends `MICRO_LOOP.md` with code-specific, individually-gated steps. Each step is a hard gate so a weak model cannot skip it.

```
0. CRITERION   — restate the checkable "done": tests pass, lint+health exit 0,
                 every file ≤ size cap, every external API verified. No criterion → refuse.
1. LOCATE      — for every target path: `git ls-files <path>` / grep the symbol.
                 EXISTS → read it fully; if it's tracked & older than this branch,
                 DIFF intent vs current and JUSTIFY any change in the manifest.
                 Refuse to "recreate from scratch" a file that already exists.   [G-B]
2. VERIFY-API  — for every external library/API: Context7 resolve+docs (or node_modules).
                 Unverifiable → mark that call BLOCKED, do NOT write it from memory.  [G-E]
3. PLAN-SHAPE  — if the unit would exceed the file-size cap, decompose UP FRONT into
                 an index/barrel + chapter modules (one concern each) before writing. [G-A]
4. PRODUCE     — smallest correct code; match the 2-3 files read in this directory.
5. ANTI-SLOP   — self-check R-01..R-29; run validate-code-health.sh (exit 0).
6. VERIFY      — deterministic first (build+test+lint+size); then verifier_model on the diff.
7. TRACK       — update the tracker/PROGRESS/inventory row; loop-learn on any miss.   [G-D]
8. EXIT        — criterion passes → manifest + phrase; stall → [PARTIAL] + escalate.
```

Bounds unchanged: ≤2 revise iterations; refuse-to-loop on unmeasurable criteria.

---

## 5. New / changed machinery (concrete, gap-closing)

### 5.1 `validate-file-size.sh` (G-A — book-style code)
- Fails (exit 1) on any source file over a cap (default **400 lines**, warn at **300**), language-aware, excluding generated/lock/test-fixture files.
- Emits the **decomposition suggestion**: "split `x.ts` (612 lines) into `x/` with an index + chapters by concern."
- Wired into `validate-code-health.sh` (promote H-02 from advisory to blocking) and the phase-4 gate.
- **Book-style code rule** added to a new `agents/shared/CODE_BOOK_PROTOCOL.md` (or a section in BOOK_PROTOCOL): a unit > cap becomes a *directory* — `index.ts` (barrel/public surface) + chapter files, one concern each, ≤ cap, max nesting depth 2 — mirroring the doc book protocol the user already likes.

### 5.2 `validate-no-reinvent.sh` + LOCATE protocol rule (G-B — anti-overwrite)
- A pre-commit/post-HANDOFF gate: for every file the agent *created or overwrote*, assert it did not replace a **canonical, build-generated, or recently-tracked** file without an explicit justification line in the manifest (`OVERWRITE <path>: <reason>`).
- For the dual-repo case specifically: any write under a path listed in `GENERATED_FILES.txt` is a hard fail (those are build outputs).
- Protocol rule (promote the Mode-4 lesson from a CLAUDE.md note to `BOUNDED_TASK_CONTRACT.md`): **"Before creating any file, `ls`/`diff` against the canonical source. An audit claiming a file is missing must be confirmed with `ls`/`diff` before acting."**

### 5.3 Verify-or-block (G-E)
- Edit `coding-agent.md` Law 2 / Phase 2: replace "tell the user you cannot verify and proceed" with **"mark the call BLOCKED and stop — do not write an unverified external API from memory."** A frontier model may be trusted to proceed; the default must protect the weak model.

### 5.4 Tracker-as-gate (G-D)
- Add **TRACK** as step 7 of the code micro-loop (above): a step completes only after its tracker/PROGRESS/inventory row is updated.
- Run `validate-inventory.sh` as a per-step gate (not just per-phase): fail if tracked work artifacts changed but the tracker row didn't.
- Completion-manifest schema gains a required `Tracker updated: <file>#<row>` line.

---

## 6. Drift vector → gate → who it protects

| Vector | Gate that stops it | Frontier | Non-frontier | Local small |
|---|---|---|---|---|
| 1 Perception | LOCATE (ls/diff before act) | nice-to-have | important | **critical** |
| 2 Reinvention | `validate-no-reinvent` + GENERATED_FILES hard-fail | nice | **critical** | **critical** |
| 3 API | Law 2 Context7 (exists) | have | have | have |
| 4 Slop | anti-slop + code-health (exists) | have | have | have |
| 5 Size | `validate-file-size` (blocking) | nice | important | **critical** (context) |
| 6 Tracking | TRACK step + inventory-as-gate | nice | **critical** | **critical** |
| 7 Context | disk-state (exists) + smaller units | have | have | **critical** |
| 8 Verify | verifier_model + Challenger (exists) | have | **critical** | **critical** |

The pattern: frontier models already "have" most of this internally; the gates exist to carry the non-frontier and local models. **Smaller units + harder gates + mandatory tracking = a weak model that converges instead of drifting.**

---

## 7. Implementation plan (canonical → flows to all consumers via build)

| Wave | Item | Files |
|---|---|---|
| 1 | `validate-file-size.sh` + promote H-02 to blocking + `CODE_BOOK_PROTOCOL.md` | new validator, `validate-code-health.sh`, new shared doc |
| 1 | Wire file-size into phase-4 gate + the code micro-loop CRITERION | `validate-phase-gate.sh`, `MICRO_LOOP.md` |
| 2 | `validate-no-reinvent.sh` + LOCATE rule + GENERATED_FILES hard-fail | new validator, `BOUNDED_TASK_CONTRACT.md`, `coding-agent.md` |
| 2 | Verify-or-block edit | `coding-agent.md` (Law 2 / Phase 2) |
| 3 | TRACK step + inventory-as-gate + manifest `Tracker updated` line | `MICRO_LOOP.md`, `coding-agent.md`, `validate-completion-manifest.sh` |
| 4 | Build + `build:claude` + tests; verify each new gate trips on a planted defect (both directions) | — |

Each new validator must be tested **both directions** (passes clean code, fails a planted defect) per the canonical validator convention. After landing, `npm run build:claude` propagates to claude-experts; Foreman picks it up via `build:foreman`.

---

## 7a. Implementation status

| Gap | Status | Shipped in |
|---|---|---|
| **G-A** book-style code sizing | ✅ DONE | v1.14.0 — `validate-file-size.sh`, `CODE_BOOK_PROTOCOL.md`, PLAN-SHAPE, H-02 consolidated |
| **G-B** no-reinvent / canonical-overwrite guard | ✅ DONE | v1.14.0 — `validate-no-reinvent.sh`, BOUNDED_TASK_CONTRACT Rule 9 (LOCATE) |
| **G-D** tracking-as-gate | ✅ DONE | v1.15.0 — `validate-tracker-fresh.sh` (git-based: work changed ⇒ a tracker changed), MICRO_LOOP TRACK step, mandatory manifest `Tracker updated:` line |
| **G-E** verify-or-block API | ✅ DONE | v1.16.0 — coding-agent Law 2 / Phase 2: API unverifiable ⇒ mark **BLOCKED**, never write from memory (default protects the weak model) |
| **G-F** release-state / versioning-as-gate | ✅ DONE | v1.16.0 — `validate-release-readiness.sh` conditions 11–12: version ↔ CHANGELOG entry (hard) + matching tag (warn), with reconcile-remotes guidance |

**All 6 gaps closed.** The anti-drift set (G-A book-sizing, G-B no-reinvent, G-D tracking, G-E verify-or-block, G-F versioning) + the 9-vector taxonomy is complete.

Follow-up: ✅ **DONE (v1.17.0)** — both validators gained a `--base <ref>` merge-gate mode (compare branch vs base, not just the working tree) and are wired into the git-expert merge gate as **condition 5** (`validate-no-reinvent --base <base>` + `validate-tracker-fresh --base <base>` must exit 0 before any merge to main / parent). They now run automatically at the merge point, not just on demand.

---

## 8. What this is NOT

- Not a rebuild — ~80% exists; this closes 4 narrow gaps.
- Not frontier-only — every gate is a bash/script check a local model triggers the same way.
- Not bureaucracy for its own sake — each gate maps to a specific drift vector that has already bitten us (Mode-4) or will bite weaker models first.
