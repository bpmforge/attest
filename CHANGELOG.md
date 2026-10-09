# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [Semantic Versioning](https://semver.org/).

## [3.12.0] — 2026-09-30

**Group K: what a review of ECC (affaan-m/ECC, MIT) was worth** — three independent challenge passes cut most of the intake and found a
bug that had been live for a long time. (The changelog lapsed after 3.5.4; this entry covers the Group K work only. Entries for 3.6.0–3.11.1 were reconstructed afterwards and are marked as such.)

### Fixed
- **Every opencode PreToolUse guard was a silent no-op.** `tool.execute.before` passes the call arguments in `output.args`; the plugin
  read `input.args`, so the dangerous-bash blocker and the secret-file blocker never fired. Fixed, and tested by driving the real hook
  signature (the test goes RED on the old plugin). Re-run `install.sh` — the installed plugin is a copy, not this checkout.
- `sync-model-limits.mjs` had an unbounded `fetch`; a server that accepts and never replies hung `run-until-done` and four suite tests. 8 s timeout + regression test.

### Added
- **config-protection** hook (opencode plugin + `attest-claude/hooks/config-protection.sh`): blocks edits to an EXISTING lint/type/test config
  (an agent that cannot pass a check will loosen the check). Case-insensitive, symlink-aware, Windows paths, vendored/fixture trees exempt, `EXPERTS_ALLOW_CONFIG_EDIT=1` bypass.
- **gateguard** (opt-in, `EXPERTS_GATEGUARD=1`): deny the first edit of a file until the agent states facts; TTL, deny log, per-session key. **Not default-on** — ECC's "+2.25 quality" is two self-run tests. A pre-registered A/B (16+ hand-built tasks, hidden tests, 4 arms incl. a pure-pause control, paired-task statistics, `INVALID` when the gate never fired) decides that; see `docs/work/GROUP_K_DESIGN.md`.
- **Rule-compliance measurement** (`scripts/lib/trace-order.mjs`, `run-compliance.mjs`, `evals/compliance/`): does the model follow a rule unprompted, and under pressure? Predicate specs over the tool-call trace (no LLM), parallel-call tie rule, demotion pass. Opt-in trace capture for opencode (`EXPERTS_TRACE_LOG`) and Claude Code (`hooks/trace-tool-call.sh`).
- `references/language-review-checklists.md` (Rust/TypeScript/Python/Go, 32 checks with lints/greps, graded on real repos) wired into code-reviewer, concurrency-checker, type-safety-checker, error-handling-auditor, coding-agent.
- `references/click-path-audit.md` (handlers that cancel each other), wired into ui-verifier and frontend-design.
- Mined into existing agents: promise-form `.catch`/lost-cause/no-timeout/no-rollback (error-handling-auditor), illegal-state representability (type-safety-checker), MCP06 agent-config grep checklist (`/security`), onboard Invariants (spec-miner idea), `test-engineer --coverage --pr`.
- Anti-tamper boundary in `goal`/`autopilot`/`wave`: a loop may not reach "done" by weakening tests, config, or its own acceptance check.
- `attest-claude`: behavioural tests for the Group K hooks (previously checked by hand), run in CI.

### Decided against (after full-file reads)
K3 loop-spec validator (attest already has `validate-loop-readiness` + the goal intake gate), K5 rationalization scanner (Pass 51 checks claims against evidence), comment-analyzer, inherit-legacy-style, the AgentShield dependency, ECC's build-resolvers. ~200 of ECC's 293 skills are domain filler.

1025 tests passing.

## [3.11.1] — 2026-09-23

_Reconstructed 2026-10-08 from the v3.11.1 GitHub release notes, the tag and `docs/RELEASE_TRACKER.md`; the changelog was not kept at release time._

Patch: installer correctness and green CI. No agent behaviour change.

### Fixed
- `install.sh` printed `attest v1.6.0` on every release from 1.6.0 through 3.11.0. The version now comes from `package.json`; new `./install.sh --version`; Pass 57 stops a hard-coded version from coming back.
- `uninstall.sh` did not remove `exemplars/` or `plugins/` (the resume-anchor plugin kept loading after an uninstall). Both uninstall paths now remove the same set and delete the `experts-version` stamp. `rm -rf` targets are guarded against an empty variable.
- CI: the `log-hop` tests need the sibling `bpm-agent-amplifier` checkout, which GitHub Actions does not have. They now skip with a visible reason when it is not built.

731 tests passing.

## [3.11.0] — 2026-09-23

_Reconstructed 2026-10-08 from the v3.11.0 GitHub release notes, the tag and `docs/RELEASE_TRACKER.md`._

