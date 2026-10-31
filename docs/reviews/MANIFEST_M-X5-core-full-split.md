# Completion Manifest — M-X5-core-full-split (WP-X5 = TOKEN_OPTIMIZATION_PLAN C4 + C5)

Branch `feat/M-X5-core-full-split`. Implemented on a Linux shell with no OpenCode binary (`which opencode` empty): the claim that a
`disable: true` file under `agents/shared/` is hidden from agent discovery rests on precedent (69 existing reference docs use it, v1 and v2
via `disabled:`), not on a live run — verify on the Mac.

## What changed
| Area | Change |
|---|---|
| Marker | `<!-- attest:full -->` on its own line in an agent source: above = core, below = full. Sources stay whole files, so `--check`/`--fix` still see every block section on both sides (section scanning now also stops at the marker). |
| `scripts/build-agents.mjs` | `--build` now works for BOTH targets: `dist/agents/` (v1) / `dist/agents-v2/` (v2) = install set with split agents as core + one pointer line; `dist/full-agents/` / `dist/full-agents-v2/` = `<name>.full.md` (`disable:`/`disabled:`, `mode: all`). `--no-split` emits unsplit. `--compact` builds from the CORE (blocks that live below the marker come back as their compact variants). `--report-sizes` (+ `--emit-exceptions`) prints source/core/full/compact per agent and the median. `--check` (both targets) enforces: marker once, frontmatter present, something below it, core <= 8192 B unless listed in `CORE_EXCEPTIONS` (each entry has `max` + a `TODO(C4)` line; a stale entry that now fits is reported). |
| `install.sh` | Default install = core set (build runs from install.sh for the detected major); full files go to `<install>/agents/shared/full/`; `--full-agents` installs unsplit sources (v2: `--build --no-split`); `--link` keeps symlinking the unsplit repo; `--compact` overlay unchanged (now built from core); project installs rewrite the pointer to `<DEST>/agents/shared/full/`; `--no-game` also removes the game agents' full files; `--help` updated; `experts-version` gets a third line `agents-variant=core|full[+compact]` (line 1 still the version, line 2 still `opencode-major=`; `--print-opencode-plan` prints `stamp-line-3`). |
| `dist/` | `dist/compact-agents/` regenerated; `dist/.gitignore` keeps the generated `agents/`, `full-agents*/` trees out of git. |
| Agents | 30 agents marked (see table). Content-preservation checked mechanically: every pre-existing line of every edited source still exists in it (only reordered, plus a generated "Mandatory gates" stub list and 2 hand-written digests). |

