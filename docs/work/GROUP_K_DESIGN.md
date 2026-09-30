# Group K — ECC intake: design (rev 2, 2026-09-29, after 3 challenger passes)

Source: affaan-m/ECC (MIT). Backlog: `IMPROVEMENT_BACKLOG.md` Group K. Applies K3's own framework to K's items:
machine-decidable done-criterion, must-NOT-do boundaries, retry cap, escalation. Nothing goes default-on without an
eval that was pre-registered. Rev 1 was challenged by three independent reviewers who read primary sources; their
findings changed the plan (see "What the challenge changed").

## Global boundaries
- No merge on a red suite (`npm test` = 0 failed). No hand-edits to generated files; `npm run build:claude`, commit both repos.
- No edits to the user's `~/.claude/settings.json` or global hooks. Installers print, never write.
- Branch per item; commit per wave; push `gitea` AND `github` (neither repo has an `origin`; verified for both).
- Every new gate ships with a red fixture and is proven RED by breaking the subject (law L3).
- Wiring proof = calling the real entry point with the host's real argument shape. A source-text grep is not proof.
- Retry cap: cite `skills/goal/SKILL.md` (2 same-tier attempts then escalate) — no second number here.
- Stop and ask the user for: model / `claude -p` spend, any external dependency, any change to global config.

## What the challenge changed
| Item | Rev 1 | Now | Evidence |
|------|-------|-----|----------|
| K3 | validator for 5 loop-goal criteria | **validator CUT**; add the missing anti-tamper "must NOT" clause to goal/autopilot/wave | attest already has `validate-loop-readiness.sh`, goal intake gate (refuses "no checkable success"), 3-iteration cap; "loop spec" is not a locatable artifact; keyword-stuffable |
| K5 | rationalization warn-only scanner | **CUT** (revisit only with a named consumer) | Pass 51 already checks claims against run evidence (stronger); ECC's 4 regexes have no measured precision |
| K2 | A/B, n=10, 1 flip rule | **redesigned** (below); harness built, **runs need user approval** | forced-pause confound; under-powered; survivorship filter; coverage holes |
| K4 | port skill-comply | **trace capture first**, then a predicate-based ordering checker | attest has counts-only telemetry, no per-tool-call trace; ECC's grader needs an LLM classifier for step detection |
| K6 | 8 items adopt/mine/skip | verdicts below (mostly SKIP / small MINE) | full-file reads: 4 of 8 ECC files are thinner than attest's counterpart |

## Already fixed while closing K1/K2
- opencode 1.4.0 passes call args in `output.args` for `tool.execute.before`; the plugin read `input.args`, so every guard was a no-op. Fixed; Pass 58 drives the real hook (RED on the old plugin).
- gateguard: deny log (`EXPERTS_GATEGUARD_LOG`), 30-min TTL, `multiedit` covered, Write-gate schema fact; Claude hook: never-shared session key, TTL, log, loud jq-missing.
- Disclosed divergences from ECC (deliberate): no Bash gate; no subagent exemption (subagent sessions gate separately); no denial condensing; no exempt globs.

## K1 config-protection — DONE
Existing lint/type/test config edits blocked (incl. `multiedit`); creation allowed; bypass env. Claude registration is manual (installer prints the entry).