Process-flow documentation (PR #8), and every gap writing it turned up fixed at the source (PR #9).

### Changed
- **Conductor exit codes (behaviour change):** a dirty working tree, a missing `plan.json` or a missing prerequisite now exit **7**, not 1. `supervise.sh` stops on exits 2–7 instead of relaunching up to 30 times. Exit 1 now means only a crash.

### Fixed
- Default `/sdlc onboard` could never pass its own `onboard-deep` gate (four causes: SERVICE rows re-derived against a ROUTE/TABLE inventory, sequence diagrams and the ERD not counted, Step 7 missing the HLA Overview). `--deep` is unchanged. Pass 56.
- `/security --deep` could never pass: `validate-owasp.sh` rejected the `ATTACK_CHAINS_<date>.md` the coordinator writes.
- Concurrent HANDOFFs to the same agent each get their own `HANDOFF_<agent>-<slug>.md` instead of overwriting each other.
- Mode 3 and Mode 4 discovery interviews restored (lost when the mode files were split).
- Gate A fact-checks `SRS.md`; the TECH_STACK check moved to Gate B; Gate B paths corrected.
- One use-case path (`docs/testing/USE_CASES.md`, legacy root path still accepted); Phase 4 updates `TEST_DESIGN.md`; threat model at `docs/THREAT_MODEL.md`.
- Unreleased follow-ups from 3.10.1: the gate wrapper no longer reads a missing gap count as 0; BRE alternation under `grep -E` fixed in two validators.

### Added
- `/security` now implements `--deep` and the focused `--owasp`, `--threat-model` and `--deps` modes the skill already advertised.
- `docs/flows/` (verified process-flow diagrams) and the `docs/README.md` index; finished plans and dated reviews moved to `docs/archive/`.

729 tests passing; 49/49 conductor; 28 validators with red/green fixtures.

## [3.10.1] — 2026-09-20

_Reconstructed 2026-10-08 from the v3.10.1 GitHub release notes and `docs/RELEASE_TRACKER.md`._

Patch: validator correctness. No agent behaviour change.

### Fixed
- `validate-no-ascii-art.sh` crashed (`TARGETS: unbound variable`) on a project with no `docs/*.md` instead of warning.
- It flagged its own documented exception (the `════` HANDOFF delimiter); `═` removed from the per-character list, real banners and boxes still caught.
- Inline code spans and `docs/work/` transcripts are no longer scanned. 45 → 39 hits, no true positives lost; the 39 remaining were converted to Mermaid, so attest is clean on its own rule for the first time.

## [3.10.0] — 2026-09-08

_Reconstructed 2026-10-08 from the v3.10.0 GitHub release notes and `docs/RELEASE_TRACKER.md`._

Conductor hardening (PR #7): the six defects reported in GH issue #6, plus twelve found auditing them.

### Fixed
- **A chatty model self-approved:** verdicts were read with unanchored regexes, and the prompts themselves contain `VERDICT: APPROVED` / `RUNTIME: PASS`. New `readVerdict()` takes the last line-anchored verdict and fails closed.
- **Post-approval code landed unreviewed** via an unguarded amend in round 3.
- Reviewer fixes could escape `write_scope` (the scope gate ran after `git commit --amend`).
- The run lock died with `ENOTDIR` in a linked worktree (now `git rev-parse --git-common-dir`).
- Blocking findings now cross the attempt boundary; `--max-processed` separates the activity ceiling from `--max-tickets`; bounded runtime repair (`--runtime-fix-iterations`, default 1) re-earns every gate; POSIX process-group timeout containment that fails closed.
- The scope gate's containment bypass: `**/*`, `*/**`, `*/*` and `[a-z]*/**` each authorised the whole repo. Also: renames checked on one side only, `close()` verify with no timeout and a 1 MB buffer, provider-limit exhaustion crashing the run, `STOP` ignored during backoff, deletions invisible to reviewer selection.

### Tests
- `validate-scope.match.test.sh` was never run by any harness; six more orphaned suites found. Pass 53 now discovers every `*.test.mjs` under `scripts/`. Conductor coverage 19 → 93 tests.

724 tests passing. Closes #6.

## [3.9.0] — 2026-09-01

_Reconstructed 2026-10-08 from the v3.9.0 GitHub release notes and `docs/RELEASE_TRACKER.md`._

Autopilot hardening; every fix came from the first live end-to-end `/autopilot` run.

- Single-conductor lock in `.git/`.
- The conductor owns the round-3 runtime verdict: an agent FAIL its own in-worktree verify cannot reproduce is overridden.
- Reviewer agent defaults to `build` (the code-reviewer orchestrator died docless in bounded unattended rounds; `models.json` `agents.reviewer` restores it).
- Evidence moved inside the project (`docs/work/.conductor-evidence`, self-gitignored).
- `/autopilot` OPERATE section: the primary agent kicks off, tracks and reconciles the run; install-dir loop resolution follows symlinks.
- `validate-dead-code.sh` tool detection matches the eval harness probe (npx-local first, then global PATH).

725 tests passing.

## [3.8.1] — 2026-09-01

_Reconstructed 2026-10-08 from the merge commit and the diff; there is no GitHub release body for this tag._

### Fixed
- A blocked input is never a licence to produce nothing: when a reference is unreadable under the session's permissions (unattended sessions auto-reject reads outside the project), `code-reviewer` and `BOUNDED_TASK_CONTRACT.md` now say so in one line and still write the review document with a real `VERDICT` line. A conductor review round had died docless twice this way.

## [3.8.0] — 2026-09-01

_Reconstructed 2026-10-08 from the v3.8.0 GitHub release notes and `docs/RELEASE_TRACKER.md`._

JIRA board-driver conductor hardening (PR #3).

### Fixed
- `validate-scope.sh` now globs. The matcher was a quoted literal/prefix test, so every glob-authored `write_scope` matched nothing. The new `matches_scope` keeps literal behaviour first, refuses bare `*`/`**` and `..` traversal, and anchors the full string.

### Added
- PR-bound tickets stay open until merge; resume state survives supervised restarts; baseline/process failures are split from code exhaustion; `--no-merge` pushes the ticket branch, not `main`; checkpoint commit before review rounds.
- `scripts/lib/jira-tickets.mjs` with parity and integration tests.

725 tests passing.

## [3.7.0] — 2026-08-31

_Reconstructed 2026-10-08 from the v3.7.0 GitHub release notes and `docs/RELEASE_TRACKER.md`._

### Added
- **`/autopilot`** (`skills/autopilot/SKILL.md`): opencode as the orchestrator, run to completion with healing. ASSESS what is left → DECIDE ordered next actions, each with an exit predicate → DRIVE the existing loops (conductor, `run-until-done`, `run-plan`; NEVER-AUTO still pauses) → HEAL (narrowed retry → split → tier escalation → durable park) → EXIT on the assembly-gate predicate or `AUTOPILOT_HALT.md`. Pass 56 pins it with a planted-red self-test.
- Not yet ported to attest-claude (tracked beside `/wave` and `/goal`); attest-claude has no v3.7.0 tag.

725 tests passing.

## [3.6.0] — 2026-08-31

_Reconstructed 2026-10-08 from the v3.6.0 GitHub release notes and `docs/RELEASE_TRACKER.md`._

### Added
- **Group P A-wave (A1–A15)**, merged earlier but unreleased: three-level review model, conductor-first Phase 4, path- and risk-triggered reviewers, citation gate, fixture-proving CI, the `rules/` primitive, `/wave`, `/goal`, consensus tiers, 5-state runtime verdicts, seams, requirement ledger.
- **`agents/shared/PRODUCT_SHAPE_PROTOCOL.md`**: the canonical role table and two-stack rule, the feature map as a mandatory decomposition artifact (`docs/work/PRODUCT_MAP.md`), and feature-grouped landing (one merge per feature, never per ticket). Wired into `PARALLEL_WAVE_PROTOCOL`, `sdlc-init-phase-4` and `task-decomposer`. Pass 55.

696 tests passing.

## [3.5.4] — 2026-08-17

**Fixes a regression shipped in 3.5.3.** That version told `sdlc-lead` that "exactly two returns are terminal — the completion phrase or `BLOCKED`." That list was hand-authored and wrong: `BOUNDED_TASK_CONTRACT.md` Rule 8 *requires* a specialist to return a **`[PARTIAL]`-prefixed** completion phrase after 3 failures on one step. A lead following 3.5.3 literally would classify that correct escalation as a failed HANDOFF and re-dispatch it — the exact loop the 3-failure cap exists to prevent, failing the same way a fourth time.

- **Aligned to the contract that already existed** rather than inventing a third enumeration. The authoritative formulation is in `plugins/resume-anchor.ts` and every agent file: *a turn may end only three ways — more work, the completion phrase, or `BLOCKED: <why + evidence>`.* The lead now reads returns against that same list, as a table: completion phrase → score it; `[PARTIAL]` → **decide** (resume from phase files, fix the named input, or reassign) but never blind re-dispatch; `BLOCKED` → answer it and re-dispatch; menu / confirm-request / which-step question / status narration / bare partial diff → failed HANDOFF.
- **The return channel already ran both ways; the lead just never read it.** Specialists write a task ledger (`docs/work/TASKS_<agent>-<slug>.md`), phase files (`docs/work/<agent>/<task-slug>/phaseN.md`), `[PARTIAL]`, `BLOCKED: <evidence>`, and `RESUME from:` — all on disk, all surviving the compaction that eats conversation history. But `sdlc-lead.md` referenced `TASKS_*` only in a directory-cleanup context. The lead must now **read the ledger and phase files before writing a resume packet**, naming still-owed items from the unchecked boxes — never a bare "continue", never a restart of work the phase files show finished. `recover-phase-state.sh` already prints exactly this packet.
- **Intake acknowledgement, without a new artifact.** The ledger is created as the specialist's first action after reading the HANDOFF; it now carries a header naming the PRODUCE paths owed and the exact completion phrase. That header *is* the ACK — it surfaces a misread task in the first minute instead of at completion, and it is the one part of the specialist's state the orchestrator can check without reading its conversation.
- **`[PARTIAL]` and `BLOCKED` are the two-way channel working correctly** — a specialist escalating instead of looping. The twice-failed ceiling on the lead's side is now labelled as the deliberate mirror of Rule 8's cap on the specialist's side.

Considered and rejected: a `NEEDS-INPUT` return state. `BLOCKED: <why + evidence>` already carries "I need help", and a sanctioned return whose content is a question would re-open the drifting-menu failure that `coding-agent.md`, `resume-anchor.ts`, and 3.5.3 all exist to close.

632 tests passing.

## [3.5.3] — 2026-08-17

Why the orchestrator ends up writing code, and why the size cap misses it when it does. Both traced from the same cross-session field capture as 3.5.2.

- **A specialist that returns anything but its completion phrase has FAILED — re-dispatch, never absorb.** `sdlc-lead` already said "you do not write code" and "wait for the completion phrase", but nothing covered what to do when something *else* comes back. The observed chain: a specialist autocompacts mid-task, drifts to a menu ("Which should I do now?"), the user pastes that menu back, and the lead answers it — by making the edit itself. That never reads as "writing code"; it reads as a question addressed to the lead. Now explicit: exactly two returns are terminal (the completion phrase, or `BLOCKED: <evidence>`); everything else is a failed HANDOFF that gets a resume packet naming the still-owed PRODUCE files. Twice-failed escalates to the user with both returns quoted — never a third attempt, never finished on the specialist's behalf.
- **Absorbed work skips every gate.** Named as the reason the rule exists: implementation done by the lead runs no PLAN-SHAPE, no per-file size check, no anti-slop pass, no completion manifest. "The remainder was small" and "it was faster to just do it" are called out as the two rationalizations to distrust — the size of the remainder has no bearing on which role owns it.
- **Author-agnostic size gate (resume protocol step 7).** Every size check shipped so far is keyed to a *role* — `coding-agent.md`, the coding HANDOFF templates, Gate 5's `--runtime` — so code that reached the branch any other way (absorbed from a failed HANDOFF, hand-edited during triage, merged from a wave) passes through none of them. The lead now runs `validate-file-size.sh --changed-since <branch-point>` before advancing a phase or accepting a wave: it reads the diff, not the delegation log. Compared against the **branch point**, not the last ticket's diff — per-ticket comparison would inherit the exact accretion blind spot 3.5.1 closed.

632 tests passing.

## [3.5.2] — 2026-08-17

3.5.1 put the file-size cap in `coding-agent.md`. A field trace of a cross-session run showed why that is not enough: **the HANDOFF is handed across a session boundary, and the executor on the other side may never have loaded our agent definitions at all.**

- **The HANDOFF packet now carries the constraint itself.** `HANDOFF_TEMPLATES.md`'s code-producing blocks (remediation, parallel wave) previously named a write-scope, a task, and a PRODUCE list — but no size rule and, in the parallel-wave case, no VERIFY block at all. The lead writes the packet to a file and tells the user to open `/code` and point it at that doc; whatever executes there is not guaranteed to be this repo's `coding-agent`. Every constraint that lived only in the agent definition was invisible across that seam. Both blocks now restate the cap as a RULE **and** as a VERIFY command.
- **Constraints travel as commands, not prose.** The verify line is `validate-file-size.sh --changed-since <branch-point>` (from 3.5.1), and the manifest must quote its literal output. A foreign executor can skim a paragraph; it cannot produce a passing manifest without running the command. Same tool-offload doctrine as `MICRO_LOOP.md` step 3 and coding-agent's "a PASS claim needs the exact command's own output."
- **New doctrine section in `HANDOFF_TEMPLATES.md`** — *the HANDOFF is the whole contract; assume the executor loaded nothing else* — with the test to apply to any future constraint: *if the executor loaded nothing but this packet, would this still bind?* If not, it belongs in the packet as a verify command. The RULE/VERIFY duplication is deliberate and marked not-to-be-deduplicated.
- **`/code`'s skill card lists the size rule.** `skills/code/SKILL.md` delegates to the agent (so 3.5.1 does reach it), but its own summary of enforced rules omitted file size — a model skimming the card saw a constraint list with a hole in it.

632 tests passing.

## [3.5.1] — 2026-08-12

The file-size cap was fully documented and fully unenforced. Field report: the coding agent shipping 2,000-line monoliths despite a 400-line cap, `CODE_BOOK_PROTOCOL.md`, and `validate-file-size.sh` all existing.

- **The rule now lives in the write path, not the post-mortem.** `coding-agent.md` mentioned the cap exactly once — line 624 of 643, in the pre-completion checklist, i.e. after every file was written, when the fix is an expensive refactor a model defers. Added: a **File size** row to the write-time Code Health table, a Law 5 pre-edit rule, a new **Phase 3.0 PLAN-SHAPE** step that sizes the whole PRODUCE list before the first character of code, a post-edit `wc -l`, and a file-size dimension in the Phase 5 self-audit.
- **Restored a check the last consolidation silently deleted.** H-02 (file size) was moved out of `validate-code-health.sh` into `validate-file-size.sh` — but Phase 5 ran code-health *only*, so the coding agent's in-loop size check had quietly become a no-op. Phase 5 now runs both, and says why.
- **PLAN-SHAPE was never dispatched.** It lived in `MICRO_LOOP.md` step 1b; `coding-agent.md` referenced that file only for lint-on-edit. Same defect class as the orphaned design chain in 3.4.0 — a documented protocol no execution path invokes.
- **Monoliths accrete; nothing modelled that.** `task-decomposer` bounds each node's output at ~300 lines, so no single ticket writes 2,000 lines — seven tickets each appending 200 to one file do, and every one is individually compliant. Every size rule was phrased against the **diff**, which is structurally blind to accretion. The cap is now on the **file** (`current + delta`); a near-cap file is never appended to — the node's output becomes a new chapter module plus an index re-export (`CODE_BOOK_PROTOCOL.md`, `MICRO_LOOP.md`, `task-decomposer.md`).
- **Size is gated per-HANDOFF, not per-phase.** `validate-file-size.sh` joins `run-handoff-gates.sh`'s runtime gate, so the ticket that pushes a file over the cap is the one that fails — while the split is still a one-file operation, not an end-of-phase-4 archaeology project.
- **…and that gate is scoped to what the run touched.** New `--changed-since <ref>`: files this run changed hard-fail over the cap; untouched oversized files warn. Whole-tree would fail every returning ticket in any project adopting the cap mid-life, for files it never opened — unclearable by that ticket, and since gates stop at the first failure, it takes every later gate down as unrun (the Gate 4 tracker lesson: gate a step on what the step owns). An unresolvable ref warns and falls back to blocking, never to silently passing.
- **Honest denominator.** The validator was counting `.tmp-*` benchmark output, `.worktrees` per-ticket checkouts (reporting the same file once per worktree), `realworld-runs/` model-authored samples, and prefix-named test suites (`test-*.ts`, which the dotted `*.test.*` rule missed). attest's own violation count: **71 → 8** real, maintained files. Largest is `scripts/conductor/conductor.mjs` at 1,159 lines — the conductor is itself the monolith the conductor is now built to prevent.

632 tests passing.

## [3.5.0] — 2026-08-11

The gauntlet loop (Matt Shumer's technique) as a first-class quality harness: **builders never grade their own work, and a critic that saw a previous draft never grades the retry.**

- **New `/gauntlet` + `gauntlet-lead` (primary)** — the LEAD only orchestrates: writes `docs/gauntlet/BAR_<slug>.md` (a named real exemplar to match or beat + per-criterion checks + budget, default 5 rounds), splits the goal into independently gradeable units, dispatches builders (clean context, never declare PASS) and blind critics (fresh context per unit per round; receives ONLY artifact + bar + exemplar — prior critiques go to the builder, never the next critic), and loops until all-pass / two-round stall / budget — reporting which exit fired and every below-bar residual. No named exemplar → `BLOCKED: no real bar`; unevidenced critic verdicts are discarded and re-run.
- **`agents/shared/GAUNTLET_LOOP.md`** — the protocol: blindness rules, bar discipline (aspirational is fine, uncomparable is not), exit rules, LOOP_PREVENTION interplay (per-context tool caps vs cross-context round budget), and explicit boundaries vs the challenger (fact-checks claims), Fix-Verify (closes known defects), Wiggum coverage (denominator), and design-iterator (internal token bar — cheaper when the bar is our own spec).
- Routing: sdlc-lead agent table (`/gauntlet`), design-iterator hands external-reference bars to `gauntlet-lead`, FEATURES/README rows. 632 tests; 98 agents block-synced; parity + leak checks clean.

## [3.4.0] — 2026-08-10

The visual design loop — the Claude-Design property (code edits and rendered pixels in ONE feedback cycle) implemented as a first-class expert, plus the wiring that makes the design chain actually run.

- **New `/design-iterate` + `design-iterator` (primary)** — render → screenshot (375/768/1440) → deterministic token-lint + vision critique against `docs/design/tokens.json` → smallest fix → re-capture until clean (cap 3 iterations, 5 fixes/wave, 2 attempts/finding then BLOCKED). `--sync` extracts an observed token baseline from an existing codebase (provenance-marked `extracted-baseline`, never overwrites an authored spec); `--real` audits logged-in browsers findings-only. Vision-first is the sanctioned exception to the snapshot-first doctrine, with an honest no-vision downgrade (token-lint only, stated in the log).
- **`references/visual-design-loop.md`** — the protocol; tool table verified against @playwright/mcp 0.0.79 (snapshot-ref API — the `browser_screenshot`/`browser_fill` names taught by older docs are stale; `BROWSER_TESTING.md` now carries a drift warning pointing here).
- **`references/real-browser-bridge.md`** — tiered claude-in-chrome equivalence **without building an extension**: persistent profile (playwright-mcp's default), `--storage-state`, the official `--extension` mode into a running Chrome/Edge (works in OpenCode), `--cdp-endpoint` attach, claude-in-chrome as the Claude-Code-only T4, and a T5 build-our-own MV3 blueprint kept for a proven gap. Safety floor: read-only in real sessions, login/CAPTCHA handoff to the human, PII scrub before reports.
- **Design chain wired (was orphaned)** — ux-researcher / design-system-lead / content-designer said "Phase 3.5 (Design Loop)" but nothing dispatched them: sdlc-lead's roster + agent table now carry `design-iterator`, Phase 3's UX HANDOFF must request ux-engineer's `--auto` chain when `flows.md`/`tokens.json` don't exist yet, and Phase 4 gains **Round 3b visual conformance** (design-iterator after RUNTIME PASS on UI modules with a token spec). Gate conditions unchanged — the chain artifacts are inputs to later phases, not new gate requirements.
- **Screenshot gates ship to both targets** — `img-gate.mjs` / `annotate.mjs` + tests moved `skills/user-guide/scripts/` → `scripts/lib/` (the old location shipped to *neither* install target, leaving guide-scribe's Claude-side reference dangling). 27/27 tests green at the new path; GUIDE_CAPTURE / user-guide docs updated.
- Routing: ux-engineer `--review` and frontend-design now hand render-verifiable visual findings to `design-iterator`; FEATURES/README rows added. 629 tests; 97 agents block-synced; parity + leak checks clean.

## [2.13.0 – 3.3.1] — 2026-07-15 to 2026-08-05

_Reconstructed 2026-10-08. The changelog was not kept for these releases. Each row is the tag's own subject line and date; the GitHub Releases page and `docs/RELEASE_TRACKER.md` carry the detail where it exists. v3.1.1–v3.1.23 were never tagged._

| Version | Date | Summary |
|---------|------|---------|
| 3.3.1 | 2026-08-05 | a fresh WSL box could not bootstrap Node, and the README assumed git |
| 3.3.0 | 2026-08-05 | stop shipping 'installed' when nothing got registered |
| 3.2.1 | 2026-08-05 | a P1 use case between two P0 rows was promoted to P0 |
| 3.2.0 | 2026-08-05 | the Wiggum loop and the challenger are systemic, not per-mode |
| 3.1.35 | 2026-08-05 | the orchestrator was the one agent never told to keep going |
| 3.1.34 | 2026-08-05 | the cleaner was untracking other people's deliberate choices |
| 3.1.33 | 2026-08-05 | one command to clean a silted docs/work |
| 3.1.32 | 2026-08-04 | nobody owned the orchestration scaffolding, so it piled up |
| 3.1.31 | 2026-08-04 | the tracker gate failed on a tracker that was committed |
| 3.1.30 | 2026-08-04 | Phase 2 had no iteration counter, so the repair loop had no floor |
| 3.1.29 | 2026-08-04 | agents followed the manifest template exactly and the gate rejected it |
| 3.1.28 | 2026-08-04 | the gate said 'missing' when it was reading the wrong column |
| 3.1.27 | 2026-08-04 | ./install.sh --update, and the project's own name back |
| 3.1.26 | 2026-08-04 | the README never mentioned releases, so a user could only ever install main |
| 3.1.25 | 2026-08-04 | the suite was green on a commit that only existed on one machine |
| 3.1.24 | 2026-07-31 | unattended Phase 4 execution, proven end to end |
| 3.1.0 | 2026-07-30 | conductor runs the Phase 4 code/review/runtime lifecycle |
| 3.0.10 | 2026-07-30 | node --test / TAP pass-count extraction |
| 3.0.9 | 2026-07-30 | expert-hooks plugin loads again |
| 3.0.8 | 2026-07-30 | gate-output contract: emitted states must be documented |
| 3.0.7 | 2026-07-30 | retry counters charge repeats, not attempts |
| 3.0.6 | 2026-07-30 | gate output levels documented where agents read them |
| 3.0.5 | 2026-07-30 | RED verdict names its blocking items |
| 3.0.4 | 2026-07-30 | bootstrap .gitignore covers expert-system runtime artifacts |
| 3.0.3 | 2026-07-30 | git refs and removal claims are not missing artifacts |
| 3.0.2 | 2026-07-30 | validator path sweep + stale-claim correction |
| 3.0.1 | 2026-07-30 | run-handoff-gates.sh path fix |
| 3.0.0 | 2026-07-30 | attest: mechanical verification for AI-delegated software development |
| 2.48.0 | 2026-07-30 | lead-absorbed rework counts as a correction |
| 2.47.0 | 2026-07-29 | retry budgets by failure class + cited evidence outranks the claim |
| 2.46.0 | 2026-07-29 | local-only git: forge-optional bootstrap, impossible gate rows made N/A |
| 2.45.0 | 2026-07-29 | fence-scope advisory + the lead owns the baseline probe |
| 2.44.0 | 2026-07-29 | wrong-verdict channels: matched-nothing fences, failure attribution, unchecked baseline |
| 2.43.0 | 2026-07-29 | unwinnable gates: file-tool upsert + done-gate escape hatches |
| 2.42.0 | 2026-07-27 | J3/J4 declared invariants + review packets |
| 2.41.0 | 2026-07-27 | I5/J2 delegation metrics by model and agent |
| 2.40.0 | 2026-07-27 | I2/I3/I4 delegation gates |
| 2.39.0 | 2026-07-27 | I1 untrusted verify receipts |
| 2.38.0 | 2026-07-27 | J5/J6/J7: project-mode scripts, description drift, pre-code port |
| 2.37.0 | 2026-07-27 | multi-ecosystem version currency (cargo/go/pypi/npm) |
| 2.36.0 | 2026-07-27 | registry verification at library pick/research/code; library-adoption-protocol |
| 2.35.0 | 2026-07-27 | --family registry skew check, AntV X6 v3 reference |
| 2.34.1 | 2026-07-27 | api-surface: no CI failures on built-in-shadowing member names |
| 2.34.0 | 2026-07-27 | library API grounding (/api-ground + api-surface.mjs), installer path fix |
| 2.33.0 | 2026-07-27 | Apache-2.0 licensing + local-model evaluation and measurement-integrity fixes |
| 2.32.0 | 2026-07-24 | summarizer no-tool-call guard (the `_noop` fix) + task-ledger loop (externalized working memory) (from `docs/RELEASE_TRACKER.md`) |
| 2.31.0 | 2026-07-24 | done-gate + auto-baseline + version stamp + lead-side harness parity (from `docs/RELEASE_TRACKER.md`) |
| 2.30.0 | 2026-07-24 | mechanical verify harness + terminal-state whitelist — enforce, don't instruct (from `docs/RELEASE_TRACKER.md`) |
| 2.29.0 | 2026-07-24 | verify-evidence discipline — no invented infra commands, fresh BLOCKED evidence, disk-reconstructed reports (from `docs/RELEASE_TRACKER.md`) |
| 2.28.0 | 2026-07-23 | remove broken grep-mcp tool; never ask to run verify commands |
| 2.27.1 | 2026-07-23 | post-compaction turns resume immediately |
| 2.27.0 | 2026-07-23 | coding-agent verify loop converges to GREEN |
| 2.26.1 | 2026-07-23 | check-tools detects off-PATH installs; dev-server writes to the login shell's rc |
| 2.26.0 | 2026-07-23 | universal HANDOFF intake, compaction fix from TUI trace, dev-server provisioner |
| 2.25.0 | 2026-07-23 | long runs survive autocompaction |
| 2.24.0 | 2026-07-23 | check-tools.sh works on a bare non-root Linux box |
| 2.23.0 | 2026-07-23 | HANDOFF intake: pointer-delivered handoffs execute instead of being handed back |
| 2.22.0 | 2026-07-18 | Opengrep-first SAST migration + Quarry integration |
| 2.21.0 | 2026-07-15 | SDLC mode clarity (merge of `feat/sdlc-mode-clarity`) |
| 2.20.0 | 2026-07-15 | game cluster expansion (merge of `feat/game-cluster-expansion`) |
| 2.19.0 | 2026-07-15 | tool preflight hardening (merge of `feat/tool-preflight-hardening`) |
| 2.18.0 | 2026-07-15 | container-ops runtime and cloud (merge of `feat/container-ops-runtime-cloud`) |
| 2.17.0 | 2026-07-15 | QA/V&V waiver and agent gate (merge of `feat/qa-vnv-waiver-and-agent-gate`) |
| 2.16.0 | 2026-07-15 | QA/V&V guardrail enforcement (merge of `feat/qa-vnv-guardrail-enforcement`) |
| 2.15.0 | 2026-07-15 | runtime error watchdog |
| 2.14.0 | 2026-07-15 | QA/V&V end-user testing specialist |
| 2.13.0 | 2026-07-15 | ANN-dead-fastpath testing lessons |

## [2.12.0] — 2026-07-14

Memory read-loop + lifecycle (memory + code-search program, part 2 of 2). An audit found memory was **write-heavy but effectively read-only**: 82 `memory_store` vs 2 `memory_recall`, one generic `memory_context_assemble` at session start as the only real reader, and the M5 hygiene layer (consolidate/forget/decay) documented but **never executed**. The rich engine surface (`memory_feedback`, `memory_consolidate`, `goal_anchor`, `memory_update`, `memory_link`) was 0-wired. Engine verified capable first (bpm-memory-mcp implements `memory_feedback` helpful/wrong/outdated/duplicate and `memory_consolidate` merge-duplicates + decay->30d), so this wiring is real, not cosmetic.

- **Close the feedback loop (the highest-leverage fix).** `sdlc-lead` Step 2b now calls `memory_feedback({id, feedback})` after consuming the assembled packet — `helpful` reinforces, `outdated`/`wrong` (spot-checked) lets consolidation prune, `duplicate` merges. This is the signal the engine needs to *improve* recall and stop resurfacing a wrong memory — the direct fix for the observed "memory made coverage worse" failure, where nothing could down-weight a bad memory. Documented as `MEMORY_PRIMER` **M4b**.
- **Precise recall, not coarse.** `sdlc-lead`'s `memory_context_assemble` now seeds the query with the real goal phrase **and `files:`** (the phase's target files), instead of a bare phase label — the engine ranks on what you pass, so this turns coarse recall into precise recall.
- **M5 hygiene actually runs.** `/steward distill` gains a **Phase 0** that executes `memory_consolidate({dryRun}→apply, decayAfterDays:30)` + `memory_forget` for wrong/superseded entries — the DB-pruning M5 prescribes but nothing ran, closing the 82-store / 0-cleanup bloat. Distinct from the prompt-corpus distillation that follows.
- **No more duplicate-on-staleness.** The Verify-on-recall rule now says: when a spot-check shows a memory moved/stale, `memory_update` in place (or `memory_feedback(outdated)`) — never `memory_store` a fresh copy alongside the stale one. `memory_link` records supersession/error-fix edges so "what replaced this?" resolves. `goal_anchor` at session start makes drift detectable.
- Consciously deferred: per-specialist *broad* recall (would reopen the M4 slice-vs-recall model that v2.5.0 settled). 421 tests green; completes the memory + code-search program (v2.11 code-search → v2.12 memory).

## [2.11.0] — 2026-07-14

Code-search wiring (memory + code-search program, part 1 of 2). An audit found the `code-search` MCP was **effectively unused** — its three structural tools (`code_symbols`/`code_references`/`code_outline`) appeared in **zero** agents, `code_index` was never built by any flow, and ~51 agents hand-reimplemented the index with `grep`. This wires it in.

- **New shared `## Code search` block** (`agents/shared/blocks/code-search.md` + `.compact`, registered in `build-agents.mjs`) backed by `agents/shared/CODE_SEARCH.md` — mirrors the proven `research-tools` block plumbing (canonical text, small-tier compact variant, CI drift gate). Content: prefer `code_symbols`/`code_references`/`code_outline`/`code_search` over grep for symbol/reference/structure questions, with a **mandatory `code_index()`-then-grep-fallback freshness contract** (the index is mtime-gated so refreshing is cheap; a missing index means "use grep," never "stop").
- **Inlined into the code-heavy agents**: `coding-agent`, `dead-code-detector`, `entry-point-tracer`, `component-mapper`, `pattern-consistency-checker`. The highest-value swap: `dead-code-detector` now uses `code_references("X")` (the real reference graph) for "zero non-test uses" instead of a grep count that a substring/comment match inflates. The `explore` skill traces call-chains via `code_references`.
- **Onboard now builds the index once** (`sdlc-onboard-mode` Step 0: `code_index()` + `code_index_status()`) so downstream specialists (entry-point-tracer routes, component-mapper dependency edges) query a fresh symbol/reference graph rather than approximating with regex. Skips silently if the MCP is absent.
- **Challenger evidence table** now ranks `code_references`/`code_symbols` above grep for symbol/existence claims. **`examples/opencode.json`** now carries the `code-search` MCP entry (was only patched into the user config live by `install.sh`, so the reference config didn't match).
- Engine verified capable (bpm-code-search-mcp is mtime-gated, falls back to FTS when unindexed, self-guides reindexing) — so the wiring is real, not cosmetic. 421 tests green; wiring-ledger + agents:check clean. (Memory read-loop + lifecycle follows as v2.12.)

## [2.10.0] — 2026-07-14

Agent-wiring audit, Tiers 2–3 (verification loops + gates + consistency) — the final part of the staged plan.

**Verification loops (agents that shipped artifacts they never tested):**
- **`migration-planner`** — was the thinnest infra agent: it wrote forward+rollback SQL but never ran it, and lacked an Input Contract, DDL-dialect verification, and any adversarial check. Added: an Input Contract; **Context7/engine-docs verification** before writing dialect-specific DDL; **Step 5 — prove reversibility on a scratch/shadow DB** (apply forward → verify → apply rollback → verify back to the OLD state → re-apply), with "ASSERTED-not-TESTED" required in the manifest if no scratch DB is reachable; and a Challenger Gate for destructive DDL. Also routed from the `guide` concierge (was semi-orphaned).
- **`reliability-engineer`** — reported a "measured breaking point" it never measured. Added a step to **run a real smoke load and paste actual req/s / P95 / error-rate**, or mark §5 `NOT MEASURED — <why>` (never a measured-looking figure it didn't observe).

**Challenger-gate parity** — 6 of 7 high-stakes design producers triggered no adversarial check. Added tailored Challenger Gates to **db-architect** (destructive/cascade/denormalization decisions), **api-designer** (breaking or new public contracts), **data-steward** (PII classification / retention), **reliability-engineer** (breaking-point / degradation claims), and **migration-planner** (destructive DDL) — matching the gate architecture-designer/synthesizers already had.

**Root & consistency gates:**
- **New `validate-flows.sh`** — `docs/design/flows.md` (ux-researcher's output) is the root of the design chain but was the only root with no validator; now structurally gated (Mermaid flow + screen inventory + no placeholders), wired into the Phase-3 design gate with red/green fixtures. `validate-design-tokens.sh` joined the same gate.
- **STYLE_GUIDE ↔ tokens.json reconciliation** — `ux-engineer` now references `tokens.json` as the authoritative palette when it exists instead of re-authoring a parallel set of hexes (killed the fork).
- **a11y ownership boundary** — `ux-engineer --audit` is design-time; `a11y-compliance` owns the Phase-4 certification of record (no more duplicate audits).
- **`gameplay-engineer`** now names the API-verification mechanism explicitly (Context7 / installed engine source) instead of only citing "the Four Laws".

- 421 tests green. Completes the v2.8→v2.10 agent-wiring program (Tier 1 correctness → Figma adapter → Tier 2–3 verification/gates).

## [2.9.0] — 2026-07-14

Figma adapter — bring a real Figma design into the design pipeline (staged plan, part 2 of 3). Figma is to the design pipeline what the Jira adapter is to the ticket pipeline: an external source consumed via a normalized snapshot, internal artifact stays authoritative, graceful fallback when absent.

- **New `scripts/figma/figma.mjs` (+ `figma.sh`).** `pull` a Figma file (`X-Figma-Token` auth) → normalized `docs/design/figma-snapshot.json` (variables → tokens as hex, the `components` map → inventory, top-level `FRAME` nodes → screen inventory). `derive-tokens` maps the snapshot into `design-system-lead`'s required `tokens.json` shape by naming convention, and **reports the required keys Figma didn't provide** so `tokens.json` is *derived, not invented*. `doctor` checks config + connectivity.
- **Closes the prose-only gap.** `design-system-lead` authored `tokens.json` from personas, and `frontend-design.md` declared "the token source of truth is the Figma export" but **no importer existed**. Now `design-system-lead` runs `derive-tokens` when a snapshot exists (Figma is the token source of truth) and hand-authors only what Figma didn't supply; `frontend-design`'s Token-Sync section points at the real adapter. One direction only — Figma → `tokens.json` → code — matching the "two-way sync is how tokens fork" rule.
- **`tokens.json` stays the source of truth for the build.** Figma is the design source it's derived from; graceful fallback = no `FIGMA_TOKEN` → the whole prose-authored path is unchanged. The Figma Variables API needs a paid plan; on a free plan `pull` captures components + screens with zero tokens (never an error).
- **New gate `validate-design-tokens.sh`** (offline-safe; skips clean unless `figma-snapshot.json` exists): **dropped-token** (a Figma color missing from `tokens.json`), **snapshot-without-tokens** (pulled but never derived), **value-drift** (advisory).
- Optional live path: the official Figma Dev Mode MCP can be wired like `playwright-mcp` (interactive select-frame→code); the REST adapter is the portable, CI-testable default.
- Design: `docs/DESIGN_FIGMA_ADAPTER.md`. Reference: `references/figma-adapter.md`. 6 mocked-REST test cases (`scripts/test-figma-adapter.ts`, Pass 42; no live Figma in CI). 421 tests green. (Tiers 2–3 verification loops + gates follow as v2.10.)

## [2.8.0] — 2026-07-14

Agent-wiring audit, Tier 1 (correctness). A two-agent audit of the full expert set found cross-agent handoff gaps and — notably — that the v2.5.0 "memory write-back on every specialist" sweep was **incomplete**: it swept the inline-manifest agents but missed 7 producer specialists because agent-file coverage was never gated.

- **Fixed the broken AI handoff.** `llm-integration-engineer` designs the LLM feature (prompt architecture, structured-output schema, fallback chain, eval set) and hands to `coding-agent` — but `coding-agent`'s input contract had **zero** reference to `docs/design/llm/`, so the design was stranded. Now: coding-agent treats `LLM_DESIGN_*` as a required read for any LLM feature (BLOCKED if an LLM feature has none); llm-integration-engineer's manifest states the HANDOFF must carry it; and `owasp-llm-checker` cross-checks the design's specified enforcement (output-schema validation, injection defenses, fallback chain) against the built code — a control **designed but not implemented** is now a finding, not a silent pass.
- **Completed the memory-write-back audit** on the 7 missed producers: `architecture-designer` (also upgraded from a stub "write manifest" line to a full Completion Manifest block — it's the most decision-dense producer), `security-auditor`, `security/semgrep-runner`, and all four `sdlc/onboard/*` specialists (`landscape-mapper`, `entry-point-tracer`, `component-mapper`, `health-coordinator`).
- **Shipped a regression gate** (`scripts/test-memory-writeback.ts`, Pass 41): every producer agent must document M4 write-back (`memory_store` / `## Memory written`); orchestrators/concierge that delegate are exempt (list guarded against staleness). This is why the 7 were missed — coverage was never gated. Proven to bite (66 producers checked).
- **Closed two dead-end handoffs.** `content-designer` microcopy now hands to `coding-agent` (strings wired into components / i18n, not re-invented at code time); `end-user-simulator` friction/abandonment findings now land in `docs/reviews/FIX_BACKLOG.md` (tracked work with an owner) instead of dying in a UAT doc.
- 415 tests green. (Tiers 2–3 — verification loops, root design validators, challenger-gate parity — and the Figma adapter follow as v2.9/v2.10.)

## [2.7.0] — 2026-07-14

Jira integration completed — works in the **unattended** path and on **Jira Cloud**, and is wired into the SDLC workflow + install. Builds on the v2.6.0 Data Center adapter.

- **Convergence keystone (`syncState`).** `jira.sh reconcile` is now two passes: drain the outbox (real-time verb events, incl. comments), **then converge from plan-state** — read `plan.json` and make each mirrored issue's assignee + status match the module, idempotently. This is the any-writer catch-all: a writer that never emitted an outbox event (the conductor, which calls the lifecycle functions in-process; or a manual `plan.json` edit) still converges. No per-caller hooks required, and it's the architecturally correct answer over threading emit-calls through every writer.
- **Conductor auto-mirror (unattended path).** The reference conductor (`scripts/conductor/conductor.mjs`) now runs `reconcile` after each ticket pick-up (`start` → in_progress) and each `accept` (→ done), via a best-effort `mirrorJira()` helper gated on `TRACKER_BACKEND=jira`. A Jira outage never breaks the conductor — the next reconcile catches up. Non-Jira projects are untouched (no-op).
- **Jira Cloud backend (`JIRA_FLAVOR=cloud`).** Same interface, second flavor: `/rest/api/3`, `email + API-token` Basic auth (`JIRA_EMAIL`), ADF comment bodies, `accountId` assignment (the claim/accept guards compare the flavor-correct identity), and the native `parent` field for epic membership. DC (Bearer PAT, v2, `name` assignment, Epic-Link custom field) is unchanged.
- **SDLC + install wiring.** The `/reflow` skill documents the optional `sync-plan`-once-then-verbs-mirror flow (no-op without a backend); `install.sh` prints the `JIRA_*` setup (DC and Cloud) + `doctor`/`sync-plan` bootstrap and points at `references/jira-adapter.md`.
- 413 tests green (12 mocked-REST adapter cases incl. convergence idempotence + Cloud auth/ADF/accountId; no live Jira in CI).

## [2.6.0] — 2026-07-14

Jira Data Center adapter — mirror the internal ticket lifecycle to a real Jira instance, with graceful fallback to `plan.json`-only.

- **New `scripts/jira/jira.mjs` (+ `jira.sh` wrapper).** Projects the six internal lifecycle verbs (claim/start/comment/close/accept/release) onto Jira DC REST v2 (Personal Access Token, `Authorization: Bearer`), plus `sync-plan` (idempotent epic/story/task creation with Epic-Link + "is blocked by" links from `depends_on`, and `lane`→Component mapping — "proper user spaces like ui"), `close-epic` (refused unless every Epic-Link child is Done), `pull` (normalized `TrackerItem` snapshot feeding the existing `tracker-model.mjs`), `reconcile` and `doctor`.
- **`plan.json` stays source of truth; Jira is a mirrored ledger.** SDLC hygiene is enforced on both surfaces: grab **issues not epics** (`claim` refuses an Epic), **epic closes only when children are done**, **no double-grab** (WIP=1 on plan.json + `claim` refused if the Jira issue is already assigned to someone else), **maker≠verifier** (`accept` refused if the Jira assignee equals the acceptor), comment-on-update / close-on-done via Jira transitions + evidence comments.
- **Graceful degradation is lossless, not best-effort.** The one coupling to the source-of-truth engine is a single synchronous, Jira-free `appendOutbox()` call in `scripts/lib/tickets.mjs` after each verb's `savePlan()` — it writes one JSONL line to a durable outbox (`docs/work/jira-outbox.jsonl`) iff a backend is configured, else a no-op (byte-for-byte the pre-adapter behavior). The new backend-agnostic `scripts/lib/lifecycle-outbox.mjs` holds the outbox (no circular import, invariant engine untouched). A Jira outage never blocks local work; `jira.sh reconcile` idempotently replays pending ops. This is the lossless answer to the repo's own flagged non-atomic dual-write problem (`docs/work/LESSONS.md:29`).
- **New gate `validate-jira-hygiene.sh`** (offline-safe; skips clean unless `TRACKER_BACKEND=jira`): flags unmirrored outbox ops and modules that advanced without a Jira sync. Live drift is reported by `jira.sh doctor` (which also verifies the workflow's status names on connect).
- Config seam: `JIRA_BASE_URL`/`JIRA_TOKEN`/`JIRA_PROJECT` + optional `jira.config.json` (issue types, Epic-Link field id, status map, lane→component). `TRACKER_BACKEND=auto|jira|none`. Jira **Cloud** (v3/ADF/email+token) is a follow-up behind the same interface.
- Design: `docs/DESIGN_JIRA_ADAPTER.md`. Reference: `references/jira-adapter.md`. 10 mocked-REST test cases (`scripts/test-jira-adapter.ts`, no live Jira in CI). 411 tests green.

## [2.5.0] — 2026-07-14

Expert-wiring audit + fixes (all 45 primary experts + cluster specialists validated for half-wired capabilities).

- **Memory write-back is now enforced for every specialist (was missing in 44 of 45 agents).** Per `MEMORY_PRIMER.md` M4, specialists don't recall memory (the SDLC lead hands them a slice in the context packet) but they MUST `memory_store` their durable decisions/errors/verified-facts — yet only `coding-agent` did, so every other specialist's decisions evaporated at session end instead of persisting to the memory DB. Added a required **`## Memory written`** section to the canonical Completion Manifest (`BOUNDED_TASK_CONTRACT.md` Rule 6 + `HANDOFF_TEMPLATES.md`), made it a gate in `validate-completion-manifest.sh` (like "Verify result" — "None — nothing durable" is a valid value), and synced the 57 agents that inline their own manifest. Also **corrected the v2.4.0 coding-agent edit** that wrongly told it to `memory_recall` (contradicted M4) → now "use the memory slice in your packet; `memory_store` after."
- **`reliability-engineer` Context7 gap closed** — it ships runnable k6/Locust/chaos scripts (code against a library API) with no API-verification path; added the mandatory Context7-before-writing clause its siblings carry.
- **`migration-planner` divergent manifest fixed** — its inlined Completion Manifest had dropped `## Files modified` and the mandatory `Tracker updated:` line, so a migration that edits files wouldn't declare them or trip `validate-tracker-fresh.sh`. Restored both.
- **Confirmed NOT gaps (audit cleared them):** research access is uniform where needed (security-auditor correctly delegates CVE currency to `dependency-auditor`'s live advisory DBs; the no-research agents genuinely don't need it); the Challenger is correctly wired into the coding wave (v2.4.0); cluster specialists' findings are properly consumed by their synthesizers.

401 tests green; all structural validators + agents:check clean.

## [2.4.0] — 2026-07-14

Process-integrity pass on the per-ticket loop/gate model + coding-agent hygiene (from a full audit of both against the completed upgrade plan).

- **Challenger is now wired into the coding wave (was the headline gap).** It previously ran only at the design gate (phase-3) and release gate (phase-5) — a phase-4/feature FIX_BACKLOG with HIGH/CRITICAL findings was remediated with NO adversarial veracity check. Added a mandatory **Challenge step** (Round 2b) in `sdlc-init-phase-4.md` and `sdlc-feature-mode.md`: on any HIGH/CRITICAL row, a `challenger` HANDOFF adjudicates CONFIRMED/CONTRADICTED before remediation (CONTRADICTED dropped, CONFIRMED remediated), and `validate-challenger-gate.sh` is now chained into the **phase-4 gate** so the module gate fails without a matching challenge report.
- **Fixed the `fix-verify.mjs` iteration classifier (a real code bug).** It keyed off raw finding-count and never received the `regressed` set, so a healthy deeper-review pass (count rising while all prior rows closed) was mislabeled `OSCILLATING` and a true regression (`REGRESSED`, flat count) was mislabeled `STALLED` — the class the whole budget table keys off of was wrong. Rewrote `classifyIteration` to match `FIX_VERIFY_LOOP.md` (movement-based: OSCILLATING iff a previously-CLOSED row returns; PROGRESSED iff all prior closed + new opened; STALLED iff a prior row survives; CLEARED iff none open/new), fixed the self-testing copy in `test-fix-verify.ts` that encoded the bug, and added the 2→9→15 PROGRESSED and regressed-flat-count OSCILLATING cases.
- **Loop is now tier-aware and class-driven, not a flat "3 iterations."** The coding-wave prose in phase-4/feature + `FIX_VERIFY_LOOP.md` now drive off `fix-verify.mjs` and the `.model-context` ceiling (6 metered / 12 local): STALLED escalates after 2 same-tier attempts, PROGRESSED may extend to the ceiling, OSCILLATING escalates immediately. Added `validate-contract-conformance.sh` to the FIX_VERIFY re-verify snapshot set (O2.5 — interface drift a fix introduces is caught in-loop, not only at the phase-5 gate).
- **Coding-agent hygiene:** now told about the **memory MCP** (`memory_recall` prior decisions/verified-APIs before coding, `memory_store` durable facts after); `validate-tech-stack.sh` (Law 4) is now an enforced gate in `run-handoff-gates.sh`, not just a self-score — a dependency not in `docs/TECH_STACK.md` fails the handoff gate; the Phase-2 API verification is anchored by name as the `pre-code` check. (Context7, anti-slop R-01..R-30, research-web access, tests-alongside, and strict-handoff-both-directions were already present and confirmed.)

401 tests green.

## [2.3.0] — 2026-07-14

- **HANDOFF delivery is now a document the specialist reads, not a block the user pastes.** In interactive mode the SDLC lead **writes the full handoff to `docs/work/HANDOFF_<agent>.md`** and prints a short pointer — *"open `/<skill>`, have it read `docs/work/HANDOFF_<agent>.md`, submit `<report>` back"* — then stops and reads only the returned report. No more pasting large blocks. Reworked `HANDOFF_TEMPLATES.md` (delivery rules, all templates, delimiter spec), `EXECUTOR_SELECTION.md` (Executor C), `sdlc-lead.md`, and converted 59 per-handoff "paste this to /X" headers + the delegation-rule blocks across every mode/phase file.
- **Hardened the delegation discipline so the SDLC lead never does specialist work inline** (from a full audit of all mode/phase files). Fixes: (1) feature-mode Step 1 and improve-mode Step 1.75 told the lead to grep/trace call-chains *itself* — now an explicit HANDOFF to `app-cartographer` (`/explore`) producing `EXPLORE_*.md` which the lead only reads; (2) the onboard `health-coordinator`, when it runs inline (no task tool), now carries a CRITICAL guard that its code-review/security/perf/test sub-checks remain HANDOFFs to the user-facing specialists — it never reviews the code itself, only synthesizes `HEALTH_ASSESSMENT.md` from their reports; (3) explicit "this is a HANDOFF — never scan it yourself, read only the report" guards added to the post-code review/security steps in phase-4, phase-5, and feature mode; (4) the strict-delegation allow-list now names the handoff/context docs the lead writes and reiterates that security/health/code-review are read-the-report-only. 400 tests green; the delegation rule is now universal across init/feature/improve/onboard and every phase.

## [2.2.2] — 2026-07-14

- **Fixed: SDLC orchestrators called specialists directly instead of emitting HANDOFF blocks in interactive opencode.** The executor-selection logic (and its restatements across ~14 agent/protocol files) keyed dispatch on `has_task_tool` / `opencode_cli` — and the T30.10 "TUI mode" rule preferred Executor B (`opencode run` subprocess) whenever the CLI was present, which is always in the TUI. So in an interactive session the lead would spawn/call the specialist behind the user's back rather than printing the HANDOFF block and telling the user which agent to open and what to submit back — the exact opencode requirement (subagents can't use MCP, #16491; specialists must be first-class user-opened conversations). Reworked `EXECUTOR_SELECTION.md` so **autonomy is the primary discriminator**: `interactive` → **always Executor C** (emit the HANDOFF block for the user) for any specialist with a `/skill`; programmatic dispatch (A Task tool / B subprocess) is **`auto`-only**. Aligned `sdlc-lead.md`, the four mode files, the SDLC phase files, `HANDOFF_TEMPLATES.md`, `BOUNDED_TASK_CONTRACT.md`, `MODEL_ADAPTER.md`, `SESSION_PRIMER.md`, `LOCAL_LLM_PRIMER.md`, and `ux-engineer.md`. 400 tests green.

## [2.2.1] — 2026-07-14

- **Upgrade migration for the v2.2.0 pullmd removal.** Someone who previously ran `./install.sh --pullmd` still had the external pullmd containers, the `~/.local/share/pullmd` clone, and a now-stale `mcp.pullmd` entry in their `opencode.json` — which makes opencode throw MCP startup errors trying to reach the dead `localhost:33000` service. New `scripts/migrate-remove-pullmd.sh` heals it: removes the `mcp.pullmd` entry (with a `.pre-pullmd-removal.bak` backup), stops + removes the pullmd Docker/Podman containers, and (with `--purge`) deletes the clone. It is idempotent and a clean no-op on a fresh install. `install.sh` runs it automatically on every install/upgrade; it can also be run standalone. New Pass 39 test.

## [2.2.0] — 2026-07-14

- **Removed the external pullmd Docker dependency** (all research now runs on our own in-house pull). `playwright-search` v0.3.0 vendors a zero-dep `bpm-pull` (fetch → strip → density-scored extraction → HTML→markdown); the `web_*_pullmd` tools use it with a native Playwright fallback, so there is no `localhost:33000` service to run. Dropped the ~370-line pullmd install block + `--pullmd` flag from `install.sh`, the `pullmd` MCP from `examples/opencode.json`, and the now-defunct `pullmd_read_url`/`read_url`/`get_share` tool references from `agents/researcher.md` + `agents/shared/RESEARCH_TOOLS.md` + `agents/shared/BROWSER_TESTING.md`. Retained external tooling by design: Context7 MCP (library docs), playwright-mcp (browser automation), Semgrep (security scanner). Remaining third-party MCP under review: mempalace (memory) — to be swapped for in-house bpm-memory-mcp later.

Per-PR entries land here; release-manager rolls them into the next tagged section. Added
2026-07-08 (T27.2) because `validate-tracker-fresh.sh --base <base>` is a documented
git-expert.md merge-gate condition, but this repo's actual CHANGELOG convention batches entries
at tag time — a real mismatch between per-PR merge-gate granularity and per-release changelog
cadence, found while wiring this gate into `run-handoff-gates.sh`. An `[Unreleased]` section is
the standard Keep-a-Changelog answer: it gives every merge a tracker-worthy target without
forcing a version bump per PR.

## [2.1.0] — 2026-07-13

- **T29.6** — Tracker Data Model design step + integrity validator (M29 field lesson, H5/A-6, external trackers). Root cause: a live Mode-1 engagement generated ~200 requirement-stories directly in a client's own issue tracker (Jira-shaped) with no deliberate data model — phases and stories ended up as siblings under one umbrella epic with nothing structurally linking a phase to its stories, so completion rollups had no native answer, 150+ phase↔story links had to be retrofitted mid-project by a one-off script, labels silently undercounted scope because they were unenforced, and template/sample tickets polluted totals (`issues/field-report-mode1-sdlc-run-2026-07.md` §A-6). New `references/tracker-data-model-template.md` (four mandatory sections: Layer Map, Phase → Work Linkage, Source of Truth, Stray & Template Handling) + `docs/TRACKER_DATA_MODEL_SCHEMA.md` (the normalized `docs/work/tracker-snapshot.json` shape the validator reads — deliberately NOT a live tracker API client; every tracker's API differs, a project supplies its own export). New pure module `scripts/lib/tracker-model.mjs`: `parseTrackerSpec()` extracts the four sections + derives whether labels are the declared source of truth and which item types the Layer Map declares; `validateTrackerSnapshot()` checks every non-stray item for the ticket's own three named categories — `unlabeled-item` (A-6.4, only when labels are the declared source of truth), `unlinked-story` (A-6.1/6.2, both no-parentId and dangling-parentId shapes), `stray-in-scope-math` (A-6.5, a title that looks like a template/sample item but isn't tagged `stray: true`) — plus an advisory `undeclared-type` check against the Layer Map. New chained validator `scripts/validators/validate-tracker-integrity.sh` wraps it: a tracker snapshot existing with no spec doc is a hard gap ("spec exists before backlog generation," the ticket's own acceptance line) — verified live: a snapshot-only fixture is refused with `spec-missing-before-backlog`, and neither artifact present is correctly NOT a gap (external tracker not in use). Wired into `validate-phase-gate.sh`'s phase-3 chain (spec-before-backlog) and phase-4 chain (item-level integrity once a snapshot exists) — the external-tracker analog of `validate-tickets.sh`'s phase-4 placement for the internal `plan.json` layer. New `scripts/tracker-link-sweep.mjs` (`sweepLinks()`) closes the retrofit failure mode directly: links every unlinked story carrying a `phase:<id>` label to its phase, re-runnable and idempotent (a second sweep over already-linked data links 0, live-verified) — the "continuous, not one-time" mechanism the field report calls for. New subsection in `agents/sdlc-init-phases-3-4.md`'s Phase 3 (between Parallelization Map and Mermaid Templates): mandatory before any external-tracker backlog generation, not applicable to `plan.json`-only projects. Red/green fixtures at `evals/fixtures/validators/validate-tracker-integrity/` (red: one unlabeled story, two unlinked-story shapes, one untagged stray — all three ticket-named categories in one fixture, live-verified via the real CLI). New Pass 38 (`scripts/test-tracker-integrity.ts`, 10 assertions): spec parsing (complete + missing-section + placeholder-section), each snapshot check isolated individually (not just the combined fixture), `sweepLinks()` idempotence, and CLI integration for both the spec-missing and neither-artifact cases plus the static fixture pair. `docs/FEATURES.md`/`docs/USERGUIDE.md` validator counts updated 70→71 with a new catalog row; `docs/SDLC_GUIDE.md`'s Phase 3/Phase 4 deliverable + gate-validator lists updated. `node --experimental-strip-types scripts/test.ts`: **397 passed, 1 pre-existing unrelated failure** (`validate-vendor-provenance.sh`'s `.worktrees` path-exclusion false-negative — confirmed, again, present only when run from inside a `.worktrees/` executor checkout: the identical test file run from a plain `~/Code/attest` checkout passes 5/5 clean; same known gap disclosed on T29.2/T21.1/T30.10's entries above, not introduced here). `node scripts/check-validator-fixtures.mjs`: clean (54 chained validators, 19 fixtured incl. the new one, 35 grandfathered). `node scripts/check-wiring-ledger.mjs`: clean (71 validators, 71 reachable — the new validator is chained, so it's reachable by construction). **Disclosed, not fixed, out of scope:** `docs/FEATURES.md`'s validator-catalog row count (68 rows) was already behind the real file count (75 `.sh` files in `scripts/validators/`) before this ticket touched it — a pre-existing drift this ticket's own row addition doesn't introduce and doesn't attempt to fully reconcile, consistent with this repo's own disclosed-not-fixed norm for unrelated pre-existing count gaps (see T29.2's/T29.3's identical disclosures for `docs/FEATURES.md`/README skill counts). This ticket does not build a live Jira/Linear/GitHub Projects API adapter — deliberately out of scope per the design step's own text ("every tracker's API is different; a project supplies its own export"); `scripts/tracker-link-sweep.mjs` is the reference linking ALGORITHM a project's own adapter calls, not a live client. `scripts/test.ts` was already over `validate-file-size.sh`'s 400-line cap on `main` (527 lines, post-T29.3) before this ticket touched it; Pass 38's wiring adds 29 lines (556 total) — a pre-existing, disclosed gap this ticket marginally compounds, consistent with every prior Pass-N addition to this same file (T29.2's/T29.3's own entries above disclose the identical pattern). New `scripts/test-tracker-integrity.ts` (333 lines) is flagged `[!] approaching the cap` (>300, advisory only, not gate-blocking) by the same validator.

- **T29.3** — Generated-project STATUS.md derives % from the requirement (story) layer, built-vs-done split, never green with open stories, plus freshness check (M29 field lesson, H7/C-1). Root cause: generated project status artifacts were hand-written, so a phase could be painted "done" purely off task closure while the T29.2 requirement layer was still open — the same task-closure-standing-in-for-requirement-closure defect T29.2 closed for the phase-4→5 gate, now closed for the human-facing status artifact. New `scripts/lib/status-report.mjs` (pure, testable): `computeStatusReport(plan, storyIds)` derives BOTH the task layer (module closure, "platform / foundation built") and, when adopted, the requirement layer via T29.2's `requirementClosure()` ("features complete") — a phase grades `complete` only when both are 100%, `built-not-done` when tasks=100% but any story is open (never green), else `in-progress`; `lastWorkEvent(plan)` reads the latest `history[]`/`claimed_at` timestamp across all modules; `checkStatusFreshness()` flags an artifact stale when its embedded numbers mismatch a live recompute or predate the plan's last work event. New `scripts/gen-status-report.mjs` CLI writes `docs/work/STATUS.md` with label math shown for both layers plus a machine-readable `<!-- STATUS_REPORT_META {...} -->` comment, and a `--check` mode for freshness only. New standalone validator `scripts/validators/validate-status-freshness.sh` wraps `--check` (deliberately not chained into a phase gate — STATUS.md is a rolling dashboard artifact, not a phase deliverable, same posture as `validate-close-receipt.sh`); wired as a new step in `skills/steward/SKILL.md`'s `/steward audit` Phase 2 ("flagged stale by steward" per the ticket text) and documented in `docs/TICKET_SCHEMA.md`. Ticket's own acceptance fixture (tasks=100%/stories=50% renders half-done) reproduced exactly: `computeStatusReport` grades `built-not-done`, the rendered markdown shows `🟡 BUILT — FEATURES INCOMPLETE` and never `✅ COMPLETE`. New Pass 36 (`scripts/test-status-report.ts`, 12 assertions) covers the derivation math, the never-green rule, backward compatibility (no `stories[]` adopted → task-closure-only grading), both staleness triggers, and red/green integration tests that shell out to the real `validate-status-freshness.sh` CLI. `docs/FEATURES.md`/`docs/USERGUIDE.md` validator counts updated 69→70 with a new catalog row (validate-doc-counts.sh's derived-count gate, same hygiene T29.2 exercised). `npm test`: 377 passed, 1 pre-existing unrelated failure (`validate-vendor-provenance.sh`'s `.worktrees` path-exclusion false-negative — same known gap disclosed on T29.2's and prior entries above, confirmed clean on `main` outside any `.worktrees/` path). `node scripts/check-validator-fixtures.mjs`: unaffected (the new validator is deliberately not chained, so it's outside this harness's scope, same as `validate-close-receipt.sh`). `node scripts/check-wiring-ledger.mjs`: clean — the new validator is reachable via a real npm-test reference (Pass 36 shells out to it directly, not just a string mention). **Disclosed, not fixed, out of scope:** `docs/FEATURES.md`/README.md's pre-existing skills-count gap (40 claimed vs 41 actual) is unrelated (no skill touched here) and left alone, consistent with T29.2's same disclosure. `scripts/test.ts` was already over `validate-file-size.sh`'s 400-line cap on `main` (515 lines, post-T29.2) before this ticket touched it; Pass 36's wiring adds 12 lines (527 total) — a pre-existing, disclosed gap this ticket marginally compounds, consistent with every prior Pass-N addition to this same file (T29.2's own entry above discloses the identical pattern).
- **T29.2** — Requirement-story layer in `plan.json` + requirement-closure gate (M29 field lesson, H1/A-6.3). Root cause: `ModuleTicket` had no requirement/story field at all, so task closure (every module `done`) silently stood in for requirement closure (every user story actually delivered) — a plan could show 100% modules done while a real story was never claimed by anything. `ModuleTicket` gains an optional `stories: string[]` field (`docs/TICKET_SCHEMA.md`, `scripts/lib/tickets-graph.mjs`'s `validatePlan()` — structural check only, array-of-strings). New `scripts/lib/user-stories.mjs` (`extractStoryIds()`) parses `docs/USER_STORIES.md` headings (`## US-01 ...` or `### E1.1 ...` — any `##`-`####` heading whose first token has a digit, so both this repo's convention and RepoPulse's differing one parse identically). Two new pure functions in `tickets-graph.mjs`: `storyCoverageWarnings()` (a story with zero referencing modules — advisory `[!]`, wired into `validate-tickets.sh`, promotable to a hard `[x]` gate via `STORY_COVERAGE_STRICT=1`) and `requirementClosure()` (a story is closed only when ≥1 module references it AND every referencing module is `done` — independent of task closure by construction). New `tickets.mjs requirement-status` CLI command. New chained validator `scripts/validators/validate-requirement-closure.sh` wired into phase-5's `GATE_VALIDATORS`: computes `requirementClosure()` against `docs/USER_STORIES.md`, and separately requires the mandatory reconciliation matrix (`docs/work/REQUIREMENT_RECONCILIATION.md`, new `scripts/lib/reconciliation-matrix.mjs` parser) to exist with a `DONE`/`PARTIAL`/`OUTSTANDING` verdict for every story (`OUTSTANDING` or a missing row fails the gate; `PARTIAL` is a disclosed gap, not a silent one) — skips cleanly when a project hasn't adopted `docs/USER_STORIES.md` or `stories[]` at all (additive, not retroactive). New Template 11 in `agents/shared/HANDOFF_TEMPLATES.md` (Requirement Reconciliation HANDOFF) is the mandatory code↔requirement reconciliation step this gate requires as Phase-5 input — an agent walks every story against the real code, not the ticket's self-reported status. Red/green fixtures at `evals/fixtures/validators/validate-requirement-closure/` (red: every module `done`, one story never mapped — the ticket's own acceptance criterion, reproduced exactly); new Pass 35 (`scripts/test-requirement-closure.ts`) unit-tests `extractStoryIds`/`storyCoverageWarnings`/`requirementClosure`/`parseReconciliationMatrix`/`reconciliationGaps`. Live acceptance run against a real, external, unmodified project (`~/Code/repopulse`'s actual `plan.json`+`USER_STORIES.md`, read-only, nothing written into that repo): its `plan.json` predates this ticket's schema (flat `tickets[]`, no `stories[]`), so `validate-requirement-closure.sh` correctly reports "requirement layer not adopted, nothing to check" against it as-is; to still produce a genuine matrix from real data, a worked example derives epic-level (not per-story) verdicts from RepoPulse's own epic→module tag declarations cross-referenced with its tickets' `module`/`status` fields — see `docs/work/examples/repopulse-reconciliation-example.md` (51/51 stories correctly `OUTSTANDING`, matching RepoPulse's real state of 0/62 tickets done). `npm test`: 365 passed, 1 pre-existing unrelated failure (`validate-vendor-provenance.sh`'s `.worktrees` path-exclusion false-negative — already disclosed on T21.1's and T30.10's entries above as present on `origin/main` too, confirmed again here via a clean `main` clone outside any `.worktrees/` path). `node scripts/check-validator-fixtures.mjs`: clean (53 chained validators, 18 fixtured incl. the new one, 35 grandfathered). `scripts/test.ts` was already over `validate-file-size.sh`'s 400-line cap on `main` (503 lines) before this ticket; the new Pass 35 wiring adds 12 lines (515 total) — a pre-existing, disclosed gap this ticket marginally adds to, consistent with every other Pass-N addition to this file, not newly introduced.
- **T21.1** — M21 end-user guide expert, protocol + 3 charters: new `agents/shared/GUIDE_CAPTURE.md` (the `BROWSER_TESTING.md` sibling for guide work) defines the replayable per-step JSON spec (`docs/guide/specs/<task>.json`, Doc-Detective-style so a guide can be regenerated instead of rotting), capture hygiene (pinned 1280×800@2x, animations disabled, mask dynamic data, wait for the expected-result element — never `networkidle`), the three deterministic quality gates (A blank/near-blank, B error-state, C premature-capture) with a retry(3)→BLOCKED policy, the error-vs-bug triage matrix (bug → `BUG_LOG.md` + excluded from the manual, designed error → Troubleshooting chapter, ambiguous → documented + `⚠ suspect`), naming conventions, and the `GUIDE_ENV` convention (`baseUrl`/`credsPath`/`seedScript`) for auth-gated apps. Three new charters follow the T9.1 micro-expert template (SDLC Handoff bounded-task trigger, MICRO_LOOP injection, Input Contract + BLOCKED gate, hard rules, Completion Manifest with a "Ready for" chain, Pre-Completion Gate) and are the first adopters of both T13.3 includes together (`progress-grounding.md` + `autonomy-end-turn-check.md`): `agents/app-cartographer.md` (page-graph state inventory `(route, tab, modal, pane)` deduped by accessibility-tree hash, plus a per-state `E-*` element inventory → `docs/guide/APP_MAP.md`; derived goal-titled story list where every element ID is claimed or `SKIPPED`-with-reason → `docs/guide/STORIES.md`; owns the default-deny destructive-edge firewall), `agents/guide-scribe.md` (the capture engine — turns stories into specs, executes them, gates every capture, triages Gate-B trips; also references `agents/shared/PERSISTENCE.md` since a multi-step capture loop is exactly where announce-then-stop bites), `agents/manual-writer.md` (assembles the Diátaxis book — Intro → Getting Started → per-feature how-to → Reference → Troubleshooting → Glossary — never citing a step without a spec+gated-screenshot behind it). Deliberately does NOT ship `skills/user-guide/scripts/img-gate.mjs`/`annotate.mjs` (T21.2's scope) — `GUIDE_CAPTURE.md` §8 is the forward contract those scripts implement. `npm test`: 352 passed, 1 pre-existing unrelated failure (`validate-vendor-provenance.sh`'s `.worktrees` path-exclusion false-negative, confirmed present on `origin/main` too — see T30.10's entry above for the same known gap). `agents:check`: 45 agents in sync (these charters use the lighter subagent-tier "## Loop prevention" section, not the synced `## Loop prevention (MANDATORY)` block, matching T9.1's design charters). `validate-persistence-block.sh`, `validate-handoff-discipline.sh`, `validate-file-size.sh`, `validate-scope.sh agents` all clean on the touched files; `validate-no-ascii-art.sh` and `validate-doc-counts.sh` gaps are pre-existing and identical on a clean `origin/main` checkout (confirmed via a throwaway detached worktree), unrelated to this change.
- **T30.10** — TUI session-hygiene protocol (LOCAL_CONTEXT_INTEGRITY_DESIGN P3): the TUI and `opencode run` assemble requests identically (full history + system + every tool schema, resent every turn); only session *lifetime* differs, so a long-lived TUI session floods itself unless tool-heavy work dispatches to a fresh context every time. New `agents/shared/TUI_SESSION_HYGIENE.md` codifies the four rules: (1) thin orchestrator — the TUI session holds only the coordinator, never a specialist's own methodology; (2) mandatory fresh-context dispatch — every tool-heavy specialist routes via Executor A (task-tool subagent) or B (`opencode run` subprocess), never Executor D (inline), since `opencode_cli=true` always in the TUI; (3) scan-output-to-disk hard rule — SAST/secrets/dependency scans write raw output to disk and return only a path + count, never stream the dump into the tool result (T30.8's V8 finding: even honest context limits don't save a hold-it-in-context workflow — 219 evicted-and-re-read tool calls, 0 compaction, doom-loop detector silent on cross-message repeats); (4) 70%-of-truthful-context-display checkpoint-and-resume — now that T30.8's `sync-model-limits.mjs` makes the TUI's context-% indicator honest, checkpoint `docs/work/STATE.md` and `/sdlc resume` at 70% of that live number rather than riding autocompaction. `agents/shared/EXECUTOR_SELECTION.md` gains a "TUI mode" note (`opencode_cli` is always true in the TUI, so B is always available — Executor D's skill-less carve-out is for headless/no-CLI runtimes only, not the TUI) and its executor-D table row is reworded to say so explicitly. `agents/security-auditor.md`'s Executor rule rewritten to drop the old "in opencode the coordinator runs them inline" fallback — every wave now dispatches via A or B. `agents/security/semgrep-runner.md` Phase 1 fixed as the reference implementation: `... | tee raw-output.txt` (streams the full dump back as the tool result) replaced with a plain redirect + `wc -l`/count report. New `scripts/validators/validate-handoff-discipline.sh` check (`scan-inline-dispatch`): flags a coordinator that names a scan-heavy specialist and describes running it inline without the explicit never-inline override; fixtures at `evals/fixtures/validators/validate-handoff-discipline/{red,green}/` (green fixture is the acceptance-criterion "security-wave HANDOFF routes via task/subprocess with disk-written scan output"). New Pass 33 (`scripts/test-tui-session-hygiene.ts`): the red/green pair via the real validator CLI, plus a grep assertion that the protocol text carries the 70% rule and that EXECUTOR_SELECTION.md carries the TUI mode note. `docs/FEATURES.md` shared-protocol catalog updated (26→27). `npm test`: 349 passed, 1 pre-existing unrelated failure (see PR evidence — `validate-vendor-provenance.sh`'s `.worktrees` path-exclusion false-negatives when run from inside this repo's own isolated-worktree executor convention; confirmed present on `origin/main` too, not introduced by this change).
- **T29.8** — Anti-slop rule R-30: library-shaped reimplementation (M29 field lesson, B-2). Field lesson: a design doc claimed "we use library X" for a vendored/copy-paste component set that was actually AI-written from memory — renamed variants, dropped sizes, an older template — never pulled from the real upstream; a reviewing developer caught it as "reinventing the component lib." Note: the field lesson's own text names this "R-29," but R-29 (Prose Padding) already shipped on main by the time this ticket ran — the new rule lands as **R-30** to avoid renumbering an already-published rule; flagged here as board-vs-field-report drift, not a ticket-scope deviation. `agents/shared/ANTI_SLOP_RULES.md` gains a new Category 8 (Vendoring & Provenance Slop) with R-30's pattern/why/rule/reviewer-check/detection. New `scripts/validators/validate-vendor-provenance.sh`: requires a `VENDORED.md` provenance manifest (`source`, `tool`/`registry`, `version`, `files:` list) at any vendored directory, or an explicit `generated-from-memory: true` + `divergence:` declaration when upstream truly couldn't be pulled; flags dropped variants (declared, missing from disk), undeclared/renamed variants (on disk, not declared), and undeclared vendoring (a directory's own README uses vendoring language with no VENDORED.md sibling — scoped to README.md only, not every markdown file, after a first pass against the real repo false-positived on this repo's own prompt docs discussing vendoring as a concept). Wired into `agents/code-review/anti-slop-auditor.md` (new Category 8 pass + pre-completion gate item + automated detection command), `agents/coding-agent.md` (new Vendoring subsection + scoring-table row bump to R-01–R-30), and `agents/frontend-design.md` (new "Vendored Component Provenance" subsection under Component Library Patterns — the most on-point agent, since B-2's actual incident was a shadcn-style copy-paste component set). Red/green fixtures at `evals/fixtures/validators/validate-vendor-provenance/` (red: dropped `dialog.tsx`, renamed `button.tsx`→`button-custom.tsx`, undeclared-vendoring README; green: matching manifest + a declared memory-generated divergence). New Pass 31 (`scripts/test-vendor-provenance.ts`): red/green pair plus 3 false-positive stress cases (incidental library mention, concept discussion in a non-README doc, non-component sibling file). `npm test`: 335 passed (330 + 5 new).
- **T30.2** — Session model receipt (M30 model-tier guard, Part 1/G1): `plugins/expert-hooks.ts`'s `event` hook now fires a session-model receipt on the FIRST assistant message of every session (providerID/modelID are set at message creation, not just completion, so this is the earliest observable point) — resolves the tier against the project's own `models.json` (T30.1's registry) and appends one row (`ts`/`session`/`agent`/`model`/`tier`) to `docs/work/session-receipts.jsonl`, plus a `console.log` first line (`[session-receipt] model=... tier=... session=...`) so the resolved model is visible immediately, not just in a file nobody tails mid-session — the exact gap the opus-4.8 misconfig incident exposed (a frontier model ran and nothing recorded it). Self-contained by design: `install.sh` only ships `plugins/` to a consuming project (not `scripts/`), so the tier-matching algorithm (`globToRegExpForTier`/`resolveTierForReceipt`) is a hand-mirrored copy of `scripts/lib/model-tiers.mjs`'s `resolveTier`, not an import across the install boundary — degrades to `tier: null` (unclassified), never throws, when a project has no `models.json` at all. New Pass 30 (`scripts/test-session-model-receipt.ts`): tier-resolution parity cases plus `logSessionReceipt()` row-shape checks (frontier model, unrecognized model, missing `models.json`). `npm test`: 330 passed (323 + 7 new). Companion conductor-side receipt (per-session tokens in/out + the G2 frontier-without-escalation-token gate) lands in `bpm-agent-amplifier`'s `scripts/conductor.mjs`, this ticket's other named write scope — see that repo's own CHANGELOG/evidence.
- **T30.1** — Model-tier registry + config-pin lint (M30 model-tier guard, Part 1/G3): new root `models.json` gains a `tiers` registry (`local`/`cheap`/`frontier`, glob `match` patterns + gate `policy`) and per-model `max_output_real` (the "45k configured / ~10k real on LM Studio qwen3.6" lesson — size requests honestly, kill truncation-retry waste). New `scripts/lib/model-tiers.mjs` (`resolveTier`/`getGatePolicy`/`getMaxOutputReal`, first-match-wins glob resolution) backs new `scripts/validators/validate-model-pins.sh` (G3): a frontier-tier model id hardcoded in agent frontmatter or repo config outside `models.json` is a hard gap — "pin roles, not models," the exact 2026-07-08 opus-4.8 misconfig class (a repo carried a raw frontier pin; nothing gated it, nothing surfaced it); any other raw `model:`/`"model"` pin outside `models.json` warns without failing. Wired into `validate-phase-gate.sh`'s phase-5 release gate (next to `validate-challenger-gate.sh`); red/green fixtures at `evals/fixtures/validators/validate-model-pins/`. New Pass 29 (`scripts/test-model-tier-lint.ts`): tier resolution unit-tested for every glob pattern in the live registry plus gate-policy/max_output_real lookups, and the planted-opus-pin/warn-only/clean-tree validator fixtures via the real CLI. Deliberately does NOT add a `roles` map (per-role routing) — that's T28.2's scope, left for it to extend without a merge collision. Doc counts updated (66→67 validators, `docs/USERGUIDE.md`/`docs/FEATURES.md`).
- **T26.4** — `/reflow audit` reconciliation mode: new `scripts/lib/reflow-audit.mjs`, the incident recovery tool (M26) — distinct from T26.2's forward-looking `validate-ticket-hygiene.sh` gate, which checks evidence→code correspondence for modules that already have evidence recorded. This does the reverse, retrospective check a post-incident cleanup actually needs: grades every non-`blocked` module `VERIFIED`/`UNVERIFIED`/`ORPHAN-CODE` by checking manifest existence, re-running `module.verify` (never a caller override, same rule `close()` already follows — `--skip-verify` for plans whose verify fields aren't known-safe commands), and cross-referencing `evidence.commits` + `write_scope` against real `git log` on HEAD (not `--all`, to avoid attributing an unmerged branch's code to the mainline). `ORPHAN-CODE` is the exact 2026-07-07 incident pattern: real commits touch a module's write_scope but no evidence was ever recorded. Writes `docs/work/RECONCILIATION.md` (CLI: `node scripts/lib/reflow-audit.mjs <plan.json> [--repo] [--out] [--skip-verify]`). Not wired into `validate-phase-gate.sh` — a manually-invoked recovery tool, not a blocking gate. New Pass 27 (`scripts/test-reflow-audit.ts`) covers all three grades plus the verify tri-state (not-configured / skipped / ran-fail / ran-pass) using this repo's own real git history (a dynamically-discovered commit, not a hardcoded hash). Acceptance fixture: run for real, read-only, against a private project's live `docs/learning-system/plan.json` (37 modules, 15 marked `done` with zero `evidence`/`history`/`manifest` — a genuine lost-audit-trail plan predating T26.1's schema v2) — see `docs/work/reconciliation-runs/private-project-2026-07-12.md` for the report and this ticket's evidence for the full run transcript.
- **T5.6** — new `skills/vault/SKILL.md` teaches any agent the three agent-brain-vault ops (query, ingest, lint) against `@bpm/wiki-compiler` (bpm-agent-amplifier): query by grepping `wiki/*.md` today, or `queryVault()` once memory-MCP's `'wiki-page'` MemoryType lands (T5.5's flagged blocker, still open); ingest by `writePage()`'s schema (non-empty `provenance`, routing-table re-synthesis, `CONFLICTS.md` on contradiction) until T5.2's compile adapters ship; lint by `validateLinks()` today, full contradiction/orphan/staleness lint once T5.4 ships. Mirrored into attest-claude/skills/vault/ (parity confirmed by `npm test`'s skills-parity pass). `agents/researcher.md` gains a "query the vault before you search" step alongside its existing `fact_query` step — gives every Jarvis research unit `queryVault` as a fetcher automatically since opencode experts run as Jarvis micro-agents (M9). `agents/guide.md` gains a `/vault` routing-table row.

- **T26.2** — Ticket lifecycle hygiene audit: new `validate-ticket-hygiene.sh` + `scripts/lib/ticket-hygiene.mjs`, wired into `validate-phase-gate.sh`'s phase-4 chain alongside `validate-tickets.sh`. Distinct from `validate-tickets.sh` (structural graph validity — schema/DAG/write-scope collisions); this audits whether the T26.1 lifecycle was actually FOLLOWED, re-derived from plan.json's own persisted fields rather than trusting `accept()` was used: (1) `incomplete-evidence` — a `done` module missing manifest/evidence/history; (2) `wip-violation` — one owner holding >1 open (claimed/in_progress) ticket at once; (3) `stale-claim` — `claimed_at` older than 7 days while still open; (4) `tracker-drift` — `docs/work/TICKETS.md`'s rendered status or `docs/work/STATE.md`'s Done-section claims disagreeing with plan.json's live status; (5) `scope-violation`/`evidence-commit-not-found` — an evidence commit touching a file outside the module's `write_scope`, or citing a commit absent from the repo's git history entirely (the audit↔code cross-check). Root cause: the 2026-07-07 incident where an executor worked tickets without claiming/commenting/closing them and self-asserted "done" with no audit trail. Red fixture plants one instance of every category; green fixture proves a real, correctly-scoped `done` ticket (this PR's own implementation commit) passes clean. New Pass 25 (`scripts/test-ticket-hygiene.ts`) unit-tests each check with an injected deterministic clock (no wall-clock bit-rot on the staleness assertions) plus an end-to-end run of the real script against both fixtures. New `docs/PROOF_LEDGER.md` (didn't exist yet in this repo) seeded with this validator's row per the M22 harness convention.
- **T9.5** — `game-asset-pipeline` charter (`agents/game/game-asset-pipeline.md`, 5th game-dev cluster agent): a micro-loop expert (units = named asset batches) running gen → post-process → sprite-sheet → engine-import. Post-process and packing are deterministic, not model judgment — new `skills/game-asset-pipeline/` ships three scripts: `pixel-snap.mjs` (lattice/pixel-snapper cleanup — dominant-color-per-cell voting onto an explicit grid, optional palette quantization, nearest-neighbor upscale preview), `transparency-cleanup.mjs` (alpha-threshold + un-premultiply de-fringe against a detected or given background color), and `sprite-sheet-pack.mjs` (deterministic shelf packing + a TexturePacker "JSON hash" atlas manifest — the portable engine-import artifact; per-engine loader code stays gameplay-engineer's job). No new deps (`sharp` already present from T21.2). 18 `node --test` cases, synthetic fixtures generated in-process, no binaries checked in. Doc counts updated: 40 skills, 5-agent game-dev cluster (`docs/FEATURES.md`, `docs/AGENT_REFERENCE.md`, `docs/USERGUIDE.md`, `README.md`).

- **T9.4** — `/ux` gains a design-manager scaled-activation default mode (Mode 0 in `agents/ux-engineer.md`, documented in `skills/ux/SKILL.md`): classifies a plain-language request as a component tweak (activates itself + at most one more role — `content-designer` for copy, `design-system-lead` for a token/component decision) or a feature/new UI (runs the full `ux-researcher`→`design-system-lead`→`ux-engineer`→`content-designer` chain sequentially, gated on each step's Completion Manifest); escape hatches for single-mode asks ("review this PR", "audit accessibility") mirror `agents/shared/PHASE_ROUTING_PROTOCOL.md`'s Smart Routing / Escape Hatches pattern. Standalone, direct-invocation path — distinct from the (separately ticketed, T9.2) `sdlc-lead`-orchestrated Phase 3.5 Design Loop.

- **T13.4** — fable-mode discipline folded into `agents/shared/MICRO_LOOP.md`'s micro-loop contract (source: `docs/research/FABLE5_FIELD_REPORTS.md` §6.1, in bpm-agent-amplifier): step 1 CRITERION now also names the stage's expected output before the loop starts; step 3 SELF-VERIFY is now explicit that the check must be FAILABLE (able to actually return FAIL, not a mental "looks right" pass) and, when judgment does fall to `verifier_model`, that it must be a skeptic flagging only confirmed problems — absence of evidence that something is wrong is not itself a finding. No behavior change to the loop's steps/caps, only tightened, explicitly-sourced language on an already-converged mechanism.

- **Parallel worktree agent playbook**: new `references/parallel-worktree-agent-playbook.md` — codifies gotchas discovered across a real multi-agent parallel dispatch session (worktree isolation, the git-stash cross-worktree collision incident, `--base origin/main` vs `--base main`, `build-target-claude.mjs --out`, awk/bash portability traps, fixture/CHANGELOG/merge-gate conventions, and the "confirm the ticket ID is real before dispatching" lesson) so future dispatch prompts can reference it instead of re-deriving everything inline each time.

- **T29.4** — Bootstrap & Empty-State checklist (M29 field lesson, H6/B-1/B-3): `agents/architecture-designer.md` and `agents/security-auditor.md` gain a `## Bootstrap & Empty-State` checklist (t=0 questions: how does the first privileged user exist, is the system usable on an empty DB, what's gated on state alone, what does a zero-role user see, and the concrete bootstrap mechanism); `agents/security/OWASP_METHODOLOGY.md` Phase 4b adds three Standing Threat Archetypes (`bootstrap-authority`, `self-referential-permission-gate`, `rbac-highest-role-wins`), referenced from `agents/security/threat-modeler.md`'s pre-completion gate. `validate-security-controls.sh` (Phase-3 gate) adds three checks: the checklist is answered with real non-placeholder content; a self-referential permission gate — a role that can only be granted by itself (1-hop) or a 2-hop mutual grant cycle (role A requires role B, role B requires role A) — is flagged unless a real bootstrap-mechanism escape is documented (role names extracted generically via backreference, not a hardcoded vocabulary); RBAC cardinality — a many-to-many role schema whose enforcement says "highest role wins" instead of "union of grants" is flagged, with negated mentions ("never ... highest role wins") correctly excluded. `validate-release-readiness.sh` (Phase-5 gate) adds a fresh-deploy bootstrap dry-run check requiring `docs/reviews/BOOTSTRAP_DRYRUN_*.md` with a READY/PASS verdict and an explicit "no manual SQL" claim. Red+green fixtures added for `validate-security-controls.sh` (removed from `GRANDFATHERED.json`); new `scripts/test-bootstrap-checklist.ts` (Pass 20), including a planted 2-hop mutual-cycle edge case in both broken and CLI-bootstrap-fixed form. Independent review (2026-07-09) found four real gaps, all fixed: (1) `bootstrap_escape_ok()` accepted an admittedly-unsafe seed script ("do not run this twice, it will corrupt the role table") as a valid escape because it only keyword-matched "seed" — fixed with danger-cue detection; (2) the RBAC negation-cue list missed "rejected ... in favor of" phrasing, false-positiving a design that explained why it avoided the anti-pattern — cue list expanded; (3) circular-gate detection only checked 1-hop/2-hop cycles, missing a 3+-hop chain (Alpha→Beta→Gamma→Alpha) — replaced with general N-hop cycle detection (DFS over the grant-dependency graph, portable POSIX awk); (4) the three new checks were appended after the pre-existing "no THREAT_MODEL.md → validator_exit" early return, making them unreachable on exactly the early-stage project this ticket targets — checks reordered to run first. New `scripts/test-bootstrap-checklist-regressions.ts` (Pass 21) covers all four.
- **T26.3** — Close-before-next-claim: `/reflow`'s claim HANDOFF template gains a Stage 0 (paste the `start()` receipt verbatim) and a final stage requiring the `close()` receipt pasted verbatim into the Completion Manifest as the ONLY accepted completion signal, replacing a self-asserted `"<id> done"`; `accept()` (`scripts/lib/tickets-lifecycle.mjs`) now refuses `in_review -> done` unless the manifest actually has that receipt, with branch/commits AND (independent review fix) the receipt's own `actor:` line cross-checked against `module.evidence`/the ticket's owner — defeats a hand-typed fake, including one with correct branch/commits but a fabricated actor. New `validate-close-receipt.sh` + red/green fixtures exercise the same check standalone. `tickets.mjs claim` now refuses to hand out a NEW ticket while the ticket graph itself is unhygienic (write-scope collision) — enforced inside `claim()` itself (extracted graph invariants into `scripts/lib/tickets-graph.mjs` to avoid a circular import), not just the CLI, after independent review found a direct library import bypassed the CLI-only version entirely. New `open-for`/`openTicketFor()` expose the "does this actor have an open ticket" query `claim`'s existing WIP=1 check already used internally; `run-until-done.sh` gains `--plan`/`--actor` and a `next_work_gate_ok()` preflight (refuses to start at all while hygiene is red or the actor's previous ticket is still open — no-op when neither flag is given), plus a second `--self-test` scenario proving it; `MICRO_LOOP.md`/`PERSISTENCE.md` document the rule in prose, pointing at the code enforcement. New Pass 18/19 (`scripts/test-close-receipt.ts`, `scripts/test-refuse-next-work.ts`).
- **T29.5** — ADR for load-bearing choices + Challenger-over-rationales (H4/A-5): new `references/adr-template.md` (Deciding Factors section tags each bullet `Internal — rigorous` / `Internal — soft` / `**External rationale (needs verification):**`, the last a literal marker); `exemplars/adr.md` extended with a Deciding Factors example. `validate-adrs.sh` now also gates hard-to-reverse choices (datastore/auth-model/core-framework/vendoring-strategy — extensible category list) asserted in `ARCHITECTURE.md`/`TECH_STACK.md` on a referenced ADR whose own content actually documents that category, not just any ADR reference (fixed an early-exit ordering bug that would have let a hard-choice-with-zero-ADR-refs silently pass); fixtures added, removed from `GRANDFATHERED.json`. `validate-challenger-gate.sh` treats an ADR/design doc carrying the external-rationale marker as a source requiring its own matching challenge report — same T22.20 per-source `**Artifact:**` correlation, not a parallel mechanism; a challenge report that only names a researcher's `RESEARCH_*.md` proxy does not satisfy the ADR's marker (the loop must terminate in a challenge report naming the ADR itself). Wired into Phase 3's `GATE_VALIDATORS` (not just Phase 5) so an unverified external rationale blocks the design doc before it's final. `CHALLENGER_PROTOCOL.md` trigger table + an "External rationale in an ADR" HANDOFF example added. New Pass 17 (`scripts/test-adr-external-rationale.ts`) — planted acceptance test (unverified external rationale flagged) + soft-tag and researcher-proxy bypass guards.
- **T29.9** — Publish render-health (H8/C-2/C-3): two confirmed-hit publish-time rendering bugs closed. `validate-mermaid.sh` gains M013, promoting an unescaped backtick anywhere in a Mermaid diagram body (not just `[...]` labels — also `{...}`, `(...)`, `\|...\|` edge labels, Note text) from a non-blocking M010 warning to a hard-fail ERROR, since a stray backtick breaks the Mermaid parser and the publish pipeline silently falls back to showing the raw ```mermaid code block instead of the diagram; `%%` comment lines are exempt. New `validate-doc-render-health.sh` adds a markdown-table orphan-fragment linter: a `\|`-delimited data row not preceded (in the same contiguous, fence-aware block) by a valid header + `---\|---`-style separator row renders as literal pipe-text in most renderers. Also fixed a real, live instance of that exact bug class found in `docs/SETUP.md` (a multi-line table cell broke the row, orphaning the rows below it). Both validators chained into `validate-phase-gate.sh`'s phase-3 and onboard-deep doc-hygiene sets, and into `agents/shared/BOOK_PROTOCOL.md`'s publish-validation commands (referenced by 8 agent files) as the "render-health" gate — any future doc-compilation pipeline (e.g. a wiki-compiler) inherits the same gate as an acceptance criterion. Red+green fixtures for both (removed `validate-mermaid.sh` from `GRANDFATHERED.json`); new `scripts/test-doc-render-health.ts` (Pass 16), including false-positive stress cases (unusual separator whitespace, code-fence/prose pipes, backtick-in-`%%`-comment). Independent review (2026-07-09) found `validate-doc-render-health.sh`'s fence tracker only recognized ` ``` ` fences, false-positiving on a `~~~`-fenced code block containing pipe-delimited sample output — fixed to recognize both GFM fence styles, plus a regression fixture/test case. Also confirmed two accepted non-goals: blockquoted orphan tables are invisible to the linter (rare, out of the ticket's stated scope), and `validate-mermaid.sh`'s pre-existing fence tracker (unchanged by this ticket) doesn't recognize `~~~` either, so a mermaid example nested inside an illustrative `~~~` block could false-positive M013 — low probability, not fixed here. CI (Linux, GNU bash) then surfaced a real, pre-existing, DIRECTLY-blocking M012 bug the first time `validate-mermaid.sh` was actually gate-fixtured (it was previously grandfathered — never exercised against real content in `npm test`): `${line//[^]]/}` is interpreted correctly on macOS bash 3.2 (a `]` immediately after `[^` is POSIX-literal) but silently matches nothing on GNU bash 5.x (confirmed live via a `podman run bash:5` cross-check) — `closes` came back as the entire unchanged line, not just its `]` count, so M012 was effectively dead code on any Linux CI runner. Fixed with a portable char-by-char loop (no bracket-negation ambiguity). Root-cause verification during this fix also found the SAME macOS-vs-Linux regex-engine divergence in M001's `=~`-based `[^]["]` idiom (confirmed live: 0 findings against this repo's own real `docs/`/`agents/`/`references/` trees on bash 3.2 vs. 40 combined findings on bash 5.x for the identical content) — likely present in M004/M007 too (same idiom family), but NOT exercised by this repo's own CI (`npm test` never runs `validate-mermaid.sh` against the real docs tree, only against small fixtures) so it doesn't block this PR; left unfixed as out-of-scope for T29.9 and disclosed for a dedicated follow-up ticket, since fixing it touches checks this ticket didn't author and risks a much larger, riskier diff.
- **T22.6** — Load-bearing denominators: `validate-design-system.sh` now enumerates STATES (loading/loaded/error/empty + hover/disabled) per data component from UX_SPEC.md's "### Data Display" § "## State Matrix", fixed a same-line awk range-pattern bug that had made the whole Component Inventory check dead code, killed the `head -10`/`head -20` sampling caps, and replaced the 1-of-N color-match pass with a >=50% floor; `validate-tests-mapping.sh` now requires an assertion-level (same-line test-block keyword) reference for P0/P1 UC coverage instead of any bare occurrence, and surfaces P2 use cases as explicit SKIPPED notes; `validate-wcag-coverage.sh` adds an interactive-element inventory (re-derived from component source) as the a11y coverage denominator; `validate-inventory.sh` adds a second pass re-deriving routes/tables/services from source and diffing against INVENTORY.md. Red+green fixtures added for all four (removed from `GRANDFATHERED.json`); new `scripts/test-load-bearing-denominators.ts` (Pass 15).
- **T22.19** — `\b`-in-awk is unsupported on stock macOS system awk (onetrueawk): `validate-code-health.sh`'s R-02 (try/catch inside a loop) and H-01 (functions >50 lines) checks, plus `validate-fix-backlog-closed.sh`'s WAIVED-without-justification check, all silently never fired despite looking correct — fixed by replacing `\b` with portable whole-word matching (token-split comparison, or explicit boundary-position verification, both underscore-aware so `for_loop`/`my_function`/`HIGH_RISK` don't false-positive); also fixed an unrelated but co-located bug found live in the same waived-justification check (`/regex/i` is not valid onetrueawk syntax — it silently concatenates the match result with the loop's `i` counter, making the check always-true). New Pass 13 (`scripts/test-awk-word-boundary.ts`) + red/green fixtures for both validators (both previously grandfathered off fixture coverage; grandfather list updated).
- **T22.7** — Wiring ledger: `scripts/check-wiring-ledger.mjs` (new, wired into `npm test` as Pass 12) confirms every `scripts/validators/validate-*.sh` is reachable via a deterministic chain, npm test, or a documented prose-trigger, and every `agents/shared/*.md` is reachable via a reference chain from a top-level agent — live repo confirmed clean (0 orphans of either kind); the 8 validators previously unchained from `validate-phase-gate.sh`/`run-handoff-gates.sh` all carry real prose-triggers (mostly `agents/git-expert.md`'s merge-gate conditions); `HANDOFF_QUICK_REF.md`/`LOCAL_LLM_PRIMER.md` confirmed reachable (not dead) via `MODEL_ADAPTER.md`'s two-hop model-tier routing table.
- **T27.4** — Outer-loop completion is receipts, not the promise token: `validate-state-drift.sh` (new) cross-checks `docs/work/STATE.md`'s Done-section phase claims against real gate receipts; `run-until-done.sh`'s `is_complete()` now requires the drift check clean (and `validate-tickets.sh` clean when a plan.json exists) before trusting the promise token; `/sdlc resume` runs the same drift check before trusting `Next`.
- **T27.5** — Runtime autonomy ledger check: `validate-autonomy-ledger.sh` (NEVER-AUTO signing tripwire).
- **T27.3** — Challenger enforcement gate: `validate-challenger-gate.sh` (CHALLENGE_REPORT existence + CONTRADICTED tripwire).
- **T22.20** — Challenger gate slug/date correlation: `validate-challenger-gate.sh` now matches each source report (HIGH/CRITICAL finding) to its OWN challenge report via the declared `**Artifact:**` header field (basename match), instead of T27.3's pure existence check — an unrelated clean challenge report elsewhere no longer satisfies the gate for a fresh, never-challenged finding; `CHALLENGER_PROTOCOL.md`'s report template note updated to mark the Artifact field load-bearing; new Pass 13 (`scripts/test-challenger-gate-correlation.ts`).
- **T27.2** — Truthful completion: `validate-completion-manifest.sh` v2 (Files-produced/Verify-result stat checks, Maker/Verifier identity), `validate-tickets.sh` un-orphaned into phase-4, `run-handoff-gates.sh` gains a Tracker gate, gate scores are now advisory (`GATE_SCORING_PROTOCOL.md`).
- **T21.2** — M21 user-guide capture tooling: `skills/user-guide/scripts/img-gate.mjs` (Gate A quality check — size floor, per-channel-stddev blank-detect, dominant-color-vs-per-app-baseline, two-shot `pixelmatch` stability, each with a specific failure reason) and `annotate.mjs` (one rounded highlight box + numbered badge composited onto a copy via `sharp`; original never mutated). New deps `sharp`, `pixelmatch`. 23 `node --test` cases incl. blank/skeleton/known-good synthetic fixtures generated in-test. No agent-prompt changes.

## [2.0.0] — 2026-07-12

_Reconstructed 2026-10-08 from the v2.0.0 annotated tag; the changelog skipped this release._

Field-lessons fold, M28 conductor, exact skills parity.

- Tier-aware, class-dependent loop budgets (FIX_VERIFY / MICRO_LOOP): stall=2 then escalate; converging progress loops extend (6 metered / 12 local); REGRESSED is zero-tolerance.
- Symlink- and traversal-safe manifest verification (`file-escapes-root`) with a red test.
- `scopeCoverageWarnings` advisory plan-lint in `tickets.mjs`.
- TypeScript-calibrated code-health / dead-code heuristics (comment, string and fixture exclusion; 20 false positives → 0).
- M28 conductor reference implementation (`scripts/conductor/`).
- Skills parity with attest-claude made exact (5 skills ported).

283 tests passing.

## [1.32.0] — 2026-07-06

### Added — UX gate hardening + founding-brief traceability (RetroForge lesson)
Root cause fixed: a Rust/egui desktop app (RetroForge) sailed through SDLC
with no frontend design doc — UI-bearing detection was web-centric
(package.json-only) and the phase-3 gate only validated UX docs *if they
already existed* (circular).

- **UI-bearing detection expanded** (sdlc-init-phase-3.md + phases-3-4.md):
  native desktop GUI toolkits (egui/iced/slint/qt/gtk/tkinter/wpf/avalonia/…),
  TUI (scope-reduced UX branch), game frontends, and a decisive brief-driven
  catch-all (any human-operated surface named in brief/SRS/stories ⇒
  UI-bearing). Default when ambiguous: UI-bearing = YES. Determination must
  be recorded in ARCHITECTURE.md § Logical View (gate-checked).
- **validate-ux-spec.sh non-circular**: now in the phase-3 gate
  UNCONDITIONALLY; passes only with UX docs present OR an explicit
  "No UI — UX branch not applicable" declaration in ARCHITECTURE.md.
  Verified: fails against the pre-fix RetroForge doc set.
- **NEW validate-spec-traceability.sh** + mandatory "Spec Traceability
  Audit" step before the phase-3 gate: docs/TRACEABILITY.md must grade EVERY
  concrete requirement from the founding brief + Discovery answers
  (COVERED/PARTIAL/MISSING, ≥20 rows) against the doc set + ticket board;
  zero unresolved MISSING, PARTIALs need a gap register. SRS-internal
  traceability cannot catch what never made it into the SRS — this can.

## [1.31.0] — 2026-07-03

### Added — Wave O3: prove-it harness (autonomy plan complete)
Final wave of `docs/AUTONOMY_AND_LOOP_UPGRADE_PLAN.md`. O3 is a *measurement* pass — the numbers
need a live model backend, so this ships the deterministic harnesses (each with `--self-test`,
no model required) plus the runbook; the live runs happen on the hardware and get recorded back.
- **`scripts/pause-census.mjs`** — counts user-input pauses in a run transcript; compares
  `interactive` vs `auto` and asserts `auto ≤ NEVER-AUTO` budget (reads the APPROVALS.md ledger).
- **`scripts/soak-monitor.mjs`** — parses a long-session log for auto-resume fires vs manual
  "continue"s (target: zero manual) plus run-until-done outer-loop session count.
- **`docs/O3_PROVE_RUNBOOK.md`** — exact commands + acceptance targets for the three measurements
  (pause census, accidental-pause soak, eval triad no-regression + wall-time delta) and the
  lessons→`loop-learn.mjs` path, with a Results table to fill in.

This completes the autonomy & loop upgrade plan (O0–O3). O3's live numbers are pending on the
M-series/LM-Studio hardware. 99 tests + all validators green.

## [1.30.0] — 2026-07-03

### Added — Wave O2: loop upgrades
Third wave of `docs/AUTONOMY_AND_LOOP_UPGRADE_PLAN.md` — protocol-side twins of the Jarvis M6/M7
loop patterns plus two deterministic scripts.
- **O2.1 evidence sub-loop** — `MICRO_LOOP.md` step **2a EVIDENCE**: if a claim can't be verified
  from what's been seen, LOOK (≤4 grep/read/validator actions per criterion, cited); an evidence
  action is not a revise. Positive "go look" rule to balance the negative guards.
- **O2.2 edit-format discipline** — existing files >~100 lines are edited via SEARCH/REPLACE or a
  unified diff, never whole-file rewrite (weak-model lazy-omission); one retry then whole-file
  fallback recorded in the manifest. `MODEL_ADAPTER` (all tiers, MANDATORY small) + coding-agent Law 5.
- **O2.3 lint-on-edit** — after each file edit, run the cheapest project check on the touched file
  and fix once before proceeding. `MICRO_LOOP` step 3 + coding-agent.
- **O2.4 `run-plan --auto-escalate`** — on a node failing after `--max-retries`, bump one tier and
  retry once (cap `--max-escalations`, default 5), journal the escalation, and emit a loop-learn
  lesson so the planner learns which node types need the strong tier. `--self-test` covers
  success / fail / cap.
- **O2.5 contract-conformance gate** — `validate-contract-conformance.sh` + `contract-conformance.mjs`:
  probe the live app's GET endpoints against the frozen `openapi` spec (declared 2xx + required JSON
  fields; drift = gap), SKIP-safe when no spec/base-url. Wired into the phase-5 gate. Validators →59.
- **O2.6 KV-cache hygiene** — stable byte-prefix (static protocol first, task content last) + backward
  tool-result pruning (`[pruned: …]`). `MODEL_ADAPTER` + `LOCAL_LLM_GUIDE`.
- **O2.7 context-packet relevance** — packets built by relevance to the specialist's criterion (files
  + line ranges + why), never by recency. `sdlc-lead`.

3 script self-tests PASS; 99 tests + all validators green. O3 (prove-it: pause census + soak + eval
re-run) is the only remaining wave.

## [1.29.0] — 2026-07-02

### Added — Wave O1: autonomy levels (make the by-design pauses opt-out)
Second wave of `docs/AUTONOMY_AND_LOOP_UPGRADE_PLAN.md`. Where O0 killed the *accidental*
pauses, O1 makes the *intentional* human-in-the-loop pauses opt-out for unattended runs — with
an audit trail and a hard NEVER-AUTO list.
- **O1.1 `agents/shared/AUTONOMY_PROTOCOL.md`** — two levels via a `.model-context` `autonomy`
  key (`interactive` default | `auto`), also set by an `AGENTS.md`/`CLAUDE.md` `autonomy: auto`
  line or `OPENCODE_AUTONOMY=auto`. In `auto`, each gated pause takes its **documented default**
  and appends a line to `docs/work/APPROVALS.md`. An enumerated **NEVER-AUTO** table always pauses
  (destructive DB ops, merges/releases/deploys, tech-stack additions, behavior-changing security
  fixes, scope-boundary blocks, interviews). `detect-model-context.sh` now writes `autonomy` and
  `opencode_cli`.
- **O1.2 gated 28 pause sites** across sdlc-lead / all phase & mode files / PHASE_ROUTING with an
  inline autonomy line (auto-default or NEVER-AUTO). New `validate-autonomy-wiring.sh` (validators
  →58) fails any pause directive lacking autonomy handling within ±5 lines; wired into the merge gate.
- **O1.3 executor reorder** in `EXECUTOR_SELECTION.md`: **A → B → C** with B (subprocess
  `opencode run --agent --dir`) preferred whenever `opencode_cli=true` — the manual paste is the
  biggest structural pause. In `auto`, C is forbidden → degrade to D (inline) + log. Added the
  `has_task_tool × opencode_cli × autonomy` selection matrix.
- **O1.4 `scripts/run-until-done.sh`** — scripted outer loop: re-invokes `opencode run` with the
  `/sdlc resume` preamble until `<promise>COMPLETE</promise>` (final output or STATE.md), with
  `--max-sessions`/`--max-seconds` caps and a journal. Makes the small-tier "restart after 3" free.
  `--self-test` passes; documented in LOOP_ENGINEERING_PLAYBOOK.

Default is `interactive` — zero behavior change unless opted in. 99 tests + all validators green.
O2 (loop upgrades) / O3 (prove-it) pending.

## [1.28.0] — 2026-07-02

### Added — Wave O0: kill the accidental pauses (autonomy & loop plan)
First wave of `docs/AUTONOMY_AND_LOOP_UPGRADE_PLAN.md`. Attacks the runtime/provider bugs that
make a run stop mid-task needing a manual "continue" — separate from the intentional human gates.
- **O0.1 config hardening** — `examples/opencode.json`: LM Studio + ollama get `timeout: false` +
  `chunkTimeout: 120000` (M2 Max thinking turns exceed the 300s default); an output-clamp comment
  documents opencode #20078 (32k hardcode) and LM Studio #1829 (~10–16k silent cap) — budget ≤10k
  real output/turn on qwen3.6-thinking, prefer bare llama-server for long runs. README notes
  **opencode ≥ v1.2.11** (the `finish_reason:"stop"` fix, PR #14973). `LOCAL_LLM_GUIDE` gains a
  pause-troubleshooting section (8 accidental causes + the by-design gates).
- **O0.2 auto-continue plugins** — `opencode-auto-resume` (stream-stall / raw-text `<function=…>`
  tool calls per #24316 / hallucination loops) and `opencode-todo-reminder`, with bounded-retry
  guards. **Local-only**: on metered cloud each injected continue bills as a premium turn (#8700),
  so cloud relies on the persistence rule instead.
- **O0.3 PERSISTENCE.md** — new shared protocol: never end a turn after *announcing* an action;
  perform it or print `BLOCKED:`. The prompt-side fix for the #1 pause (~+20% SWE-bench). Referenced
  from `MODEL_ADAPTER` (small-tier MANDATORY) + `BOUNDED_TASK_CONTRACT` (pairs with stop-means-stop)
  and wired into 14 executor agents. New `validate-persistence-block.sh` (validators →57) fails any
  executor/coding agent missing the rule; wired into the git-expert merge gate.

99 tests + all validators green. O1 (autonomy levels) / O2 (loop upgrades) / O3 (prove-it) pending.

## [1.27.1] — 2026-07-01

### Added — code-review Tech-Stack Compliance dimension (design adherence, review side)
The code-reviewer's health pass gains a 9th dimension: **Tech-Stack Compliance**. Until now,
"did the code add tech outside the design?" was enforced by coding-agent Law 4 (prevention) and
`validate-tech-stack.sh` (phase gate), but the *review* itself had no dimension for it — a
registry-valid, actually-used library added outside `docs/TECH_STACK.md` would slip past review.
- New METHODOLOGY **Pass 8** (script-backed): run `validate-tech-stack.sh` (every manifest dep must
  be in `TECH_STACK.md`), then flag new runtime tech introduced in code/config not named in the design
  (new DB client, queue, cloud SDK, second HTTP framework, build tool). HIGH if it adds an external
  service/runtime; MEDIUM for a duplicate library; fed to the synthesizer's Challenger gate.
- Coordinator-run (not a new specialist agent — it's deterministic), added to the Health Dashboard
  (row 9) and the pre-completion self-check. Independent third check alongside prevention + the gate.
- Propagated the dimension to the /review-code skill, guide routing, FEATURES, and the SDLC review
  HANDOFF prompts (feature/phase-4/phase-5/onboard health-coordinator). 99 tests + all validators green.

## [1.27.0] — 2026-07-01

### Added — module-contract tickets, /reflow, and checkpoint/resume
Two capabilities so multiple contributors (or their own agents) can work an SDLC project in
parallel, and so a large loop can be cleared and resumed without losing the thread. Design +
dogfood plan: `docs/SDLC_TICKETS_REFLOW_RESUME_PLAN.md`.

**Module-contract tickets (T1/T2/T6).** `plan.json` gains an optional `modules[]` layer above the
task-decomposer node DAG — each module is a *contract* (interface, exclusive `write_scope`,
`acceptance`, `depends_on`, `owner`, `status`) any agent can claim. Disjoint write-scopes are what
make concurrent work collision-free; **interface-first** deps let a module build against a
dependency's contract before that dependency's code exists.
- `scripts/lib/tickets.mjs` — load/save/validate/recomputeStatus/claimable/writeScopeCollisions + CLI.
- `docs/TICKET_SCHEMA.md` — canonical schema; `examples/tickets-plan.sample.json` — validating sample.
- `scripts/gen-tickets-board.mjs` — derive `docs/work/TICKETS.md` (table + mermaid DAG + claimable set).
- `scripts/validators/validate-tickets.sh` — graph integrity + write-scope disjointness (validators →56).

**/reflow (T3).** Recomputes the claimable set (marks done via each ticket's verify gate, resolves
blocked→ready), flags write-scope collisions, and emits a full HANDOFF for a claimed module. Skills →38.

**Checkpoint + /sdlc resume (T4/T5).** `agents/shared/CHECKPOINT_STATE.md` defines a compact
`docs/work/STATE.md` (done / in-flight / next / ordered catch-up list) written after every step, plus a
context-budget nudge. `/sdlc resume` rehydrates from it instead of chat scrollback so you can `/clear`
mid-loop and continue exactly where you left off.

**Wiring (T7) + tests (T9).** Routed via `guide`, `sdlc-lead`, and feature-mode's sub-component
decomposition; all delegation stays HANDOFF-based. Test Pass 4 covers validate/status/cycle/collision.
99 tests green; all validators + doc gates clean.

## [1.26.5] — 2026-07-01

### Added — handoff-discipline validator now catches gate-less concurrent dispatchers
`validate-handoff-discipline.sh` previously only inspected `task(agent=)` shorthand files, so a coordinator that fanned out specialists via the `HANDOFF to:` prose format ("Dispatch Wave", "emit N HANDOFFs simultaneously / in parallel / in one message") could ship with no opencode fallback — exactly how security-auditor regressed. New third check: any agent file with a concurrent-dispatch cue must STATE a no-spawn behavior (has_task_tool branch, manual paste, sequential/inline execution, Delegation Rule, or a named Executor). A bare pointer to EXECUTOR_SELECTION.md is not sufficient. Reference/protocol docs (agents/shared/**, disable:true, PARALLEL_WAVE_PROTOCOL) are exempt. Verified: clean across the repo; a negative test (stripping security-auditor's gate) flags only that file.

## [1.26.4] — 2026-07-01

### Fixed — HANDOFF blocks: complete, clearly stated, easy to pass off (opencode)
Audited every delegation in the opencode target (where a HANDOFF must be a self-contained copy-paste, since there is no reliable spawn) — Ralph Wiggum sweep + adversarial Challenger:
- **`security-auditor` lacked the `has_task_tool` executor gate** its siblings (`code-reviewer`, `performance-engineer`) carry — it said "dispatch Wave 1 in parallel" with no opencode fallback. Added the gate: run specialists inline/sequentially when there is no task tool (the security/code-review/perf specialists have no user-facing `/skill`, so manual paste is not an option for them). The discipline validator missed this because it only checks `task(agent=)` files, not the `HANDOFF to:` format.
- **13 HANDOFF blocks did not tell the user which `/skill` to open** — `health-coordinator` ×8 (bare `SDLC-TASK for <agent>`), three `test-engineer` blocks ("paste this EXACT prompt:" with no `/test-expert`), and two `sdlc-onboard-mode` `════` headers (`/dba`, `/research`). All now name the exact skill to open.
- **`sdlc-onboard-mode`** now states the no-skill-specialist rule: skilless onboard specialists (landscape-mapper, entry-point-tracer, component-mapper, health-coordinator) run inline when there is no task tool, instead of waiting on an impossible paste.
- **`health-coordinator`** gained the `has_task_tool` executor gate its peer coordinators have (dispatch as subagents when available; otherwise paste each `/skill` session or run sequentially).
- **`EXECUTOR_SELECTION.md`** now formally names **Executor D (inline)** — the coordinator reads a skill-less specialist's agent file and runs its methodology in-conversation. This was the de-facto opencode path for security/code-review/performance/onboard micro-agents but was absent from the three-executor table; Rule 1 now explains why a Executor-D dispatch may be terse (methodology lives in the agent file, not the block).
- **`security-auditor`** Phase-1 prose no longer reads spawn-first — it cross-references the executor gate so a model reading the phase in isolation runs inline when there is no task tool.

Verified (Ralph Wiggum + independent adversarial Challenger): all paste-able blocks complete (valid `/skill`, TASK-for-agent, CONTEXT, YOUR TASK, PRODUCE, completion phrase); every SDLC file carries the Delegation Rule; validators + 94 tests green.

## [1.26.3] — 2026-07-01

### Fixed — exhaustive slash-command wiring audit (Ralph Wiggum + Challenger)
A whole-repo sweep (all agents/skills/commands/docs) against the authoritative opencode rule — a skill's slash = its `name:` frontmatter (fallback: directory) — plus an independent adversarial Challenger pass, found four real breaks:
- **`skills/ui-verify` had `name: UI Verifier`** (invalid slug: spaces/caps) → `/ui-verify` did not resolve. Fixed to `name: ui-verify`; this also repaired the `/ui-verify` cross-reference in `skills/end-user-simulator`.
- **`/arch` → `/architect`** (the architect skill's name is `architect`): `sdlc-lead.md` routing table + two review docs.
- **`/git` → `/git-expert`** (the git skill's name is `git-expert`): `guide.md` rows + the new `release` skill.
- **`/challenge` was documented as user-invocable but no skill existed** — added `skills/challenge` wrapping the `challenger` agent. Skills →37.

Confirmed clean: every skill→agent wrap, every `SDLC-TASK for <agent>`, and every HANDOFF template slash resolve; only `git` and `ui-verify` ever had `name != dir` (git-expert is a valid intentional slug). Remaining unresolved `/slash` tokens are built-ins (`/loop`, `/schedule`, `/clear`), prose placeholders, and REST-endpoint examples.

## [1.26.2] — 2026-07-01

### Fixed — every expert now has a working invocation path (opencode)
A reachability audit of the full agent graph from `sdlc-lead`/`guide` found three primary experts that `guide.md` routed with "dispatch \`X\`" — not a real action in opencode (no spawn), so they had no working entry point:
- **`llm-integration-engineer`** was a true orphan (only the guide mention; no skill, no HANDOFF, no script). Added `skills/llm-integration`.
- **`end-user-simulator`** had no direct entry (game uses `playtest-evaluator`). Added `skills/end-user-simulator`.
- **`release-manager`** had no slash. Added `skills/release`; guide "cut a release" row now points to `/git --release` (mechanics) or `/release` (coordinator).

Updated the four `guide.md` routing rows to real slashes (`task-decomposer` keeps its `scripts/run-plan.mjs` mechanism). Verified: cluster subagents (security/code-review/performance) are dispatched by their coordinators, onboard specialists by `sdlc-onboard-mode`, and the chained agents (`release-manager`→`changelog-writer`) resolve. Skills →36; counts reconciled.

## [1.26.1] — 2026-07-01

### Fixed — broken HANDOFF slash targets (opencode wiring)
A wiring audit found four HANDOFF/skill references pointing at slash commands that do not resolve in opencode (the same failure class as an SDLC handoff naming a non-existent target):
- **`/arch` → `/architect`** in `HANDOFF_TEMPLATES.md` (the skill is named `architect`).
- **`/migration-planner`** and **`/documentation-gap-finder`** were HANDOFF targets with no wrapper skill — the agents existed but no slash opened them. Added `skills/migration-planner` and `skills/documentation-gap-finder` (thin wrappers, matching the one-skill-per-expert pattern); skills →33.
- **`/frontend`** skill never loaded its `frontend-design` agent (every sibling skill does) — added the load line.

Full sweep confirmed all `read()`/`write()` file paths, `task(agent=)` targets, and skill→agent links resolve, with no orphan agents. Counts reconciled (README/FEATURES →33 skills).

## [1.26.0] — 2026-06-24

### Added — catalog completeness validator (the doc-maintenance loop, closed)
The count gate (1.25.0) checks doc *numbers*; this checks the catalog *body*. \`validate-doc-catalog.sh\` (new) verifies FEATURES.md lists every validator + shared protocol that actually ships — it immediately found **15 validators undocumented** (40/55), now backfilled from their own header descriptions. Only categories with a comprehensive table are checked (references appear incidentally in prose, not a catalog, so they are skipped — no false positives). Wired into the git-expert merge gate; validator count →55.

## [1.25.0] — 2026-06-24

### Added — doc-freshness becomes a deterministic gate (not just agent prose)
A self-audit ("does our scaffolding prevent docs from going stale?") found it didn't, deterministically: release-manager's step-5 doc-count audit was agent-only, so this session's *manual* releases bypassed it and "48 validators" silently drifted to a real 54; and the canonical→generated tag/release sync was guarded nowhere (attest-claude v1.23.0 went un-tagged).
- **`scripts/validators/validate-doc-counts.sh` (new):** re-derives every "N validators / N skills / N references" claim in README/docs from the filesystem and fails on a mismatch — making release-manager step 5 enforceable. Scoped to **clean directory counts only**; curated catalog counts (shared protocols, agents, custom tools — which mix dirs and exclude items editorially) stay the agent's manual job, by design, to avoid false positives. Wired into the `git-expert` merge gate when README/docs or an agent/skill/validator/reference changes.
- **`build:claude` dual-repo reminder:** when the build changes generated files, it now prints a reminder to tag + release the generated repo too (the step that was silently skipped for v1.23.0).
- **Doc reconciliation:** FEATURES was stale — `Skills (26)→(31)`, `Shared protocols (17)→(24)` with the 6 undocumented protocols backfilled (incl. this session's `CHECKPOINT_REVERT`/`MICRO_LOOP`/`LOCAL_LLM_PRIMER`); validator count corrected to 54 across README/USERGUIDE/FEATURES.

## [1.24.0] — 2026-06-23

### Added — HANDOFF-discipline validator (delegation must not naively spawn)
Audited every delegation point: all 9 `task()`-using agents correctly treat `task()` as shorthand for a HANDOFF block, gated by `has_task_tool` with a manual-paste fallback (Executor C) — so an agent never tries to spawn a child a runtime like opencode can't. The discipline was a convention; now it's enforced.
- **`scripts/validators/validate-handoff-discipline.sh` (new):** fails any agent that uses `task()` shorthand without both a HANDOFF translation and a no-spawn fallback, and flags raw `Agent(...)`/`subagent_type` spawns that bypass the contract. Clean on the repo (9 files, 0 gaps); proven to catch a planted violation.
- **Merge gate:** `git-expert` condition 5 now runs it when a branch changes any `agents/**.md`.
- **Wording:** clarified `sdlc-improve-mode.md`'s "Spawn a Mode 3 sub-workflow" → "route to a `/sdlc feature` workflow (HANDOFF-driven), not a programmatic spawn."

## [1.23.0] — 2026-06-23

### Scaffold levers B5 / B7 / B8 (from the bridging-the-frontier-gap backlog)
Additive, evidence-cited externalized scaffolds that carry weak/local models closer to frontier on bounded tasks. LOCATE-mapped first to extend, not reinvent.
- **B5 — planner/executor tier split:** `MODEL_ADAPTER.md` gains a **PLANNER** role + Rule 5 ("plan strong, execute cheap; cap granularity — small models over-decompose"); `task-decomposer.md` gains an over-decomposition cap that routes re-planning up to the strong tier instead of recursing the cheap tier.
- **B7 — checkpoint/revert to known-good:** new `agents/shared/CHECKPOINT_REVERT.md` (git checkpoint per gated PASS; revert-to-last-known-good on unrecoverable failure instead of unwinding error context) + `BOUNDED_TASK_CONTRACT.md` Rule 10 + `git-workflow-checklist.md` `--checkpoint` rows. Canonical protocol lives here; Foreman implements the mechanics.
- **B8 — local-model runtime playbook:** new `references/local-agentic-models.md` (model picks per tier + the runtime gotchas that silently break tool-calls — llama.cpp `--jinja`, Qwen3-Coder XML, PR #16932, strip `<think>`, vLLM>llama.cpp>Ollama), wired into `MODEL_ADAPTER.md` (small tier), `task-decomposer.md`, and `LOCAL_LLM_PRIMER.md`.
- All under the file-size cap; 88 tests pass; claude target regenerated (231 files). Backlog B5/B7/B8 marked shipped in book ch.02.

## [1.22.0] — 2026-06-23

### Eval agent isolation (critical) + outcome-based fixture
- **Isolation fix (critical):** `opencode run` is now passed `--dir <workcopy>`. opencode resolves its project root to the **launch directory (this repo)**, not the runner's `cwd` — so agents were reading/editing the **main repo, not the fixture copies**. It surfaced when a bare agent fixed the canonical `lemonade-cashbox` fixture in place. With `--dir` the agent only sees the sandbox (verified). **All agent-eval numbers produced before this fix are invalid** (corrected in book ch.06).
- **Stronger sandbox guard:** the runner now aborts if the repo HEAD moves **or any tracked file changes** during a run (the in-place edit vector the HEAD-only guard missed). `.opencode-loops/` gitignored.
- **`verify_cmd` (outcome-based scoring):** an agent_check may run a verifier in the work dir after the agent and PASS iff it exits 0 — scoring whether the agent actually made the criterion true, not whether it claimed to.
- **`lemonade-cashbox` fixture:** six money-helper bugs whose `node:test` suite must be made green (multi-step, fix-the-code). Verified well-formed (shipped 6/6 fail, correct fix 6/6 pass).
- **First trustworthy result** (book ch.06): isolated triad on lemonade-cashbox — frontier / local-scaffolded / local-bare all PASS in ~60s → lift & gap both **0%**. The ceiling effect is real, not an artifact: even bare local-30B one-shot-fixes oracle-guided bounded tasks. Discriminating the scaffold/frontier gap needs tasks beyond bare-local's one-shot reach.

## [1.21.1] — 2026-06-23

### Fixed — eval-run sandbox guard
The `--bare` eval cell runs opencode's default agent, which autonomously git-committed its output into this repo during a background run (rewriting `docs/onboard/entry-points.md` + `docs/reviews/SECURITY_FINDINGS.md`). Restored both docs and hardened the harness:
- The work copy is now `git init`'d so an agent that commits lands in the throwaway sandbox, not the canonical repo.
- After each fixture the harness checks this repo's HEAD; if it moved during the run it aborts (exit 2) with the SHA range + reset hint. An eval can never again silently contaminate the repo or reach a release. Deterministic mode unaffected.

## [1.21.0] — 2026-06-23

### Eval `--bare` cell + the ceiling-effect finding
- **`--bare` cell (`run-evals.mjs`):** runs the same agent_checks with the same model + prompt but drops the specialist `--agent` scaffold (model under opencode's default agent). Pairing a bare cell with a scaffolded cell of the same model populates `lift = scaffolded − bare` in `eval-compare` — the no-scaffold baseline.
- **First lift measurement recorded** (book ch.06): frontier / local-scaffolded / local-bare all scored 100% → `lift` and `gap` both **0%** — a **ceiling effect**, not proof the scaffold is worthless. The fixtures verify "pipeline finds planted defects", so even bare local-30B passes (no headroom), and bare *leaked* the scaffold (opencode's default agent delegated to specialist sub-agents on its own). The one signal that moved was **cost**: bare local 1964s vs scaffolded 1021s — the scaffold bought ≈48% efficiency at equal correctness.
- **Conclusion:** the harness is now methodologically sound; the bottleneck moved to the **fixtures** (too easy to discriminate capability). Next: harder fixtures where bare-local fails, plus a truly-isolated bare (`opencode --pure`). N× repeats still pending.

## [1.20.0] — 2026-06-23

### Eval harness rigor — the comparison is now a measurement
Turned the frontier-vs-local eval from an anecdote into a measurement, after a first real run produced a misleading −12% gap (frontier appearing *worse* than local) that was purely an artifact of a coordinator agent timing out and being scored as a failure.

- **Outcome classes (`run-evals.mjs`):** records `PASS/FAIL/TIMEOUT/ERROR/SKIP`. A `TIMEOUT` is a budget signal ("didn't finish"), no longer logged as `FAIL` ("got it wrong"), and doesn't fail the run.
- **Agent-only gap (`eval-compare.mjs`):** results are tagged `kind: agent|deterministic`. The gap is computed over **decided agent checks only**; deterministic semgrep/validator checks become a **fixture-health gate**; `TIMEOUT`/`ERROR` show as `⧗` and never fold into the rate; an undecided scope renders `—`, not a false 0%. Self-test rewritten to assert these rules.
- **Per-check budgets:** `agent_checks[].timeout_ms` in the expectation JSON, sized to the agent — coordinator `code-reviewer` 40m, single agents 15m.
- **`eval-status.mjs` fan-out tracker** (carried from 1.19.x work): renders live coordinator→sub-agent fan-out from `telemetry.jsonl` + live `opencode run` procs, so a busy coordinator isn't mistaken for a stalled run. `npm run evals:status`.
- **First measured run recorded** in the research book (`docs/bridging-the-frontier-gap/06`): `gpt-5.5` vs `qwen3-coder-next`, same scaffold — **0% gap across short/medium/long** bounded tasks, at ≈1.4× wall-time / ≈2.3× tokens (free on owned hardware). Honest boundary kept: bounded tasks only; `lift` (bare cell) and N× repeats still pending.

## [1.19.1] — 2026-06-23

### Added — `EVAL_MODEL` per-cell model pinning
- `run-evals.mjs` now honors `EVAL_MODEL=<provider>/<model>`, passing it to
  `opencode run -m` and stamping `summary.model`. Without it the agent runs used
  whatever opencode defaulted to, making per-tier comparison uncontrollable —
  this closes that gap so the tiered lift/gap/cost workflow can actually pin
  frontier vs local. Documented in `evals/README.md`.
- **First real-model run (validation):** `flask-sqli` (short), frontier
  `openai/gpt-5.5` vs local `lmstudio/qwen/qwen3-coder-next` — both 3/3, the
  security-auditor agent caught both planted defects on each, so **gap = 0% on
  this bounded task**, with local ~3.7× the wall-time/tokens (free on owned
  hardware). The book's bounded-task thesis, measured.

## [1.19.0] — 2026-06-23

### Added — tiered eval harness (lift / gap / cost), per ch. 06
Stands up the measurement layer before building B1, so scaffold changes can be judged on data, not vibes.
- **`scripts/eval-compare.mjs` (new):** reads labeled run summaries and produces a per-horizon pass-rate matrix with **lift** = pass-rate(local-scaffolded) − pass-rate(bare) (what the scaffold buys), **gap** = pass-rate(frontier) − pass-rate(local-scaffolded) (what's left to frontier), and **cost** per cell (agent duration + estimated output tokens) — so a scaffold that costs more inference than the gap it closes is visible. Roles (`--frontier`/`--local`/`--bare`) are optional; with none it prints the side-by-side matrix. `--self-test` verifies the lift/gap/cost math on synthetic data (no models needed, CI-able). Writes `docs/work/EVAL_COMPARE.md`.
- **`scripts/run-evals.mjs`:** added `--label <name>` (tags the run → `summary.label`, archived to `docs/work/eval-runs/<label>.json`), propagated the new `horizon` field into every result row, and added a `costEst` summary (accumulated agent duration + estimated output tokens).
- **`evals/expectations/*.json`:** each fixture now carries a `horizon` — `flask-sqli`=short, `ts-dead-dup`=medium, `node-onboard`=long — because the frontier gap widens with task length and must be read per-horizon.
- **`evals/README.md`:** documents the per-cell tiered-comparison workflow; **npm:** `evals:compare`, `evals:compare:selftest`.
- Eval-harness scripts are canonical-only (not shipped to `attest-claude`); drift gate stays green at 229 generated files.

## [1.18.0] — 2026-06-23

### Added — bridging-the-frontier-gap: experts fixes + research book expansion
Implements the cheap, high-value backlog items from the research book (all evidence-cited; carry weak/local models closer to frontier on bounded tasks):
- **B3 — tool-offloaded verification (`MICRO_LOOP.md`):** now a hard rule — if a tool/test/validator can decide the criterion, the model MUST NOT judge it (a weak model's self-judgment is its weakest link; a 1B+tools can beat an 8B).
- **B4 — goal-state re-grounding (`MICRO_LOOP.md`):** RE-GROUND on every revision — restate goal vs current-state gap before retrying (ReflAct: +31 pts on an 8B; counters the ~20–25× higher drift of small models).
- **B6 — reason-in-NL-then-format (`MODEL_ADAPTER.md` small tier):** reason in natural language, emit structured output only at the final boundary (the −27pt "format tax").
- **B2 — prune error turns (`MODEL_ADAPTER.md` small tier):** drop a model's own failed turns from context before retrying (self-conditioning isn't fixed by scale).

### Docs / research
- **Research book expanded to 6 chapters** — added **05 (memory architecture)** and **06 (economics, evaluation & distillation)**. **B1 CORRECTED after reading `bpm-memory-mcp`:** the system is mature (graph `entities`/`relations` + Zettelkasten links + hybrid vector/BM25/graph-walk retrieval + supersession + typed taxonomy already exist and are tested) — so B1 is **activate the dormant bi-temporal model + add sleep-time consolidation + auto-resolve contradictions**, NOT "build a graph." (Rule 9 caught the stale assumption.) Ch. 06 adds the scaffold-economics decision, an evaluation plan tied to `run-evals.mjs`, and distillation as the complementary lever. Identities confirmed: Mythos = Anthropic class above Opus (Fable 5 = first GA); ZLM = GLM (Z.ai).

## [1.17.0] — 2026-06-23

### Added — anti-drift gates auto-wired into the merge gate
- `validate-no-reinvent.sh` and `validate-tracker-fresh.sh` gained a **`--base <ref>` merge-gate mode** (compare the branch against its base, not just the working tree).
- **git-expert merge gate condition 5:** before any merge to `main` (or a parent feature branch), both must exit 0 — no hand-edited generated outputs / unjustified canonical rewrites (G-B), and the branch updated a tracker so work isn't lost (G-D). The anti-drift guards now run automatically at the merge point, not just on demand.

## [1.16.0] — 2026-06-23

### Added — anti-drift Wave 4: G-E verify-or-block + G-F versioning-as-gate (set complete)
- **G-E verify-or-block** (`coding-agent.md` Law 2 / Phase 2): if a library API can't be verified via Context7 / `node_modules` / existing usages, mark the call **BLOCKED** and hand back — never write an unverified external API from training data. The default protects non-frontier / local models (where hallucinated/outdated APIs are the #1 failure).
- **G-F versioning-as-gate** (`validate-release-readiness.sh` conditions 11–12): the version (package.json or newest CHANGELOG heading) must have a matching `## [ver]` CHANGELOG entry (hard) and a `v<ver>` tag (warn), with reconcile-remotes-by-ff-merge guidance. Targets release-state drift (taxonomy vector 9).
- **Anti-drift set complete:** G-A (book-style sizing), G-B (no-reinvent), G-D (tracking-as-gate), G-E, G-F + the 9-vector drift taxonomy. See `docs/CODE_MICRO_LOOP_AND_ANTI_DRIFT.md`.

## [1.15.0] — 2026-06-22

### Added — anti-drift Wave 3: G-D tracking-as-gate ("things get lost between steps")
- **`scripts/validators/validate-tracker-fresh.sh`** — git-based gate: if work files changed but no tracker did (SDLC_TRACKER / PROGRESS / DELEGATION_LOG / CHANGELOG / `*_TRACKER` / LESSONS), it FAILS. Unfakeable, unlike a manifest line. Tested three ways.
- **`MICRO_LOOP.md` TRACK step (4b)** — a step is not done until its work is recorded.
- **Mandatory manifest `Tracker updated:` line** — `validate-completion-manifest.sh` now hard-requires it; the manifest template + `exemplars/completion-manifest.md` updated to follow it (the exemplar would otherwise have failed its own new rule — caught via a fixture sweep).
- Rule 9 (LOCATE) applied during the build: verified against source that `validate-inventory.sh` is coverage-only (does NOT check freshness) — so this is net-new, not a reinvention.

## [1.14.0] — 2026-06-22

### Added — anti-drift hardening (carry non-frontier / local models)
- **`docs/CODE_MICRO_LOOP_AND_ANTI_DRIFT.md`** — the drift taxonomy (9 vectors incl. release-state drift), the current-coverage map (~80% already exists — anti-reinvention grounding), the hardened code micro-loop, and a vector→gate→model-tier table. Thesis: the process externalizes, as checkable micro-steps, the corrections a frontier model does silently — so a weak model converges instead of drifting.
- **G-A book-style code sizing:** `validate-file-size.sh` (configurable cap 400 / warn 300, language-aware, excludes generated/test/migration + `.filesizeignore`) + `agents/shared/CODE_BOOK_PROTOCOL.md` (a file over cap becomes a directory: index/barrel + chapter modules, one concern each) + a **PLAN-SHAPE** step in `MICRO_LOOP.md` (decompose up front, never refactor a monolith later) + coding-agent checklist. **Consolidation:** the old hardcoded `validate-code-health` H-02 (blocking at 250) is folded into the single configurable gate at 400; fixed a greedy `*migrations/*` glob.
- **G-B no-reinvent / canonical-overwrite guard:** `validate-no-reinvent.sh` (HARD-FAIL edits to `GENERATED_FILES.txt` paths; WARN on wholesale rewrites) + `BOUNDED_TASK_CONTRACT.md` Rule 9 (LOCATE before create — confirm an audit's "missing/wrong" claim with `ls`/`diff` before acting). Targets the Mode-4 class directly.

### Process
- Both fixes were driven by the **independent Challenger** (G1): it caught that file-size was already gated (H-02) and that the threshold was being silently loosened — preventing a redundant/conflicting gate. Lesson recorded via loop-learn (G3). Released with both remotes reconciled to the same SHA (no squash divergence — release-state drift).

## [1.13.0] — 2026-06-22

### Added — loop engineering: micro-agents with macro + micro loops
- **`docs/LOOP_ENGINEERING_PLAYBOOK.md`** — synthesizes the loop-engineering canon (Addy Osmani, Sabrina Ramonov) + Boris Cherny/Cat Wu's Claude Code design against our HANDOFF + Ralph-Wiggum machinery, with a capability matrix (opencode vs Claude Code), an honest gap analysis, and the Foreman reconciliation. Primary sources fetched and adversarially verified (an independent Challenger caught two over-reports, both fixed before merge).
- **`agents/shared/MICRO_LOOP.md`** + a load-bearing micro-loop instruction injected into all **27 micro-agents** (security ×9, code-review ×8, performance ×6, onboard ×4): each specialist now runs a bounded `criterion → produce → self-verify → revise (≤2) → return` loop before its completion phrase, inside the macro coverage/fix loops. Same five guarantees at both levels.
- **G1 independent verifier (Cherny: makers over-report):** `detect-model-context.sh` now emits `maker_model` / `verifier_model` / `verifier_independent` (anthropic→haiku, google→flash-lite, openai→4o-mini, local→classification tier; `VERIFIER_MODEL` override). `MODEL_ADAPTER.md` § Maker/Verifier split; referenced by GATE_SCORING Step 3 + FIX_VERIFY Step 4.
- **G2 no-progress kill:** `run-coverage-loop.sh` gap-checksum stall detection → **exit 3** when the gap set is byte-identical to the prior iteration (halts instead of burning the cap).
- **G3 auto-correction:** new `scripts/loop-learn.mjs` records `{symptom, cause, rule}` to `docs/work/LESSONS.md` (+ optional CLAUDE.md) and emits a `memory_store` payload; wired into Ralph-Wiggum + Fix-Verify escalation blocks.
- **G7 refuse-to-loop, now script-enforced:** new `scripts/validators/validate-loop-readiness.sh` fails any inventory row whose Artifact names no checkable success criterion ("improve the UX"), passing validator/test/measurable-target rows. Wired into the Ralph-Wiggum refuse-to-loop gate.

### Notes
- `EXECUTOR_SELECTION.md` records opencode #20059 (custom subagents) CLOSED; #16491 (MCP in subagents) remains the live blocker for native dispatch.
- Counts: 39 primary agents, 31 skills, **53 validators** (+ loop-readiness), 7 exemplars. 88 tests pass; `build:claude` in sync.

## [1.12.0] — 2026-06-11

### Added — backlog waves 3+4: IMPROVEMENT BACKLOG AT ZERO (28/28 closed) + evolution plan complete
- **5 new specialist experts** (each: primary agent + skill + reference, shared blocks byte-identical to the canonical template):
  - `cost-engineer` (`/cost`) — cloud + LLM spend: audit/right-size/unit-economics; every recommendation in $/month; commitments only after 3-month baselines. + `references/cloud-cost-checklist.md`.
  - `analytics-architect` (`/analytics`) — RED/USE/golden-signals telemetry design, event taxonomy, dashboards from SLOs; output contract keyed to validate-observability.sh. + `references/observability-checklist.md`.
  - `a11y-compliance` (`/a11y`) — WCAG 2.2 AA/AAA audits (incl. 2.2's new criteria), EAA/508 applicability, criterion+file:line on every finding. + `references/wcag-audit-checklist.md` + `validate-wcag-coverage.sh` (UI-bearing phase-4 gate).
  - `data-steward` (`/data-governance`) — full-schema PII classification, GDPR/CCPA/PIPEDA, retention with triggers (never "indefinite"), erasure as designed features. + `references/data-classification-checklist.md` + `validate-data-governance.sh` (phase-3 gate).
  - `reliability-engineer` (`/reliability`) — NFR-derived load tests (to breaking point, not target), per-dependency failure behavior, retry budgets, runnable chaos scenarios. + `references/load-test-checklist.md` + `validate-resilience-patterns.sh` (phase-3 gate).
- **`/steward distill` (evolution plan 4.9)** — the per-release distillation loop: telemetry-report + eval results + verifier verdicts → classified failures (format→exemplar, judgment→rubric, budget→tier tables, recurring feedback→prompt) → evidence-cited edits, ≤5 per release, evals re-run as the regression gate. Release-manager step 9 reminds. The evolution plan is now FULLY executed.
- **frontend-design deepened (A2):** design-system governance (breaking-change policy, ownership, migration paths), component-library patterns (composition>configuration, variant utilities, story-per-component), token generation/sync (one-direction rule), architecture choice via the trade-offs decision matrix.
- **researcher Fact Bank wiring (A3):** fact_store per claim with source-type credibility ladder (0.9 official docs → 0.4 forum), staleAfterDays on perishables, fact_query-before-search, contradiction handling (store both, surface, never silently pick).
- Routing wired everywhere: guide table (5 new rows), improve-mode on-demand specialist roster, AGENT_REFERENCE.md. Counts: 39 primary + 31 cluster agents, 31 skills, 48 validators.

## [1.11.0] — 2026-06-11

### Added — backlog wave 2 (C1 + C2 closed; backlog now 7 open of 28)
- **`validate-api-consistency.sh` (C2, HIGH):** openapi.yaml paths×methods vs routes detected in source (Express/Fastify/Koa, Flask/FastAPI, Go net-http/chi/gin, NestJS) with path-param normalization ({id}==:id==<id>). Spec-only endpoints and undocumented routes are hard gaps; dynamically-composed routes get a manual-review warning instead of silent omission; response-schema conformance explicitly deferred to contract tests. Wired into phase-4 + phase-5 gates. Found-by-test: macOS bash 3.2 cannot parse backticks inside $(heredoc) — use \x60 in embedded regexes.
- **Phantom-UC check (C1)** in `validate-tests-mapping.sh`: tests referencing UC-IDs that do not exist in USE_CASES.md are now a hard gap (stale/hallucinated traceability); forward coverage and orphan-test warnings already existed.

## [1.10.0] — 2026-06-11

### Added — backlog wave 1 (16 items closed; backlog now 9 open of 28)
- **3 new Phase-3 validators**, wired into the phase-3 gate: `validate-circular-deps.sh` (DFS cycles on the MODULE_DESIGN allowed-import table), `validate-module-boundaries-transitive.sh` (hard gaps for undeclared/contradictory rows; transitive-cone WARN report — plain layering is not failed), `validate-observability.sh` (logging/metrics-methodology/tracing/alerting-conditions/dashboards content, not just section presence). All tested both directions against planted defects.
- **Failure & recovery (D2+D4):** BOUNDED_TASK_CONTRACT Rule 8 — 3-failures-escalate cap (aligned with Ralph Wiggum and run-plan G5), phase files preserved even on failure, `[PARTIAL]` completion phrase, RESUME packet semantics — plus `scripts/recover-phase-state.sh` (`--list`, git-commits phase state, prints the resume packet).
- **4 reference guides:** `sre-cloud-patterns.md` (AWS/GCP/Azure/on-prem equivalence + invariant patterns), `design-system-tradeoffs.md` (3 architectures + decision matrix), `phase-completion-checklist.md` (automated gate + human-judgment items per phase), `validator-performance.md` (runtime classes, rerun-safety).
- **F1/F2 closed:** the 2 standalone validators (mermaid, book-structure) now emit telemetry rows; all 45 validators share exit-code semantics and JSON output.

### Changed
- IMPROVEMENT_BACKLOG.md: 16 items marked DONE/CLOSED with evidence (A4, A5, D1, D3, E3, G3 were already satisfied by v1.0–v1.9 work). Open: A1–A3, B1–B4, C1, C2.

## [1.9.0] — 2026-06-11

### Added — telemetry (plan 4.12: tune budgets with data, not guesses)
- **Plugin `event` hook** in `plugins/expert-hooks.ts`: every completed assistant message appends one JSONL row of REAL actuals — agent, model, tokens in/out/reasoning, cache read/write, cost, duration, finish/error — to the project's `docs/work/telemetry.jsonl`. Counts and identifiers only, never message content. Deduped per message; `EXPERTS_TELEMETRY=0` disables. Live-verified end-to-end (first row immediately surfaced that a trivial run costs ~25k input tokens of agent-corpus overhead).
- **Script instrumentation:** `run-plan.mjs` logs per-node status/attempts/duration/output-size (estimates marked `_est`); `run-evals.mjs` logs per-agent-check pass/fail/timeout + duration; `_lib.sh` `validator_exit` logs one verdict row per validator run (covers 42 of 45 validators), written to the audited project's `docs/work/`. All writes are fail-silent — telemetry can never break a gate or a run.
- **`scripts/telemetry-report.mjs`** (`npm run telemetry:report`, `--json`, `--days N`): per-agent×model token/cost/duration distributions (p50/p95), run-plan retry and escalation rates, eval pass rates, validator gap rates — the observed numbers that replace hand-waved tier tables, `max_tokens_est`, and escalation thresholds. Ships to attest-claude via the build.
- `docs/work/telemetry.jsonl` gitignored (per-machine, append-only).

## [1.8.0] — 2026-06-11

### Added — eval suite (plan 4.11: golden tasks for the system itself)
- `evals/fixtures/` — 3 tiny fixture repos with planted defects and known architecture: `flask-sqli` (SQLi via f-string + hardcoded private key), `ts-dead-dup` (copy-paste duplicate pair + dead module with stub + N+1 loop), `node-onboard` (3 known entry points). Off-domain themes (parcel lockers, seedling nursery, birdhouse registry) per the G7 anti-leak rule.
- `evals/expectations/*.json` — expected-finding assertions per fixture: deterministic checks (semgrep, jscpd, validate-dead-code.sh — regex over output, min counts, `{REPO}` expansion, missing tool → SKIP) and agent checks (`opencode run --agent <agent>`, assertions over produced artifacts + final text).
- `scripts/run-evals.mjs` (`npm run evals` / `npm run evals:agent`) — runs fixtures from temp copies, stamps results with the model tier from `.model-context`, writes `docs/work/EVAL_RESULTS.json` (gitignored), exits nonzero on any failure. Deterministic mode verified green (5 pass) AND verified able to fail (impossible threshold → exit 1); agent mode live-verified on opencode.
- Release checklist step 2b in `release-manager`: deterministic evals gate the tag when `evals/` exists; agent-mode per tier is recommended, not gating.
- A protocol edit's effect on output quality is now measurable per release, per tier — including "is model X good enough for phase N?" with data instead of opinion.

## [1.7.0] — 2026-06-11

### Added — exemplar library (plan 4.3 + G7/G8)
- `exemplars/` — one gold-standard instance per artifact type: ERD + table specs, sequence diagram with error path, security finding (preconditions/yields), completion manifest, ADR, gap report. All authored in a deliberately off-domain example (community tool-lending library) so small models copy structure, not content (G7 cross-domain rule).
- HANDOFF Context Packet template gains an `Exemplar` pointer line and a `Memory slice` section; explicit packet layout budget for tier=small: task ≤400 words + memory slice ≤200 tokens + exemplar by pointer + ≤3 files = ≤1,200 tokens injected (G8).
- `install.sh` installs `exemplars/`; the claude build step ships it to attest-claude.

### Changed — memory protocol rewrite (plan 5.2 M1–M5)
- `MEMORY_PRIMER.md` rewritten around substitution rate vs injection noise. 3-call workflow → 4-call: session start is now `memory_context_assemble({task, files, tokenBudget})` with tier-scaled budgets (600 small / 1500 medium / 3000 large) instead of recency-based `session_restore()` (kept as fallback); `checkpoint_task` is the canonical long-task state carrier with STATE.md as no-MCP fallback.
- M2 pointer-facts: never store what lives in `docs/` — store pointer + one-line conclusion; mandatory post-onboard pass stores one pointer-fact per artifact + the 5–10 hottest facts. Clarified `fact_store`/`fact_query` are the research Fact Bank (require source URL); codebase facts use `memory_store(type:"fact")`.
- M3 error memory: store every confirmed root cause AND failed approaches, with citation; recall-first when ranking candidate root causes.
- M4 recall-once: the orchestrator assembles memory once per phase and distributes ≤200-token slices via HANDOFF packets; specialists inside a HANDOFF do not re-assemble (≤1 targeted lookup). Wired into `sdlc-lead` Step 2b and SESSION_PRIMER Rule 7.
- M5: `memory_consolidate` on the steward cadence + promotion rule (facts recalled every session graduate into prompts/CLAUDE.md).

### Fixed
- **G1 — tier detection probes the loaded context, not the model max.** `detect-model-context.sh` now queries LM Studio `/api/v0/models` and uses `loaded_context_length` (a model loaded at 8k on a 262k-max checkpoint correctly tiers small, verified live); name-pattern heuristics remain only as fallback for older servers. `.model-context` gains `context_source=probe|heuristic`.
- Reverse path leakage: SESSION_PRIMER Rule 7 pointed at `~/.claude/...` in the opencode source; now uses the opencode path (build step rewrites it per target).

## [1.6.1] — 2026-06-10

### Fixed
- `doctor.sh` no longer reports a false `BROKEN` when `opencode agent list` returns a partial result (it boots the runtime and intermittently lists 71–76 of 76 agents). Agent **file presence** is now the authoritative pass/fail; the runtime enumeration is advisory only. Also fixed a loose `grep guide` that gave a false PASS. The install was never actually broken — this was a doctor false-negative.

## [1.6.0] — 2026-06-10

### Added — Mermaid hardening (prevent + fix generation parse errors)
- **6 new static checks** in `validate-mermaid.sh` (M007–M012): unquoted parentheses in node labels, reserved word `end` as a node id, smart-quote/em-dash/non-breaking-space, Markdown inside labels, `//` comments, unbalanced brackets — the highest-frequency LLM-generation failures.
- **Authoritative render gate:** when `@mermaid-js/mermaid-cli` (`mmdc`) is installed, the validator renders every block headlessly and surfaces *real* parser errors (`MRENDER`) — catching everything the static patterns can't (proven: `B --> C --` passes static checks, fails the render gate). Opt out with `MERMAID_NO_RENDER=1`; auto-skips when mmdc absent.
- **`scripts/mermaid-fix.mjs`** — mechanical autofixer: smart quotes→ASCII, em/en-dash→hyphen, Unicode arrows→`-->`, `//`→`%%`, `<br>`→`<br/>`, and quotes any `[label]` containing `()`/`:`/Markdown (stripping `**`/backticks). `--write` to apply, dry-run by default. Operates only inside ```mermaid blocks.
- **`references/mermaid-safe-syntax.md`** — the 7 authoring rules agents follow when generating diagrams; wired into the document-hygiene rule (sdlc-lead) and the book-deliverable validation step (BOOK_PROTOCOL now runs mermaid-fix before the gate).
- `mmdc` added to `check-tools.sh` (detect + `--install`).

## [1.5.0] — 2026-06-10

### Added
- **`scripts/fix-verify.mjs` — deterministic re-verify gate for fix loops.** Turns the "is this finding actually closed?" step from model judgment into a script that can't be faked. `snapshot <source>` records a baseline; after fixes, `verify <source>` re-runs the scan and diffs by fingerprint (rule + file + matched code — survives line-number drift), printing CLOSED / STILL-OPEN / NEW and exiting non-zero if any in-scope finding remains or the fix introduced a regression. Works for any scriptable source: `semgrep` (SAST) and any `validate-*.sh` validator (dead-code, deps, ...). Severity floor for semgrep (`--floor ERROR`).
- FIX_VERIFY_LOOP and `/security --fix` now use it: scriptable findings (SAST, dead-code, CVEs) get the deterministic gate — a row is CLOSED only when fix-verify proves it — while judgment findings (manual OWASP, UX) keep the model gate. Each backlog row declares its `Verify-by` (`fix-verify:<source>` or `manual`). This is the script half of guide → decompose → run-plan → fix that makes heavy fix work reliable on small local models.

### Note
- Bug caught while building: Node's `process.exit()` truncates buffered stdout on a pipe — switched to `process.exitCode` so verdict lines aren't dropped.

## [1.4.0] — 2026-06-10

### Added
- **`guide` — expert-system concierge / front door.** A top-level orchestrator: describe any goal in plain English and it routes to the right expert, explains the route, checks prerequisites, drives the workflow, and always offers the next step (especially "want me to fix what I found?"). Full intent→expert routing table covering every skill; a dedicated guided **security scan→triage→fix** flow; multi-step sequencing for goals like "harden before launch". `/guide`.
- **`/security --fix`** — verified security remediation loop. Audits, builds a fix backlog (CRITICAL+HIGH default), dispatches coding-agent to remediate, then **re-scans to confirm each finding is actually closed** before marking it fixed (FIX_VERIFY_LOOP). Skips findings in dead/unreachable code; flags auth/crypto/input-validation fixes for human review instead of silently applying. Combine with `--deep`.
- **`scripts/check-tools.sh`** — detects the external analysis tools each specialist uses (semgrep, knip, ts-prune, jscpd, vulture, radon, lizard, staticcheck, trufflehog), reports present/missing with install hints, and `--install` adds the npm/pipx ones (never sudo, never a package manager). Wired into `install.sh` (runs at end; `./install.sh --tools` auto-installs) and `doctor.sh` (presence check). Every agent falls back to grep when a tool is absent — these upgrade heuristic to deterministic.

## [1.3.0] — 2026-06-10

### Added
- **Dead/unutilized code detection** — new code-review dimension (8th). `dead-code-detector` specialist hunts unimplemented stubs, defined-but-never-called functions, unused exports, orphan files, disconnected pipelines (code wired to nothing), and unreachable branches — the #1 unreported debt class in AI-assisted codebases. Five scans, tool-first (knip/ts-prune/vulture/staticcheck) with grep fallback for any language; every tool hit hand-verified against dynamic dispatch/DI/route tables before becoming a finding. Reports a Utilization Summary ("X% of exports never imported").
- `validate-dead-code.sh` — deterministic gate (stubs, unreachable-after-return, constant-false guards, tool-based unused detection); wired into phase-4 and phase-5 gates.
- **Security reachability gate** — attack-chainer now cross-checks findings against the dead-code report: a vuln in never-called/orphan/unreachable code drops two severity levels and cannot start an exploit chain (a SQLi in an unwired handler no longer ranks equal to one on a live route). A stub on a *live* path that returns attacker-influenced data stays a real finding.

## [1.2.0] — 2026-06-10

### Added
- **DAG runner** (`scripts/run-plan.mjs`) — executes task-decomposer plans deterministically: topological order, per-node tier-scaled timeouts, pre-flight model-server health checks, checkpoint-continue retries (max 2, then escalate; independent branches keep running), journal-based resume, `plan_invalidating` replan support (`--auto-replan`), `--dry-run`/`--node`/`--parallel`/`--cmd`. Live-verified end-to-end against opencode 1.15.3 (2-node plan: dependency data flow, retry, resume all confirmed). Found+fixed: spawned CLIs must get stdin IGNORED — a piped-but-unclosed stdin makes `opencode run` wait forever.
- **Single-source build step** (`scripts/build-target-claude.mjs`, `npm run build:claude[:check]`) — this repo is now the canonical source for agents/, references/, validators, compact variants, and shared tooling; the attest-claude copies are GENERATED (path rewrites + prose rewrites + per-target overrides in `build/overrides/claude/`). `--check` is a drift gate that replaces the manual dual-repo sync rule. Writes `GENERATED_FILES.txt` manifest to the target.

## [1.1.0] — 2026-06-10

The expert-hardening release: every item from the 2026-06-10 system review (R1–R11) plus distribution hardening. See `docs/ARCHITECTURE_EVOLUTION_PLAN.md` and `docs/EXPERT_SYSTEM_REVIEW_2026-06-10.md`.

### Added
- **8 new experts:** task-decomposer (plan.json DAGs for small-model execution), end-user-simulator (blind persona UAT), llm-integration-engineer, release-manager, and the `agents/game/` cluster (game-designer, gameplay-engineer, game-balance-designer, playtest-evaluator) with a `--game` SDLC flavor (SRS→GDD, vertical-slice gate).
- **Capability-probed delegation (R8):** `detect-model-context.sh` writes `has_task_tool`/`mcp_in_subagents` flags; `agents/shared/EXECUTOR_SELECTION.md` defines the Task-tool / subprocess / manual-paste executor ladder. All "task() does not work" prose is now flag-conditional.
- **Findings schemas (R4):** `code-review/FINDINGS_SCHEMA.md` (module-key compounding) and `performance/FINDINGS_SCHEMA.md` (hot-path multiplication, measured-over-estimated) mirroring the security cluster.
- **Scoped coverage loops (R5):** `/sdlc feature` and `/sdlc improve` get 2-iteration Ralph Wiggum mini-loops (`validate-feature-coverage.sh`, `validate-improve-coverage.sh`).
- **Onboard Challenger gate (R6):** LANDSCAPE.md + HEALTH_ASSESSMENT.md challenged before final documentation.
- **Input Contracts (R3):** every micro-agent declares expected HANDOFF fields + a BLOCKED rule for missing inputs.
- **Single-source boilerplate (R1):** `agents/shared/blocks/` + `scripts/build-agents.mjs` (`npm run agents:check|fix|compact`); compact tier=small agent variants generated to `dist/compact-agents/`, installable via `./install.sh --compact`.
- **`scripts/doctor.sh`** — post-install self-check (structure, runtime deps, config, model backend, detection, agent discovery).
- **Stack fallbacks (R11)** in test-engineer (no Playwright / no framework), db-architect (document/multi-store), frontend-design (no component library / tokens).

### Fixed
- **`opencode run` permission failure:** install.sh now merges an `external_directory` allow for the install dir into opencode.json — without it, every `agents/shared/*` protocol read auto-rejects in non-interactive runs (verified live against opencode 1.15.3).
- **Agent roster pollution:** 35 reference docs (protocols, schemas, methodologies, templates, blocks) carried no frontmatter and registered as agents; all now carry `disable: true`. Compact variants moved out of `agents/` (they registered as 23 duplicates).
- **Loop-file archival (R7):** `run-coverage-loop.sh` archives prior-day COVERAGE_LOOP files; iteration counter can no longer read stale files.
- **Prompt contradictions (R2):** task-pattern wording in 7 agents, code-reviewer/performance-engineer mode-selection fork, coding-agent Law 3 vs 4 precedence, ux-engineer mode count.
- **67 stray `name:` lines** removed from 22 micro-agents (bulk-script frontmatter-delimiter collision).
- **entry-point-tracer** was missing its mandatory Completion Manifest.
- README counts corrected (33+30 agents, 25 skills, 40 validators).

## [1.0.4] — 2026-06-04

### Added
- **3 new agents**: `changelog-writer` (git log → Keep-a-Changelog format), `migration-planner` (schema diff → ordered migration steps with rollback), `documentation-gap-finder` (scans exports vs docs, reports undocumented/stale)
- **Context Budget (MANDATORY)** added to 11 primary agents: `architecture-designer`, `api-designer`, `db-architect`, `frontend-design`, `ux-engineer`, `container-ops`, `performance-engineer`, `git-expert`, `sre-engineer`, `test-engineer`, `ui-verifier`
- **Context Budget + Loop Prevention** added to all 4 SDLC mode orchestrators: `sdlc-feature-mode`, `sdlc-improve-mode`, `sdlc-init-mode`, `sdlc-onboard-mode`
- **Pre-Completion Gate** (4-item checklist) added to all 11 primary agents
- **Completion Manifests** added to all 21 micro-agents (8 security, 7 code-review, 6 performance); all manifests include new "Model tier" field for coordinator visibility
- `ANTI_SLOP_RULES`: **R-29 Prose Padding** — flags confidence-hedging openers, repetitive section openers, fake specificity (common local LLM patterns)
- `BOUNDED_TASK_CONTRACT`: Rule 6 "Model tier" field in Completion Manifest template; Rule 7 Minimum Viable Output for short deliverables (exec summary, findings table, confidence score required even when output < 300 lines)

### Changed
- **Anti-Slop references (R-05/07/08/17/18)** added to design agents: `architecture-designer`, `api-designer`, `frontend-design`, `ux-engineer`
- **Error recovery / confidence escalation rules** added to `ux-engineer`, `git-expert`, `sre-engineer`
- **Loop Prevention** added to `architecture-designer` (was the only primary agent missing it)
- `researcher.md`: cross-references canonical `LOOP_PREVENTION.md` from 3-strikes rule

---

## [1.0.3] — 2026-06-02

### Fixed
- `mode: "specialist"` replaced with `mode: "subagent"` in all 27 micro-agent files — OpenCode only accepts `subagent | primary | all`; this caused a startup crash on every OpenCode launch. Affected clusters: `agents/security/` (9), `agents/code-review/` (7), `agents/performance/` (6), `agents/sdlc/onboard/` (4).

---

## [1.0.2] — 2026-06-02

### Added
- `install.sh`: Node version guard runs before anything else. Detects Node < 20 (too old) or Node 25+ (pre-release) and prompts to install NVM + Node 24 LTS. If NVM is not installed, installs it first (`nvm-sh v0.40.1`). Sets `nvm alias default 24` for persistence. Non-interactive (CI/pipe) mode prints the manual fix command and continues.

---

## [1.0.1] — 2026-06-02

### Fixed
- `install.sh`: replaced with correct attest-claude installer (v1.0.0 had accidentally shipped the attest version)
- `README.md`: was showing attest content; corrected to attest-claude

### Changed
- **`claude-memory` renamed → `bpm-memory-mcp`** — LLM-agnostic naming, matches `bpm-*` convention. Repo: `github.com/bpmforge/bpm-memory-mcp`
- `master` branch renamed to `main`
- `install.sh`: interactive y/n prompts when run with no flags — each optional MCP can be accepted or skipped individually. `--yes` / `-y` for non-interactive use.
- `install.sh`: bpm-memory-mcp and bpm-code-search-mcp now auto-clone + build (previously only printed manual instructions)
- `install.sh`: new flags `--no-memory`, `--no-code-search`, `--no-playwright-mcp`

---

## [1.0.0] — 2026-06-01

v1 micro-agent architecture — coordinator/specialist pattern across all major domains, Challenger quality layer, memory and code-search MCPs, playwright-mcp browser testing, full documentation overhaul.

### Added

**Agents (47 total, +31 from v0.24.0)**

*Security micro-agents (`agents/security/`, 9 new):*
- `owasp-web-checker`, `owasp-llm-checker`, `cloud-security-checker`, `iac-security-checker`, `secrets-scanner`, `dependency-auditor`, `semgrep-runner`, `threat-modeler`, `attack-chainer`
- Methodology docs: `OWASP_METHODOLOGY.md`, `OWASP_LLM_METHODOLOGY.md`, `CLOUD_METHODOLOGY.md`, `IaC_METHODOLOGY.md`, `FINDING_SCHEMA.md`

*Code-review micro-agents (`agents/code-review/`, 7 new):*
- `complexity-analyzer`, `duplication-detector`, `error-handling-auditor`, `type-safety-checker`, `pattern-consistency-checker`, `anti-slop-auditor`, `code-health-synthesizer`

*Performance micro-agents (`agents/performance/`, 6 new):*
- `static-perf-analyzer`, `profiler-agent`, `db-query-analyzer`, `bundle-analyzer`, `concurrency-checker`, `perf-synthesizer`

*SDLC onboard specialists (`agents/sdlc/onboard/`, 4 new):*
- `landscape-mapper`, `entry-point-tracer`, `component-mapper`, `health-coordinator`

*New primary agents:*
- **`challenger`** — adversarial quality layer; FATAL/MAJOR/MINOR/NITPICK challenge grades; rebuttal cycle (DEFENDED/CONCEDED/DEFERRED); automatically gates Phase 2→3 and 3→4
- **`ui-verifier`** — live browser verification via `playwright-mcp`; accessibility-tree primary signal (no vision required); 4 modes: `--smoke`, `--use-cases`, `--flow`, `--regression`; produces `UI_VERIFICATION_REPORT.md`

**Skills (25 total, +1)**
- `/ui-verify` — triggers `ui-verifier` for live browser verification

**Shared protocols (`agents/shared/`, 7 new):**
- `CHALLENGER_PROTOCOL.md` — full challenge/rebuttal specification
- `GATE_SCORING_PROTOCOL.md` — HANDOFF resume scoring (1–10, asymmetric threshold ≥7 pass)
- `PHASE_ROUTING_PROTOCOL.md` — routing table, escape hatches, two-track gate system
- `PARALLEL_WAVE_PROTOCOL.md` (`agents/sdlc/`) — 3-round parallel coding protocol (code → review+fix → runtime)
- `MEMORY_PRIMER.md` — 3-call memory workflow (session_restore → memory_store → session_save)
- `BROWSER_TESTING.md` — playwright-mcp tool reference and patterns for agents
- `SESSION_PRIMER.md` updated — Rule 7 added (memory discipline on session start/end)

**MCPs (3 new):**
- **`bpm-code-search-mcp`** — semantic code search + structural symbol index. 6 tools: `code_index`, `code_search`, `code_symbols`, `code_outline`, `code_references`, `code_index_status`. 10 languages. FTS5 BM25 fallback.
- **`bpm-memory-mcp`** — cross-session project memory. `session_restore` on start, `memory_store` on discovery, `session_save` at gate pass. Flat-file fallback to `docs/work/SESSION_NOTES.md`.
- **`playwright-mcp`** (`@playwright/mcp`) — LLM-agnostic browser automation, no vision required, CI-compatible.

**Docs:**
- `docs/MCP_GUIDE.md` — all 6 MCPs with install commands, tool tables, troubleshooting
- `docs/EXPERT_REVIEW_PROCESS.md` — Phase 2b Challenger chapter
- `docs/FEATURES.md` — full v1 catalog (47 agents, 25 skills, 17 shared protocols, 3 new MCPs)
- `docs/USERGUIDE.md` — browser automation backbone and memory/code-search backbone sections

### Changed

**Coordinators refactored to thin dispatchers:**
- `sdlc-onboard-mode` — 1089→392 lines; 4 steps now HANDOFF to onboard specialists
- `sdlc-lead` — smart routing and gate scoring extracted to shared protocols; memory restore (Step 2b) and `session_save` (inter-phase check-in) added
- `test-engineer` — Playwright infra templates extracted to `agents/test/E2E_INFRASTRUCTURE.md`
- `security-auditor` — coordinator pattern; dispatches 9 micro-agents via HANDOFF
- `code-reviewer` — coordinator pattern; dispatches 7 code-review micro-agents
- `performance-engineer` — coordinator pattern; dispatches 6 performance micro-agents

**install.sh:**
- Step 8: `bpm-memory-mcp` MCP registration (`--no-playwright-search` parity)
- Step 9: `playwright-mcp` registration (`--no-playwright-mcp` flag to skip)
- Micro-agent subdirectory symlinking now covers all clusters: `security/`, `code-review/`, `performance/`, `sdlc/onboard/`, `test/`

### Removed / Archived
- `docs/STRICT_REFACTOR_PLAN.md` → `docs/releases/v0.15.0-strict-refactor-plan.md`
- `.code-search/` added to `.gitignore`

---

## [0.24.0] — 2026-05-07

Full-lifecycle quality enforcement — traceability chain from requirements to passing tests, production Playwright infrastructure, complete git workflow with SDLC branch topology, 27 new validators, Phase 3.5 test design gate, Phase 5 5-round release structure, and git checkpoints at every document-producing step.

### Added

**Agents**
- **`architecture-designer`** — new specialist agent that derives module boundaries from business domains (not technical layers). Enforces hexagonal/FSD/DDD patterns. Produces `MODULE_DESIGN.md` (8 required sections incl. dependency rules, feature recipe, enforcement config) and `INFRASTRUCTURE.md` (topology-only, 5 sections). Validated by `validate-module-design.sh` and `validate-infrastructure.sh`.

**Validators (27 new, 36 total)**

| New validator | Checks |
|---|---|
| `validate-module-design.sh` | MODULE_DESIGN.md: pattern+justification, no technical-layer naming, circular dep detection, enforcement config |
| `validate-infrastructure.sh` | INFRASTRUCTURE.md: env matrix, compute, data, networking+Mermaid, ops concerns; rejects IaC code |
| `validate-security-controls.sh` | SECURITY_CONTROLS.md: every HIGH/CRITICAL threat has a control; DB/API/ARCH have security sections |
| `validate-test-design.sh` | TEST_DESIGN.md: 5 mandatory sections (Unit, Integration, E2E, Security, Test Infrastructure), P0 UCs covered |
| `validate-iac.sh` | IaC scaffolding: entry/variables/outputs/per-env configs, `terraform validate`, no hardcoded secrets |
| `validate-module-boundaries.sh` | Cross-module internal imports in TS/JS/Python/Go; enforces dep rules from MODULE_DESIGN.md |
| `validate-code-health.sh` | 9 anti-slop patterns: catch-all blocks, try-in-loop, what-comments, emoji-comments, >50L functions, >250L files, TODO/FIXME, debug prints, magic numbers |
| `validate-ux-spec.sh` | UX_SPEC.md: component library chosen (not TBD), ≥5 inventory items, P0 UCs covered, WCAG 4 pillars, responsive strategy |
| `validate-design-system.sh` | Token file, component files match UX_SPEC inventory, DESIGN_SYSTEM.md, no hardcoded hex |
| `validate-release-readiness.sh` | 10-condition release gate: FIX_BACKLOG clean, 4 review verdicts, coverage gaps, container CVEs, tech debt catalogued, all RUNTIME PASS |
| `validate-requirements-matrix.sh` | REQUIREMENTS_MATRIX.md: P0 UC rows have Test + Status columns; cross-references USE_CASES.md |
| `validate-e2e-setup.sh` | Playwright config has JSON reporter, retries, screenshot, baseURL; auth fixture; POM/fixtures dir; CI workflow has E2E step |
| `validate-adrs.sh` | Every ADR-NNN reference has a file with valid status |
| `validate-completion-manifest.sh` | HANDOFF manifest schema + completion phrase present |
| `validate-migrations.sh` | Migration files have both up and down; reversible |
| `validate-deps.sh` | npm audit / pip-audit / cargo audit; subtracts waivers |
| `validate-build.sh` | Runs project build, captures exit code |
| `validate-lint.sh` | Runs linter + typecheck |
| `validate-fix-backlog-closed.sh` | CRITICAL/HIGH rows VERIFIED/FIXED/WAIVED before phase-5 |
| `validate-smoke.sh` | Boots server, hits configured routes, asserts 200 |
| `validate-no-ascii-art.sh` | No Unicode box-drawing or ASCII banners in docs |
| `validate-scope.sh` | Post-HANDOFF git-scope enforcement |
| `validate-c3-coverage.sh` | Every source module in C3 component diagram |
| `validate-entry-points.sh` | Every entry point documented |
| `validate-tech-stack.sh` | All deps appear in TECH_STACK.md |
| `validate-use-cases.sh` | UC-IDs, required fields, priority, Source: traceability |
| `validate-user-stories.sh` | Given/When/Then acceptance criteria, traceability to UC/FR |

`validate-tests-mapping.sh` extended: now parses jest/vitest/pytest JSON results files and produces UC-level PASS/FAIL verdict table. `validate-tests.sh` extended: Playwright fast-path with `--reporter=json,html,list` to produce `test-results.json`.

**Shared protocols**
- **`ANTI_SLOP_RULES.md`** — canonical 20-rule AI slop catalog (R-01..R-20) across error handling, abstraction, defensive bloat, comment/style, structural patterns. Used by `code-reviewer` (8th scored dimension, threshold ≥8) and `coding-agent`.

**SDLC phases**
- **Phase 3.5 (Test Design)** — new gate between Design and Implementation. `test-engineer` produces `TEST_DESIGN.md` (5 sections: Unit, Integration, E2E Scenarios, Security, Test Infrastructure) and E2E config files. Non-blocking style (gaps escalate, don't hard-block). Validated by `validate-test-design.sh`.
- **Human Approval Gate A** (Phase 2→3) and **Gate B** (Phase 3.5→4) — explicit user sign-off before irreversible design and implementation work begins.

### Changed

**Code review — 8 dimensions**
- `code-reviewer.md`: anti-slop is now the 8th scored dimension (threshold ≥8, not 7). Progress Summary table, confidence loop table, Health Dashboard mirror, mode descriptions, and verdict rubric all updated to 8 dimensions.
- All HANDOFF prompts across all modes updated from "7-dimension review" to "8-dimension review".

**Phase 5 restructured as 5 rounds**
- Round 1: Reviews fan-out (code, security, perf, UX — always parallel)
- Round 2: Fix-Verify loop (up to 3 iterations with remediation + targeted re-verify)
- Round 3: Audit fan-out (tech-debt + coverage + container — parallel-safe with Round 2)
- Round 4: Release gate via `run-coverage-loop.sh phase-5` (must exit 0)
- Round 5: Release via `git-expert --release`

**Parallel execution — improve-mode**
- `sdlc-improve-mode.md` Step 2: `[S]equential / [P]arallel` audit fan-out selection before specialist HANDOFFs (mirrors Phase 5 Round 1 pattern).

**Git workflow**
- `references/git-workflow-checklist.md`: SDLC Branch Topology section (complete branch map, decision table, merge strategy per type, commit cadence, draft-PR-first rule), Hotfix Flow section (13-step P0/security fix pattern, forward-merge, automatic PATCH release).
- `agents/git-expert.md`: CI pipeline green added as explicit merge gate (alongside RUNTIME_*.md PASS); draft-PR-on-first-push rule; SDLC Branch Awareness quick-reference table.
- Phase 4 Step 8: split into 8a (branch + push + draft PR immediately), 8b (atomic commits after coding-agent), 8c (merge gate after all conditions met).
- `sdlc-feature-mode.md` Step 3.1: create draft PR on first push (not after code is done).

**Git checkpoints everywhere**
- Phase 3: 6 new checkpoints after each specialist gate (MODULE_DESIGN, DATABASE, API+OpenAPI, THREAT_MODEL, SECURITY_CONTROLS, INFRASTRUCTURE). Session crash no longer loses validated design artifacts.
- Phase 5: checkpoints after Round 1 reviews, after each Fix-Verify iteration, after Round 3 audits. Review documents are now tracked in git on the feature branch.
- Improve-mode: checkpoints after each audit, after backlog synthesis, after each item fix+verify.
- Onboard-mode: 2 intermediate checkpoints (steps 1-2, steps 3-4) before the final PR commit.

**UC-level test traceability**
- `validate-requirements-matrix.sh`: new validator checks REQUIREMENTS_MATRIX.md coverage.
- `validate-tests-mapping.sh`: extended with jest/vitest/pytest JSON parsing for per-UC PASS/FAIL verdicts.
- Test-engineer HANDOFF: `describe("UC-NNN: <name>")` and `it("AC-N: <criterion>")` naming convention enforced.

**Playwright E2E infrastructure**
- `test-engineer.md`: full Playwright infrastructure section — `playwright.config.ts` template (JSON reporter, retries, screenshot, storageState auth project), `auth.setup.ts`, Page Object Model base class, `test.extend()` custom fixtures with auto-cleanup, `global-setup.ts` DB reset, GitHub Actions/Gitea CI workflow, sharding, soft assertions, network mocking, Cypress equivalent patterns.
- `validate-e2e-setup.sh`: gates that playwright.config.ts has JSON reporter (required for UC-level verdicts), auth fixture, POM directory, CI E2E step.
- Phase 4 test-strategy HANDOFF: requires E2E infrastructure files as deliverables (not just TEST_STRATEGY.md).
- `validate-test-design.sh`: requires `## Test Infrastructure` section with framework, JSON reporter path, auth strategy.

**Canonical rules — six**
- `BOUNDED_TASK_CONTRACT.md`: "five canonical rules" updated to "six canonical rules" throughout all agent files and HANDOFF_TEMPLATES.md. Rule 6 (Pre-Completion Self-Check) is now properly counted.

### Phase gate changes

| Gate | New validators added |
|------|---------------------|
| phase-2 | `validate-requirements-matrix.sh` |
| phase-3 | `validate-module-design.sh`, `validate-infrastructure.sh`, `validate-security-controls.sh`, `validate-ux-spec.sh` (UI-bearing) |
| phase-3.5 | `validate-test-design.sh` (non-blocking) |
| phase-4 | `validate-iac.sh`, `validate-module-boundaries.sh`, `validate-code-health.sh`, `validate-e2e-setup.sh`, `validate-design-system.sh` (UI-bearing) |
| phase-5 | `validate-code-health.sh`, `validate-module-boundaries.sh`, `validate-release-readiness.sh` |

---

## [0.23.0] — 2026-05-04

Tiered research architecture — researcher now uses a mandatory tool selection gate and a 4-tier fallback chain that starts with fast pullmd-backed tools and escalates to Playwright only when needed. Synced from playwright-search v0.2.0 and attest-claude v0.18.0.

### Changed

- **`agents/researcher.md`** — tool table expanded from 3 to 5 tools with explicit tier labels (1–4). Mandatory **Tool Selection Gate** added: must use `playwright-search_web_search_pullmd` (tier 1) before `playwright-search_web_research_pullmd` (tier 2) before `playwright-search_web_research` (tier 3). Escalation trigger from tier 2 to tier 3 is explicit: < 2 useful sources returned. Fallback chain rewritten to reflect the new order (pullmd SERP first, Playwright on escalation only). Standard and escalation pattern examples updated.

### Tier order (mandatory)

| Tier | Tool | Trigger to escalate |
|------|------|---------------------|
| 1 | `playwright-search_web_search_pullmd` | Always start here |
| 2 | `playwright-search_web_research_pullmd` | When full content needed |
| 3 | `playwright-search_web_research` | Tier 2 returned < 2 useful sources |
| 4 | `playwright-search_web_fetch` | Single known URL |

## [0.22.0] — 2026-05-04

Wave E of the audit remediation — template extraction. Conservative size reduction by extracting two large embedded templates (the ARCHITECTURE.md template from sdlc-init-mode and the OWASP_TRACKER template from security-auditor) into their own files in `agents/templates/`. Mode files reference the templates by path instead of inlining 100+ line markdown blocks.

### Added

- **`agents/templates/ARCHITECTURE_template.md`** (~115 lines) — the canonical ARCHITECTURE.md template with all 6 mandatory diagram types as Mermaid blocks. Was inline in `sdlc-init-mode.md` Phase 3.
- **`agents/templates/OWASP_TRACKER_template.md`** (~332 lines) — the canonical OWASP audit tracker (10 categories + Semgrep Triage Summary + Pass Progress + Attack Chain Analysis + Final Gate). Was inline in `security-auditor.md` initialization.

### Changed

- **`agents/sdlc-init-mode.md`** — 1868 → 1765 lines (~103 lines saved). Phase 3 now references the template via "read `agents/templates/ARCHITECTURE_template.md`" instead of inlining 117 lines of markdown.
- **`agents/security-auditor.md`** — 2227 → 1900 lines (~327 lines saved). Tracker initialization now reads from the template file instead of inlining 332 lines of markdown.
- **`install.sh`** — already copies `agents/` recursively, so `agents/templates/*` lands at `~/.config/opencode/agents/templates/*` automatically. No script change needed.

### Why this matters and what was deferred

The audit's Finding 4 identified that monolithic agent prompts cause attention degradation and exceed local-LLM effective context. Two largest offenders were `sdlc-init-mode.md` (1868) and `security-auditor.md` (2227). Extracting embedded template blocks (which the agent reads, then COPIES into deliverables) is a safe size reduction — the templates aren't behavioral instructions, they're document scaffolds.

**Deferred to a future wave:** full per-phase split of `sdlc-init-mode.md` (Phase 0 / 1 / 2 / 3 / 4 / 5 each in its own file with a thin router). That work requires careful end-to-end testing on a sandbox project and changes to how sdlc-lead loads the right phase based on `docs/work/sdlc-state.md`. The conservative template-extraction approach in this wave delivers ~440 lines of immediate savings without regression risk; the deeper restructure can be tackled separately when a sandbox project is ready for E2E validation.

## [0.21.0] — 2026-05-04

Wave D of the audit remediation — default-onboard Ralph. The default `/sdlc onboard` (no flag) now includes a lightweight inventory pass that catches the two highest-value coverage gaps — undocumented routes and undocumented tables — without going to the full 45–90 min Ralph Wiggum 5-category loop. Three depth levels are now distinct:

| Flag | Inventory categories | Time | Use case |
|------|----------------------|------|----------|
| `--quick` | none (7-step only) | ~10–15 min | Quick exploratory orientation |
| (default) | ROUTE + TABLE | ~25–35 min | Standard onboard — default for most users |
| `--deep` | ROUTE / TABLE / SERVICE / FLOW / ENTRY | ~45–90 min | Contract bid / due diligence / security takeover |

### Changed

- **`agents/sdlc-onboard-mode.md`** — added a "Three depth levels" table at the top, plus a new "Lightweight Inventory" section between the 7-step flow and the existing Ralph Wiggum Deep Mode section. The lightweight section issues ONE HANDOFF to researcher to enumerate ROUTE + TABLE rows only, then runs `run-coverage-loop.sh onboard-deep` (the existing onboard-deep validator chain — SERVICE/FLOW/ENTRY validators warn-skip when no rows of those types exist).
- **`commands/sdlc-onboard.md`** — help text rewritten to document all three flags clearly. Default behavior is now described as the standard onboard (was: alias for `--quick`).

### Why this matters

The audit's Finding 2 noted that Ralph was opt-in only — default `/sdlc onboard` ran 7 steps once with no inventory verification. Users reported that "ralph wiggum and such are always being run" was the desired default. This wave bridges quick (no inventory) and deep (full inventory) with a sensible middle that catches the most common gaps in 25–35 min instead of 45–90.

`--quick` is preserved for users who want the original minimal flow.

## [0.20.0] — 2026-05-04

Wave C of the audit remediation — universal Ralph Wiggum coverage loop. The 3-iteration validator-loop with escalation is no longer reserved for `--deep` modes. Every phase gate in every mode now iterates to coverage, with explicit escalation when 3 iterations don't close the gap list.

### Added

- **`scripts/validators/run-coverage-loop.sh`** — wrapper around `validate-phase-gate.sh` with iteration tracking and escalation. Reads/writes `docs/work/COVERAGE_LOOP_<phase>_<date>.md` (markdown table of iteration → gap count → status). Exit codes:
  - `0` = clean (advance to next phase)
  - `1` = gaps remain, iteration < 3 (orchestrator emits one gap-fill HANDOFF per uncovered row, re-runs)
  - `2` = 3 iterations exhausted (orchestrator emits the escalation block from `RALPH_WIGGUM_LOOP.md`)
- **Two-Track Gate System** documented in `agents/sdlc-lead.md`. Replaces the old "Confidence-based gates" section.
  - **Track 1 (objective)** — coverage loop for any artifact a validator can check. Default for everything except narrative.
  - **Track 2 (subjective)** — confidence 1-10 self-rating for narratives only (VISION, summaries, research reports). Used sparingly; if a validator could be written, write the validator.

### Changed

- **`agents/shared/RALPH_WIGGUM_LOOP.md`** — promoted from "deep-mode-only protocol" to "universal coverage-loop spec." Header now lists every mode that uses the loop (init Phase 3 + 4, onboard default + deep, feature Step 5, improve audit-coverage matrix, security default + deep).
- **`agents/sdlc-init-mode.md`** —
  - Phase 0 gate language clarified to call out Track 2 (narrative confidence loop) for VISION + COMPETITIVE_ANALYSIS.
  - Phase 4 Round 3 gate now calls `run-coverage-loop.sh phase-4` (was: `validate-phase-gate.sh phase-4`). Iteration + escalation handled by the wrapper.

### Why this matters

The audit's Finding 6 sub-issue: "Validators report gaps once; nothing forces re-iteration outside `--deep`." The orchestrator was making subjective "is this good enough?" calls when validators had already returned objective gap lists. The universal loop closes that judgment gap.

Now every mode that has validatable deliverables iterates until clean OR escalates after 3 tries. The escalation block forces a deliberate user choice (waive / lower bar / change specialist / fill manually) instead of letting work drift to "DONE" with gaps still open.

## [0.19.0] — 2026-05-04

Wave B+ of the audit remediation — completeness gates. Nine new validators close the missing coverage dimensions identified in the audit. Every "all X are documented" check is now enforceable by script.

### Added

- **`scripts/validators/validate-c3-coverage.sh`** — every top-level `src/` (or `app/`, `server/`, `internal/`, `pkg/`, `packages/`, `services/`, `modules/`) subdirectory must appear in the C3 component diagram in `ARCHITECTURE.md` or `docs/diagrams/c3-components.md`.
- **`scripts/validators/validate-entry-points.sh`** — enumerates entry points from source: `package.json` `bin`/`main`/`scripts.start`, `__main__.py` files, Go `main.go` files, Rust `src/main.rs` and `src/bin/*.rs`, common server entry files. Each must be referenced in `ONBOARDING.md`, `docs/diagrams/entry-points.md`, or `ARCHITECTURE.md`.
- **`scripts/validators/validate-use-cases.sh`** — parses `USE_CASES.md` and verifies each row (table-form OR section-form) has non-empty Persona, Trigger, Main Flow, Success Criteria, and a valid Priority (P0/P1/P2). Catches stub rows.
- **`scripts/validators/validate-user-stories.sh`** — every story in `USER_STORIES.md` must have acceptance criteria (Given/When/Then OR ≥3 numbered steps OR explicit "Acceptance Criteria" heading). Cross-checks: every persona in `USER_PERSONAS.md` has at least one story.
- **`scripts/validators/validate-tech-stack.sh`** — reads dependencies from `package.json` (deps + devDeps + peerDeps), `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod` (direct only). Every direct dep must appear in `TECH_STACK.md`.
- **`scripts/validators/validate-tests-mapping.sh`** — bidirectional UC ↔ test coverage. Forward: every P0/P1 use case in `USE_CASES.md` must have a test file referencing its UC-NN ID (in filename or content). Reverse: warns on test files that don't reference any UC-ID.
- **`scripts/validators/validate-fix-backlog-closed.sh`** — before phase-5 release, every CRITICAL or HIGH row in any `FIX_BACKLOG_*.md` must have status `VERIFIED`, `FIXED`, `RESOLVED`, `CLOSED`, `WAIVED`, or `WAIVED-WITH-JUSTIFICATION`. Open statuses (`OPEN`, `PENDING`, `IN-PROGRESS`, `REOPENED`, `NEW`, `TODO`) fail the gate. Waived rows must have a non-empty justification.
- **`scripts/validators/validate-adrs.sh`** — every `ADR-NNN` reference in `ARCHITECTURE.md` or `DECISION_LOG.md` must have a corresponding `docs/adrs/ADR-NNN-*.md` file with a recognized status (`proposed`, `accepted`, `deprecated`, `superseded`, `rejected`).
- **`scripts/validators/validate-migrations.sh`** — every migration file in `migrations/`, `prisma/migrations/`, `db/migrations/`, `alembic/versions/`, or `src/migrations/` must be referenced (by basename) in `docs/DATABASE.md` or `docs/MIGRATIONS.md`.

### Changed

- **`scripts/validators/validate-phase-gate.sh`** — completeness validators wired into the appropriate phases:
  - `phase-2` adds: `validate-use-cases.sh`, `validate-user-stories.sh`
  - `phase-3` adds: `validate-c3-coverage.sh`, `validate-entry-points.sh`, `validate-tech-stack.sh`, `validate-adrs.sh`
  - `phase-4` adds: `validate-tests-mapping.sh`, `validate-migrations.sh`
  - `phase-5` adds: `validate-fix-backlog-closed.sh`
- **`agents/shared/RALPH_WIGGUM_LOOP.md`** — expanded the validator catalog table to list all 17 validators (architecture, coverage, completeness, operational) so mode authors can pick the right one.

### Why this matters

The audit's Finding 6 identified that completeness checking existed but was partial. Six high-value coverage dimensions had no validator: C3 components, entry points, use case structure, user-story acceptance criteria, tech-stack ↔ deps, ADR existence, and migration-doc consistency. Plus two phase-5 gaps: fix-backlog closure, tests ↔ use-case mapping.

All nine are now scripts. Each enumerates the source-of-truth (manifest file, source dir, or source-doc) and verifies every item has its corresponding artifact. No subjective confidence score; either every item has an entry or it does not.

Combined with the universal Ralph loop in Wave C, validators that find gaps will trigger automatic gap-fill HANDOFFs (capped at 3 iterations) instead of waiting for orchestrator judgment.

## [0.18.0] — 2026-05-04

Wave B of the audit remediation — operational gates. Phase-4 and phase-5 release gates no longer trust agent self-report. Five new validators auto-detect the project's stack (node / python / rust / go) and actually EXECUTE the build, lint, typecheck, test, smoke, and dependency-audit steps. Every gate produces a `docs/reviews/RUNTIME_<kind>_<date>.md` report with verdict and tail output.

### Added

- **`scripts/validators/validate-build.sh`** — runs the project's build command (npm run build / python -m build / cargo build / go build), captures exit code + tail output. Override via `.sdlc/sdlc.json` "build" key.
- **`scripts/validators/validate-tests.sh`** — runs the test suite, parses pass/fail counts where the runner format is recognizable (vitest, jest, pytest, cargo test, go test). Tests are mandatory — missing test config is a gap.
- **`scripts/validators/validate-lint.sh`** — runs lint AND typecheck, both must exit clean. Tool-specific config-file checks (tsc requires tsconfig.json, eslint requires eslint config, mypy requires mypy.ini or pyproject.toml). Missing config = warn + skip; configured + broken = gap.
- **`scripts/validators/validate-smoke.sh`** — boots the server in background, waits for `wait_url` to respond, hits configured routes, asserts 200/204. Requires `.sdlc/sdlc.json` "smoke" config; skips clean if absent.
- **`scripts/validators/validate-deps.sh`** — runs `npm audit` / `pip-audit` / `cargo audit` / `govulncheck`, counts high+critical advisories, subtracts waivers from `.sdlc/deps-waivers.txt`. Fails on any unwaived high/critical.
- **`scripts/validators/_lib_sdlc_config.sh`** — shared helpers: stack detection, `.sdlc/sdlc.json` reader (supports jq, python3, sed fallback), `command_runnable()` with prerequisite checks (tsc → tsconfig.json, eslint → eslint config, etc.), `write_runtime_report()`.
- **`.sdlc/sdlc.json` schema documentation** in `docs/SDLC_GUIDE.md` with per-stack defaults table, smoke config example, and waivers explanation.

### Changed

- **`scripts/validators/validate-phase-gate.sh`** —
  - phase-4 gate now chains `validate-build.sh + validate-lint.sh + validate-tests.sh` (was: empty, "handled inline").
  - phase-5 gate now chains all 5 operational validators in addition to the existing FIX_BACKLOG / review-verdict / RUNTIME doc checks.
- **`agents/sdlc-feature-mode.md`** — Step 5 runtime gate now documents the validator scripts directly. Coding-agent is still used for feature-specific smoke (happy path of the feature + 1-2 regression paths) but build/lint/test/deps are run by validator scripts, not by agent self-report.
- **`agents/sdlc-init-mode.md`** — Phase 4 Round 3 gate adds explicit `validate-phase-gate.sh phase-4` invocation as the operational backstop. Per-module `RUNTIME_<module>_<date>.md` agent reports remain (for feature-specific assertions) but the orchestrator no longer accepts them as the sole evidence.

### Why this matters

The audit found that phase-5 release gate was performative: it grepped for the literal string "PASS" in agent-written `RUNTIME_*.md` files. An agent could write `verdict: PASS` without ever running anything, and the gate would exit 0. Five new validators replace the grep-for-PASS with actual exit-code checks. A green release gate now means the system actually built, linted, typechecked, tested, smoked, and audited dependencies — not that someone wrote PASS in markdown.

Graceful skipping ensures the validators don't break projects that don't have every tool configured. Each validator checks both "is the command configured" and "are its prerequisites met" (e.g., `tsc` needs `tsconfig.json`). Missing configuration warns and skips clean; broken configuration gaps and fails. Tests are the one mandatory step.

## [0.17.0] — 2026-05-04

Document hygiene + Wave A of the audit remediation. SDLC mode files no longer use Unicode box-drawing banners as visual separators around HANDOFF blocks — those banners were leaking into deliverables generated by smaller models (verified: `docs/USERGUIDE.md` already had stray banners; `docs/AGENT_PROCESS_FLOW.md` was 419 lines of ASCII tree art). All deliverable docs are now Mermaid-only; a new `validate-no-ascii-art.sh` enforces the rule across every `docs/*.md` and is wired into the phase-3 and onboard-deep gates.

### Added

- **`scripts/validators/validate-no-ascii-art.sh`** — scans markdown for Unicode box-drawing characters (`═`, `║`, `┌`, `└`, `─`, `┐`, `┘`, `╔`, `╗`, `╚`, `╝`, `╠`, `╣`, `╦`, `╩`, `╬`, `┏`, `┓`, `┗`, `┛`, `━`, `┃`, `├`, `┤`, `┬`, `┴`, `┼`, etc.) and 40+ char `=` banner lines. Skips Mermaid blocks. Excludes `AUDIT_*.md` (which intentionally references the patterns it bans). Wired into `validate-phase-gate.sh` for `phase-3` and `onboard-deep`.
- **`docs/AUDIT_2026-05-04.md`** — full audit report covering 6 findings (ASCII leakage, Ralph opt-in, performative gates, prompt bloat, code-review verification, completeness gaps).
- **`TODO.md`** — actionable wave plan tracking remediation across A → E.
- **Document hygiene section** in all four SDLC mode files (`sdlc-init-mode.md`, `sdlc-onboard-mode.md`, `sdlc-feature-mode.md`, `sdlc-improve-mode.md`) and `sdlc-lead.md`. Standard rule: "ALL diagrams MUST use Mermaid syntax — NEVER ASCII art or Unicode box-drawing characters."

### Changed

- **`agents/sdlc-init-mode.md`** — 81 Unicode `═══` banner separators replaced with `---`.
- **`agents/sdlc-onboard-mode.md`** — 33 Unicode + ASCII banners replaced.
- **`agents/sdlc-feature-mode.md`** — 18 banners replaced.
- **`agents/sdlc-improve-mode.md`** — 36 banners replaced.
- **`agents/shared/SCOPE_BOUNDARY.md`** — 3 banners replaced.
- **`agents/shared/HANDOFF_TEMPLATES.md`** — 12 ASCII `===` banners replaced with `---` to align with the new convention. Templates remain functionally identical.
- **`agents/shared/RALPH_WIGGUM_LOOP.md`** + **`agents/shared/FIX_VERIFY_LOOP.md`** — 3 banners each replaced.
- **`docs/USERGUIDE.md`** — 3 banners replaced (already-leaked instance).
- **`docs/AGENT_PROCESS_FLOW.md`** — full rewrite of all ASCII tree diagrams as Mermaid `flowchart TD` blocks. Mode 1 phases 0-5, Mode 3, Mode 4, and the Ralph Wiggum loop are all Mermaid now. 419 lines → ~250 lines, more readable, renderable in any markdown viewer.

### Why this matters

Local LLMs (Qwen3-coder, Gemma-3-27b) imitate in-prompt visual style. When a mode file surrounds every HANDOFF with `═══...═══` banner separators, the model treats banners as the project's style — and copies them into deliverables like `ARCHITECTURE.md`, `HEALTH_ASSESSMENT.md`, and `USE_CASES.md`. The audit found 192 banner lines across agent prompts AND already-leaked banners in `docs/USERGUIDE.md` (the repo's own user-facing documentation). Removing the in-prompt examples is the load-bearing fix; the validator prevents recurrence.

The canonical `validate-architecture.sh` enforces real Mermaid fences but only on `ARCHITECTURE.md`. The new `validate-no-ascii-art.sh` generalizes that backstop to every deliverable.

## [0.16.0] — 2026-04-27

Research-tooling overhaul + universal loop-prevention. The legacy DDG-only `web-search.ts` / `web-fetch.ts` tools are deleted in favor of the new **playwright-search MCP** (auto-installed by `install.sh`), giving every agent in the project free, multi-engine web research with paragraph-level relevance ranking. Use-case testing surfaced three distinct loop classes that were causing real failures with local LLMs (LM Studio + Qwen3-coder); all three are now blocked by a shared `LOOP_PREVENTION.md` referenced from every agent prompt.

### Added

- **`agents/shared/LOOP_PREVENTION.md`** — single source of truth for loop-prevention rules. Covers three failure classes:
  - **Failure loop** — same tool error 3+ times → 3-strikes STOP
  - **Schema-validation loop** — model emits malformed tool args (e.g. `glob({pattern: undefined})`), gets a Zod error, retries identical broken call → never retry the same broken call; switch tool or surface
  - **Success loop** — every call succeeds but the model never stops fetching (re-fetches same URLs, keeps wanting "one more source") → hard caps: 15 total / 4 per work-unit / 1 per URL / diminishing-returns check
  - Universal STOP triggers + a required template for surfacing partial results to the user. Every agent must apply these.
- **`agents/shared/RESEARCH_TOOLS.md`** — single-source reference doc agents Read at runtime. Documents the playwright-search MCP tool surface, per-agent when-to-use guidance, query tips.
- **playwright-search MCP auto-install in `install.sh`** — clones from GitHub to `~/.local/share/playwright-search` (override via `PLAYWRIGHT_SEARCH_DIR`), runs `npm install && npm run build`, merges the MCP into `opencode.json` via `jq`. Skip with `--no-playwright-search`. Idempotent.
- **Iterative-loop research workflow** in `agents/researcher.md` — explicit pass-1-broad / pass-2+-refined pattern with a "Learned so far / Still missing" ledger between passes. New Step 2.5 question-completion gate blocks synthesis until every decomposed question reaches DONE; report template requires `#### Qn:` subsections per question.
- **Cross-agent research surface** — `web_research / web_search / web_fetch` (via `playwright-search_*` MCP tool names) made available to and documented in 11 agents that benefit from web lookups before deciding: coding-agent, api-designer, security-auditor, db-architect, performance-engineer, container-ops, frontend-design, ux-engineer, sre-engineer, test-engineer, code-reviewer.

### Removed

- **`tools/web-search.ts` and `tools/web-fetch.ts`** — replaced by playwright-search MCP. The legacy tools were DDG-only with no captcha awareness, and their hyphenated names were being picked over the MCP-prefixed equivalents by smaller models. The replacements are multi-engine, captcha-aware, paragraph-ranked, and cached.
- **`install.sh` playwright-npm install step** — previously installed `playwright` into the opencode node_modules for the deleted `web-fetch.ts`. `@playwright/cli` is still installed (for `tools/playwright-web.ts`).

### Changed

- **`tools/CUSTOM_TOOLS_GUIDE.md`** — Web Research section rewritten to point at the MCP tools.
- **`examples/opencode.json`** — adds the `playwright-search` MCP entry alongside `context7` and `mempalace`.
- **`README.md`** — new "Install flags" table (`--no-playwright-search`, `PLAYWRIGHT_SEARCH_DIR=...`) and "What others need" subsection. Recipients get one-command install with the MCP wired in automatically.

## [0.15.0] — 2026-04-24

Strict-refactor release. Replaces large monolithic prompts + manual enforcement with small targeted prompts + automated validators. sdlc-lead.md drops from 4986 lines to 386 (router only); modes and shared protocols live in their own files. Introduces the Ralph Wiggum inventory loop for exhaustive verification (inventory -> discover -> verify -> gap -> repeat, 3-iteration cap) and the `--quick` / `--deep` depth flags for onboarding and security. Nine bash validators automate completeness checks that previously required orchestrator judgment, plus a three-gate post-HANDOFF runner that proves every delegated task stayed in scope and produced a valid manifest.

### Added

- **`scripts/validators/`** — nine bash validators + shared `_lib.sh`:
  - `validate-architecture.sh` — 6 diagram types, Mermaid syntax, HLA overview, no placeholders
  - `validate-owasp.sh` — all 10 OWASP categories present, confidence >= 7, attack-chains.md present
  - `validate-api-coverage.sh` — every route in source has a row in API_DESIGN.md AND openapi.yaml (Express/Fastify/Next app router/FastAPI/Flask/Go net-http detection)
  - `validate-erd-coverage.sh` — every table/model in source has an ERD entry (Prisma/TypeORM/Sequelize/Knex/SQLAlchemy/Django/raw SQL detection)
  - `validate-sequence-coverage.sh` — every P0 use case in USE_CASES.md has a sequence diagram
  - `validate-inventory.sh` — every row in INVENTORY.md has a corresponding artifact
  - `validate-scope.sh` — post-HANDOFF git-scope enforcement (`git status --porcelain` confined to assigned directories)
  - `validate-completion-manifest.sh` — HANDOFF manifest schema + completion phrase
  - `validate-phase-gate.sh` — orchestrator that chains the right validators for a given phase (phase-0..5, onboard-deep, security-deep)
  - `run-handoff-gates.sh` — three-gate orchestrator (scope + manifest + coverage) with any-failure-aborts semantics
  - Every validator emits a JSON envelope to stdout, a human-readable gap list to stderr, and exits 0 / 1 / 2. Bash 3.2 compatible (macOS default).

- **`agents/shared/`** — canonical shared protocols:
  - `BOUNDED_TASK_CONTRACT.md` (71 lines) — single source of truth for scope rules every specialist follows in Bounded Task Mode. Enables delete-duplicates-from-every-specialist follow-up.
  - `HANDOFF_TEMPLATES.md` (201 lines) — canonical HANDOFF block templates (standard, remediation, re-verification, parallel-wave) + context-packet template + post-HANDOFF gate documentation.
  - `FIX_VERIFY_LOOP.md` (152 lines) — canonical five-step pipeline (parallel fan-out -> FIX_BACKLOG -> remediation -> re-verification -> gate), severity matrix, merge gate, escalation block. Extracted from sdlc-lead.md.
  - `RALPH_WIGGUM_LOOP.md` — canonical inventory-driven deep-verification loop reused by onboard-deep and security-deep.

- **Four mode files** extracted from the sdlc-lead monolith:
  - `agents/sdlc-init-mode.md` (1850 lines) — Mode 1 new project, Phases 0-5
  - `agents/sdlc-onboard-mode.md` (823 lines) — Mode 2 onboard, 7-step + Ralph Wiggum deep section
  - `agents/sdlc-feature-mode.md` (483 lines) — Mode 3 add feature
  - `agents/sdlc-improve-mode.md` (890 lines) — Mode 4 audit & improve

- **Ralph Wiggum Deep Mode for `/sdlc onboard --deep`** — step D1-D5 flow appended to sdlc-onboard-mode.md with inventory producer HANDOFF, parallel DISCOVER waves per category, validator-driven VERIFY, focused one-row gap-fill HANDOFFs, and 3-iteration cap.

- **Depth Modes for `/security`** — new Depth Modes section in security-auditor.md. `--quick` (default) runs phases 1-3 once; `--deep` runs the Ralph Wiggum loop over every OWASP category, every custom semgrep rule file, and iteratively over 9 attack-chain patterns until a full pass finds no new chains. Gate: `validate-phase-gate.sh security-deep` exit 0.

- **Three new onboard sub-skills** (thin triggers):
  - `/onboard-inventory` — trigger for step D1
  - `/onboard-verify` — trigger for step D3 (runs `validate-phase-gate.sh onboard-deep`)
  - `/onboard-gap-fill` — trigger for step D4 (focused per-row HANDOFFs)

- **Platform support block** in README.md and install.sh preflight refusing native Windows and pointing to WSL2.

- **`docs/STRICT_REFACTOR_PLAN.md`** — durable record of the 5-wave plan.

### Changed

- **`agents/sdlc-lead.md`: 4986 lines -> 386 lines.** Router + shared protocols only. Modes extracted to `sdlc-<mode>-mode.md`. Resume protocol step 2 rewritten to call `run-handoff-gates.sh` with a HANDOFF-type -> coverage-validator mapping table. No behavioral regression — same flow, just delegated.

- **`commands/sdlc-onboard.md`** — gains `--quick` / `--deep` flags with guidance on when to pick deep.

- **`skills/gate/SKILL.md`** — rewritten from confidence-score self-evaluation to call `validate-phase-gate.sh <phase>`. Output is the validator's JSON gap list, not a subjective rating.

- **`skills/security/SKILL.md`** — depth-flag matrix + guidance on when deep makes sense.

- **Gate verdict mechanism** — every phase advance now blocked by `validate-phase-gate.sh <phase>` exit code. Confidence-score loops remain ONLY for artifacts validators cannot check (narratives, summaries, research reports).

### Fixed

- **bash 3.2 parser bugs** in validator scripts — triple-backticks inside `[[ ]]` comparisons and double-quoted strings mis-parse on macOS. Fix: bind to variables via `printf '%s' '...'` first. Also stripped em-dashes and box-drawing unicode from code bodies (kept in output via format strings).

---

## [0.14.0] — 2026-04-23

Structured Fix-Verify Loop across every review stage. Parallel review fan-out, unified FIX_BACKLOG, dedicated remediation + re-verification HANDOFF templates, hard 3-iteration cap with escalation, canonical severity→action matrix, and expanded git-expert merge enforcement. Closes the gap where review findings had no structured path back into code and where reviews ran sequentially instead of concurrently.

### Added

- **Fix-Verify Loop Protocol (shared, near the top of `sdlc-lead.md`).** Canonical five-step pipeline — **parallel fan-out → synthesize FIX_BACKLOG → remediation HANDOFF → targeted re-verification HANDOFF → gate**. Referenced by Mode 3 Step 4, Mode 1 Phase 4 Parallel Wave Round 2, and Mode 1 Phase 5. Single source of truth for how findings turn into code changes.

- **Severity → Action matrix (canonical).** `CRITICAL` / `HIGH` block merge to `main` and require fix-this-session (or a signed waiver). `MEDIUM` is tracked as tech debt — merge-OK. `LOW` is informational. Waivers are recorded in `docs/reviews/WAIVERS_<feature>_<date>.md` with compensating control + review date; sdlc-lead never waives, only the user does.

- **Auto-trigger rules for security + perf + ux.** sdlc-lead decides which reviews to run based on the impact analysis: security runs when auth/session/authorization/user-input/file-upload/SQL/crypto/external-API-with-credentials surfaces are touched; performance runs when NFR-tracked paths, DB queries, loops, caching, or background jobs are touched; ux runs on any UI file. code-review always runs. Removes the human judgment call and the recurring "forgot to run /security" miss.

- **Unified `FIX_BACKLOG_<feature>_<date>.md`.** Orchestrator-written synthesis of every review's findings into one table with severity, file:line, finding, recommended fix, and an observable **Verify criterion** (passing test, metric threshold, grep that returns nothing). Deduplicates cases where two reviewers flagged the same file:line.

- **Remediation HANDOFF template.** Dedicated template that hands the FIX_BACKLOG to coding-agent with rules: fix only CRITICAL+HIGH rows, minimum change at cited file:line, stop and report if a fix needs a design change. Produces `FIX_SUMMARY_<feature>_<iteration>_<date>.md`.

- **Targeted Re-verification HANDOFF template.** code-reviewer (or the original specialist for domain-specific checks) verifies ONLY the findings in the backlog — does not re-scan for new issues. Produces `VERIFY_<feature>_<iteration>_<date>.md` with per-row PASS/FAIL/INCONCLUSIVE and evidence. Targeted verification saves tokens vs. re-running a full 7-dimension review.

- **Hard 3-iteration cap + escalation block.** If the 3rd verification still has any FAIL, sdlc-lead STOPS the loop and emits a four-option escalation prompt: (A) sign a waiver, (B) redesign, (C) defer to tech debt, (D) change specialist. No 4th iteration without explicit user direction.

- **Phase 5 Release Gate.** New explicit gate block emitted before `--release`: 10 required conditions including FIX_BACKLOG closed, every review verdict READY/APPROVED/RELEASE-READY, runtime PASS, test suite P0+P1 green, no CRITICAL CVE in containers. Any `[✗]` stops release and reports blockers.

### Changed

- **Mode 3 Step 4 rewritten as parallel fan-out.** code-review + security + perf + ux (when triggered) emit together in ONE message → user opens N concurrent OpenCode sessions → sdlc-lead synthesizes FIX_BACKLOG → Fix-Verify loop → merge. Previously ran sequentially with each review in its own section; Step 4's conditional "if security-sensitive / if perf-sensitive" blocks are gone.

- **Mode 1 Phase 5 rewritten as parallel fan-out.** security-final + perf-final + code-review-final + ux-audit fan out together; tech-debt, coverage, and container-audit remain sequential post-review audits (they examine different concerns than the four blocking reviews). Phase 5 ends with the explicit Release Gate.

- **Mode 1 Phase 4 Parallel Wave Round 2 unified.** Round 2 now emits every triggered review (code + security + perf + ux per module), feeds findings into a per-module FIX_BACKLOG, and runs the Fix-Verify loop per module (3 iterations max). A module stuck after 3 cycles emits the escalation block for that module only; peer modules advance to Round 3 runtime.

- **git-expert merge rule expanded.** The merge-to-`main` refusal now requires three conditions (previously just one): (1) matching `RUNTIME_*.md` = PASS; (2) Fix-verify loop closed (empty backlog OR latest VERIFY all PASS OR signed waivers); (3) no open CRITICAL/HIGH in CODE_REVIEW/SECURITY/PERF/UX verdicts. Missing or failing any → abort and report exactly which condition blocks.

- **performance-engineer — findings-only for SDLC reviews.** Bounded Task Mode gains a new Strict Scope Rule: when the SDLC-TASK prompt asks you to review/audit/benchmark, produce findings with recommended fix + expected delta — do NOT self-optimize. Fixes flow through the Remediation HANDOFF so the change runs through code review like every other finding. Direct `/perf` invocation with an explicit "optimize X" prompt is unchanged.

## [0.13.0] — 2026-04-23

Runtime validation gate before every merge, per-component parallelism with full mini-lifecycle per module, and sub-component decomposition for Mode 3 features. Closes the gap where tests-green PRs were merging to `main` without a confirmed clean run, and where Phase 4 parallel waves only parallelized coding while reviews and runtime ran once at the end.

### Added

- **Runtime validation gate — MANDATORY before every merge.** Mode 3 Step 5 now includes a blocking runtime gate before `git-expert` is allowed to squash-merge. `coding-agent` runs: build → lint/typecheck → start → feature smoke → regression smoke, producing `docs/reviews/RUNTIME_<feature>_<date>.md` with verdict PASS or FAIL. FAIL blocks the merge — fix, re-review if non-trivial, re-run the gate. A green test suite and approved review are not proof the app boots; this gate exists because a merge without runtime confirmation is a P0 defect (missing env vars, broken migrations, import cycles, misconfigured services all surface only at runtime).

- **git-expert merge rule — matching `RUNTIME_*.md` required to squash to `main`.** New NEVER-rule in `git-expert.md`: any merge to `main`, any sub-component merge to its parent feature branch, and any Phase 4 wave module merge requires a matching `docs/reviews/RUNTIME_*.md` with verdict PASS. Missing, stale, or FAIL → abort and report. The merge-phase `task(git-expert, ...)` prompt in `sdlc-lead` now explicitly tells git-expert to verify this file before marking the PR ready.

- **Mode 3 Step 1.5 — Sub-component Decomposition.** After impact analysis, sdlc-lead asks whether the feature is Atomic (linear flow, as before) or Split. Split features produce `docs/features/<slug>/COMPONENT_DAG.md` (same format as Phase 4's `PARALLELIZATION_MAP.md`) with sub-components, directories, dependencies, wave numbers, and frozen contracts. Each sub-component cuts its own branch `feat/<slug>/<sub-slug>` from the parent `feat/<slug>`, runs the full Mode-3 lifecycle (Steps 2–5) in its own OpenCode session, produces `RUNTIME_<slug>_<sub-slug>_<date>.md`, and merges back to the parent when its runtime passes. The parent merges to `main` only when every sub-component is PASS.

- **Phase 4 Parallel Wave — three-round per-module pattern (code → review → runtime).** Parallel waves were previously coding-only with shared reviews at the end. Now each parallel wave runs three rounds, one message per round: Round 1 emits N `coding-agent` HANDOFFs (one per module), Round 2 emits N `code-reviewer` HANDOFFs producing `docs/reviews/CODE_REVIEW_<module>_<date>.md`, Round 3 emits N runtime-validation HANDOFFs producing `docs/reviews/RUNTIME_<module>_<date>.md`. The wave advances only after every module is green in all three rounds. A Round 3 FAIL blocks only the failing module — fix and re-run that module's HANDOFF while peers' PASS verdicts stay valid.

### Changed

- **SDLC_TRACKER Phase 4 Wave Execution table** — gained `Depends on waves` column and per-round status (code / review / runtime) plus per-module RUNTIME verdicts. A wave row is only ✅ DONE when all three rounds are green AND every per-module RUNTIME verdict is PASS.

- **Mode 3 merge prompt to git-expert** — no longer just "mark ready + squash." It now instructs git-expert to first confirm the RUNTIME report exists with PASS, abort if missing or FAIL, and report the merge SHA after success.

## [0.12.0] — 2026-04-22

Strict delegation policy for sdlc-lead, modular-parallel architecture requirements in Phase 3, and opt-in parallel wave execution in Phase 4. Closes the two remaining INLINE audit leaks where the orchestrator was doing specialist work directly.

### Added

- **`docs/PARALLELIZATION_MAP.md` — new Phase 3 deliverable** — Module Inventory table (every module has a row with directory, contract artifact, dependencies, wave number) plus a Waves section grouping independent modules. Phase 4 Execution Mode Selection reads this file as its first step. The Phase 3 gate refuses to pass if the map is missing or the Module Inventory has fewer rows than `ARCHITECTURE.md` lists modules.

- **Phase 4 Execution Mode Selection** — before emitting any Wave 1 HANDOFFs, sdlc-lead asks the user per-wave whether to run Sequential (default, safer) or Parallel (opt-in, faster). The choice is recorded in `docs/work/sdlc-state.md` and the Phase 4 Wave Execution table in the SDLC_TRACKER.

- **Parallel wave protocol** — when a wave is marked `[P]`, sdlc-lead emits one message containing every module's HANDOFF as separate blocks. Each HANDOFF names the module's directory as the exclusive write-scope and tells the agent that wave-peers are running concurrently. Wave N+1 does not start until every Wave-N agent prints its completion phrase, every output passes verification ≥ 7, and a write-scope collision check (`git status` for overlapping files) is clean.

- **Modular Design Requirements — items 6–8** — architecture MUST define service-boundary criteria (each module is independently buildable with a frozen contract), write-scope isolation (enforced during Phase 4, each module owns `src/<module>/` exclusively), and contract-first ordering (API/event contracts frozen in Phase 3 before any Phase 4 implementation starts — modules can then implement against mocks of each other).

- **Strict Scope Rules — 5-point policy across all 12 specialists** — added to the Bounded Task Mode section of `api-designer`, `db-architect`, `researcher`, `test-engineer`, `ux-engineer`, `security-auditor`, `code-reviewer`, `sre-engineer`, `performance-engineer`, `container-ops`, `coding-agent`, and `frontend-design`. Non-negotiable rules: write-scope isolation, no extra files beyond PRODUCE, verbatim completion phrase (for sdlc-lead's resume logic), no scope expansion (observations go to "Known issues / deferred", not silent fixes), stop means stop (no "anything else?" after completion phrase). Rules exist because sdlc-lead coordinates multiple specialists — including parallel waves — and depends on every specialist staying inside its lane.

- **Mode 1 SDLC_TRACKER — Synthesis Documents + Phase 4 Wave Execution sections** — tracker template now has explicit rows for the two orchestrator-written synthesis docs (ARCHITECTURE.md, PARALLELIZATION_MAP.md) and a Phase 4 Wave Execution table with wave number, modules, execution mode, status, and per-module verify scores.

### Changed

- **sdlc-lead becomes a strict master-tracker / documentation-master** — Rules list rewritten to make delegation non-negotiable. The only documents sdlc-lead writes directly are trackers (`SDLC_TRACKER.md`, `DELEGATION_LOG.md`, `docs/work/sdlc-state.md`), synthesis docs (`ARCHITECTURE.md`, `PARALLELIZATION_MAP.md`, `VISION.md`, use case catalogs, `DESIGN_CONTEXT.md`, improvement backlogs). Everything else is a HANDOFF, including discovery audits, navigating running apps, checking HTTP responses, writing code, designing schemas, running tests. The policy is enforced by explicit callout: *"If you catch yourself about to `Read` a source file to analyze it, STOP — that's a HANDOFF."*

- **`frontend-design` Bounded Task Mode brought to parity** — previously had 1 reference to Bounded Task Mode versus 3–4 in sibling specialists. Now includes the full "Skip all of the following" list, the expanded Execute-in-order procedure, and the new Strict Scope Rules section.

### Fixed

- **Phase 4 discovery audit — INLINE → HANDOFF (test-engineer/ux-engineer)** — previously sdlc-lead navigated every app route itself checking for console errors and 4xx/5xx responses, violating the strict-delegation policy. Now issued as a HANDOFF producing `docs/audits/discovery-<date>.md` with per-route status, severity, and a summary table.

- **Mode 4 Step 1.5 Discovery Audit — INLINE → HANDOFF (test-engineer/ux-engineer)** — same pattern in improvement mode before specialist audits start. Now a HANDOFF producing `docs/improve/DISCOVERY_PRE.md` with route findings and a "prioritize" recommendation scoping the Step 2 audits.

---

## [0.11.1] — 2026-04-14

### Fixed

- **Researcher timeout — moved from Tier 1 (task) to Tier 2 (HANDOFF)** — researcher runs multi-phase web research (5–15 min, 300–360 s timeouts) and was incorrectly delegated via `task()` alongside git-expert. This caused silent hangs and timeouts in SDLC flows. Researcher is now a Tier 2 HANDOFF agent, consistent with all other specialists. All 4 delegation sites updated: Phase 0 (competitive landscape), Phase 1 (technical feasibility), Phase 3 Step 1 (framework comparison), Mode 4 Step 2.5 (vision research). Each site now saves `sdlc-state.md` before the HANDOFF and specifies a clean completion phrase. The Research Findings Review Protocol updated to reference the HANDOFF pattern. `AGENT_PROCESS_FLOW.md` and `USERGUIDE.md` updated to reflect the change.

- **Tier 1 clarified** — Tier 1 (`task()`) is now git-expert only. Tier 2 (HANDOFF) is researcher + all 10 other specialists + coding-agent.

---

## [0.11.0] — 2026-04-14

New `coding-agent` specialist for doc-driven implementation, delegation tracking across all handoffs, and TECH_STACK.md enforcement throughout the SDLC.

### Added

- **`coding-agent` — new specialist agent** (`agents/coding-agent.md`) — Doc-driven implementation engineer invoked via HANDOFF from `sdlc-lead` for all code implementation work. Enforces Four Laws before writing any code: (1) read SDLC design docs first, (2) verify every library API via Context7 MCP (`resolve-library-id` + `get-library-docs`) — never writes from training-data assumptions, (3) match existing patterns in the target directory, (4) follow `docs/TECH_STACK.md` — flags any unlisted library rather than silently adopting it. Anti-slop rules enforced on every file: no try-catch outside system boundaries, no abstractions with <2 implementations, no single-use helpers, no what-comments, no unused imports, no scope creep. Self-audit checklist run before reporting done. Produces a Completion Manifest including files produced, API verifications, tech stack compliance, anti-slop audit result, test result, and deferred items.

- **`/code` skill** (`skills/code/SKILL.md`) — Thin trigger that invokes `coding-agent`. Usage: `/code` (will ask for design docs) or `/code <description>`. Requires design docs to exist — directs user to `/sdlc feature` if none found.

- **DELEGATION_LOG** — persistent append-only tracking file (`docs/work/DELEGATION_LOG.md`) written by `sdlc-lead` on every HANDOFF issued and returned. Columns: timestamp, agent, task summary, status (PENDING / DONE / REDO / FAILED), confidence score, notes. Provides a complete audit trail of what was delegated, to whom, and whether it passed the confidence gate.

- **Structured HANDOFF confidence loop** — "Resuming after a HANDOFF" section rewritten with a 6-step protocol: confirm state from `sdlc-state.md` → verify output files → score 1–10 → apply asymmetric threshold (≥7 pass, 5–6 revise up to 3×, <5 auto-fail) → update DELEGATION_LOG → continue or escalate. "Revise" means ask user to re-run the agent, not rewrite output yourself.

- **TECH_STACK.md enforcement in implementation** — coding-agent HANDOFF template in Mode 4 now includes `docs/TECH_STACK.md` in the CONTEXT block with explicit constraint: "Do not introduce any library, framework, or runtime not listed in TECH_STACK.md — flag deviations in the completion manifest instead of silently adopting them." Same constraint added to the Mode 1 Phase 4 IMPLEMENTATION CHECKPOINT.

### Changed

- `sdlc-lead`: Skill → Agent mapping table updated — `coding-agent` added as the agent for all general code implementation. `sre-engineer` annotated as CI/CD/ops only (NOT application code). CRITICAL warning block added to prevent inventing agent names.
- `sdlc-lead` Mode 4: Size M HANDOFF template updated to pass `docs/TECH_STACK.md` as a required context file and require tech stack compliance in the completion manifest.
- `sdlc-lead` IMPLEMENTATION CHECKPOINT: `docs/TECH_STACK.md` listed first among spec documents with "MANDATORY constraint" label.
- All docs updated: `README.md` (14 agents, 20 skills), `docs/FEATURES.md`, `docs/EXPERT_GUIDE.md`, `docs/USERGUIDE.md`, `docs/SDLC_GUIDE.md`, `docs/AGENT_PROCESS_FLOW.md`.

---

## [0.10.0] — 2026-04-13

Three targeted enhancements: attack chain analysis in the security auditor, OpenAPI 3.0 spec as an SDLC Phase 3 gate requirement, and semgrep custom rules correctly documented to the user's personal OpenCode store.

### Added

- **Attack chain analysis — `security-auditor` Phase 5b** — New phase runs after all individual findings are verified, before the report is written. Builds a pre-condition/post-condition inventory for every real finding, then tests every pair and triple for multi-step exploitability. Discovers vulnerabilities that exist only when findings are chained — e.g., MEDIUM info disclosure + MEDIUM IDOR = CRITICAL account takeover that neither finding describes alone. Nine classic chain patterns tested explicitly (XSS→session hijack, SSRF→pivot, path traversal→credential theft, auth bypass→privilege escalation, recon→targeted attack, weak crypto→forgery, race condition+business logic, CVE+reachability, misconfiguration→enumeration). Each chain documented as a `C-N` finding with step-by-step attack narrative, combined severity (auto-bumped above highest individual link when applicable), and a "break the chain" remediation priority. Chains written to `docs/security/attack-chains.md` and included as first-class findings in the final report. Reader simulation checklist updated to require chain section presence.

- **OpenAPI 3.0 spec — `sdlc-lead` Phase 3 deliverable** — `docs/api/openapi.yaml` is now a required Phase 3 artifact alongside `docs/API_DESIGN.md`. The api-designer HANDOFF prompt now mandates both files: `API_DESIGN.md` for human-readable narrative and `openapi.yaml` as a valid OpenAPI 3.0 spec with `components/schemas`, `components/securitySchemes`, reusable `$ref` error responses, and no inline schemas for reused types. Phase 3 gate blocks until the spec passes `swagger-cli validate` with 0 errors and every endpoint in `API_DESIGN.md` has a corresponding path entry. Git checkpoint and PR body updated to include the spec.

- **Custom Semgrep rules personal store documentation** — `security-auditor` preflight check (Phase 2, Step 1) now includes a check for `~/.config/opencode/.semgrep/custom-rules` (global install) or `.opencode/.semgrep/custom-rules` (project install). When missing, agent provides recovery instruction (re-run `install.sh`). Phase 2 Step 3 description and OWASP tracker template updated with accurate personal store paths.

### Changed

- `security-auditor` orchestrator plan updated from 4 phases to 5 (adds `attack-chain` between `verify-findings` and `write-report`).
- `sdlc-lead` Phase 3 deliverables list updated: `docs/API_DESIGN.md` now described as "human-readable contracts" and `docs/api/openapi.yaml` added as "machine-readable OpenAPI 3.0 spec (Swagger-compatible)".
- `docs/FEATURES.md` and `docs/USERGUIDE.md` updated for all three changes above.

## [0.9.0] — 2026-04-13

Semgrep security scanning deep upgrade: 98 custom gap-filler rules across 6 languages, offline/air-gapped scanning with registry pack caching, polyglot language detection, and auto-loading custom rulesets per detected language.

### Added

- **Custom gap-filler rulesets** (`.semgrep/custom-rules/`) — 98 hand-written Semgrep rules across 6 languages that fill OWASP Top 10 coverage gaps in registry packs with thin coverage:
  - `csharp-security.yml` (20 rules) — command injection (`Process.Start`), XSS (`Html.Raw`), LDAP injection, path traversal, SSRF (`HttpClient` + `WebRequest`), hardcoded secrets, CORS wildcard, weak hashing, sensitive logging, insecure cookies
  - `kotlin-security.yml` (16 rules) — SQL injection (JDBC + Android `rawQuery`), command injection, hardcoded secrets, deserialization, SSRF, WebView misconfig, path traversal, cleartext traffic, sensitive logging
  - `swift-security.yml` (17 rules) — weak hashes (MD5/SHA1), hardcoded keys, ECB mode, SQLite injection, WebView XSS, insecure HTTP, SSL bypass, keychain accessibility, path traversal, SSRF
  - `rust-security.yml` (15 rules) — SQL injection (`format!` macro), command injection, hardcoded secrets, `unwrap`/`expect`/`panic`/`todo` abuse, path traversal, SSRF, sensitive logging
  - `php-security.yml` (15 rules) — `unserialize` RCE, `include`/`require` LFI, file upload, type juggling, hash timing, session fixation, `preg /e` injection, `eval`, XXE, SSRF
  - `cpp-security.yml` (15 rules) — buffer overflow, format string, memory safety, command injection, crypto weakness, deprecated functions (targets `[c, cpp]`)

- **Offline / air-gapped scanning** — New `scripts/cache-registry-packs.sh` downloads all registry packs as local YAML files for fully offline scanning. Modes: `download`, `refresh`, `status`, `prune`.

- **`--offline` flag for `semgrep-full-audit.sh`** — Forces the audit to use only cached registry packs and local rules. No network calls. Requires prior `cache-registry-packs.sh` setup.

- **Auto-loading custom rules per language** — `semgrep-full-audit.sh` now detects which languages are present and automatically loads matching gap-filler rulesets from `.semgrep/custom-rules/`. Banner reports how many custom rulesets were loaded.

- **`--cache-packs` subcommand for `update-semgrep-rules.sh`** — Delegates to `cache-registry-packs.sh` for one-command registry pack caching.

- **`resolve_registry_pack()` function** — New function in `semgrep-full-audit.sh` that prefers local cache over live registry, handles 4 cases: cache hit, cache miss with network, cache miss offline (skip), and cache disabled (direct URL).

### Changed

- **Polyglot language detection** — `semgrep-full-audit.sh` language detection rewritten from single-language `elif` chain to `LANGS=()` array. Projects with multiple languages (e.g., TypeScript + Go + Python) now get ALL relevant packs, not just the first match.
- **Language detection expanded** — Added detection for C#/.NET, C/C++, Swift/iOS, Kotlin/Android, Scala alongside existing JS/TS, Python, Go, Rust, Java, Ruby, PHP.
- **`install.sh` now installs `.semgrep/` custom rules** — Custom rulesets are copied to `$DEST/.semgrep/` alongside scripts. Status summary reports custom rule count. Uninstall cleans up `.semgrep/` directory.
- **`uninstall.sh` updated** — Now removes `scripts/` and `.semgrep/` directories, notes about registry-cache cleanup.
- **Documentation updated across all references** — `semgrep-guide.md`, `semgrep-community-rules.md`, and `security-auditor.md` all document the custom rulesets, offline scanning, and dead registry packs.

## [0.8.0] — 2026-04-13

SDLC lead deep upgrade: persistent SDLC_TRACKER across all four modes, per-diagram confidence loops for ARCHITECTURE.md, strengthened SAD format template that rejects placeholders, and Phase 3 Architecture Diagram Pre-Gate that blocks advancement until every diagram row passes independently.

### Added

- **`SDLC_TRACKER.md` — persistent session tracker for all four SDLC modes** — Written at the start of each mode (Phase 0 for Mode 1, Step 0 for Modes 2/4, new Step 0 for Mode 3). Stored at `docs/sdlc/SDLC_TRACKER.md`. Survives context loss and session restarts. Status transitions: `⏳ PENDING` → `✅ DONE` / `🔄 RE-PASS` / `⚠️ BLOCKED`. Four mode-specific templates provided (Mode 1 phases 0-5, Mode 2 steps 0-7, Mode 3 steps 0-5, Mode 4 steps 1-6). Resume check: read tracker at start of each mode and skip `✅ DONE` rows — never re-run completed phases.

- **Architecture Diagram Inventory** — New section within the Mode 1 tracker template. One row per required diagram type: C1, C2, one C3 per major service, one sequence diagram per P0 use case, deployment, data flow. Gate CANNOT pass until every inventory row is `✅ DONE` with score ≥ 7.

- **Per-Diagram Confidence Loop** — New mandatory sub-loop in Phase 3. After writing EACH diagram, the agent rates completeness 1-10 against specific grounding criteria:
  - C1: all personas from USER_PERSONAS.md present as actors? all external systems from SRS §5.2 present?
  - C2: all services/runtimes from TECH_STACK.md present? communication styles on arrows?
  - C3 (one per service): real module names from feature-sliced structure? dependency arrows showing direction? no circular deps?
  - Sequence diagrams: one per P0 use case from USE_CASES.md (not a fixed minimum of 3). Each must have happy path + at least one error path. Participants named specifically — no "Service" generics.
  - Deployment: reflects DESIGN_CONTEXT.md infra choices — no invented infrastructure.
  - Data Flow: traces user request to persistence and back, shows where data transforms and where it's masked.
  - Score < 5 → surface to user immediately. Score 5-6 → revise up to 3 passes. Score ≥ 7 → mark tracker row `✅ DONE`.

- **Architecture Diagram Pre-Gate** — New mandatory check that runs BEFORE the standard Phase 3 gate loop. Reads `docs/sdlc/SDLC_TRACKER.md`, checks every diagram inventory row. If any row is NOT `✅ DONE`, write/revise that diagram following the per-diagram confidence loop before proceeding. Prints a `Diagram Inventory Completion Check` block showing DONE/BLOCKED status per diagram before the main gate runs.

- **HLA Overview section — written LAST** — New `## 0. HLA Overview` at the top of ARCHITECTURE.md. Written AFTER all diagrams pass their confidence loops so it's grounded in real design decisions, not a copy of the discovery interview. Three paragraphs: system partition metaphor, key architectural decisions (referencing ADR table), what a new engineer should read first.

- **Strengthened SAD Format template** — The `### SAD Format (4+1 Views)` template now:
  - Has a MANDATORY notice: no placeholder text in final documents — every section must be filled with real names from the project
  - C3 has one `#### 2.3.x [Service Name]` subsection per major service (not a single generic block)
  - Sequence diagrams section is `### 2.6 Sequence Diagrams — one per P0 Use Case` (derived from USE_CASES.md, not "minimum 3")
  - Each section has HTML comments listing the specific grounding criteria the diagram must meet
  - Goals & Constraints now requires specific targets from SRS.md (e.g., "P95 < 200ms") — not "performance, security, scalability"
  - Cross-Cutting Concerns now requires specific library names and file paths — not "use a logger"

- **Tracker writes wired into Confidence-Based Gates** — After every gate table is printed, the agent immediately calls `edit()` on the tracker to update the phase row status. `✅ DONE` on pass, `⚠️ BLOCKED` on automatic fail, `🔄 RE-PASS` on 5-6 score iteration.

- **Tracker init wired into Mode 2 Output Verification Protocol** — Every step verification log now includes a `Tracker:` line showing the row update applied after the step passes or fails.

- **Tracker init wired into Mode 4 Output Verification Protocol** — Same as Mode 2 — every step verification log includes a `Tracker:` line.

### Changed

- **ARCHITECTURE.md sequence diagram count: "minimum 3" → "one per P0 use case"** — The previous minimum-3 rule was a floor that led to arbitrary diagrams. Now explicitly derived from USE_CASES.md P0 entries so coverage is traceable to requirements.
- **Phase 3 Gate Loop: new pre-gate check added** — The standard gate deliverable rating loop now has a mandatory pre-step (Architecture Diagram Pre-Gate) that must clear before the standard loop runs.

## [0.7.0] — 2026-04-13

Performance engineer deep upgrade: persistent session tracker, pre-profiling static analysis pass with try/catch performance anti-patterns, coverage confidence loop, and mandatory full report template. Also fixes stale `mode: subagent` references across all docs.

### Added

- **`PERF_TRACKER.md` — persistent performance session tracker** (`cd5357b`) — Written at Phase 1, updated after every phase via `edit()`. Stored at `docs/performance/PERF_TRACKER.md`. Survives context loss and session restarts. Tracks: 7-row progress summary (status/confidence per phase), baseline metrics, static analysis findings, profiler results, hotspot log, before/after benchmark table (filled across phases 2, 4, 5). Status transitions: `⏳ PENDING` → `✅ DONE` / `🔄 RE-PASS` / `⚠️ BLOCKED`.

- **Phase 1b — Static Analysis Pass** (`cd5357b`) — New phase between "understand problem" and "profile". Runs 5 grep scans against all source files to detect performance anti-patterns statically, before any profiler runs. Source file inventory (`find . -type f ...`) runs first so the agent knows the full scope.

  Scan 1 — **O(n²) nested loops**: `.find()` / `.filter()` / `.some()` inside `for` / `forEach`.
  
  Scan 2 — **N+1 query patterns**: DB/fetch call inside a loop; suggests `findMany` + `Map` pre-build.
  
  Scan 3 — **try/catch performance anti-patterns** (four patterns, four languages):
  - Pattern A: `try/catch` inside tight loop → V8 cannot apply JIT optimizations (inlining, hidden class caching, escape analysis) → 5-20x slowdown. Fix: move try/catch outside loop or use `Promise.allSettled`.
  - Pattern B: Exception-driven control flow in hot paths (e.g. `try { JSON.parse } catch` called 10,000×/req) → 100-1000× slower than a guard check.
  - Pattern C: Individual `try/catch` per `await` → each `await` blocks on completion, preventing `Promise.allSettled` parallelism. Three 200ms calls = 600ms serial vs 200ms parallel.
  - Pattern D: Re-throw after logging → stack captured twice (on throw + on re-throw); noisy logs + perf cost.
  - Python: EAFP misuse — `try/except KeyError` in hot loop instead of `.get(default)`.
  - Go: `errors.New()` in hot loop → heap allocation per call; fix with sentinel error at init.
  - Rust: `unwrap()` panic path in tight loop → `filter_map` / `.ok()` avoids panic overhead.
  
  Scan 4 — **Blocking I/O in async paths**: `readFileSync`, `execSync`, `bcrypt.hashSync` etc. inside request handlers. Blocks Node.js event loop for all concurrent requests.
  
  Scan 5 — **Hot-path allocations**: `JSON.parse` per request on static data, object spread in tight loops, string concatenation loops instead of buffers.

- **Coverage confidence loop** (`eaed023`) — After all 5 scans, agent cross-checks grep coverage against the source file list with a 9-question checklist (all scans run? all hits read? all extensions covered? absence-of-findings suspicious?). Rates coverage 1-10. Re-passes with broader patterns if < 7 (max 3 attempts). Prints a mandatory `Phase 1b Coverage Verdict` block. Sets `⚠️ BLOCKED` and surfaces to user if still < 7 after 3 passes.

- **Verbatim code mandate on all findings** (`eaed023`) — Every finding in every scan now requires `read(filePath=..., offset=<line-5>, limit=20)` before the finding is recorded. Each finding's block has a `Verbatim code (lines N–M):` section with exact output from `read()`. Findings from grep output alone are explicitly prohibited.

- **Full mandatory report template — Phase 6** (`eaed023`) — Replaces the previous 5-bullet list. `docs/PERFORMANCE_REPORT.md` must be filled in completely (placeholder dashes = incomplete). Template sections: executive summary, baseline measurements table (P50/P95, data size, method), one `STATIC-NNN` block per finding (verbatim code + loop bound + specific impact reason + concrete fix code + profiler confirmation status), profiler results table (top hot functions with file:line and time%), fix applied (before/after verbatim code + rationale), final benchmark (P50/P95 before/after + improvement factor + regression column), regression check table, known remaining bottlenecks (S/M/L effort + P0/P1/P2 priority), data size thresholds, coverage verdict (per-scan file count + finding count + confidence), handoffs recommended (expert + finding + specific reason).

- **Confidence gate reads from `PERF_TRACKER.md`** (`cd5357b`) — Gate prints a 7-row confidence table derived from the tracker file, not from context memory. Phase 5 (verify-fix) uses raised threshold of 8/10 — a fix without before/after benchmark numbers is not considered verified.

- **Resume check at Phase 2** (`cd5357b`) — `read(filePath="docs/performance/PERF_TRACKER.md")` before profiling starts; skips `✅ DONE` phases, surfaces `⚠️ BLOCKED` to user before continuing.

### Changed

- **`performance-engineer` phase count: 6 → 7** — Phase 1b (static analysis) is a distinct new phase between understand and profile. Updated orchestrator plan announcement and tracker row count.
- **`performance-engineer` handoff boundary clarified** — try/catch-in-loop: performance-engineer owns the runtime cost; code-reviewer owns the swallowed-error / correctness angle. Both agents can flag the same instance for different reasons without duplicating findings.
- **`docs/FEATURES.md`** — performance-engineer entry expanded from 1 line to full capability description. All 13 agent entries updated from `mode: subagent` → `mode: primary` (reflects the v0.5.0 change that was not reflected in docs). Agent count header corrected from 12 → 13.
- **`docs/USERGUIDE.md`** — `/perf` section expanded: full 7-phase description, Phase 1b scan list, output file paths corrected (`docs/perf/` → `docs/PERFORMANCE_REPORT.md` + `docs/performance/PERF_TRACKER.md`), try/catch and performance handoff boundary documented.



Test-driven SDLC, visual design agent, smart routing, adaptive questioning, and design compliance enforcement. Based on lessons from a real 60-test QA track on ThreatForge.

### Added

- **`frontend-design` agent (#13)** + `/frontend` skill — Production-grade visual implementation: typography, color systems, spacing, motion. Three modes: `--implement` (turn UX specs into components), `--polish` (elevate existing generic UI), `--system` (build/refactor design tokens). Includes "AI slop" checklist to catch generic AI-generated look.
- **`/explore` skill** — Codebase archaeology: trace a feature end-to-end before modifying it. Maps entry points, call chains, data flow, blast radius with file:line references.
- **`/steward` skill** — Project intelligence lifecycle: audits CLAUDE.md/AGENTS.md alignment with actual code, captures session learnings, fixes doc drift. Three modes: `audit`, `capture`, full.
- **`/design-options` skill** — Multi-approach architecture decisions: generates 3 alternatives (minimal, clean, pragmatic) with 6-dimension trade-off matrix. Integrated into Mode 3 Step 2 and Mode 4 Step 2.5.
- **Smart Routing** — `/sdlc` without a mode keyword detects intent from natural language. "Make the frontend better" → Mode 4 with frontend scope. When ambiguous, asks ONE routing question (A/B/C/D).
- **Adaptive Questioning** — Agents learn from research and audits, then generate follow-up questions derived from what they discovered. Questions must reference something specific, affect the next step, and couldn't have been asked at start.
- **Design Compliance (MANDATORY)** — 8 code-writing agents now read TECH_STACK.md + ARCHITECTURE.md before writing code. Will NEVER introduce technologies the architect didn't choose. If they think a change is better, they flag it as a decision point.
- **API Verification (MANDATORY)** — 6 code-writing agents check Context7 MCP or node_modules before using any library API. Never guesses from training data. Prevents renamed functions, changed option shapes, moved import paths.
- **Completion Manifest protocol** — All 12 specialist agents produce structured return manifests: files produced/modified, decisions made, known issues, test results.
- **Context Packet protocol** — SDLC lead writes focused context files before every HANDOFF, front-loading specialists instead of having them re-explore the codebase.
- **USE_CASES.md + TEST_PLAN.md in all 4 modes** — Phase 2 (from requirements), Mode 2 Step 6c (from existing code), Mode 3 Step 2 (for new features), Mode 4 (per-fix regression tests).
- **E2E test writing in Phase 4** — MANDATORY test-engineer handoff writes actual E2E specs for all P0 use cases BEFORE code review starts.
- **Discovery audit** — SDLC lead walks all app pages/routes and collects errors (console, 4xx/5xx, visible error text, slow loads) before and after improvements.
- **Pre-review gate** — All P0 tests must pass before code-reviewer or security-auditor sees the code.
- **TDD in Mode 3** — Test-engineer writes failing acceptance test first, developer implements, test passes, then review.
- **Mode 4 Vision Research** — When user provides a desired state ("make it feel like Linear"), researcher studies how best products achieve that vision with the current stack. `/design-options` triggered when multiple paths exist.
- **Mode 4 Feature-scoped improvement** — `/sdlc improve "feature:payments"` traces that specific feature via `/explore`, then scopes all audits to just those files.
- **Mode 4 granular scoping** — "frontend", "backend", "feature:X", "design", or combinations.
- **`/sdlc status` enhanced** — Visual progress display with phase→deliverable mapping, test counts, gate blockers, handoff state.
- **`/sdlc gate` implemented** — Full gate check with quality scoring, test gates, failure handling rules.
- **Container-ops → SRE ordering** clarified in AGENT_PROCESS_FLOW.md.
- **Researcher progress announcements** standardized to `▶ Phase N:` format.

### Changed

- All agents use `mode: "primary"` (OpenCode 1.4.0 compatibility).
- Mode 4 discovery interview expanded: new Q3 "What should it BECOME?", granular scope options.
- Mode 3 Step 1 now uses `/explore` pattern for impact analysis.
- Mode 3 Step 2 uses `/design-options` for non-trivial features.
- HANDOFF return verification strengthened: checks completion manifest, surfaces test failures.

## [0.5.0] — 2026-04-10

Mode 4 (`/sdlc improve`), strict git branching discipline across all modes, HANDOFF block overhaul, and Bounded Task Mode on all specialist agents.

### Added

- **Mode 4 (`/sdlc improve ["<focus>"]`)** — New SDLC mode for discovery-driven improvement of existing systems. Runs targeted specialist audits (UX, code quality, performance, security, DB), synthesizes findings into a prioritized improvement backlog (S/M/L sizing), and executes approved items with the right ceremony for their size (S = direct + verify, M = design step first, L = spawn Mode 3 sub-workflow). Optional focus arg narrows scope: `"ux"`, `"performance"`, `"security"`, `"code-quality"`.
- **Git Discipline section (mandatory — all modes)** — New top-level section defining the branching model: `main` = production, no direct commits. Each mode now creates a typed branch before touching any file: `sdlc/setup` (Mode 1 phases 0–3), `docs/onboard` (Mode 2), `feat/[slug]` (Mode 3), `improve/[slug]` (Mode 4). Every mode ends with a PR — no work merges without one.
- **`sdlc/setup` branch for Mode 1** — Phases 0–3 design docs all commit to `sdlc/setup`, not `main`. After Phase 3 gate passes, the branch is merged to `main` via PR before Phase 4 implementation begins. Feature branches cut from updated `main`.
- **Mode 2 branch + PR** — `docs/onboard` branch created at Step 0. All onboarding docs committed there. PR opened at end — docs don't land on `main` without review.
- **Mode 3 explicit merge step** — After all reviews pass in Step 4, `git-expert` marks the draft PR as ready and squash-merges to `main`. Branch deleted after merge.
- **Mode 4 branch + PR** — `improve/[slug]` branch created at Step 1 before any audit work. All findings and implementation committed there. PR opened at wrap-up.
- **Bounded Task Mode on all 11 specialist agents** — `SDLC-TASK for [agent]:` prefix triggers a scoped execution mode: skip discovery, skip orchestrator phases, read only the files listed under CONTEXT, execute exactly the task in YOUR TASK, write exactly the files in PRODUCE, print the exact completion phrase, then stop. Prevents specialists from running full multi-phase workflows when invoked via HANDOFF.
- **SDLC-TASK HANDOFF format on all 33 delegation points** — Every specialist HANDOFF in `sdlc-lead` now uses the structured `SDLC-TASK for [agent]: CONTEXT / YOUR TASK / PRODUCE / completion phrase` format. Specialists execute bounded jobs without triggering their own orchestrator workflows.
- **Mode 4 Improvement Discovery Interview** — Structured interview determines which audits to run based on what's driving the improvement (user complaints, perf concerns, tech debt, security, etc.). Announces audit plan and waits for user confirmation before running any specialists.

### Changed

- **`sdlc-lead` description** updated to include Mode 4 (`/sdlc improve`).
- **`sdlc-lead` command table** updated from "Three Operating Modes" to "Four Operating Modes".
- **All Phase 0–3 git commits** now explicitly target `sdlc/setup` branch (not "current branch").
- **`sdlc-lead` Rules** — Three new rules: never commit to `main` directly, always create the mode's branch before starting, always open a PR before merging.
- **All specialist agents** changed from `mode: "subagent"` to `mode: "primary"` — fix for OpenCode 1.4.0 which hides `subagent`-mode agents from direct invocation. All 12 agents now visible in the UI.

---

## [0.4.0] — 2026-04-10

Multi-agent orchestration, real-time progress feedback, phase-splitting for long-running agents, full git and UX wiring throughout the SDLC, and a comprehensive test suite.

### Added

- **Researcher orchestrator + `--single` + `--plan` modes** — The `researcher` agent no longer runs as one silent multi-minute block. In orchestrator mode (default) it announces its plan, spawns a `--single` sub-task per question via the `task` tool, and reports each finding as it completes (`✓ Q1: ...`). `--single` researches exactly one question in 30–60 s. `--plan` returns a question list only.
- **Orchestrator + `--phase: N` mode on all 8 long-running agents** — `db-architect`, `test-engineer`, `sre-engineer`, `container-ops`, `performance-engineer`, `api-designer`, `security-auditor`, `code-reviewer` all gained the same two-mode pattern. Orchestrator announces a phase plan, spawns one sub-task per phase (each writes to `docs/work/<agent>/<slug>/phaseN.md`), reports `✓ Phase N: [finding]` after each. `--phase: N name` runs only that phase in under 90 s.
- **Progress announcements mandatory on all 10 agents** — Every agent now has a `## Progress Announcements` section requiring `▶ Phase N: [name]...` at start and `✓ Phase N complete: [summary]` at end of every phase. These surface in the `task` tool's UI label via `context.metadata`.
- **Real-time metadata on every assistant message** — `task.ts` fires `context.metadata` on every JSON event from stdout, not just on the 5 s heartbeat.
- **`scripts/test.ts`** — Comprehensive test suite replacing `validate-tools.js`. Three passes: (1) dynamically imports each `.ts` tool via Node 24 native TS, validates runtime shape; (2) parses skill frontmatter, validates name/description/agent cross-references; (3) checks agent content length and role/identity.
- **`scripts/add-orchestrator.mjs`** — Script to insert the orchestrator + phase-mode block into new agents.
- **`mode: "subagent"` frontmatter on all 11 specialist agents** — Correct classification for OpenCode native task tool when custom agent support ships. `sdlc-lead` gets `mode: "primary"`.
- **`sdlc-lead` Mode 2: git history inspection (Step 0)** — `git-expert --inspect` runs before any code is read; hot files and recent activity focus landscape mapping.
- **`sdlc-lead` Mode 2: UI detection** — Step 1 detects UI frameworks/directories, records `UI-bearing: YES/NO`.
- **`sdlc-lead` Mode 2: UX audit** — If UI-bearing, Step 6 calls `ux-engineer --audit`.
- **`sdlc-lead` Mode 2: docs commit** — Step 7 calls `git-expert` to commit all produced onboarding docs.
- **`sdlc-lead` Mode 1: git checkpoints after phases 0–3** — `git-expert` commits phase docs after each gate. Nothing advances uncommitted.
- **`sdlc-lead` Mode 3: UX review in implementation** — Step 3 calls `ux-engineer --review` after code review for UI features; CRITICAL/HIGH block the PR. Step 4 adds accessibility audit. Step 5 updates `UX_SPEC.md` and commits docs.
- **`sdlc-lead` Phase 3/4/5: explicit `task()` calls with timeouts** — All delegations now have concrete `task(agent=..., prompt=..., timeout=...)` blocks sized for orchestrator depth (480–720 s).

### Changed

- **`task.ts` max timeout 600 s → 900 s** — 6 phases × 120 s = 720 s; new cap provides headroom.
- **`task.ts` default timeout 120 s → 180 s**.
- **`tools/grep-mcp.ts`** — Fixed `require('child_process')` in ESM module; replaced with `import { exec as execCb }`.
- **`package.json`** — `"type": "module"`, test script uses `node --experimental-strip-types`.
- **`sdlc-lead` researcher calls include numbered questions** — All three research delegations provide explicit questions so orchestrator mode activates without a planning round-trip.

### Architecture note

The `task` tool spawns `opencode run --agent X --format json` as a subprocess — the correct workaround for the current OpenCode limitation where the built-in task tool only supports `general` and `explore` (custom agents not yet supported: [anomalyco/opencode#20059](https://github.com/anomalyco/opencode/issues/20059)). When OpenCode ships full custom agent support, switching to the native task tool will give proper child-session visibility in the TUI sidebar without needing `context.metadata` hacks.

---

## [0.3.0] — 2026-04-10

Major upgrade wave: new `git-expert` agent, three-mode `code-reviewer` rewrite, three-mode `ux-engineer` rewrite, deeper `security-auditor`, sdlc-lead discovery interviews, asymmetric confidence gates applied across every agent. Repository cleanup + new documentation.

### Added
- **`git-expert`** — New 6-mode agent (`--init`, `--feature`, `--release`, `--recover`, `--inspect`, `--sync`). Handles repo bootstrap, daily feature-branch flow with atomic commits and draft PRs, semver releases with Keep-a-Changelog, reflog-based recovery, history forensics (blame / pickaxe / bisect), and multi-remote sync (Gitea + GitHub). Includes secret-scanning, reflog backups before destructive ops, and explicit confirmation gates. Wired into `sdlc-lead` at Phase 0, Phase 4, Phase 5, and Mode 3.
- **`references/git-workflow-checklist.md`** — Canonical rules for conventional commits, SemVer 2.0, Keep-a-Changelog, language-aware `.gitignore` presets, recovery scenarios, report templates, and destructive-op confirmation templates.
- **`code-reviewer` four modes** — `--review` (7-dimension health pass), `--debt` (leverage-sorted tech-debt register), `--consolidate` (DRY + error-handling consolidation with Consolidation Catalog), `--patterns` (cross-codebase drift audit).
- **`references/code-health-checklist.md`** — 7 dimensions, silent-failure hunter, consolidation catalog, language thresholds, confidence scoring, report templates.
- **`ux-engineer` three modes** — `--design` (WCAG-aware component design), `--review` (Nielsen Norman heuristic pass), `--audit` (accessibility audit with live-environment methodology).
- **Discovery Interviews + Confidence Loops** on `sdlc-lead` — Mode 1 and Mode 3 now start with a mandatory interview protocol; every phase ends with a per-document confidence gate (asymmetric: < 5 = fail, 5-6 = revise max 3x, ≥ 7 = pass).
- **Inter-Phase Check-In + Research Findings Review protocols** — Prevents `sdlc-lead` from auto-advancing phases and forces it to reconcile research with prior decisions.
- **Semgrep deep upgrade** — Community rules integration, framework auto-detect, two-tier scans in `security-auditor`.
- **Skeleton-first security report format** — Rewritten to surface actionable intel first.
- **Verifier isolation + reader simulation + asymmetric gates** — Applied across all 12 agents.
- **MemPalace MCP integration** — Persistent memory for OpenCode workflows.
- Repository cleanup: `.gitignore`, `CHANGELOG.md`, shortened `README.md`, `docs/FEATURES.md`, `docs/USERGUIDE.md`.

### Changed
- **`sdlc-lead` Phase 0 now calls `git-expert --init` first** — so VISION.md is the first tracked artifact.
- **`sdlc-lead` Phase 4 calls `git-expert --feature`** per completed feature for branch + atomic commits + draft PR.
- **`sdlc-lead` Phase 5 calls `git-expert --release`** once reviews pass — semver bump + signed tag + GitHub/Gitea releases.
- Agent descriptions now use trigger-aware "pushy" language so they surface proactively.
- OpenCode-specific compatibility fixes and session-context tooling.

## [0.2.0] — 2026-04-09

End-of-day state after a major expert-depth push. 11 experts upgraded with real per-phase iteration loops, instinct patterns, deep threat modeling, verbatim code snippet enforcement, and a Mode 2 (`sdlc onboard`) overhaul with high-level architecture + operation sequence diagrams.

### Added
- **Real expert behavior** across all 11 agents — per-phase iteration, instinct patterns, deeper threat modeling.
- **Semgrep integration** in `security-auditor` — auto-install, auto-detect language, guided setup.
- **Context7 MCP** — Live library documentation lookup reference available to all agents.
- **Custom OpenCode tools** — `tools/` directory with 18 TypeScript tools (bash, grep-mcp, write, append, update, file-info, task, test-runner, playwright-test, playwright-web, semgrep-scan, semgrep-rule, simplify-file, pomodoro, run, log-parser, loop-detector, deploy).
- **Micro-loop pattern** applied to all 11 agents (ThreatForge lessons absorbed).
- **Detailed security + code review reports** — verbatim code quotes, concrete exploitation explanations, file:line anchors.
- **Mode 2 (`sdlc onboard`) overhaul** — high-level architecture pass, operation sequence diagrams, confidence loop.
- Local LLM compatibility fixes across all 11 agents.

### Changed
- Phase agents consolidated into a single `sdlc-lead` program manager with 3 operating modes (init, onboard, feature).
- Install script (`install.sh`) hardened: idempotent clean-reinstall, safely merges Context7 MCP into existing `opencode.json`, checks for Semgrep.
- Agent directory structure + frontmatter fixed for OpenCode compatibility.

## [0.1.0] — 2026-04-06

Initial public release of the BPM OpenCode Expert system.

### Added
- **11 specialist agents**: `sdlc-lead`, `security-auditor`, `researcher`, `test-engineer`, `db-architect`, `ux-engineer`, `sre-engineer`, `container-ops`, `code-reviewer`, `performance-engineer`, `api-designer`.
- **14 slash commands** triggering the agents: `/sdlc`, `/security`, `/research`, `/test-expert`, `/dba`, `/ux`, `/devops`, `/containers`, `/review-code`, `/perf`, `/api-design`, `/gate`, `/review`, `/simplify`.
- **6 reference documents** covering OWASP, engineering artifacts, REST APIs, Playwright, Semgrep, severity matrices.
- **Install scripts** for global (`~/.config/opencode/`) or project-level setup.
- **Full documentation**: expert guide, SDLC guide, contributing guide.
- **Interoperable** with the sibling `attest-claude` project for Claude Code — works with any LLM backend (Claude, OpenAI, Gemini, Ollama, LM Studio, 75+ providers).

[0.7.0]: https://github.com/bpmforge/attest/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/bpmforge/attest/compare/v0.5.0...v0.6.0
[0.3.0]: https://github.com/bpmforge/attest/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bpmforge/attest/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bpmforge/attest/releases/tag/v0.1.0