## Deviations from the ticket design (and why)
1. **Full files live at `agents/shared/full/<name>.full.md`, not `agents/full/`.** `agents/shared/` already holds 69 non-agent `disable: true` docs and is already inside the installer's `external_directory` allow glob; `agents/full/` would be a new directory OpenCode might scan. Pointer line text is the ticket's, with that path: `Full methodology: read ~/.config/opencode/agents/shared/full/<name>.full.md on demand (direct/interactive mode, or when a HANDOFF step needs it)`.
2. **Full files are emitted to `dist/full-agents[-v2]/`, not inside `dist/agents[-v2]/`**, and installed into `agents/shared/full/` by install.sh. Reason: `scripts/test-build-target-modes.ts` asserts "source docs with `disable:` == `disabled:` files in dist/agents-v2"; putting 30 more `disabled:` files in that tree would break an out-of-scope test.
3. **The 8 KB core cap is NOT met by 29 of the 30 split agents** (only `llm-integration-engineer`, 8,053 B, fits; the others are 8.2-16.4 KB, `sdlc-lead` 32 KB). The shared mandatory blocks (HANDOFF intake 4,072 B, loop prevention 1,107 B, plus the bounded-task / completion / pre-completion sections) alone are 7-11 KB, and shrinking them to card pointers changes canonical block text for all agents (separate ticket). Each is in `CORE_EXCEPTIONS` with a `max` and a `TODO(C4)` line. `sdlc-lead` keeps delegation / HANDOFF-authoring / approval-gate sections in core by design (its job is writing HANDOFFs and stopping at gates; leaving them in full would force a full read every session).
4. **Not split (59 unsplit agents), deliberately:**
   - the 12 phase/mode documents (`sdlc-init-mode`, `sdlc-onboard-mode`, `sdlc-feature-mode`, `sdlc-improve-mode`, `sdlc-init-phases-0-2`, `-phase-3`, `-phase-4`, `-phases-3-4`, `-phase-5`, ...): `sdlc-lead` loads them by `read()` of the installed path and the phase body IS what it needs; a core-only file would hide the phase. They are read on demand, not session baselines (the 44-94 KB "coordinators" in the plan). Splitting them by step is the follow-up if their weight matters.
   - leaf specialists whose `## Execution` is a sequential Phase 0..N procedure (security/*, code-review/*, performance/*, game/*, sdlc/onboard/{landscape-mapper,health-coordinator}, content-designer, design-system-lead, ux-researcher, manual-writer, ...): the bounded session executes that procedure every run, so moving it below the marker would force an unconditional full-file read (more tokens, one more turn). Where an optional block existed (Code search, Research tools, Context Budget) it was split off; where the removable part was < 1.5 KB the file stays whole.
5. Context Budget, Challenger Gate, Design Compliance, API Verification and other `MANDATORY`-headed sections that moved below the marker are kept visible in core as a one-line stub list ("Mandatory gates — full text below the marker": heading + first sentence), so a trigger (e.g. a destructive schema change) is still recognised without the full file.
6. Digests (hand-written, in core): `coding-agent` (Four Laws, verify-receipt, api-surface, baseline/verify loop, anti-slop card, write-scope) and `security-auditor` (phase outline). Core sections moved to full for the heavy agents: Execution Modes, How You Work/Execute, How You Think, Progress Announcements, the duplicate "Bounded Task Mode (SDLC Handoff)" section where a "SDLC Handoff (Bounded Task Mode)" section also exists, Research tools, Code search, Memory, Anti-Slop (the card is the core pointer), Mode N sections.
7. Claude target (`npm run build:claude`) is unchanged: it builds from the unsplit sources, so it carries the marker comment (harmless) and no pointer.

## Size table (`node scripts/build-agents.mjs --report-sizes`, bytes; core includes the 160-170 B pointer line)
```
agent                                           source    core    full  compact
coding-agent.md                                  52255   14652   37930    12468
sdlc-lead.md                                     51575   32182   19711        -
git-expert.md                                    43478   12614   31185     9727
researcher.md                                    42387   11503   31205     9023
ux-engineer.md                                   39186   14966   24544    12282
test-engineer.md                                 38481   12574   26237    10225
container-ops.md                                 35321   12808   22843    10459
frontend-design.md                               34202   12514   22024    10163
db-architect.md                                  31234   11810   19751     9462
api-designer.md                                  30947   12731   18543    10383
sre-engineer.md                                  30601   12299   18629     9951
security-auditor.md                              25453    8560   17232     6074
code-reviewer.md                                 24454   16400    8384    13917
agent-ui-engineer.md                             22831   13842    9331    11489
graphics-engineer.md                             22726   14301    8767    11948
interaction-engineer.md                          22495   14032    8814    11676
architecture-designer.md                         22416    8705   14065     8861
performance-engineer.md                          21483   15174    6660    12481
design-iterator.md                               18632   11012    7956     8661
ui-verifier.md                                   15040   13480    1884    10592
gauntlet-lead.md                                 13717   10462    3585     8113
code-review/dead-code-detector.md                13567   12147    1765        -
sdlc/onboard/entry-point-tracer.md               13199   11779    1765        -
reliability-engineer.md                          12539    9164    3725     9138
sdlc/onboard/component-mapper.md                 12133   10711    1761        -
code-review/pattern-consistency-checker.md       11893   10482    1783        -
data-steward.md                                  11189    8552    2964     8534
a11y-compliance.md                               10837    9208    1965     9187
analytics-architect.md                            9840    8215    1973     8190
llm-integration-engineer.md                       9673    8053    1983     8023


agents: 89 (30 split, 59 unsplit)
median source: 12121 B   median core: 11012 B   (target < 12288)
total source: 1660689 B   total core: 1291837 B   total full: 378964 B
split agents over 8192 B: 29 — coding-agent.md, sdlc-lead.md, git-expert.md, researcher.md, ux-engineer.md, test-engineer.md, container-ops.md, frontend-design.md, db-architect.md, api-designer.md, sre-engineer.md, security-audi
```
Median core 11,012 B vs median source 12,121 B across 89 agents (target < 12,288 B: met). Total agent text 1.66 MB source -> 1.29 MB core (+ 0.38 MB on demand). Heavy agents: coding-agent 52.3 -> 14.7 KB, test-engineer 38.5 -> 12.6, git-expert 43.5 -> 12.6, researcher 42.4 -> 11.5, ux-engineer 39.2 -> 15.0, sdlc-lead 51.6 -> 32.2.

## C5 — conductor sessions start from the core set
`install.sh` default now installs the core set, so the agent files the conductor's `opencode run` sessions resolve are the core files; `--compact` still overlays the smaller tier=small variants. No edit to `conductor.mjs` (out of scope).
**Conductor follow-up (one line, `scripts/conductor/conductor.mjs` ~L2479-2492, the `agents.prompt-size` log):** read `agents-variant=` (line 3 of `~/.config/opencode/experts-version`) and add it to the log payload; change the heavy hint from "install with --compact" to "installed variant is `full` — reinstall without `--full-agents`" when variant=full, and keep `--compact` only when variant=core and a core is still > 32 KB (today only `sdlc-lead`, 32,182 B, sits just under that threshold).

## Evidence
- Baseline (clean checkout of main 7b16c1d outside the worktree): `npm test` **1276 passed / 0 failed**. Final in the worktree: **1273 passed / 3 failed** (same 1276 total) — the three are the known worktree/environment failures: validate-vendor-provenance RED (worktree), build-target "--check reports mode drift", "--write restores mode" (mode 700). One more failure appeared mid-way (v2 real-tree `disable:` == `disabled:` count) and was fixed by deviation 2, not by editing the test.
- `npm run agents:check` and `node scripts/build-agents.mjs --check --target opencode-v2`: green (101 agents). `npm run agents:compact`: 50 variants. `--build` v1 and v2: 30 split, 131 unsplit files, no core over its limit.
- `npm run build:claude -- --out /tmp/...` succeeds (output removed).
- Real `install.sh --project --no-game` into a scratch dir (OPENCODE_MAJOR=1): 161-file agents tree, (30 full files installed to `.opencode/agents/shared/full/`), pointer rewritten to `.opencode/agents/shared/full/<name>.full.md`, no game full files.
- Existing tests that read agent files (test-agent-reachability, test-language-checklists, test-hook-guards, evals fixtures) stayed green with no text assertions needing to move; no test required keeping text in core.

## Not measurable here / unmet
- **Telemetry acceptance (median first-message baseline < 12k tokens): cannot be measured here.** Agent text only; the C1 harness floor is ~13.4k tokens, so the < 12k target is likely not reachable by agent text alone — on the Mac, run a session set after `./install.sh` and read `agents.prompt-size` + `telemetry-report.mjs` first-message `tokens_in`; expect coding-agent roughly 38.7k -> ~25-28k before shared-file reads, and record the number in this manifest.
- Core <= 8 KB: met by 1 of 30 split agents; 29 listed exceptions (shrink the shared blocks to card pointers to close them).
- 12 phase/mode docs and ~47 leaf specialists unsplit (deviation 4).
- Not verified against a real OpenCode: that `agents/shared/full/*.md` with `disable: true` / `disabled: true` stays out of the agent list, and that the on-demand `read` of `~/.config/opencode/agents/shared/full/...` passes the external-directory allow (the installer already allows `~/.config/opencode/**`).