## K2 gateguard — opt-in; default-on requires this pre-registered A/B
- **Guarantee check:** every run logs `gate_denied` rows. Report **intent-to-treat** (all runs) AND **fired-only**; a fired-only result that disagrees with ITT is reported as such, never chosen after the fact.
- **Arms (same model/prompt):** A ungated · B gate with the fact request · C ungated + prompt line "before editing, list importers and affected APIs" · D gate with a neutral "retry" message (pure pause). B>A but B≈D means the benefit is a forced pause, not facts; B≈C means ship the prompt line, not the hook. Score "facts given" by transcript (did importer Grep/Read occur between deny and retry).
- **Tasks:** ≥16 across: ≥6 multi-module (importer/data-schema hazards), ≥4 isolated single-file (gate expected to be pure tax), ≥4 reuse-vs-create traps, ≥2 authored **blind to the gate's fact list** by someone other than its author. Hidden behavioural tests live OUTSIDE the workdir, are hashed, and tool logs are scanned for reads of them (gamed runs discarded, counted).
- **Runs:** ≥5 per task per arm. **Analysis:** paired per-task deltas, sign test / McNemar with a 95% CI; secondary: turns, tokens, wall time.
- **Flip rule (all must hold):** B−A lower CI bound > 0 on multi-module; B not worse than A on isolated beyond the pre-set margin; median cost overhead ≤ 25%; B−D reported (if ≈0, prefer the cheaper design). Else stays opt-in, result recorded either way.
- **Write-path holes:** tool names used per run are logged; runs where an ungated path (bash write, `apply_patch`) did the edit are flagged and reported separately.
- **Escalate:** model choice and spend (LM Studio here is unresponsive; frontier runs cost money). Harness built; runs not started.

## K3 (changed) — anti-tamper boundary in the loop skills
- Done: `skills/goal`, `skills/autopilot`, `skills/wave` each carry, in their Boundaries section, an explicit clause: the loop must not delete/skip/weaken tests, loosen lint/type config, or edit its own acceptance check to reach "done"; a test asserts all three skills carry it (gap-fill test, RED when a clause is removed).
- NOT: a new validator; new loop-spec artifact; restating the retry cap.

## K4 (changed) — trace capture, then deterministic ordering
1. **Trace capture:** `tool.execute.after` appends `{ts, seq, session, tool, args-summary}` JSONL when `EXPERTS_TRACE_LOG` is set (opt-in, counts nothing else). Test drives the real hook.
2. **Ordering checker** `scripts/lib/trace-order.mjs`: spec steps are **predicates on tool + args** (no LLM); supports `after`/`before`; keeps ECC's demotion pass (a dependant may not pass on a failed prerequisite) and forward-reference rule; **tie rule:** events sharing one `seq` group (parallel calls in one assistant message) are unordered, so ordering constraints across a tie never fail. Fixtures: ECC's compliant/non-compliant TDD traces re-expressed for predicates (MIT attribution); RED when order is broken.
- NOT: `claude -p` runs or an LLM classifier without approval; porting the Python verbatim; claiming compliance rates from <3 scenarios per level.

## K5 — CUT.

## K6 — verdicts from full-file reads (expected outcome: mostly SKIP / small MINE)
| ECC item | Verdict | Action |
|----------|---------|--------|
| spec-miner | **MINE** (only high-value item) | invariants, `enforced:` code anchor, `test:` anchor, cross-validate against callers, commit-stamp freshness, sample-and-expand cap → `/sdlc onboard` |
| silent-failure-hunter | MINE 4 checks | error-handling-auditor: `.catch(() => [])` promise form, rethrow dropping cause, no timeout on network/db, no rollback |
| type-design-analyzer | MINE 2 checks | type-safety-checker: illegal-state representability, invariant encapsulation |
| click-path-audit | MINE (new pattern set) | static state-store side-effect map + 6 patterns; code-health/frontend lane, not `/ui-verify` |
| security-scan (AgentShield) | MINE checklist, SKIP dependency | `/security`: `.claude/settings.json` + hooks + CLAUDE.md + agent-tools checklist (grep-based). External package needs user approval |
| pr-test-analyzer | SKIP agent; MINE one mode | `test-engineer --coverage` diff-scoped to a PR's changed symbols |
| comment-analyzer | SKIP | R-13/14/15 cover it; add one sentence (over-promising comments) |
| inherit-legacy-style | SKIP | covered by pre-code + pattern-consistency + `delegation-gate --patterns`; signal-threshold idea noted |
| rust/typescript/python reviewers | **UNVERIFIED** | read full files before any verdict |
- NOT: adopt an external dependency; copy text without MIT attribution; add an agent where a section suffices.

## Challenge loop
Each shipped wave's diff is challenged again (read-only reviewer, primary sources) until no HIGH remains; a HIGH blocks the wave. Cap: 2 fix cycles per wave, then escalate.
